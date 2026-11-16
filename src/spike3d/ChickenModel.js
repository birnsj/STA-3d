import * as THREE from 'three'

/** Approximate chicken height in world units (map tiles ≈ metres for Spike scale). */
export const CHICKEN_HEIGHT = 0.42

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts })

/**
 * Simple procedural chicken for ambient roam (body, head, beak, comb, legs).
 * Idle alts: peck (primary), scratch.
 */
export class ChickenModel {
  constructor({ height = CHICKEN_HEIGHT } = {}) {
    this.height = height
    this.root = new THREE.Group()
    this.root.name = 'chicken_model'

    const s = height / 0.42
    this._s = s
    const bodyMat = mat(0xf2e6c8)
    const combMat = mat(0xc43c2c)
    const beakMat = mat(0xe8a020)
    const legMat = mat(0xd4a017)

    // Neck group so peck can dip the whole head/beak/comb toward the ground.
    this.neck = new THREE.Group()
    this.neck.position.set(0, 0.22 * s, 0.08 * s)
    this.root.add(this.neck)

    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 10, 8), bodyMat)
    this.body.scale.set(1.15, 0.85, 1.35)
    this.body.position.y = 0.16 * s
    this.body.castShadow = true
    this.root.add(this.body)

    this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.12 * s, 6), bodyMat)
    this.tail.rotation.x = Math.PI / 2.4
    this.tail.position.set(0, 0.2 * s, -0.16 * s)
    this.root.add(this.tail)

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 10, 8), bodyMat)
    this.head.position.set(0, 0.08 * s, 0.08 * s)
    this.head.castShadow = true
    this.neck.add(this.head)

    this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.025 * s, 0.06 * s, 6), beakMat)
    this.beak.rotation.x = Math.PI / 2
    this.beak.position.set(0, 0.06 * s, 0.14 * s)
    this.neck.add(this.beak)

    this.comb = new THREE.Mesh(new THREE.BoxGeometry(0.02 * s, 0.05 * s, 0.06 * s), combMat)
    this.comb.position.set(0, 0.14 * s, 0.06 * s)
    this.neck.add(this.comb)

    this.legL = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.12 * s, 5), legMat)
    this.legL.position.set(-0.04 * s, 0.06 * s, 0.02 * s)
    this.root.add(this.legL)
    this.legR = this.legL.clone()
    this.legR.position.x = 0.04 * s
    this.root.add(this.legR)

    this._phase = 0
    this._gait = 'idle'
    this._idlePose = null
    this._peckT = 0
  }

  setGait(gait, idlePose = null) {
    const next = gait === 'run' || gait === 'walk' ? gait : 'idle'
    if (next !== this._gait || idlePose !== this._idlePose) {
      if (idlePose === 'peck' && this._idlePose !== 'peck') this._peckT = 0
      this._gait = next
      this._idlePose = next === 'idle' ? idlePose : null
    }
  }

  update(dt, speedEma = 0) {
    const moving = this._gait === 'walk' || this._gait === 'run'
    const stride =
      this._gait === 'run' ? 10 + Math.min(8, speedEma * 1.2) : this._gait === 'walk' ? 8 + Math.min(4, speedEma) : 2.5
    this._phase += dt * stride
    const bob = moving ? Math.sin(this._phase) * (this._gait === 'run' ? 0.028 : 0.018) : 0
    this.body.position.y = this.height * (0.38 + bob)

    if (moving) {
      const amp = this._gait === 'run' ? 0.7 : 0.5
      this.legL.rotation.x = Math.sin(this._phase) * amp
      this.legR.rotation.x = Math.sin(this._phase + Math.PI) * amp
      this.neck.rotation.x = this._gait === 'run' ? -0.2 : -0.05
      this.head.rotation.x = 0
      this.body.rotation.x = 0
    } else if (this._idlePose === 'peck') {
      // Two quick dips to the ground, then a short hold — reads as pecking, not a nod.
      this._peckT += dt
      const cycle = 0.55
      const local = this._peckT % cycle
      const dip = local < 0.22 ? Math.sin((local / 0.22) * Math.PI) : local < 0.38 ? Math.sin(((local - 0.22) / 0.16) * Math.PI) * 0.85 : 0.08
      this.neck.rotation.x = 0.35 + dip * 1.15
      this.head.rotation.x = dip * 0.35
      this.body.rotation.x = dip * 0.25
      this.legL.rotation.x = 0
      this.legR.rotation.x = 0
    } else if (this._idlePose === 'scratch') {
      this.neck.rotation.x = 0.2
      this.head.rotation.x = 0.1
      this.body.rotation.x = 0
      this.legR.rotation.x = -0.45 + Math.sin(this._phase * 3.2) * 0.4
      this.legL.rotation.x = 0
    } else {
      this.neck.rotation.x = Math.sin(this._phase * 0.45) * 0.06
      this.head.rotation.x = Math.sin(this._phase * 0.5) * 0.05
      this.body.rotation.x = 0
      this.legL.rotation.x = 0
      this.legR.rotation.x = 0
    }
  }

  dispose() {
    this.root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
        else obj.material.dispose()
      }
    })
  }
}
