import * as THREE from 'three'
import { clearLiveClip, reportLiveClip } from '../dev/animClipDebug.js'
import { createContactShadow } from './contactShadow.js'
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
  constructor(id, host) {
    this.id = id
    this.host = host
    this.scene = host.scene
    this._lastSeen = performance.now()

    this.root = new THREE.Group()
    this.root.name = `spike_horse_${id}`
    this.body = new HorseBody({ height: HORSE_HEIGHT })
    this.root.add(this.body.root)
    this.shadow = createContactShadow({ width: HORSE_HEIGHT * 1.15, depth: HORSE_HEIGHT * 0.65 })
    this.root.add(this.shadow)

    this._tx = 0
    this._tz = 0
    this._yaw = Math.PI / 4
    this._yawTarget = this._yaw
    this._posReady = false
    this._pendingTravel = 0
    this._riderId = null
    this._gait = 'idle'
    this._gaitWant = 'idle'
    this._gaitHold = 0

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

  setPose({ position, facing, gait, riderId }) {
    this._lastSeen = performance.now()
    this._riderId = riderId ?? null
    this._gaitWant = gait === 'walk' || gait === 'trot' ? gait : 'idle'
    if (!position) return
    this._yawTarget = facingToYaw(facing)
    if (this._posReady) {
      this._pendingTravel = Math.hypot(position.x - this._tx, position.y - this._tz)
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

  /** Resolve playable clip from wanted gait + stop settle + actual travel. */
  _resolveClip(travelPerSec, yawErr) {
    if (this._gait === 'stop' && !this.body.actionDone) return 'stop'

    // No real translation (blocked / yaw-only): don't keep walk/trot — that skates in place.
    const movingWant = this._gaitWant === 'walk' || this._gaitWant === 'trot'
    const actuallyMoving = travelPerSec > 0.35
    const turningHard = Math.abs(yawErr) > 0.45
    if (movingWant && !actuallyMoving && !turningHard) {
      const wasMoving = this._gait === 'walk' || this._gait === 'trot'
      if (wasMoving) return 'stop'
      return 'idle'
    }

    if (this._gaitWant === 'idle') {
      const wasMoving = this._gait === 'walk' || this._gait === 'trot'
      if (wasMoving) return 'stop'
      return 'idle'
    }
    return this._gaitWant
  }

  update(dt) {
    let travelPerSec = 0
    let yawErr = 0
    if (this._posReady && dt > 0) {
      travelPerSec = this._pendingTravel / dt
      this._pendingTravel = 0
      this.root.position.set(this._tx, 0, this._tz)
      yawErr = this._wrapYawDelta(this._yawTarget, this._yaw)
      // Snap yaw when nearly aligned; ease only small corrections (big turns used to skate the body).
      if (Math.abs(yawErr) < 0.02) {
        this._yaw = this._yawTarget
      } else if (Math.abs(yawErr) > 0.9) {
        this._yaw = this._yawTarget
        yawErr = 0
      } else {
        const yawK = 1 - Math.exp(-18 * dt)
        this._yaw += yawErr * yawK
      }
      this.root.rotation.y = this._yaw
      yawErr = this._wrapYawDelta(this._yawTarget, this._yaw)
    }

    const wantClip = this._resolveClip(travelPerSec, yawErr)
    // Walk↔trot: hold ~0.22s so pace flicker doesn't reset the stride. Stop/idle switch immediately.
    if (wantClip !== this._gait) {
      const bothPace =
        (this._gait === 'walk' || this._gait === 'trot') &&
        (wantClip === 'walk' || wantClip === 'trot')
      this._gaitHold += dt
      if (!bothPace || this._gaitHold >= 0.22) {
        this._gait = wantClip
        this._gaitHold = 0
      }
    } else {
      this._gaitHold = 0
    }

    this.body.play(this._gait)
    this.body.update(dt, null)
    // X overlay reads this (same id as horse pose: horse:<id>).
    reportLiveClip(this.id, this._gait)
    if (this.shadow) {
      this.shadow.rotation.y = -this._yaw
      this.shadow.material.opacity = 0.75
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
