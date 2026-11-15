import { HORSE_HEIGHT, HorseModel } from './HorseModel.js'

/** Clip lengths for viewer scrub / progress (match clips.js CLIP_META). */
const CLIP_SECONDS = {
  // One full graze look L→R→L (slow).
  idle: 10,
  walk: 0.7,
  trot: 0.45,
}

/** Idle graze: +pitch tips nose toward the ground (forward); yaw period ≈ CLIP_SECONDS.idle. */
const GRAZE_NECK_PITCH = 1.05
const GRAZE_HEAD_PITCH = 0.42
const GRAZE_YAW_AMP = 0.42
const ALERT_NECK_PITCH = 0.18
const ALERT_HEAD_PITCH = 0.2

const STAMP_DURATION = 0.7
const STAMP_WAIT_MIN = 1.1
const STAMP_WAIT_MAX = 3.4

/**
 * CharacterBody-like wrapper for the procedural horse.
 * Clips: idle | walk | trot — seek/progress/pause for the Animation Viewer.
 */
export class HorseBody {
  constructor({ height = HORSE_HEIGHT } = {}) {
    this.model = new HorseModel(height)
    this.root = this.model.root
    this.root.name = 'horse_body'
    this._clip = 'idle'
    this._gaitPhase = 0
    this._weight = 0
    this._idleT = 0
    this._paused = false
    this._progress = 0
    // Idle hoof fidget: one leg at a time lifts then settles.
    this._stampLeg = -1
    this._stampT = 0
    this._stampWait = 0.6 + Math.random() * 1.2
    this._legLifts = [0, 0, 0, 0]
  }

  get saddle() {
    return this.model.saddle
  }

  get materials() {
    return null
  }

  get bodyY() {
    return this.model.body?.position?.y ?? 0
  }

  play(clip) {
    const name = clip === 'walk' || clip === 'trot' || clip === 'idle' ? clip : 'idle'
    if (this._clip === name) return true
    this._clip = name
    this._progress = 0
    this._gaitPhase = 0
    this._weight = name === 'idle' ? 0 : name === 'trot' ? 1 : 0.7
    if (name !== 'idle') this._clearStamps()
    return true
  }

  _clearStamps() {
    this._stampLeg = -1
    this._stampT = 0
    this._legLifts = [0, 0, 0, 0]
  }

  /** Smooth 0→1→0 lift envelope for one stamp. */
  _stampEnvelope(u) {
    const t = Math.min(1, Math.max(0, u))
    return Math.sin(Math.PI * t)
  }

  /**
   * Advance random idle stomps. When seeking, use a deterministic pattern from idleT
   * so the Animation Viewer scrub still shows lifts.
   */
  _updateStamps(dt, { seek = false } = {}) {
    const graze = 1 - this._weight
    if (graze < 0.35) {
      this._clearStamps()
      return
    }

    if (seek) {
      // ~every 2.4s a different leg lifts for STAMP_DURATION (stable under scrub).
      const cycle = 2.4
      const local = this._idleT % cycle
      const slot = Math.floor(this._idleT / cycle)
      const leg = ((slot * 3 + 1) % 4 + 4) % 4
      const lifts = [0, 0, 0, 0]
      if (local < STAMP_DURATION) lifts[leg] = this._stampEnvelope(local / STAMP_DURATION) * graze
      this._legLifts = lifts
      return
    }

    if (this._stampLeg < 0) {
      this._stampWait -= dt
      if (this._stampWait <= 0) {
        this._stampLeg = Math.floor(Math.random() * 4)
        this._stampT = 0
      }
    } else {
      this._stampT += dt
      const u = this._stampT / STAMP_DURATION
      const lifts = [0, 0, 0, 0]
      if (u >= 1) {
        this._stampLeg = -1
        this._stampWait = STAMP_WAIT_MIN + Math.random() * (STAMP_WAIT_MAX - STAMP_WAIT_MIN)
        this._legLifts = lifts
      } else {
        lifts[this._stampLeg] = this._stampEnvelope(u) * graze
        this._legLifts = lifts
      }
    }
  }

  get current() {
    return this._clip
  }

  setPaused(paused) {
    this._paused = Boolean(paused)
  }

  get paused() {
    return this._paused
  }

  setViewerHoldOnce() {}

  setViewerLoopOnce() {}

  setAppearance() {}

  setAttachmentSettings() {}

  seek(u) {
    const t = Math.min(1, Math.max(0, Number(u) || 0))
    this._progress = t
    this._applyFromProgress()
    return t
  }

  get progress() {
    return this._progress
  }

  _seconds() {
    return CLIP_SECONDS[this._clip] ?? 1
  }

  _applyFromProgress() {
    const moving = this._clip === 'walk' || this._clip === 'trot'
    const targetWeight = moving ? (this._clip === 'trot' ? 1 : 0.7) : 0
    this._weight = targetWeight
    if (moving) {
      this._gaitPhase = this._progress
      this._idleT = 0
      this._clearStamps()
    } else {
      this._gaitPhase = 0
      this._idleT = this._progress * this._seconds()
      this._updateStamps(0, { seek: true })
    }
    this._writePose()
  }

  _writePose() {
    const graze = 1 - this._weight
    const trot = this._clip === 'trot' ? 1 : 0
    const walk = this._clip === 'walk' ? 1 : 0
    // Slow look left / right while grazing (one full cycle per idle clip length).
    const look = Math.sin((this._idleT * (Math.PI * 2)) / CLIP_SECONDS.idle)
    const grazeBob = Math.sin(this._idleT * 1.35) * 0.05 * graze
    const breathe = Math.sin(this._idleT * Math.PI * 2 * 0.35) * 0.015 * graze
    // One nod per gait cycle; trot holds the nose farther forward with a slower bounce.
    const gaitNod = Math.sin(this._gaitPhase * Math.PI * 2) * this._weight
    const neckPitch =
      GRAZE_NECK_PITCH * graze +
      (ALERT_NECK_PITCH + this._weight * 0.08 + walk * 0.1 + trot * 0.52) * this._weight +
      grazeBob +
      gaitNod * (0.05 * walk + 0.14 * trot)
    const headPitch =
      GRAZE_HEAD_PITCH * graze +
      (ALERT_HEAD_PITCH + walk * 0.06 + trot * 0.28) * this._weight +
      grazeBob * 0.55 +
      gaitNod * (0.04 * walk + 0.09 * trot)
    const neckYaw = look * GRAZE_YAW_AMP * graze
    const headYaw = look * GRAZE_YAW_AMP * 0.35 * graze
    // Idle: slow swish; walk/trot: stronger side sway (gait also adds in applyPose).
    const tailSwing =
      Math.sin(this._idleT * 1.05) * 0.28 * graze + Math.sin(this._idleT * 2.4) * 0.12 * this._weight
    const tailCurl = 0.4 + Math.sin(this._idleT * 0.9) * 0.08 * graze + this._weight * 0.12
    this.model.applyPose({
      gait: this._gaitPhase,
      weight: this._weight,
      bounce:
        breathe +
        this._weight * (0.02 + trot * 0.03) * Math.abs(Math.sin(this._gaitPhase * Math.PI * 2)),
      neckPitch,
      neckYaw,
      headPitch,
      headYaw,
      tailSwing,
      tailCurl,
      legLifts: this._legLifts,
    })
  }

  update(dt, travel = 0) {
    if (this._paused || !(dt > 0) || dt > 0.1) return
    const moving = this._clip === 'walk' || this._clip === 'trot'
    const targetWeight = moving ? (this._clip === 'trot' ? 1 : 0.7) : 0
    this._weight += (targetWeight - this._weight) * (1 - Math.exp(-(moving ? 8 : 12) * dt))

    if (this._weight > 0.02) {
      const stride = this._clip === 'trot' ? 2.8 : 2.2
      const stepped = Math.min(0.6, Math.max(0, travel ?? 0))
      if (stepped > 1e-5) this._gaitPhase = (this._gaitPhase + stepped / stride) % 1
      else this._gaitPhase = (this._gaitPhase + dt / (this._clip === 'trot' ? 0.45 : 0.7)) % 1
    }

    this._idleT += dt
    // Viewer scrubber: progress loops with clip length (travel-driven gait still advances phase above).
    this._progress = (this._progress + dt / this._seconds()) % 1
    if (moving) this._gaitPhase = this._progress

    this._updateStamps(dt, { seek: false })
    this._writePose()
  }

  dispose() {
    this.model.dispose()
  }
}

export { HORSE_HEIGHT }
