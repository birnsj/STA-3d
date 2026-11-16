import * as THREE from 'three'

/** Approximate cat height in world units (map tiles ≈ metres for Spike scale). */
export const CAT_HEIGHT = 0.38

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.04, ...opts })

/**
 * Simple procedural cat for ambient roam (body, head, ears, tail, legs).
 * Idle alts: sit (primary), lick, stretch.
 */
export class CatModel {
  constructor({ height = CAT_HEIGHT } = {}) {
    this.height = height
    this.root = new THREE.Group()
    this.root.name = 'cat_model'

    const s = height / 0.38
    this._s = s
    const furMat = mat(0xc48a3a)
    const bellyMat = mat(0xe8d2a8)
    const noseMat = mat(0xe09090)
    const earMat = mat(0xb8732e)

    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.11 * s, 10, 8), furMat)
    this.body.scale.set(1.05, 0.78, 1.55)
    this.body.position.y = 0.15 * s
    this.body.castShadow = true
    this.root.add(this.body)

    this.belly = new THREE.Mesh(new THREE.SphereGeometry(0.08 * s, 8, 6), bellyMat)
    this.belly.scale.set(0.9, 0.7, 1.2)
    this.belly.position.set(0, 0.12 * s, 0.02 * s)
    this.root.add(this.belly)

    this.neck = new THREE.Group()
    this.neck.position.set(0, 0.2 * s, 0.14 * s)
    this.root.add(this.neck)

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.075 * s, 10, 8), furMat)
    this.head.position.set(0, 0.04 * s, 0.04 * s)
    this.head.castShadow = true
    this.neck.add(this.head)

    this.earL = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s, 0.07 * s, 5), earMat)
    this.earL.position.set(-0.045 * s, 0.1 * s, 0.02 * s)
    this.earL.rotation.z = 0.25
    this.neck.add(this.earL)
    this.earR = this.earL.clone()
    this.earR.position.x = 0.045 * s
    this.earR.rotation.z = -0.25
    this.neck.add(this.earR)

    this.nose = new THREE.Mesh(new THREE.SphereGeometry(0.018 * s, 6, 5), noseMat)
    this.nose.position.set(0, 0.02 * s, 0.085 * s)
    this.neck.add(this.nose)

    this.tail = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * s, 0.012 * s, 0.22 * s, 6), furMat)
    this.tail.position.set(0, 0.2 * s, -0.2 * s)
    this.tail.rotation.x = Math.PI / 2.6
    this.root.add(this.tail)

    this.legL = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * s, 0.014 * s, 0.14 * s, 5), furMat)
    this.legL.position.set(-0.05 * s, 0.07 * s, 0.06 * s)
    this.root.add(this.legL)
    this.legR = this.legL.clone()
    this.legR.position.x = 0.05 * s
    this.root.add(this.legR)
    this.legBL = this.legL.clone()
    this.legBL.position.set(-0.05 * s, 0.07 * s, -0.08 * s)
    this.root.add(this.legBL)
    this.legBR = this.legL.clone()
    this.legBR.position.set(0.05 * s, 0.07 * s, -0.08 * s)
    this.root.add(this.legBR)

    this._phase = 0
    this._gait = 'idle'
    this._idlePose = null
    this._poseT = 0
  }

  setGait(gait, idlePose = null) {
    const next = gait === 'run' || gait === 'walk' ? gait : 'idle'
    if (next !== this._gait || idlePose !== this._idlePose) {
      if (idlePose && idlePose !== this._idlePose) this._poseT = 0
      this._gait = next
      this._idlePose = next === 'idle' ? idlePose : null
    }
  }

  update(dt, speedEma = 0) {
    const moving = this._gait === 'walk' || this._gait === 'run'
    const stride =
      this._gait === 'run' ? 11 + Math.min(8, speedEma * 1.2) : this._gait === 'walk' ? 7.5 + Math.min(4, speedEma) : 2.2
    this._phase += dt * stride
    const bob = moving ? Math.sin(this._phase) * (this._gait === 'run' ? 0.024 : 0.014) : 0
    this.body.position.y = this.height * (0.4 + bob)
    this.belly.position.y = this.height * (0.32 + bob)

    if (moving) {
      const amp = this._gait === 'run' ? 0.75 : 0.48
      this.legL.rotation.x = Math.sin(this._phase) * amp
      this.legR.rotation.x = Math.sin(this._phase + Math.PI) * amp
      this.legBL.rotation.x = Math.sin(this._phase + Math.PI) * amp * 0.9
      this.legBR.rotation.x = Math.sin(this._phase) * amp * 0.9
      this.tail.rotation.y = Math.sin(this._phase * 0.8) * 0.35
      this.neck.rotation.x = this._gait === 'run' ? -0.12 : -0.04
      this.head.rotation.x = 0
      this.body.rotation.x = 0
      this.body.position.y = this.height * (0.4 + bob)
    } else if (this._idlePose === 'sit') {
      this._poseT += dt
      this.body.position.y = this.height * 0.28
      this.belly.position.y = this.height * 0.22
      this.legL.rotation.x = 1.1
      this.legR.rotation.x = 1.1
      this.legBL.rotation.x = 0.35
      this.legBR.rotation.x = 0.35
      this.neck.rotation.x = -0.15
      this.head.rotation.x = Math.sin(this._poseT * 1.2) * 0.08
      this.tail.rotation.y = Math.sin(this._poseT * 2.1) * 0.45
      this.body.rotation.x = 0.15
    } else if (this._idlePose === 'lick') {
      this._poseT += dt
      const dip = 0.5 + Math.sin(this._poseT * 8) * 0.35
      this.neck.rotation.x = 0.55 + dip * 0.4
      this.head.rotation.x = dip * 0.5
      this.body.rotation.x = 0.1
      this.legL.rotation.x = 0.15
      this.legR.rotation.x = 0.55 + Math.sin(this._poseT * 8) * 0.2
      this.legBL.rotation.x = 0
      this.legBR.rotation.x = 0
      this.tail.rotation.y = Math.sin(this._poseT) * 0.2
    } else if (this._idlePose === 'stretch') {
      this._poseT += dt
      const u = Math.min(1, this._poseT / 0.45)
      this.body.scale.set(1.05, 0.72, 1.55 + u * 0.25)
      this.neck.rotation.x = -0.35 * u
      this.head.rotation.x = -0.15 * u
      this.body.rotation.x = -0.2 * u
      this.legL.rotation.x = -0.55 * u
      this.legR.rotation.x = -0.55 * u
      this.legBL.rotation.x = 0.35 * u
      this.legBR.rotation.x = 0.35 * u
      this.tail.rotation.x = Math.PI / 2.6 + u * 0.4
    } else {
      this.body.scale.set(1.05, 0.78, 1.55)
      this.neck.rotation.x = Math.sin(this._phase * 0.4) * 0.05
      this.head.rotation.x = Math.sin(this._phase * 0.55) * 0.04
      this.body.rotation.x = 0
      this.legL.rotation.x = 0
      this.legR.rotation.x = 0
      this.legBL.rotation.x = 0
      this.legBR.rotation.x = 0
      this.tail.rotation.x = Math.PI / 2.6
      this.tail.rotation.y = Math.sin(this._phase * 0.7) * 0.25
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
