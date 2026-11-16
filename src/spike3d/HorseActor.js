import * as THREE from 'three'
import { playClipSound } from '../audio/animationSounds.js'
import { clearLiveClip, reportLiveClip } from '../dev/animClipDebug.js'
import { getBoardSunSettings } from './boardSunSettings.js'
import { HORSE_CONTACT_SHADOW_FILL_OPACITY, createContactShadow } from './contactShadow.js'
import { facingToYaw } from './isoProjection.js'
import { HorseBody, HORSE_HEIGHT } from './HorseBody.js'
import { MOUNT_LEFT_X } from './HorseModel.js'
import { PROCEDURAL_HEIGHT } from './ProceduralBody.js'
import { SPRITE_BODY_UNITS } from './HumanoidModel.js'

/** World Y from feet to hips on the procedural humanoid (body units 23 / 50 × height). */
const RIDER_HIP_Y = (23 / SPRITE_BODY_UNITS) * PROCEDURAL_HEIGHT
/** Seat height above hip-to-saddle math — positive lifts the rider on the pad. */
const SADDLE_SEAT_BIAS = 0.16
/** Fallback left pad X if mountLeft joint is missing. */
const MOUNT_LEFT_FALLBACK = MOUNT_LEFT_X
/** Planted approach ends; weight moves into the stirrup after this. Long plant = dismount sticks on the joint. */
const CLIMB_PLANT_END = 0.4
/** Stirrup push ends; swing-over into the saddle after this. */
const CLIMB_STIRRUP_END = 0.58

function smoothstep01(u) {
  const t = Math.min(1, Math.max(0, u))
  return t * t * (3 - 2 * t)
}

/**
 * Left-side climb path that stays grounded as long as possible:
 * plant near the pad (y=0) → step into stirrup → swing over to seat while holding outboard.
 * (Single root = feet; pose sells the other foot / hands. Avoids a mid-air lerp.)
 */
function climbPosAlongLeftPath(blend, ground, stirrup, seat) {
  const t = Math.min(1, Math.max(0, blend))
  const approach = new THREE.Vector3(ground.x, 0, ground.z).lerp(
    new THREE.Vector3(stirrup.x, 0, stirrup.z),
    0.4,
  )
  approach.y = 0

  if (t <= CLIMB_PLANT_END) {
    const u = smoothstep01(t / CLIMB_PLANT_END)
    const p = new THREE.Vector3().lerpVectors(new THREE.Vector3(ground.x, 0, ground.z), approach, u)
    p.y = 0
    return p
  }
  if (t <= CLIMB_STIRRUP_END) {
    const u = smoothstep01((t - CLIMB_PLANT_END) / (CLIMB_STIRRUP_END - CLIMB_PLANT_END))
    return new THREE.Vector3().lerpVectors(approach, stirrup, u)
  }
  const u = smoothstep01((t - CLIMB_STIRRUP_END) / (1 - CLIMB_STIRRUP_END))
  const p = new THREE.Vector3().lerpVectors(stirrup, seat, u)
  // Hold outside the barrel early in the swing so the chord does not cut through.
  const out = new THREE.Vector3().subVectors(stirrup, seat)
  out.y = 0
  if (out.lengthSq() > 1e-6) {
    out.normalize()
    p.addScaledVector(out, (1 - u) * (1 - u) * 0.28)
  }
  return p
}

/**
 * World horse in Spike3dScene — position from exploration mount state; optional rider attach.
 */
export class HorseActor {
  constructor(id, host, { coat = 'bay' } = {}) {
    this.id = id
    this.host = host
    this.scene = host.scene
    this._lastSeen = performance.now()
    this._coat = coat

    this.root = new THREE.Group()
    this.root.name = `spike_horse_${id}`
    this.body = new HorseBody({ height: HORSE_HEIGHT, coat })
    this.root.add(this.body.root)
    this.shadow = createContactShadow({ width: HORSE_HEIGHT * 1.15, depth: HORSE_HEIGHT * 0.65 })
    this.root.add(this.shadow)

    this._tx = 0
    this._tz = 0
    this._yaw = Math.PI / 4
    this._yawTarget = this._yaw
    this._posReady = false
    this._pendingTravel = 0
    // Smoothed tiles/s — pose updates can land on fewer frames than paint, so raw travel flickers to 0.
    this._speedEma = 0
    this._riderId = null
    this._gait = 'idle'
    this._gaitWant = 'idle'
    this._gaitHold = 0
    // After a click-to-move from standstill / stop settle, trust the wanted gait briefly so legs don't lag the root.
    this._startupGrace = 0

    this.scene.add(this.root)
  }

  get saddle() {
    return this.body.saddle
  }

  get mountLeft() {
    return this.body.mountLeft
  }

  get mountLeftUp() {
    return this.body.mountLeftUp
  }

  paintKey() {
    return this._tx + this._tz + 0.55
  }

  setVisible(visible) {
    this.root.visible = Boolean(visible)
    if (this.shadow) this.shadow.visible = Boolean(visible)
  }

  setPose({ position, facing, gait, riderId, coat }) {
    this._lastSeen = performance.now()
    this._riderId = riderId ?? null
    const nextWant = gait === 'walk' || gait === 'trot' || gait === 'run' ? gait : 'idle'
    // Idle/stop → walk: start the stride immediately (waiting on travel EMA skates the body).
    if (this._isMovingGait(nextWant) && !this._isMovingGait(this._gaitWant)) {
      this._startupGrace = 0.4
      this._speedEma = Math.max(this._speedEma, 1.4)
      if (this._gait === 'stop') this.body.finishStop?.()
    }
    this._gaitWant = nextWant
    if (coat != null && coat !== this._coat) {
      this._coat = coat
      this.body.setCoat?.(coat)
    }
    if (!position) return
    this._yawTarget = facingToYaw(facing)
    if (this._posReady) {
      // Accumulate — multiple setPose calls can land before update; overwriting dropped travel.
      this._pendingTravel += Math.hypot(position.x - this._tx, position.y - this._tz)
    }
    this._tx = position.x
    this._tz = position.y
    // Snap with the sim — easing position against a striding gait is what looked like a slide.
    this.root.position.set(this._tx, 0, this._tz)
    if (!this._posReady) {
      this._posReady = true
      this._yaw = this._yawTarget
      this.root.rotation.y = this._yaw
    }
  }

  /**
   * Place a SpikeActor on / beside the horse.
   * blend 0 = standing on the left mount pad; 1 = hips in the saddle.
   * Mount 0→1 / dismount 1→0: plant → left stirrup → swing to saddle (keeps feet low as long as possible).
   */
  attachRider(actor, blend = 1) {
    if (!actor?.root || !this.saddle) return
    const t = Math.min(1, Math.max(0, blend))
    this.root.updateWorldMatrix(true, true)
    this.saddle.updateWorldMatrix(true, false)
    this.mountLeft?.updateWorldMatrix(true, false)
    this.mountLeftUp?.updateWorldMatrix(true, false)

    const ground = new THREE.Vector3()
    const stirrup = new THREE.Vector3()
    const saddle = new THREE.Vector3()
    if (this.mountLeft) this.mountLeft.getWorldPosition(ground)
    else {
      ground.set(MOUNT_LEFT_FALLBACK, 0, 0)
      this.root.localToWorld(ground)
    }
    ground.y = 0
    if (this.mountLeftUp) this.mountLeftUp.getWorldPosition(stirrup)
    else {
      stirrup.set(ground.x, RIDER_HIP_Y * 0.35, ground.z)
    }
    this.saddle.getWorldPosition(saddle)
    const seat = new THREE.Vector3(saddle.x, saddle.y - RIDER_HIP_Y + SADDLE_SEAT_BIAS, saddle.z)

    const pos = climbPosAlongLeftPath(t, ground, stirrup, seat)
    actor.root.position.copy(pos)
    actor.root.rotation.y = this._yaw
    actor._paintX = pos.x
    actor._paintZ = pos.z
    // Shadow while feet are still near the ground / stirrup; hide once settling in the saddle.
    if (actor.shadow) {
      actor.shadow.visible = actor.root.visible && t < 0.62 && !actor.ragdollActive
    }
  }

  _wrapYawDelta(target, current) {
    let dy = target - current
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    return dy
  }

  _isMovingGait(name) {
    return name === 'walk' || name === 'trot' || name === 'run'
  }

  /** Resolve playable clip from wanted gait + stop settle + actual travel. */
  _resolveClip(travelPerSec, yawErr) {
    const movingWant = this._isMovingGait(this._gaitWant)
    const actuallyMoving = travelPerSec > 0.22 || this._startupGrace > 0
    const turningHard = Math.abs(yawErr) > 0.45

    // New click-to-move must cancel settle — holding stop while the root translates is the post-ride skate.
    if (movingWant && (actuallyMoving || turningHard || this._startupGrace > 0)) {
      return this._gaitWant
    }

    if (this._gait === 'stop' && !this.body.actionDone) return 'stop'

    // No real translation (blocked / yaw-only): don't keep walk/trot/run — that skates in place.
    if (movingWant && !actuallyMoving && !turningHard) {
      if (this._isMovingGait(this._gait)) return 'stop'
      return 'idle'
    }

    if (this._gaitWant === 'idle') {
      if (this._isMovingGait(this._gait)) return 'stop'
      return 'idle'
    }
    return this._gaitWant
  }

  update(dt) {
    let yawErr = 0
    if (this._startupGrace > 0) this._startupGrace = Math.max(0, this._startupGrace - dt)
    if (this._posReady && dt > 0) {
      const travelPerSec = this._pendingTravel / dt
      this._pendingTravel = 0
      // Rise fairly quick, fall slower — fewer gait flickers between sparse sim pose updates.
      const k = travelPerSec >= this._speedEma ? 1 - Math.exp(-14 * dt) : 1 - Math.exp(-3.5 * dt)
      this._speedEma += (travelPerSec - this._speedEma) * k
      this.root.position.set(this._tx, 0, this._tz)
      yawErr = this._wrapYawDelta(this._yawTarget, this._yaw)
      // Riders / climb attach use mountLeft from this yaw — snap so the pad matches sim mountSidePoint.
      if (this._riderId) {
        this._yaw = this._yawTarget
        yawErr = 0
      } else if (Math.abs(yawErr) < 0.02) {
        this._yaw = this._yawTarget
      } else if (Math.abs(yawErr) > 0.9) {
        this._yaw = this._yawTarget
        yawErr = 0
      } else {
        const yawK = 1 - Math.exp(-12 * dt)
        this._yaw += yawErr * yawK
      }
      this.root.rotation.y = this._yaw
      yawErr = this._wrapYawDelta(this._yawTarget, this._yaw)
    }

    const wantClip = this._resolveClip(this._speedEma, yawErr)
    // Walk↔trot↔run: hold longer so pace flicker doesn't reset the stride. Stop/idle / new move: immediate.
    if (wantClip !== this._gait) {
      const bothPace = this._isMovingGait(this._gait) && this._isMovingGait(wantClip)
      const fromStopOrIdle = this._gait === 'stop' || this._gait === 'idle'
      this._gaitHold += dt
      if (!bothPace || fromStopOrIdle || this._gaitHold >= 0.28) {
        this._gait = wantClip
        this._gaitHold = 0
        playClipSound(wantClip, { minGapMs: 80 })
      }
    } else {
      this._gaitHold = 0
    }

    this.body.play(this._gait)
    // Steady time-based stride (travel-lock fought sparse pose updates and read as a constant slide).
    this.body.update(dt)
    // X overlay reads this (same id as horse pose: horse:<id>).
    reportLiveClip(this.id, this._gait)
    if (this.shadow) {
      this.shadow.rotation.y = -this._yaw
      this.shadow.material.opacity =
        HORSE_CONTACT_SHADOW_FILL_OPACITY * (getBoardSunSettings().shadowStrength ?? 1)
    }
  }

  dispose() {
    clearLiveClip(this.id)
    this.scene.remove(this.root)
    this.shadow?.geometry?.dispose?.()
    this.shadow?.material?.dispose?.()
    this.shadow = null
    this.body.dispose()
  }
}
