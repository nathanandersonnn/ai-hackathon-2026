export const LANDMARK = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
}

export function calculateAngle(a, b, c) {
  if (!a || !b || !c) return null
  const v1x = a.x - b.x
  const v1y = a.y - b.y
  const v2x = c.x - b.x
  const v2y = c.y - b.y
  const dot = v1x * v2x + v1y * v2y
  const m1 = Math.hypot(v1x, v1y)
  const m2 = Math.hypot(v2x, v2y)
  if (m1 === 0 || m2 === 0) return null
  const cos = Math.max(-1, Math.min(1, dot / (m1 * m2)))
  return (Math.acos(cos) * 180) / Math.PI
}

function bilateralAngle(landmarks, leftTriple, rightTriple) {
  const left = calculateAngle(landmarks[leftTriple[0]], landmarks[leftTriple[1]], landmarks[leftTriple[2]])
  const right = calculateAngle(landmarks[rightTriple[0]], landmarks[rightTriple[1]], landmarks[rightTriple[2]])
  if (left == null || right == null) return null
  return (left + right) / 2
}

export function createSquatTracker() {
  let phase = 'standing'
  let reps = 0

  return {
    label: 'Knee',
    update(landmarks) {
      const angle = bilateralAngle(
        landmarks,
        [LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE],
        [LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE],
      )
      if (angle == null) return { angle: null, reps, phase }

      if (phase === 'standing' && angle < 130) phase = 'descending'
      else if (phase === 'descending' && angle < 100) phase = 'ascending'
      else if (phase === 'ascending' && angle > 160) {
        phase = 'standing'
        reps += 1
      }
      return { angle, reps, phase }
    },
  }
}

export function createPushupTracker() {
  let phase = 'up'
  let reps = 0

  return {
    label: 'Elbow',
    update(landmarks) {
      const angle = bilateralAngle(
        landmarks,
        [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_ELBOW, LANDMARK.LEFT_WRIST],
        [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST],
      )
      if (angle == null) return { angle: null, reps, phase }

      if (phase === 'up' && angle < 120) phase = 'going_down'
      else if (phase === 'going_down' && angle < 90) phase = 'going_up'
      else if (phase === 'going_up' && angle > 150) {
        phase = 'up'
        reps += 1
      }
      return { angle, reps, phase }
    },
  }
}

export function createDeadliftTracker() {
  let phase = 'standing'
  let reps = 0

  return {
    label: 'Hip',
    update(landmarks) {
      const angle = bilateralAngle(
        landmarks,
        [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE],
        [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE],
      )
      if (angle == null) return { angle: null, reps, phase }

      if (phase === 'standing' && angle < 140) phase = 'descending'
      else if (phase === 'descending' && angle < 110) phase = 'ascending'
      else if (phase === 'ascending' && angle > 160) {
        phase = 'standing'
        reps += 1
      }
      return { angle, reps, phase }
    },
  }
}

export function createLungeTracker() {
  let phase = 'up'
  let reps = 0

  return {
    label: 'Knee',
    update(landmarks) {
      const left = calculateAngle(
        landmarks[LANDMARK.LEFT_HIP],
        landmarks[LANDMARK.LEFT_KNEE],
        landmarks[LANDMARK.LEFT_ANKLE],
      )
      const right = calculateAngle(
        landmarks[LANDMARK.RIGHT_HIP],
        landmarks[LANDMARK.RIGHT_KNEE],
        landmarks[LANDMARK.RIGHT_ANKLE],
      )
      if (left == null || right == null) return { angle: null, reps, phase }

      const minAngle = Math.min(left, right)

      if (phase === 'up' && minAngle < 130) phase = 'going_down'
      else if (phase === 'going_down' && minAngle < 100) phase = 'going_up'
      else if (phase === 'going_up' && minAngle > 160) {
        phase = 'up'
        reps += 1
      }
      return { angle: minAngle, reps, phase }
    },
  }
}

export function createTracker(exercise) {
  if (exercise === 'Squat') return createSquatTracker()
  if (exercise === 'Push-up') return createPushupTracker()
  if (exercise === 'Deadlift') return createDeadliftTracker()
  if (exercise === 'Lunge') return createLungeTracker()
  return null
}
