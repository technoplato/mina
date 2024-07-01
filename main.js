const { RealtimeSttWhisper } = require('bindings')('addon')
const fs = require('fs')
const path = require('path')
const clipboard = require('clipboardy')
const AudioRecorder = require('./audioRecorder')

const models = {
  tiny: 'tiny.en',
  base: 'base.en',
  large: 'large',
}
const modelPath = `../whisper.cpp/models/ggml-${models.tiny}.bin`

const kModelFile = path.join(__dirname, modelPath)
if (!fs.existsSync(kModelFile)) {
  console.error(`Cannot find whisper model file '${kModelFile}'. Abort.`)
  process.exit(1)
}

const stt = new RealtimeSttWhisper(kModelFile)

const kSampleRate = 16000

const recorder = new AudioRecorder(kSampleRate, (audioData) => {
  stt.addAudioData(audioData)
})

recorder.start()

function getTranscription() {
  const result = stt.getTranscribed()
  if (result && result.msgs && result.msgs.length > 0) {
    const lastMsg = result.msgs[result.msgs.length - 1]
    if (!lastMsg.isPartial) {
      clipboard.writeSync(lastMsg.text)
      console.log('Transcribed and copied to clipboard:', lastMsg.text)
    }
  }
}

setInterval(getTranscription, 300)

// Clean up on exit
process.on('SIGINT', () => {
  recorder.stop()
  stt.destroy()
  process.exit()
})
