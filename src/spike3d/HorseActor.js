import * as THREE from 'three'
import { clearLiveClip, reportLiveClip } from '../dev/animClipDebug.js'
import { getBoardSunSettings } from './boardSunSettings.js'
import { HORSE_CONTACT_SHADOW_FILL_OPACITY, createContactShadow } from './contactShadow.js'
import { facingToYaw } from './isoProjection.js'
import { HorseBody, HORSE_HEIGHT } from './HorseBody.js'
import { PROCEDURAL_HEIGHT } from './ProceduralBody.js'
import { SPRITE_BODY_UNITS } from './HumanoidModel.js'

/** World Y from feet to hips on the procedural humanoid (body units 23 / 50 × height). */
const RIDER_HIP_Y = (23 / SPRITE_BODY_UNITS) * PROCEDURAL_HEIGHT
/** Sink hips slightly into the saddle pad. */
const SADDLE_SEAT_BIAS = 0.06

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
   * blend 0 = standing on the climb side (feet on the ground); 1 = hips in the saddle.
   * Mount lerps 0→1; dismount lerps 1→0; riding stays at 1.
   */
  attachRider(actor, blend = 1) {
    if (!actor?.root || !this.saddle) return
    const t = Math.min(1, Math.max(0, blend))
    const ease = t * t * (3 - 2 * t)
    this.root.updateWorldMatrix(true, true)
    this.saddle.updateWorldMatrix(true, false)
    const saddle = new THREE.Vector3()
    this.saddle.getWorldPosition(saddle)
    // Left of the horse in local space (matches mountSidePoint: heading + π/2).
    const side = new THREE.Vector3(1.05, 0, 0)
    this.root.localToWorld(side)
    const feetSide = new THREE.Vector3(side.x, 0, side.z)
    const feetSaddle = new THREE.Vector3(saddle.x, saddle.y - RIDER_HIP_Y + SADDLE_SEAT_BIAS, saddle.z)
    const pos = feetSide.lerp(feetSaddle, ease)
    actor.root.position.copy(pos)
    actor.root.rotation.y = this._yaw
    actor._paintX = pos.x
    actor._paintZ = pos.z
    // Shadow under the feet while climbing; hide once seated.
    if (actor.shadow) {
      actor.shadow.visible = actor.root.visible && ease < 0.55 && !actor.ragdollActive
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
      // Snap yaw when nearly aligned; ease only small corrections (big turns used to skate the body).
      if (Math.abs(yawErr) < 0.02) {
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
