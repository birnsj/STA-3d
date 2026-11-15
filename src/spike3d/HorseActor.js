import * as THREE from 'three'
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
    this._gait = gait === 'walk' || gait === 'trot' ? gait : 'idle'
    this.body.play(this._gait)
    if (!position) return
    this._yawTarget = facingToYaw(facing)
    if (this._posReady) {
      this._pendingTravel = Math.hypot(position.x - this._tx, position.y - this._tz)
    }
    this._tx = position.x
    this._tz = position.y
    this.root.position.set(this._tx, 0, this._tz)
    if (!this._posReady) {
      this._posReady = true
      this._yaw = this._yawTarget
      this.root.rotation.y = this._yaw
    }
  }

  /** Place a SpikeActor so their hips sit in the saddle (legs astride the barrel). */
  attachRider(actor) {
    if (!actor?.root || !this.saddle) return
    this.root.updateWorldMatrix(true, true)
    this.saddle.updateWorldMatrix(true, false)
    const pos = new THREE.Vector3()
    this.saddle.getWorldPosition(pos)
    // Root is at the feet; drop by hip height so the pelvis lands on the saddle pad.
    actor.root.position.set(pos.x, pos.y - RIDER_HIP_Y + SADDLE_SEAT_BIAS, pos.z)
    actor.root.rotation.y = this._yaw
    actor._paintX = pos.x
    actor._paintZ = pos.z
    // Keep contact shadow under the horse, not floating at saddle height.
    if (actor.shadow) {
      actor.shadow.visible = false
    }
  }

  update(dt) {
    let travel = 0
    if (this._posReady && dt > 0) {
      travel = this._pendingTravel
      this._pendingTravel = 0
      this.root.position.set(this._tx, 0, this._tz)
      const yawK = 1 - Math.exp(-14 * dt)
      let dy = this._yawTarget - this._yaw
      while (dy > Math.PI) dy -= Math.PI * 2
      while (dy < -Math.PI) dy += Math.PI * 2
      this._yaw += dy * yawK
      this.root.rotation.y = this._yaw
    }
    this.body.update(dt, travel)
    if (this.shadow) {
      this.shadow.rotation.y = -this._yaw
      this.shadow.material.opacity = 0.75
    }
  }

  dispose() {
    this.scene.remove(this.root)
    this.shadow?.geometry?.dispose?.()
    this.shadow?.material?.dispose?.()
    this.shadow = null
    this.body.dispose()
  }
}
