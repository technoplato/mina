window.AudioContext = window.AudioContext || window.webkitAudioContext
window.OfflineAudioContext =
  window.OfflineAudioContext || window.webkitOfflineAudioContext

const kSampleRate = 16000
let seconds = 0
const info = document.getElementById('info')
info.innerText = 'Loading...'

/** @type {AudioContext} */
let context

async function showMediaDevices() {
  // console.log('showMediaDevices')
  const devices = await navigator.mediaDevices.enumerateDevices()
  // console.log(devices)
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
    setInterval(() => {
      seconds = seconds + 1
      info.innerText = seconds
    }, 1000)
    info.innerText = ''
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
      // console.log('from worklet:', recordBuffer[0])
      window.electronAPI.invoke(
        /*TODO: fix require not defiend and import this*/ 'add-audio-data',
        recordBuffer[0]
      )
    }
    source.connect(worklet)
    worklet.connect(context.destination)
  })
}

startRecording()

function isSurroundedByBrackets(input) {
  return /[\[\(].*[\]\)]/.test(input)
}

/**
 * A function that returns true if the input is surrounded by [] or []
 */
function shouldIgnore(input) {
  return isSurroundedByBrackets(input)
}

/** Update view. */
const texts = document.getElementById('texts')

// Add a listener for text highlights
texts.addEventListener('mouseup', () => {
  const selection = window.getSelection().toString()
  if (selection) {
    navigator.clipboard.writeText(selection)
  }
})

const textUpdateInterval = setInterval(async () => {
  const result = await window.electronAPI.invoke('get-transcribed')
  if (!result) return

  for (let i = 0; i < result.msgs.length; i++) {
    const msg = result.msgs[i]
    if (shouldIgnore(msg.text)) continue
    // console.log(JSON.stringify(msg, null, 2))
    const lastTextNode = texts.lastChild

    if (!lastTextNode || lastTextNode.dataset.partial === 'false') {
      const text = document.createElement('div')
      text.innerText = seconds + '\t' + msg.text
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
      lastTextNode.innerText = seconds + '\t' + msg.text

      if (!msg.isPartial) {
        lastTextNode.style.color = 'black'
        lastTextNode.dataset.partial = 'false'
      }
    }

    const distanceFromBottom = Math.abs(
      document.body.scrollHeight - window.scrollY - window.innerHeight
    )
    const howFarAwayFromBottomWhereWeShouldScroll = 100
    const shouldAutoScroll =
      distanceFromBottom < howFarAwayFromBottomWhereWeShouldScroll
    if (shouldAutoScroll) {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth',
      })
    }
  }
}, 300)

let currentResultIndex = 0
const searchBox = document.getElementById('search-box')
// searchBox.addEventListener('input', search)

function search() {
  const query = searchBox.value.trim().toLowerCase()
  const textElements = document.querySelectorAll('#texts .text')

  console.log({ query, textElements })
  textElements.forEach((textElement) => {
    const text = textElement.innerText.trim().toLowerCase()
    if (text.includes(query)) {
      textElement.style.display = 'block'
      textElement.style.backgroundColor = 'yellow'
    } else {
      textElement.style.display = 'none'
      textElement.style.backgroundColor = 'transparent'
    }
  })
}
