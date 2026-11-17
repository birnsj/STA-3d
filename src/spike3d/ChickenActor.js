import * as THREE from 'three'
import { playClipSound } from '../audio/animationSounds.js'
import { facingToYaw } from './isoProjection.js'
import { createContactShadow } from './contactShadow.js'
import { ChickenModel, CHICKEN_HEIGHT } from './ChickenModel.js'

function soundClipForPose(gait, idlePose) {
  if (idlePose === 'peck') return 'peck'
  if (idlePose === 'scratch') return 'scratch'
  if (gait === 'run') return 'chickenRun'
  if (gait === 'walk') return 'chickenWalk'
  return 'chickenIdle'
}

function wrapAngle(radians) {
  const tau = Math.PI * 2
  return ((((radians + Math.PI) % tau) + tau) % tau) - Math.PI
}

/**
 * Ambient chicken in Spike3dScene — pose from exploration ambientAnimals state.
 * Yaw follows travel so scatter pathing does not whip the mesh every frame.
 */
export class ChickenActor {
  constructor(id, host, { coat = 'yellow' } = {}) {
    this.id = id
    this.host = host
    this.scene = host.scene
    this._lastSeen = performance.now()
    this._coat = coat

    this.root = new THREE.Group()
    this.root.name = `spike_chicken_${id}`
    this.body = new ChickenModel({ height: CHICKEN_HEIGHT, coat })
    this.root.add(this.body.root)
    this.shadow = createContactShadow({ width: CHICKEN_HEIGHT * 1.1, depth: CHICKEN_HEIGHT * 0.7 })
    this.root.add(this.shadow)

    this._tx = 0
    this._tz = 0
    this._prevTx = null
    this._prevTz = null
    this._yaw = Math.PI / 4
    this._yawTarget = this._yaw
    this._posReady = false
    this._pendingTravel = 0
    this._speedEma = 0
    this._gait = 'idle'
    this._idlePose = null
    // Local alt-idle fidgets while standing (peck is the primary; scratch is the secondary).
    this._authoredIdlePose = null
    this._fidget = null
    this._lastFidget = null
    this._nextFidgetAt = performance.now() + 1800 + Math.random() * 2200
    this._soundClip = null

    this.scene.add(this.root)
  }

  _fidgetGapMs() {
    return 2800 + Math.random() * 4200
  }

  _pickFidget() {
    const poses = ['peck', 'peck', 'peck', 'scratch']
    const choices = poses.filter((name) => name !== this._lastFidget)
    const pool = choices.length ? choices : poses
    return pool[Math.floor(Math.random() * pool.length)]
  }

  paintKey() {
    return this._tx + this._tz + 0.2
  }

  setVisible(visible) {
    this.root.visible = Boolean(visible)
    if (this.shadow) this.shadow.visible = Boolean(visible)
  }

  setPose({ position, facing, gait, idlePose, coat }) {
    this._lastSeen = performance.now()
    if (coat != null && coat !== this._coat) {
      this._coat = coat
      this.body.setCoat?.(coat)
    }
    const nextGait = gait === 'run' || gait === 'walk' ? gait : 'idle'
    const nextIdle = nextGait === 'idle' ? idlePose ?? null : null
    const soundClip = soundClipForPose(nextGait, nextIdle)
    if (soundClip !== this._soundClip) {
      this._soundClip = soundClip
      // Idle clucks are sparse; walk/run/peck use their own gaps.
      const gap = soundClip === 'chickenIdle' ? 2200 : soundClip === 'chickenWalk' ? 320 : 80
      playClipSound(soundClip, { minGapMs: gap })
    }
    this._gait = nextGait
    this._authoredIdlePose = nextIdle
    if (nextGait !== 'idle') {
      this._fidget = null
      this._idlePose = null
    }
    if (!position) {
      this._applyIdlePose()
      return
    }

    if (this._posReady) {
      this._pendingTravel += Math.hypot(position.x - this._tx, position.y - this._tz)
    }
    this._tx = position.x
    this._tz = position.y
    this.root.position.set(this._tx, 0, this._tz)

    if (!this._posReady) {
      this._posReady = true
      this._prevTx = this._tx
      this._prevTz = this._tz
      this._yawTarget = facingToYaw(facing)
      this._yaw = this._yawTarget
      this.root.rotation.y = this._yaw
      this._applyIdlePose()
      return
    }

    // Standing: ease toward authored facing. Moving: update() aims from travel.
    if (nextGait === 'idle' && this._pendingTravel < 0.02 && facing) {
      this._yawTarget = facingToYaw(facing)
    }
    this._applyIdlePose()
  }

  _applyIdlePose() {
    const pose = this._gait === 'idle' ? this._authoredIdlePose || this._fidget?.name || null : null
    this._idlePose = pose
    this.body.setGait(this._gait, pose)
  }

  update(dt) {
    const travel = this._pendingTravel
    this._pendingTravel = 0
    const instant = dt > 1e-6 ? travel / dt : 0
    this._speedEma = this._speedEma * 0.75 + instant * 0.25

    if (this._prevTx != null) {
      const dx = this._tx - this._prevTx
      const dz = this._tz - this._prevTz
      if (this._speedEma > 0.45 && dx * dx + dz * dz > 1e-8) {
        this._yawTarget = facingToYaw({ x: dx, y: dz })
      }
    }
    this._prevTx = this._tx
    this._prevTz = this._tz

    const now = performance.now()
    if (this._gait === 'idle' && this._speedEma < 0.35) {
      if (this._fidget && now >= this._fidget.endsAt) {
        this._lastFidget = this._fidget.name
        this._fidget = null
        this._soundClip = 'chickenIdle'
        this._nextFidgetAt = now + this._fidgetGapMs()
      }
      // Roam wait pose wins while set; otherwise schedule peck/scratch fidgets.
      if (!this._authoredIdlePose && !this._fidget && now >= this._nextFidgetAt) {
        const name = this._pickFidget()
        const seconds = name === 'peck' ? 1.35 : 1.1
        this._fidget = { name, endsAt: now + seconds * 1000 }
        this._soundClip = name
        playClipSound(name, { minGapMs: 40 })
      }
    } else {
      this._fidget = null
      this._nextFidgetAt = now + this._fidgetGapMs()
    }
    this._applyIdlePose()

    // Looping gait sounds (clip change already fired once in setPose).
    if (this._gait === 'walk') playClipSound('chickenWalk', { minGapMs: 340 })
    else if (this._gait === 'run') playClipSound('chickenRun', { minGapMs: 200 })
    else if (this._gait === 'idle' && !this._fidget && !this._authoredIdlePose) {
      playClipSound('chickenIdle', { minGapMs: 3200 })
    }

    const diff = wrapAngle(this._yawTarget - this._yaw)
    const turnRate = this._gait === 'run' ? 9 : 5.5
    this._yaw += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt)
    this.root.rotation.y = this._yaw
    this.body.update(dt, this._speedEma)
  }

  dispose() {
    this.scene.remove(this.root)
    this.body.dispose()
    if (this.shadow?.material) this.shadow.material.dispose()
    if (this.shadow?.geometry) this.shadow.geometry.dispose()
  }
}
