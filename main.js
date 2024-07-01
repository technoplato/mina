const { RealtimeSttWhisper } = require('bindings')('addon')
const fs = require('fs')
const path = require('path')
const clipboard = require('clipboardy')
const mic = require('node-microphone')
const wav = require('wav')

const models = {
  tiny: 'tiny.en',
  base: 'base.en',
  large: 'large',
}
const modelPath = path.join(
  __dirname,
  'whisper.cpp',
  'models',
  `ggml-${models.tiny}.bin`
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

function getTranscription() {
  const result = stt.getTranscribed()
  if (result && result.msgs && result.msgs.length > 0) {
    const lastMsg = result.msgs[result.msgs.length - 1]
    if (!lastMsg.isPartial) {
      clipboard.writeSync(lastMsg.text)
      console.log(lastMsg.text)
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

const { GlobalKeyboardListener } = require('node-global-key-listener')
console.log(GlobalKeyboardListener)
const v = new GlobalKeyboardListener()

//Log every key that's pressed.
v.addListener(function (e, down) {
  console.log(
    `${e.name} ${e.state == 'DOWN' ? 'DOWN' : 'UP  '} [${e.rawKey._nameRaw}]`
  )
})

//Capture Windows + Space on Windows and Command + Space on Mac
v.addListener(function (e, down) {
  if (
    e.state == 'DOWN' &&
    e.name == 'SPACE' &&
    (down['LEFT META'] || down['RIGHT META'])
  ) {
    //call your function
    return true
  }
})

//Capture ALT + F
v.addListener(function (e, down) {
  if (
    e.state == 'DOWN' &&
    e.name == 'F' &&
    (down['LEFT ALT'] || down['RIGHT ALT'])
  ) {
    //call your function
    return true
  }
})

//Call one listener only once (demonstrating removeListener())
calledOnce = function (e) {
  console.log('only called once')
  v.removeListener(calledOnce)
}
v.addListener(calledOnce)
