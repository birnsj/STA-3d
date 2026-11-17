import * as THREE from 'three'
import { playClipSound } from '../audio/animationSounds.js'
import { facingToYaw } from './isoProjection.js'
import { createContactShadow } from './contactShadow.js'
import { CatModel, CAT_HEIGHT } from './CatModel.js'

function soundClipForPose(gait, idlePose) {
  if (idlePose === 'sit') return 'sit'
  if (idlePose === 'lick') return 'lick'
  if (idlePose === 'stretch') return 'stretch'
  if (gait === 'run') return 'catRun'
  if (gait === 'walk') return 'catWalk'
  return 'catIdle'
}

function wrapAngle(radians) {
  const tau = Math.PI * 2
  return ((((radians + Math.PI) % tau) + tau) % tau) - Math.PI
}

/**
 * Ambient cat in Spike3dScene — pose from exploration ambientAnimals state.
 * Same actor pattern as ChickenActor (travel yaw, sparse idle fidgets, clip sounds).
 */
export class CatActor {
  constructor(id, host, { coat = 'orange' } = {}) {
    this.id = id
    this.host = host
    this.scene = host.scene
    this._lastSeen = performance.now()
    this._coat = coat

    this.root = new THREE.Group()
    this.root.name = `spike_cat_${id}`
    this.body = new CatModel({ height: CAT_HEIGHT, coat })
    this.root.add(this.body.root)
    this.shadow = createContactShadow({ width: CAT_HEIGHT * 1.15, depth: CAT_HEIGHT * 0.75 })
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
    this._authoredIdlePose = null
    this._fidget = null
    this._lastFidget = null
    this._nextFidgetAt = performance.now() + 2200 + Math.random() * 2800
    this._soundClip = null

    this.scene.add(this.root)
  }

  _fidgetGapMs() {
    return 3200 + Math.random() * 4800
  }

  _pickFidget() {
    const poses = ['sit', 'sit', 'lick', 'stretch']
    const choices = poses.filter((name) => name !== this._lastFidget)
    const pool = choices.length ? choices : poses
    return pool[Math.floor(Math.random() * pool.length)]
  }

  _fidgetSeconds(name) {
    if (name === 'sit') return 2.2
    if (name === 'lick') return 1.4
    return 1.2
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
      const gap = soundClip === 'catIdle' ? 1800 : soundClip === 'catWalk' ? 300 : 80
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
        this._soundClip = 'catIdle'
        this._nextFidgetAt = now + this._fidgetGapMs()
      }
      if (!this._authoredIdlePose && !this._fidget && now >= this._nextFidgetAt) {
        const name = this._pickFidget()
        this._fidget = { name, endsAt: now + this._fidgetSeconds(name) * 1000 }
        this._soundClip = name
        playClipSound(name, { minGapMs: 40 })
      }
    } else {
      this._fidget = null
      this._nextFidgetAt = now + this._fidgetGapMs()
    }
    this._applyIdlePose()

    if (this._gait === 'walk') playClipSound('catWalk', { minGapMs: 300 })
    else if (this._gait === 'run') playClipSound('catRun', { minGapMs: 180 })
    else if (this._gait === 'idle' && !this._fidget && !this._authoredIdlePose) {
      // Sparse meows — chance from animationSounds.json / Viewer Random %.
      playClipSound('catIdle', { minGapMs: 2800 })
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
