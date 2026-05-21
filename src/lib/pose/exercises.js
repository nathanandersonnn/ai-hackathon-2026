export const LANDMARK = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,    RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,    RIGHT_WRIST: 16,
  LEFT_HIP: 23,      RIGHT_HIP: 24,
  LEFT_KNEE: 25,     RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,    RIGHT_ANKLE: 28,
}

// A phase transition is only committed after the exit condition holds for this
// many consecutive frames. Prevents MediaPipe coordinate jitter at threshold
// boundaries from triggering phantom reps.
const MIN_CONFIRM = 4

// Minimum landmark visibility score accepted for telemetry updates.
// The state machine always runs regardless of visibility — this threshold only
// gates writes to currentRepData extremes so garbage values don't pollute telemetry.
const VIS_THRESHOLD = 0.3

// Returns true if every listed landmark index meets the visibility threshold.
function allVisible(landmarks, indices) {
  return indices.every(i => (landmarks[i]?.visibility ?? 1) >= VIS_THRESHOLD)
}

export function calculateAngle(a, b, c) {
  if (!a || !b || !c) return null
  // No visibility check here — callers that need a quality gate use allVisible().
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
  const left  = calculateAngle(landmarks[leftTriple[0]],  landmarks[leftTriple[1]],  landmarks[leftTriple[2]])
  const right = calculateAngle(landmarks[rightTriple[0]], landmarks[rightTriple[1]], landmarks[rightTriple[2]])
  if (left == null || right == null) return null
  return (left + right) / 2
}

// Angle of the torso (shoulder-midpoint → hip-midpoint) from vertical, degrees.
// 0° = perfectly upright; 90° = horizontal. Image y grows downward, so an
// upright torso has dy < 0 (shoulders above hips).
export function torsoLean(landmarks) {
  const ls = landmarks[LANDMARK.LEFT_SHOULDER]
  const rs = landmarks[LANDMARK.RIGHT_SHOULDER]
  const lh = landmarks[LANDMARK.LEFT_HIP]
  const rh = landmarks[LANDMARK.RIGHT_HIP]
  if (!ls || !rs || !lh || !rh) return null
  if (
    (ls.visibility ?? 1) < VIS_THRESHOLD || (rs.visibility ?? 1) < VIS_THRESHOLD ||
    (lh.visibility ?? 1) < VIS_THRESHOLD || (rh.visibility ?? 1) < VIS_THRESHOLD
  ) return null
  const sx = (ls.x + rs.x) / 2
  const sy = (ls.y + rs.y) / 2
  const hx = (lh.x + rh.x) / 2
  const hy = (lh.y + rh.y) / 2
  return Math.abs((Math.atan2(Math.abs(sx - hx), -(sy - hy)) * 180) / Math.PI)
}

function emptyRepData() {
  return { minAngle: Infinity, maxTorsoLean: 0 }
}

// Push telemetry only if the rep actually tracked a real angle.
// Reps that complete instantly (jitter phantom) still have minAngle === Infinity.
function commitRep(telemetryHistory, currentRepData) {
  if (isFinite(currentRepData.minAngle)) {
    telemetryHistory.push(currentRepData)
  }
}

// ─── Squat ────────────────────────────────────────────────────────────────────
// Primary joint: knee (hip–knee–ankle bilateral average)
// Phases: standing → descending (angle < 130) → ascending (angle < 100) → standing (angle > 160)

export function createSquatTracker() {
  let phase = 'standing'
  let reps = 0
  let consecutive = 0
  let currentRepData = emptyRepData()
  const telemetryHistory = []

  return {
    label: 'Knee',
    update(landmarks) {
      const angle = bilateralAngle(
        landmarks,
        [LANDMARK.LEFT_HIP,  LANDMARK.LEFT_KNEE,  LANDMARK.LEFT_ANKLE],
        [LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE],
      )
      if (angle == null) { consecutive = 0; return { angle: null, reps, phase } }

      if (phase !== 'standing') {
        if (allVisible(landmarks, [LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE,
                                   LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE])
            && angle < currentRepData.minAngle) currentRepData.minAngle = angle
        const lean = torsoLean(landmarks)
        if (lean != null && lean > currentRepData.maxTorsoLean) currentRepData.maxTorsoLean = lean
      }

      const cond =
        phase === 'standing'   ? angle < 130 :
        phase === 'descending' ? angle < 100 :
        phase === 'ascending'  ? angle > 160 : false

      if (cond) consecutive++; else consecutive = 0

      if (consecutive >= MIN_CONFIRM) {
        consecutive = 0
        if (phase === 'standing') {
          phase = 'descending'
        } else if (phase === 'descending') {
          phase = 'ascending'
        } else if (phase === 'ascending') {
          phase = 'standing'
          reps++
          commitRep(telemetryHistory, currentRepData)
          currentRepData = emptyRepData()
        }
      }

      return { angle, reps, phase }
    },
    getTelemetry() { return telemetryHistory.slice() },
    reset() {
      phase = 'standing'; reps = 0; consecutive = 0
      currentRepData = emptyRepData(); telemetryHistory.length = 0
    },
  }
}

// ─── Push-up ──────────────────────────────────────────────────────────────────
// Primary joint: elbow (shoulder–elbow–wrist bilateral average)
// Phases: up → going_down (angle < 120) → going_up (angle < 90) → up (angle > 150)

export function createPushupTracker() {
  let phase = 'up'
  let reps = 0
  let consecutive = 0
  let currentRepData = emptyRepData()
  const telemetryHistory = []

  return {
    label: 'Elbow',
    update(landmarks) {
      const angle = bilateralAngle(
        landmarks,
        [LANDMARK.LEFT_SHOULDER,  LANDMARK.LEFT_ELBOW,  LANDMARK.LEFT_WRIST],
        [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST],
      )
      if (angle == null) { consecutive = 0; return { angle: null, reps, phase } }

      if (phase !== 'up') {
        if (allVisible(landmarks, [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_ELBOW, LANDMARK.LEFT_WRIST,
                                   LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST])
            && angle < currentRepData.minAngle) currentRepData.minAngle = angle
        const lean = torsoLean(landmarks)
        if (lean != null && lean > currentRepData.maxTorsoLean) currentRepData.maxTorsoLean = lean
      }

      const cond =
        phase === 'up'        ? angle < 120 :
        phase === 'going_down' ? angle < 90  :
        phase === 'going_up'   ? angle > 150 : false

      if (cond) consecutive++; else consecutive = 0

      if (consecutive >= MIN_CONFIRM) {
        consecutive = 0
        if (phase === 'up') {
          phase = 'going_down'
        } else if (phase === 'going_down') {
          phase = 'going_up'
        } else if (phase === 'going_up') {
          phase = 'up'
          reps++
          commitRep(telemetryHistory, currentRepData)
          currentRepData = emptyRepData()
        }
      }

      return { angle, reps, phase }
    },
    getTelemetry() { return telemetryHistory.slice() },
    reset() {
      phase = 'up'; reps = 0; consecutive = 0
      currentRepData = emptyRepData(); telemetryHistory.length = 0
    },
  }
}

// ─── Deadlift ─────────────────────────────────────────────────────────────────
// Primary joint: hip (shoulder–hip–knee bilateral average)
// Phases: standing → descending (angle < 140) → ascending (angle < 110) → standing (angle > 160)

export function createDeadliftTracker() {
  let phase = 'standing'
  let reps = 0
  let consecutive = 0
  let currentRepData = emptyRepData()
  const telemetryHistory = []

  return {
    label: 'Hip',
    update(landmarks) {
      const angle = bilateralAngle(
        landmarks,
        [LANDMARK.LEFT_SHOULDER,  LANDMARK.LEFT_HIP,  LANDMARK.LEFT_KNEE],
        [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE],
      )
      if (angle == null) { consecutive = 0; return { angle: null, reps, phase } }

      if (phase !== 'standing') {
        if (allVisible(landmarks, [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE,
                                   LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE])
            && angle < currentRepData.minAngle) currentRepData.minAngle = angle
        const lean = torsoLean(landmarks)
        if (lean != null && lean > currentRepData.maxTorsoLean) currentRepData.maxTorsoLean = lean
      }

      const cond =
        phase === 'standing'   ? angle < 140 :
        phase === 'descending' ? angle < 110 :
        phase === 'ascending'  ? angle > 160 : false

      if (cond) consecutive++; else consecutive = 0

      if (consecutive >= MIN_CONFIRM) {
        consecutive = 0
        if (phase === 'standing') {
          phase = 'descending'
        } else if (phase === 'descending') {
          phase = 'ascending'
        } else if (phase === 'ascending') {
          phase = 'standing'
          reps++
          commitRep(telemetryHistory, currentRepData)
          currentRepData = emptyRepData()
        }
      }

      return { angle, reps, phase }
    },
    getTelemetry() { return telemetryHistory.slice() },
    reset() {
      phase = 'standing'; reps = 0; consecutive = 0
      currentRepData = emptyRepData(); telemetryHistory.length = 0
    },
  }
}

// ─── Lunge ────────────────────────────────────────────────────────────────────
// Primary joint: the more-flexed knee (min of left and right hip–knee–ankle angle)
// Phases: up → going_down (minAngle < 130) → going_up (minAngle < 100) → up (minAngle > 160)

export function createLungeTracker() {
  let phase = 'up'
  let reps = 0
  let consecutive = 0
  let currentRepData = emptyRepData()
  const telemetryHistory = []

  return {
    label: 'Knee',
    update(landmarks) {
      const left = calculateAngle(
        landmarks[LANDMARK.LEFT_HIP],  landmarks[LANDMARK.LEFT_KNEE],  landmarks[LANDMARK.LEFT_ANKLE],
      )
      const right = calculateAngle(
        landmarks[LANDMARK.RIGHT_HIP], landmarks[LANDMARK.RIGHT_KNEE], landmarks[LANDMARK.RIGHT_ANKLE],
      )
      if (left == null || right == null) { consecutive = 0; return { angle: null, reps, phase } }

      const minAngle = Math.min(left, right)

      if (phase !== 'up') {
        if (allVisible(landmarks, [LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE,
                                   LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE])
            && minAngle < currentRepData.minAngle) currentRepData.minAngle = minAngle
        const lean = torsoLean(landmarks)
        if (lean != null && lean > currentRepData.maxTorsoLean) currentRepData.maxTorsoLean = lean
      }

      const cond =
        phase === 'up'         ? minAngle < 130 :
        phase === 'going_down' ? minAngle < 100 :
        phase === 'going_up'   ? minAngle > 160 : false

      if (cond) consecutive++; else consecutive = 0

      if (consecutive >= MIN_CONFIRM) {
        consecutive = 0
        if (phase === 'up') {
          phase = 'going_down'
        } else if (phase === 'going_down') {
          phase = 'going_up'
        } else if (phase === 'going_up') {
          phase = 'up'
          reps++
          commitRep(telemetryHistory, currentRepData)
          currentRepData = emptyRepData()
        }
      }

      return { angle: minAngle, reps, phase }
    },
    getTelemetry() { return telemetryHistory.slice() },
    reset() {
      phase = 'up'; reps = 0; consecutive = 0
      currentRepData = emptyRepData(); telemetryHistory.length = 0
    },
  }
}

// ─── Bicep Curl ───────────────────────────────────────────────────────────────
// Primary joint: elbow (shoulder–elbow–wrist bilateral average)
// Phases: down (arm extended, ~160°) → curling (angle < 120°) → releasing (angle < 60°) → down (angle > 140°)
// minAngle = peak curl depth (smaller = fuller curl). maxTorsoLean flags body-swing cheating.

export function createBicepCurlTracker() {
  let phase = 'down'
  let reps = 0
  let consecutive = 0
  let currentRepData = emptyRepData()
  const telemetryHistory = []

  return {
    label: 'Elbow',
    update(landmarks) {
      const angle = bilateralAngle(
        landmarks,
        [LANDMARK.LEFT_SHOULDER,  LANDMARK.LEFT_ELBOW,  LANDMARK.LEFT_WRIST],
        [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST],
      )
      if (angle == null) { consecutive = 0; return { angle: null, reps, phase } }

      if (phase !== 'down') {
        if (allVisible(landmarks, [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_ELBOW, LANDMARK.LEFT_WRIST,
                                   LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST])
            && angle < currentRepData.minAngle) currentRepData.minAngle = angle
        const lean = torsoLean(landmarks)
        if (lean != null && lean > currentRepData.maxTorsoLean) currentRepData.maxTorsoLean = lean
      }

      const cond =
        phase === 'down'      ? angle < 120 :
        phase === 'curling'   ? angle < 60  :
        phase === 'releasing' ? angle > 140 : false

      if (cond) consecutive++; else consecutive = 0

      if (consecutive >= MIN_CONFIRM) {
        consecutive = 0
        if (phase === 'down') {
          phase = 'curling'
        } else if (phase === 'curling') {
          phase = 'releasing'
        } else if (phase === 'releasing') {
          phase = 'down'
          reps++
          commitRep(telemetryHistory, currentRepData)
          currentRepData = emptyRepData()
        }
      }

      return { angle, reps, phase }
    },
    getTelemetry() { return telemetryHistory.slice() },
    reset() {
      phase = 'down'; reps = 0; consecutive = 0
      currentRepData = emptyRepData(); telemetryHistory.length = 0
    },
  }
}

// ─── Overhead Press ───────────────────────────────────────────────────────────
// Primary joint: elbow (shoulder–elbow–wrist bilateral average)
// Start with hands at shoulders (elbow ~80°), press straight up to lockout (~170°), lower back down.
// Phases mirror Bicep Curl: down → pressing → lowering → down [rep++]
//   down       → pressing  when angle > 110°  (initiating press)
//   pressing   → lowering  when angle > 160°  (locked out overhead)
//   lowering   → down      when angle <  90°  (rep counts on return to shoulders)

export function createOverheadPressTracker() {
  let phase = 'down'
  let reps = 0
  let consecutive = 0
  let currentRepData = emptyRepData()
  const telemetryHistory = []

  return {
    label: 'Elbow',
    update(landmarks) {
      const angle = bilateralAngle(
        landmarks,
        [LANDMARK.LEFT_SHOULDER,  LANDMARK.LEFT_ELBOW,  LANDMARK.LEFT_WRIST],
        [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST],
      )
      if (angle == null) { consecutive = 0; return { angle: null, reps, phase } }

      if (phase !== 'down') {
        if (allVisible(landmarks, [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_ELBOW, LANDMARK.LEFT_WRIST,
                                   LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST])
            && angle < currentRepData.minAngle) currentRepData.minAngle = angle
        const lean = torsoLean(landmarks)
        if (lean != null && lean > currentRepData.maxTorsoLean) currentRepData.maxTorsoLean = lean
      }

      const cond =
        phase === 'down'     ? angle > 110 :
        phase === 'pressing' ? angle > 160 :
        phase === 'lowering' ? angle < 90  : false

      if (cond) consecutive++; else consecutive = 0

      if (consecutive >= MIN_CONFIRM) {
        consecutive = 0
        if (phase === 'down') {
          phase = 'pressing'
        } else if (phase === 'pressing') {
          phase = 'lowering'
        } else if (phase === 'lowering') {
          phase = 'down'
          reps++
          commitRep(telemetryHistory, currentRepData)
          currentRepData = emptyRepData()
        }
      }

      return { angle, reps, phase }
    },
    getTelemetry() { return telemetryHistory.slice() },
    reset() {
      phase = 'down'; reps = 0; consecutive = 0
      currentRepData = emptyRepData(); telemetryHistory.length = 0
    },
  }
}

// ─── Glute Bridge ─────────────────────────────────────────────────────────────
// Primary joint: hip (shoulder–hip–knee bilateral average)
// Lying with knees bent, hip starts flexed (~110°); drive up to extension (~170°); lower.
// Phases: down → rising → peaked → down [rep++]
//   down    → rising  when angle > 140°
//   rising  → peaked  when angle > 165°
//   peaked  → down    when angle < 130°  (rep counts on return)

export function createGluteBridgeTracker() {
  let phase = 'down'
  let reps = 0
  let consecutive = 0
  let currentRepData = emptyRepData()
  const telemetryHistory = []

  return {
    label: 'Hip',
    update(landmarks) {
      const angle = bilateralAngle(
        landmarks,
        [LANDMARK.LEFT_SHOULDER,  LANDMARK.LEFT_HIP,  LANDMARK.LEFT_KNEE],
        [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE],
      )
      if (angle == null) { consecutive = 0; return { angle: null, reps, phase } }

      if (phase !== 'down') {
        if (allVisible(landmarks, [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE,
                                   LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE])
            && angle < currentRepData.minAngle) currentRepData.minAngle = angle
        const lean = torsoLean(landmarks)
        if (lean != null && lean > currentRepData.maxTorsoLean) currentRepData.maxTorsoLean = lean
      }

      const cond =
        phase === 'down'   ? angle > 140 :
        phase === 'rising' ? angle > 165 :
        phase === 'peaked' ? angle < 130 : false

      if (cond) consecutive++; else consecutive = 0

      if (consecutive >= MIN_CONFIRM) {
        consecutive = 0
        if (phase === 'down') {
          phase = 'rising'
        } else if (phase === 'rising') {
          phase = 'peaked'
        } else if (phase === 'peaked') {
          phase = 'down'
          reps++
          commitRep(telemetryHistory, currentRepData)
          currentRepData = emptyRepData()
        }
      }

      return { angle, reps, phase }
    },
    getTelemetry() { return telemetryHistory.slice() },
    reset() {
      phase = 'down'; reps = 0; consecutive = 0
      currentRepData = emptyRepData(); telemetryHistory.length = 0
    },
  }
}

// ─── Sit-up ───────────────────────────────────────────────────────────────────
// Primary joint: hip (shoulder–hip–knee bilateral average)
// Lying flat (angle ~170°); crunch up so the torso closes toward the thighs (~80°); release.
// Phases: down → curling → crunched → down [rep++]
//   down     → curling   when angle < 140°
//   curling  → crunched  when angle <  90°
//   crunched → down      when angle > 150°  (rep counts on return)

export function createSitupTracker() {
  let phase = 'down'
  let reps = 0
  let consecutive = 0
  let currentRepData = emptyRepData()
  const telemetryHistory = []

  return {
    label: 'Hip',
    update(landmarks) {
      const angle = bilateralAngle(
        landmarks,
        [LANDMARK.LEFT_SHOULDER,  LANDMARK.LEFT_HIP,  LANDMARK.LEFT_KNEE],
        [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE],
      )
      if (angle == null) { consecutive = 0; return { angle: null, reps, phase } }

      if (phase !== 'down') {
        if (allVisible(landmarks, [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE,
                                   LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE])
            && angle < currentRepData.minAngle) currentRepData.minAngle = angle
      }

      const cond =
        phase === 'down'     ? angle < 140 :
        phase === 'curling'  ? angle < 90  :
        phase === 'crunched' ? angle > 150 : false

      if (cond) consecutive++; else consecutive = 0

      if (consecutive >= MIN_CONFIRM) {
        consecutive = 0
        if (phase === 'down') {
          phase = 'curling'
        } else if (phase === 'curling') {
          phase = 'crunched'
        } else if (phase === 'crunched') {
          phase = 'down'
          reps++
          commitRep(telemetryHistory, currentRepData)
          currentRepData = emptyRepData()
        }
      }

      return { angle, reps, phase }
    },
    getTelemetry() { return telemetryHistory.slice() },
    reset() {
      phase = 'down'; reps = 0; consecutive = 0
      currentRepData = emptyRepData(); telemetryHistory.length = 0
    },
  }
}

// ─── Lateral Raise ────────────────────────────────────────────────────────────
// Primary joint: shoulder abduction (hip–shoulder–elbow bilateral average)
// Arms at sides (~15°) raised laterally to horizontal (~90°), then lowered.
// Phases: down → raising → topped → down [rep++]
//   down    → raising  when angle > 45°
//   raising → topped   when angle > 80°
//   topped  → down     when angle < 25°  (rep counts on return)

export function createLateralRaiseTracker() {
  let phase = 'down'
  let reps = 0
  let consecutive = 0
  let currentRepData = emptyRepData()
  const telemetryHistory = []

  return {
    label: 'Shoulder',
    update(landmarks) {
      const angle = bilateralAngle(
        landmarks,
        [LANDMARK.LEFT_HIP,  LANDMARK.LEFT_SHOULDER,  LANDMARK.LEFT_ELBOW],
        [LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW],
      )
      if (angle == null) { consecutive = 0; return { angle: null, reps, phase } }

      if (phase !== 'down') {
        if (allVisible(landmarks, [LANDMARK.LEFT_HIP, LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_ELBOW,
                                   LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW])
            && angle < currentRepData.minAngle) currentRepData.minAngle = angle
        const lean = torsoLean(landmarks)
        if (lean != null && lean > currentRepData.maxTorsoLean) currentRepData.maxTorsoLean = lean
      }

      const cond =
        phase === 'down'    ? angle > 45 :
        phase === 'raising' ? angle > 80 :
        phase === 'topped'  ? angle < 25 : false

      if (cond) consecutive++; else consecutive = 0

      if (consecutive >= MIN_CONFIRM) {
        consecutive = 0
        if (phase === 'down') {
          phase = 'raising'
        } else if (phase === 'raising') {
          phase = 'topped'
        } else if (phase === 'topped') {
          phase = 'down'
          reps++
          commitRep(telemetryHistory, currentRepData)
          currentRepData = emptyRepData()
        }
      }

      return { angle, reps, phase }
    },
    getTelemetry() { return telemetryHistory.slice() },
    reset() {
      phase = 'down'; reps = 0; consecutive = 0
      currentRepData = emptyRepData(); telemetryHistory.length = 0
    },
  }
}

// ─── Tricep Extension (overhead) ──────────────────────────────────────────────
// Primary joint: elbow (shoulder–elbow–wrist bilateral average)
// Hands overhead with elbows bent (~70°), extend straight up (~170°), return.
// Phase pattern matches Overhead Press but cued for the overhead-tricep movement.
//   down       → extending  when angle > 110°
//   extending  → topped     when angle > 160°
//   topped     → down       when angle <  80°  (rep counts on return)

export function createTricepExtensionTracker() {
  let phase = 'down'
  let reps = 0
  let consecutive = 0
  let currentRepData = emptyRepData()
  const telemetryHistory = []

  return {
    label: 'Elbow',
    update(landmarks) {
      const angle = bilateralAngle(
        landmarks,
        [LANDMARK.LEFT_SHOULDER,  LANDMARK.LEFT_ELBOW,  LANDMARK.LEFT_WRIST],
        [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST],
      )
      if (angle == null) { consecutive = 0; return { angle: null, reps, phase } }

      if (phase !== 'down') {
        if (allVisible(landmarks, [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_ELBOW, LANDMARK.LEFT_WRIST,
                                   LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST])
            && angle < currentRepData.minAngle) currentRepData.minAngle = angle
      }

      const cond =
        phase === 'down'      ? angle > 110 :
        phase === 'extending' ? angle > 160 :
        phase === 'topped'    ? angle < 80  : false

      if (cond) consecutive++; else consecutive = 0

      if (consecutive >= MIN_CONFIRM) {
        consecutive = 0
        if (phase === 'down') {
          phase = 'extending'
        } else if (phase === 'extending') {
          phase = 'topped'
        } else if (phase === 'topped') {
          phase = 'down'
          reps++
          commitRep(telemetryHistory, currentRepData)
          currentRepData = emptyRepData()
        }
      }

      return { angle, reps, phase }
    },
    getTelemetry() { return telemetryHistory.slice() },
    reset() {
      phase = 'down'; reps = 0; consecutive = 0
      currentRepData = emptyRepData(); telemetryHistory.length = 0
    },
  }
}

export function createTracker(exercise) {
  if (exercise === 'Squat')             return createSquatTracker()
  if (exercise === 'Push-up')           return createPushupTracker()
  if (exercise === 'Deadlift')          return createDeadliftTracker()
  if (exercise === 'Lunge')             return createLungeTracker()
  if (exercise === 'Bicep Curl')        return createBicepCurlTracker()
  if (exercise === 'Overhead Press')    return createOverheadPressTracker()
  if (exercise === 'Glute Bridge')      return createGluteBridgeTracker()
  if (exercise === 'Sit-up')            return createSitupTracker()
  if (exercise === 'Lateral Raise')     return createLateralRaiseTracker()
  if (exercise === 'Tricep Extension')  return createTricepExtensionTracker()
  return null
}
