window.AudioContext = window.AudioContext || window.webkitAudioContext
window.OfflineAudioContext =
  window.OfflineAudioContext || window.webkitOfflineAudioContext

const kSampleRate = 16000

/** @type {AudioContext} */
let context

async function showMediaDevices() {
  console.log('showMediaDevices')
  const devices = await navigator.mediaDevices.enumerateDevices()
  console.log(devices)
}

showMediaDevices().catch(console.error)

function startRecording() {
  if (!context) {
    context = new AudioContext({
      sampleRate: kSampleRate,
      channelCount: 1,
      echoCancellation: false,
      autoGainControl: true,
      noiseSuppression: true,
    })
  }

  navigator.mediaDevices.getUserMedia({ audio: true }).then(async (stream) => {
    await context.audioWorklet.addModule('recorderWorklet.js')
    const source = new MediaStreamAudioSourceNode(context, {
      mediaStream: stream,
    })
    const worklet = new AudioWorkletNode(context, 'recorder-processor', {
      processorOptions: { channelCount: 1, reportSize: 3072 },
    })
    worklet.onprocessorerror = console.trace
    worklet.port.onmessage = async (e) => {
      const { recordBuffer, sampleRate, currentFrame } = e.data
      // console.log("from worklet:", recordBuffer, sampleRate, currentFrame);
      if (recordBuffer[0].length === 0) return
      window.electronAPI.invoke('add-audio-data', recordBuffer[0])
    }
    source.connect(worklet)
    worklet.connect(context.destination)
  })
}

startRecording()

const ignoredText = [
  '(buzzer)',
  ' (buzzer)',
  '[buzzer]',
  ' (buzzer buzzing)',
  ' (static)',
  '[BLANK_AUDIO]',
  ' [BLANK_AUDIO]',
  '[ Pause ]',
  ' [ Inaudible ]',
  ' [ Pause ]',
  ' [ silence ]',
  ' [ Silence ]',
]

// const shouldIgnore = (text) => {
//   return ignoredText.includes(text)
// }

const regex = /\s?\[?(buzzer|BLANK_AUDIO|Pause|Inaudible|silence)\]?\s?/i

const shouldIgnore = (text) => {
  return regex.test(text)
}

/** Update view. */
const texts = document.getElementById('texts')
const textUpdateInterval = setInterval(async () => {
  const result = await window.electronAPI.invoke('get-transcribed')
  if (!result) return

  for (let i = 0; i < result.msgs.length; i++) {
    const msg = result.msgs[i]
    if (shouldIgnore(msg.text)) continue
    console.log(JSON.stringify(msg, null, 2))
    const lastTextNode = texts.lastChild

    if (!lastTextNode || lastTextNode.dataset.partial === 'false') {
      const text = document.createElement('div')
      text.innerText = msg.text
      text.classList.add('text')
      if (msg.isPartial) {
        text.style.color = '#256FEF'
        text.dataset.partial = 'true'
      } else {
        text.style.color = '#000000'
        text.dataset.partial = 'false'
      }
      texts.append(text)
    } else {
      lastTextNode.innerText = msg.text
      if (!msg.isPartial) {
        lastTextNode.style.color = 'black'
        lastTextNode.dataset.partial = 'false'
      }
    }

    // window.scrollTo({
    //   top: document.body.scrollHeight,
    //   behavior: 'smooth',
    // })
    // Check if the user has scrolled up

    const x = document.body.scrollHeight - window.scrollY - window.innerHeight
    const howFarAwayFromBottomWhereWeShouldScroll = 100
    console.log({ x })
    const shouldAutoScroll =
      Math.abs(x) < howFarAwayFromBottomWhereWeShouldScroll
    if (shouldAutoScroll) {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth',
      })
    }
  }
}, 300)
