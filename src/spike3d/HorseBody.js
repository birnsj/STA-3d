import { HORSE_HEIGHT, HorseModel } from './HorseModel.js'

/** Clip lengths for viewer scrub / progress (match clips.js CLIP_META). */
const CLIP_SECONDS = {
  // One full graze look L→R→L (slow).
  idle: 10,
  walk: 0.7,
  trot: 0.45,
  run: 0.32,
  // Halt settle from walk/trot/run into idle (once).
  stop: 0.55,
}

const MOVING_CLIPS = new Set(['walk', 'trot', 'run'])
const CLIP_NAMES = new Set(['idle', 'walk', 'trot', 'run', 'stop'])
const PACE_CLIPS = new Set(['walk', 'trot', 'run'])

/** Idle graze: +pitch tips nose toward the ground (forward); yaw period ≈ CLIP_SECONDS.idle. */
// Softer than before — the rebuilt neck already rises forward from the withers.
const GRAZE_NECK_PITCH = 0.22
const GRAZE_HEAD_PITCH = 0.12
const GRAZE_YAW_AMP = 0.42
const ALERT_NECK_PITCH = 0.02
const ALERT_HEAD_PITCH = 0.04

const STAMP_DURATION = 0.7
const STAMP_WAIT_MIN = 1.1
const STAMP_WAIT_MAX = 3.4

/**
 * CharacterBody-like wrapper for the procedural horse.
 * Clips: idle | walk | trot | run | stop.
 */
export class HorseBody {
  constructor({ height = HORSE_HEIGHT, coat = 'bay' } = {}) {
    this.model = new HorseModel(height, { coat })
    this.root = this.model.root
    this.root.name = 'horse_body'
    this._clip = 'idle'
    this._pace = 'walk'
    this._gaitPhase = 0
    this._weight = 0
    this._idleT = 0
    this._paused = false
    this._progress = 0
    this._actionDone = true
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

  get actionDone() {
    return this._actionDone
  }

  /** Cancel an in-progress stop settle (new click-to-move). */
  finishStop() {
    if (this._clip !== 'stop') return
    this._actionDone = true
    this._progress = 1
    this._weight = 0
  }

  play(clip) {
    const name = CLIP_NAMES.has(clip) ? clip : 'idle'
    const nextPace = PACE_CLIPS.has(name) ? name : name === 'idle' ? 'walk' : this._pace
    if (this._clip === name && this._pace === nextPace) return true
    const wasMoving = MOVING_CLIPS.has(this._clip)
    const nowMoving = MOVING_CLIPS.has(name)
    const sameClip = this._clip === name
    this._clip = name
    this._pace = nextPace
    // Keep stride phase across walk↔trot↔run so the legs don't pop. Reset leaving/entering idle/stop.
    if (!sameClip && !(wasMoving && nowMoving)) {
      this._progress = 0
      if (!nowMoving && name !== 'stop') this._gaitPhase = 0
    }
    if (name === 'idle') this._weight = 0
    else if (name === 'stop') this._weight = Math.max(this._weight, 0.55)
    else if (nowMoving && !wasMoving) {
      // Entering a gait from idle/stop: snap weight up so the first frames don't skate with planted feet.
      this._weight = Math.max(this._weight, this._moveWeight() * 0.85)
    }
    this._actionDone = name !== 'stop'
    if (name !== 'idle') this._clearStamps()
    return true
  }

  _isTrotPace() {
    return this._pace === 'trot' && this._isMovingClip()
  }

  _isRunPace() {
    return this._pace === 'run' && this._isMovingClip()
  }

  _stridePeriod() {
    if (this._isRunPace()) return CLIP_SECONDS.run
    if (this._isTrotPace()) return CLIP_SECONDS.trot
    return CLIP_SECONDS.walk
  }

  _moveWeight() {
    if (this._isRunPace()) return 1
    if (this._isTrotPace()) return 1
    return 0.7
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
    if (graze < 0.35 || this._clip === 'stop') {
      this._clearStamps()
      return
    }

    if (seek) {
      // ~every 2.4s a different leg lifts for STAMP_DURATION (stable under scrub).
      const cycle = 2.4
      const local = this._idleT % cycle
      const slot = Math.floor(this._idleT / cycle)
      const leg = ((slot * 3 + 1) % 4 + 4) % 4
      this._legLifts = [0, 0, 0, 0]
      if (local < STAMP_DURATION) this._legLifts[leg] = this._stampEnvelope(local / STAMP_DURATION)
      return
    }

    if (this._stampLeg < 0) {
      this._stampWait -= dt
      if (this._stampWait <= 0) {
        this._stampLeg = (Math.random() * 4) | 0
        this._stampT = 0
      }
      this._legLifts = [0, 0, 0, 0]
      return
    }

    this._stampT += dt
    const u = this._stampT / STAMP_DURATION
    this._legLifts = [0, 0, 0, 0]
    if (u >= 1) {
      this._stampLeg = -1
      this._stampWait = STAMP_WAIT_MIN + Math.random() * (STAMP_WAIT_MAX - STAMP_WAIT_MIN)
      return
    }
    this._legLifts[this._stampLeg] = this._stampEnvelope(u)
  }

  pause() {
    this._paused = true
  }

  resume() {
    this._paused = false
  }

  seek(progress01) {
    const t = Math.min(1, Math.max(0, progress01))
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

  _isMovingClip() {
    return MOVING_CLIPS.has(this._clip)
  }

  _applyFromProgress() {
    const moving = this._isMovingClip()
    const stopping = this._clip === 'stop'
    if (PACE_CLIPS.has(this._clip)) this._pace = this._clip
    const targetWeight = moving ? this._moveWeight() : 0
    this._weight = stopping ? Math.max(0, 0.75 * (1 - this._progress)) : targetWeight
    if (moving) {
      this._gaitPhase = this._progress
      this._idleT = 0
      this._clearStamps()
    } else if (stopping) {
      this._idleT = 0
      this._clearStamps()
      this._actionDone = this._progress >= 0.999
    } else {
      this._gaitPhase = 0
      this._idleT = this._progress * this._seconds()
      this._updateStamps(0, { seek: true })
    }
    this._writePose()
  }

  _writePose() {
    const graze = 1 - this._weight
    const run = this._isRunPace() ? 1 : 0
    const trot = this._isTrotPace() ? 1 : 0
    const walk = this._isMovingClip() && !trot && !run ? 1 : 0
    const stopping = this._clip === 'stop'
    const stopPlant = stopping ? Math.min(1, this._progress * 1.35) : 0
    // Slow look left / right while grazing (one full cycle per idle clip length).
    const look = Math.sin((this._idleT * (Math.PI * 2)) / CLIP_SECONDS.idle)
    const grazeBob = Math.sin(this._idleT * 1.35) * 0.05 * graze
    const breathe = Math.sin(this._idleT * Math.PI * 2 * 0.35) * 0.015 * graze
    // One nod per gait cycle; run holds the nose farthest forward.
    const gaitNod = Math.sin(this._gaitPhase * Math.PI * 2) * this._weight
    const neckPitch =
      GRAZE_NECK_PITCH * graze * (1 - stopPlant) +
      (ALERT_NECK_PITCH + this._weight * 0.04 + walk * 0.05 + trot * 0.2 + run * 0.28) * this._weight +
      grazeBob +
      gaitNod * (0.03 * walk + 0.08 * trot + 0.1 * run) +
      // Stop: lift the nose from the forward gait posture.
      stopPlant * 0.04
    const headPitch =
      GRAZE_HEAD_PITCH * graze * (1 - stopPlant) +
      (ALERT_HEAD_PITCH + walk * 0.03 + trot * 0.14 + run * 0.18) * this._weight +
      grazeBob * 0.55 +
      gaitNod * (0.02 * walk + 0.07 * trot + 0.09 * run) +
      stopPlant * 0.04
    const neckYaw = look * GRAZE_YAW_AMP * graze * (1 - stopPlant)
    const headYaw = look * GRAZE_YAW_AMP * 0.35 * graze * (1 - stopPlant)
    // Idle: slow swish; moving: stronger side sway (gait also adds in applyPose).
    const tailSwing =
      Math.sin(this._idleT * 1.05) * 0.28 * graze + Math.sin(this._idleT * 2.4) * 0.12 * this._weight
    const tailCurl = 0.4 + Math.sin(this._idleT * 0.9) * 0.08 * graze + this._weight * 0.12
    // Trot: two-beat; run: sharper gallop bob; walk: softer single cycle.
    const bobWave = run
      ? Math.abs(Math.sin(this._gaitPhase * Math.PI * 2))
      : trot
        ? Math.abs(Math.sin(this._gaitPhase * Math.PI * 2))
        : 0.5 * (1 - Math.cos(this._gaitPhase * Math.PI * 2))
    this.model.applyPose({
      gait: this._gaitPhase,
      weight: this._weight,
      trot,
      run,
      bounce: breathe + this._weight * (0.018 + trot * 0.055 + run * 0.09) * bobWave * (1 - stopPlant),
      neckPitch,
      neckYaw,
      headPitch,
      headYaw,
      tailSwing,
      tailCurl,
      stopPlant,
      legLifts: this._legLifts,
    })
  }

  update(dt) {
    if (this._paused || !(dt > 0) || dt > 0.1) return
    const moving = this._isMovingClip()
    const stopping = this._clip === 'stop'
    const targetWeight = moving ? this._moveWeight() : 0

    if (stopping) {
      this._progress = Math.min(1, this._progress + dt / this._seconds())
      this._weight = Math.max(0, 0.75 * (1 - this._progress))
      // Hold the last stride phase — advancing it after the root has stopped reads as skating.
      if (this._progress >= 0.999) this._actionDone = true
    } else {
      this._weight += (targetWeight - this._weight) * (1 - Math.exp(-(moving ? 14 : 12) * dt))
      if (this._weight > 0.02 && moving) {
        this._gaitPhase = (this._gaitPhase + dt / this._stridePeriod()) % 1
      }
      this._idleT += dt
      this._progress = moving ? this._gaitPhase : (this._progress + dt / this._seconds()) % 1
    }

    this._updateStamps(dt, { seek: false })
    this._writePose()
  }

  setCoat(coatId) {
    this.model.setCoat?.(coatId)
  }

  dispose() {
    this.model.dispose()
  }
}

export { HORSE_HEIGHT }
