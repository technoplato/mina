const mic = require('node-microphone')
const wav = require('wav')

class AudioRecorder {
  constructor(sampleRate, onData) {
    this.sampleRate = sampleRate
    this.onData = onData
    this.microphone = new mic()
  }

  start() {
    const micStream = this.microphone.startRecording()

    const reader = new wav.Reader()
    reader.on('format', (format) => {
      console.log('WAV format:', format)
    })

    reader.on('data', (buffer) => {
      // Convert buffer to Float32Array
      const floatData = new Float32Array(buffer.length / 2)
      for (let i = 0; i < buffer.length / 2; i++) {
        floatData[i] = buffer.readInt16LE(i * 2) / 32768.0
      }
      this.onData(floatData)
    })

    micStream.pipe(reader)

    micStream.on('error', (error) => {
      console.error('Error in microphone stream:', error)
    })
  }

  stop() {
    this.microphone.stopRecording()
  }
}

module.exports = AudioRecorder
