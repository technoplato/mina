const { RealtimeSttWhisper } = require('bindings')('addon')
const fs = require('fs')
const path = require('path')
const clipboard = require('clipboardy')
const mic = require('node-microphone')
const wav = require('wav')
const { GlobalKeyboardListener } = require('node-global-key-listener')
const v = new GlobalKeyboardListener()

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

const stt = new RealtimeSttWhisper(modelPath)
const kSampleRate = 16000

// Audio recording logic
const microphone = new mic()
const micStream = microphone.startRecording()
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
  processAudioData(floatData)
})

micStream.pipe(reader)

micStream.on('error', (error) => {
  console.error('Error in microphone stream:', error)
})

function processAudioData(audioData) {
  stt.addAudioData(audioData)
}

let pauseCopying = false

function containsBracketsOrParentheses(text) {
  return /[\[\]()]/.test(text)
}

function getTranscription() {
  const result = stt.getTranscribed()
  if (result && result.msgs && result.msgs.length > 0) {
    const lastMsg = result.msgs[result.msgs.length - 1]
    if (lastMsg.text.toLowerCase().includes('pause copying')) {
      pauseCopying = !pauseCopying
    }
    if (!lastMsg.isPartial && !containsBracketsOrParentheses(lastMsg.text)) {
      console.log(lastMsg.text)
      if (!pauseCopying) {
        const currentClipboard = clipboard.readSync()
        clipboard.writeSync(currentClipboard + lastMsg.text)
      }
    }
  }
}

setInterval(getTranscription, 300)

// Clean up on exit
process.on('SIGINT', () => {
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
    console.log('pauseCopying:', pauseCopying)
    if (!pauseCopying) {
      clipboard.writeSync('') // Clear the clipboard
      console.log('Clipboard cleared')
    }
    return /* dont consume event, let the system do that */ false
  }
})
