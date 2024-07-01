window.AudioContext = window.AudioContext || window.webkitAudioContext
window.OfflineAudioContext =
  window.OfflineAudioContext || window.webkitOfflineAudioContext

const kSampleRate = 16000
let seconds = 0
let timestamp = ''
const info = document.getElementById('info')
info.innerText = '⚠️ wait'

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');

    let textElements = document.getElementsByClassName('text');
    for (let i = 0; i < textElements.length; i++) {
        textElements[i].classList.toggle('dark-mode');
    }
}

document.addEventListener('keydown', function(event) {
    // Check if either the control or command key was pressed along with the D key
    if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
        toggleDarkMode();
    }
});


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
      // info.innerText = formatSecondsAsTimestamp(seconds)
      // Format the milliseconds a timestamp
      // The timestamp should look like this - February 19, 2023 - 21:30:42.223
      // create a new Date object with the current date and time
      const now = new Date()

      // get the month, day, year, hour, minute, second, and millisecond values from the Date object
      const month = now.toLocaleString('default', { month: 'long' })
      const day = now.getDate()
      const year = now.getFullYear()
      const hour = now.getHours()
      const minute = now.getMinutes()
      const second = now.getSeconds()
      const millisecond = now.getMilliseconds()

      // format the timestamp
      timestamp = `${month} ${day}, ${year} - ${hour}:${minute}:${second}.${millisecond}`

      info.innerText = timestamp
    }, 1)
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
  return isSurroundedByBrackets(input) || input.length === 1
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
    text.innerText = msg.text
    text.classList.add('text')
    if (document.body.classList.contains('dark-mode')) {
        text.classList.add('dark-mode');
    }
    if (msg.isPartial) {
        text.dataset.partial = 'true'
    } else {
        text.dataset.partial = 'false'
    }
    texts.append(text)
}
 else {
      lastTextNode.innerText =
        // timestamp +
        '\n' + msg.text

      if (!msg.isPartial) {
        try {
          navigator.clipboard.writeText(msg.text)
        } catch (err) {
          console.error('Failed to copy: ', err)
        }

        console.log("lastTextNode.style.color = 'black'")
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
// const { remote } = require('electron')
// const fs = remote.require('fs')
// const { app } = require('electron')
// const fs = require('fs')

// Listen for the before-quit event to save the transcript data to a file
/**
 * This code listens for the before-quit event on the app module, and then retrieves the transcript data from the texts
 * element using the innerText property. It then generates a filename based on the current timestamp, writes the
 * transcript data to a file using the fs.writeFile() method, and logs a message to the console indicating whether the
 * operation was successful.
 */
// app.on('before-quit', () => {
//   const transcriptData = document.getElementById('texts').innerText
//   const date = new Date()
//   const filename = `transcript_${date.getTime()}.txt`

//   fs.writeFile(filename, transcriptData, (err) => {
//     if (err) {
//       console.error(`Failed to save transcript data to ${filename}:`, err)
//     } else {
//       console.log(`Transcript data saved to ${filename}`)
//     }
//   })
// })
