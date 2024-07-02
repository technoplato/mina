#include "stt_whisper.h"
#include "whisper.h"
#include <atomic>
#include <cmath>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include <chrono>
#include <iostream>

#define DEBUG 0

#if DEBUG
#define DEBUG_LOG(x) std::cout << "[DEBUG] " << __FUNCTION__ << ": " << x << std::endl
#else
#define DEBUG_LOG(x)
#endif

void print_array(const std::vector<float>& data)
{
    DEBUG_LOG("Printing first 10 elements of array");
    fprintf(stdout, "print array: [");
    for (int i = 0; i < std::min((int)data.size(), 10); i++) {
        fprintf(stdout, " %.8f,", data[i]);
    }
    fprintf(stdout, " ]\n");
}

void high_pass_filter(std::vector<float>& data, float cutoff, float sample_rate)
{
    DEBUG_LOG("Applying high-pass filter with cutoff " << cutoff << " Hz and sample rate " << sample_rate << " Hz");
    const float rc = 1.0f / (2.0f * M_PI * cutoff);
    const float dt = 1.0f / sample_rate;
    const float alpha = dt / (rc + dt);

    float y = data[0];

    for (size_t i = 1; i < data.size(); i++) {
        y = alpha * (y + data[i] - data[i - 1]);
        data[i] = y;
    }
    DEBUG_LOG("High-pass filter applied");
}

bool vad_simple(std::vector<float>& pcmf32, int sample_rate, int last_ms, float vad_thold, float freq_thold, bool verbose)
{
    DEBUG_LOG("Running VAD with sample_rate=" << sample_rate << ", last_ms=" << last_ms << ", vad_thold=" << vad_thold << ", freq_thold=" << freq_thold);
    const int n_samples = pcmf32.size();
    const int n_samples_last = (sample_rate * last_ms) / 1000;

    if (n_samples_last >= n_samples) {
        DEBUG_LOG("Not enough samples for VAD. Returning false.");
        return false;
    }

    if (freq_thold > 0.0f) {
        high_pass_filter(pcmf32, freq_thold, sample_rate);
    }

    float energy_all = 0.0f;
    float energy_last = 0.0f;

    for (int i = 0; i < n_samples; i++) {
        energy_all += fabsf(pcmf32[i]);

        if (i >= n_samples - n_samples_last) {
            energy_last += fabsf(pcmf32[i]);
        }
    }

    energy_all /= n_samples;
    energy_last /= n_samples_last;

    if (verbose) {
        DEBUG_LOG("VAD energies - all: " << energy_all << ", last: " << energy_last);
    }

    if ((energy_all < 0.0001f && energy_last < 0.0001f) || energy_last > vad_thold * energy_all) {
        DEBUG_LOG("VAD returning false");
        return false;
    }

    DEBUG_LOG("VAD returning true");
    return true;
}

RealtimeSttWhisper::RealtimeSttWhisper(const std::string& path_model)
{
    DEBUG_LOG("Initializing RealtimeSttWhisper with model: " << path_model);
    struct whisper_context_params cparams = whisper_context_default_params();
    ctx = whisper_init_from_file_with_params(path_model.c_str(), cparams);
    if (ctx == nullptr) {
        DEBUG_LOG("Failed to initialize whisper context");
        return;
    }
    is_running = true;
    worker = std::thread(&RealtimeSttWhisper::Run, this);
    t_last_iter = std::chrono::high_resolution_clock::now();
    DEBUG_LOG("RealtimeSttWhisper initialized successfully");
}

RealtimeSttWhisper::~RealtimeSttWhisper()
{
    DEBUG_LOG("Destroying RealtimeSttWhisper");
    is_running = false;
    if (worker.joinable())
        worker.join();
    whisper_free(ctx);
}

void RealtimeSttWhisper::AddAudioData(const std::vector<float>& data)
{
    std::lock_guard<std::mutex> lock(s_mutex);
    DEBUG_LOG("Adding " << data.size() << " samples to queue. Current queue size: " << s_queued_pcmf32.size());
    s_queued_pcmf32.insert(s_queued_pcmf32.end(), data.begin(), data.end());
}

std::vector<transcribed_msg> RealtimeSttWhisper::GetTranscribed()
{
    std::vector<transcribed_msg> transcribed;
    std::lock_guard<std::mutex> lock(s_mutex);
    transcribed = std::move(s_transcribed_msgs);
    DEBUG_LOG("Returning " << transcribed.size() << " transcribed messages");
    s_transcribed_msgs.clear();
    return transcribed;
}

void RealtimeSttWhisper::Run()
{
    DEBUG_LOG("Starting Run thread");
    struct whisper_full_params wparams = whisper_full_default_params(whisper_sampling_strategy::WHISPER_SAMPLING_GREEDY);

    wparams.n_threads = 4;
    wparams.no_context = true;
    wparams.single_segment = true;
    wparams.print_progress = false;
    wparams.print_realtime = false;
    wparams.print_special = false;
    wparams.print_timestamps = false;
    wparams.max_tokens = 64;
    wparams.language = "en";
    wparams.translate = false;
    wparams.audio_ctx = 768;

    const int trigger_ms = 200;  // Reduced from 400ms to make it more eager
    const int n_samples_trigger = (trigger_ms / 1000.0) * WHISPER_SAMPLE_RATE;
    const int iter_threshold_ms = trigger_ms * 35;
    const int n_samples_iter_threshold = (iter_threshold_ms / 1000.0) * WHISPER_SAMPLE_RATE;

    const int vad_window_s = 3;
    const int n_samples_vad_window = WHISPER_SAMPLE_RATE * vad_window_s;
    const int vad_last_ms = 500;
    const int n_samples_keep_iter = WHISPER_SAMPLE_RATE * 0.5;
    const float vad_thold = 0.3f;
    const float freq_thold = 200.0f;

    std::vector<float> pcmf32;

    while (is_running) {
        {
            std::unique_lock<std::mutex> lock(s_mutex);

            if (s_queued_pcmf32.size() < n_samples_trigger) {
                lock.unlock();
                std::this_thread::sleep_for(std::chrono::milliseconds(10));
                DEBUG_LOG("Waiting for more audio data. Current size: " << s_queued_pcmf32.size() << ", Trigger size: " << n_samples_trigger);
                continue;
            }
        }

        {
            std::lock_guard<std::mutex> lock(s_mutex);

            if (s_queued_pcmf32.size() > 2 * n_samples_iter_threshold) {
                DEBUG_LOG("WARNING: Large audio buffer. Size: " << s_queued_pcmf32.size() << ", Threshold: " << 2 * n_samples_iter_threshold);
            }
        }

        {
            std::lock_guard<std::mutex> lock(s_mutex);
            pcmf32.insert(pcmf32.end(), s_queued_pcmf32.begin(), s_queued_pcmf32.end());
            DEBUG_LOG("Processing audio. Buffer size: " << pcmf32.size() << ", Threshold: " << n_samples_iter_threshold);
            s_queued_pcmf32.clear();
        }

        {
            DEBUG_LOG("Running whisper_full");
            int ret = whisper_full(ctx, wparams, pcmf32.data(), pcmf32.size());
            if (ret != 0) {
                DEBUG_LOG("Failed to process audio. Return code: " << ret);
                continue;
            }
            DEBUG_LOG("whisper_full completed successfully");
        }

        {
            transcribed_msg msg;

            const int n_segments = whisper_full_n_segments(ctx);
            DEBUG_LOG("Number of segments: " << n_segments);
            for (int i = 0; i < n_segments; ++i) {
                const char* text = whisper_full_get_segment_text(ctx, i);
                msg.text += text;
            }
            DEBUG_LOG("Transcribed text: " << msg.text);

            bool speech_has_end = false;

            if ((int)pcmf32.size() >= n_samples_vad_window) {
                std::vector<float> pcmf32_window(pcmf32.end() - n_samples_vad_window, pcmf32.end());
                speech_has_end = vad_simple(pcmf32_window, WHISPER_SAMPLE_RATE, vad_last_ms,
                                            vad_thold, freq_thold, true);
                DEBUG_LOG("VAD result: speech_has_end = " << (speech_has_end ? "true" : "false"));
            }

            if (pcmf32.size() > n_samples_iter_threshold || speech_has_end) {
                const auto t_now = std::chrono::high_resolution_clock::now();
                const auto t_diff = std::chrono::duration_cast<std::chrono::milliseconds>(t_now - t_last_iter).count();
                DEBUG_LOG("Iteration time: " << t_diff << "ms");
                t_last_iter = t_now;

                msg.is_partial = false;
                std::vector<float> last(pcmf32.end() - n_samples_keep_iter, pcmf32.end());
                pcmf32 = std::move(last);
                DEBUG_LOG("Clearing audio buffer. New size: " << pcmf32.size());
            } else {
                msg.is_partial = true;
                DEBUG_LOG("Partial transcription");
            }

            std::lock_guard<std::mutex> lock(s_mutex);
            s_transcribed_msgs.insert(s_transcribed_msgs.end(), std::move(msg));
            DEBUG_LOG("Added transcribed message. Total messages: " << s_transcribed_msgs.size());
        }
    }
    DEBUG_LOG("Run thread exiting");
}