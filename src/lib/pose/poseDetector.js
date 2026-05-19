import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

let landmarkerPromise = null

async function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL)
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
      })
    })()
  }
  return landmarkerPromise
}

export async function createPoseSession(video, onFrame) {
  const landmarker = await getLandmarker()
  let rafId = null
  let lastTimestamp = -1
  let running = true

  function tick() {
    if (!running) return
    if (video.readyState >= 2 && !video.paused && !video.ended) {
      const ts = performance.now()
      if (ts !== lastTimestamp) {
        const result = landmarker.detectForVideo(video, ts)
        lastTimestamp = ts
        if (result?.landmarks?.length) {
          onFrame(result, ts)
        }
      }
    }
    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)

  return {
    stop() {
      running = false
      if (rafId) cancelAnimationFrame(rafId)
    },
  }
}

export const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
]
