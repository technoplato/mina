const { RealtimeSttWhisper } = require('bindings')('addon')
const fs = require('fs')
const path = require('path')
const clipboard = require('clipboardy')
const mic = require('node-microphone')
const wav = require('wav')
const { GlobalKeyboardListener } = require('node-global-key-listener')
const v = new GlobalKeyboardListener()

function debugLog(message) {
  // console.log(`[DEBUG] ${new Date().toISOString()}: ${message}`)
}

const models = {
  tiny: 'tiny.en',
  base: 'base.en',
  large: 'large',
}

const modelPath = path.join(
  __dirname,
  'whisper.cpp',
  'models',
  `ggml-${models.base}.bin`
)

if (!fs.existsSync(modelPath)) {
  console.error(`Cannot find whisper model file '${modelPath}'. Abort.`)
  process.exit(1)
}

debugLog(`Using model: ${modelPath}`)

const stt = new RealtimeSttWhisper(modelPath)
const kSampleRate = 16000

debugLog('Initializing audio recording')
const microphone = new mic()
const micStream = microphone.startRecording()
const reader = new wav.Reader()

reader.on('format', (format) => {
  debugLog(`WAV format: ${JSON.stringify(format)}`)
})

reader.on('data', (buffer) => {
  debugLog(`Received audio data: ${buffer.length} bytes`)
  const floatData = new Float32Array(buffer.length / 2)
  for (let i = 0; i < buffer.length / 2; i++) {
    floatData[i] = buffer.readInt16LE(i * 2) / 32768.0
  }
  processAudioData(floatData)
})

micStream.pipe(reader)

micStream.on('error', (error) => {
  console.error('Error in microphone stream:', error)
})

function processAudioData(audioData) {
  debugLog(`Processing audio data: ${audioData.length} samples`)
  stt.addAudioData(audioData)
}

let pauseCopying = false

function containsBracketsOrParentheses(text) {
  return /[\[\]()]/.test(text)
}

function getTranscription() {
  const result = stt.getTranscribed()
  debugLog(
    `Received ${result.msgs ? result.msgs.length : 0} transcribed messages`
  )
  if (result && result.msgs && result.msgs.length > 0) {
    result.msgs.forEach((msg, index) => {
      debugLog(`Message ${index + 1}: ${JSON.stringify(msg)}`)
      if (msg.text.toLowerCase().includes('pause copying')) {
        pauseCopying = !pauseCopying
        debugLog(`Pause copying toggled: ${pauseCopying}`)
      }
      if (!msg.isPartial && !containsBracketsOrParentheses(msg.text)) {
        console.log(msg.text)
        if (!pauseCopying) {
          const currentClipboard = clipboard.readSync()
          clipboard.writeSync(currentClipboard + msg.text)
          debugLog(`Added to clipboard: "${msg.text}"`)
        }
      }
    })
  } else {
    debugLog('No transcribed messages received')
  }
}

setInterval(getTranscription, 300)

process.on('SIGINT', () => {
  debugLog('Received SIGINT, cleaning up')
  microphone.stopRecording()
  stt.destroy()
  process.exit()
})

console.log('Whisper model loaded successfully. Starting transcription...')
console.log('Listening to your microphone. Speak now...')
console.log('Press Ctrl+C to stop.')

v.addListener(function (e, down) {
  if (
    e.state == 'UP' &&
    e.name === 'V' &&
    (down['LEFT META'] || down['RIGHT META'])
  ) {
    debugLog('Keyboard shortcut detected: CMD+V')
    console.log('pauseCopying:', pauseCopying)
    if (!pauseCopying) {
      clipboard.writeSync('') // Clear the clipboard
      console.log('Clipboard cleared')
      debugLog('Clipboard cleared')
    }
    return /* dont consume event, let the system do that */ false
  }
})
