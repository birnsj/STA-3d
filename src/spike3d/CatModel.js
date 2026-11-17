import * as THREE from 'three'
import {
  CAT_ATLAS,
  applyAtlasUvs,
  bindCatTexture,
  catCoatOf,
  normalizeCatCoatId,
} from './catTexture.js'

/** Authored body units for UV/mesh proportions (see constructor scale). */
const CAT_DESIGN_HEIGHT = 0.38

/** World height — larger than chicken (~0.42) so ambient cats read clearly on the board. */
export const CAT_HEIGHT = 0.62

/**
 * Procedural cat for ambient roam (body, head, ears, tail, legs).
 * One shared albedo atlas (`/art/models/creatures/cat-{coat}.png`); meshes UV into panels.
 * Idle alts: sit (primary), lick, stretch.
 *
 * Body + belly + neck/head live under `torso` so walk bob / sit / stretch keep the head attached.
 */
export class CatModel {
  constructor({ height = CAT_HEIGHT, coat = 'orange' } = {}) {
    this.height = height
    this._coat = normalizeCatCoatId(coat)
    this.root = new THREE.Group()
    this.root.name = 'cat_model'
    this._owned = []

    const s = height / CAT_DESIGN_HEIGHT
    this._s = s

    this.skin = new THREE.MeshStandardMaterial({
      color: catCoatOf(this._coat).fallback,
      metalness: 0.04,
      roughness: 0.72,
    })
    this._owned.push(this.skin)
    bindCatTexture(this.skin, this._coat)

    // Torso carries body + head so bob/pitch never leaves the head floating.
    this.torso = new THREE.Group()
    this.torso.position.set(0, 0.15 * s, 0)
    this.root.add(this.torso)

    this.body = this._mesh(new THREE.SphereGeometry(0.11 * s, 10, 8), this.torso, [0, 0, 0], 'fur')
    this.body.scale.set(1.05, 0.78, 1.55)

    this.belly = this._mesh(new THREE.SphereGeometry(0.08 * s, 8, 6), this.torso, [0, -0.03 * s, 0.02 * s], 'belly')
    this.belly.scale.set(0.9, 0.7, 1.2)
    this.belly.castShadow = false

    // Neck pivot at the chest/shoulder — head meshes are local to this.
    this.neck = new THREE.Group()
    this.neck.position.set(0, 0.04 * s, 0.12 * s)
    this.torso.add(this.neck)

    // Short join so the sphere head doesn't leave a gap when the neck tips.
    this.neckJoin = this._mesh(
      new THREE.CylinderGeometry(0.04 * s, 0.045 * s, 0.06 * s, 8),
      this.neck,
      [0, 0.01 * s, 0.02 * s],
      'fur',
    )
    this.neckJoin.rotation.x = Math.PI / 2
    this.neckJoin.castShadow = false

    this.head = this._mesh(new THREE.SphereGeometry(0.075 * s, 10, 8), this.neck, [0, 0.035 * s, 0.055 * s], 'fur')

    this.earL = this._mesh(new THREE.ConeGeometry(0.035 * s, 0.07 * s, 5), this.neck, [-0.045 * s, 0.095 * s, 0.035 * s], 'ear')
    this.earL.rotation.z = 0.25
    this.earL.castShadow = false
    this.earR = this._mesh(new THREE.ConeGeometry(0.035 * s, 0.07 * s, 5), this.neck, [0.045 * s, 0.095 * s, 0.035 * s], 'ear')
    this.earR.rotation.z = -0.25
    this.earR.castShadow = false

    this.nose = this._mesh(new THREE.SphereGeometry(0.018 * s, 6, 5), this.neck, [0, 0.015 * s, 0.1 * s], 'nose')
    this.nose.castShadow = false

    this.tail = this._mesh(
      new THREE.CylinderGeometry(0.018 * s, 0.012 * s, 0.22 * s, 6),
      this.torso,
      [0, 0.05 * s, -0.2 * s],
      'furDk',
    )
    this.tail.rotation.x = Math.PI / 2.6

    this.legL = this._mesh(
      new THREE.CylinderGeometry(0.016 * s, 0.014 * s, 0.14 * s, 5),
      this.root,
      [-0.05 * s, 0.07 * s, 0.06 * s],
      'furDk',
    )
    this.legL.castShadow = false
    this.legR = this._mesh(
      new THREE.CylinderGeometry(0.016 * s, 0.014 * s, 0.14 * s, 5),
      this.root,
      [0.05 * s, 0.07 * s, 0.06 * s],
      'furDk',
    )
    this.legR.castShadow = false
    this.legBL = this._mesh(
      new THREE.CylinderGeometry(0.016 * s, 0.014 * s, 0.14 * s, 5),
      this.root,
      [-0.05 * s, 0.07 * s, -0.08 * s],
      'furDk',
    )
    this.legBL.castShadow = false
    this.legBR = this._mesh(
      new THREE.CylinderGeometry(0.016 * s, 0.014 * s, 0.14 * s, 5),
      this.root,
      [0.05 * s, 0.07 * s, -0.08 * s],
      'furDk',
    )
    this.legBR.castShadow = false

    this._phase = 0
    this._gait = 'idle'
    this._idlePose = null
    this._poseT = 0
    this._bodyScaleZ = 1.55
  }

  _mesh(geo, parent, pos, atlasKey) {
    applyAtlasUvs(geo, CAT_ATLAS[atlasKey] ?? CAT_ATLAS.fur)
    this._owned.push(geo)
    const mesh = new THREE.Mesh(geo, this.skin)
    mesh.position.set(pos[0], pos[1], pos[2])
    mesh.castShadow = atlasKey === 'fur' || atlasKey === 'furDk'
    mesh.receiveShadow = false
    parent.add(mesh)
    return mesh
  }

  setCoat(coatId) {
    const next = normalizeCatCoatId(coatId)
    if (next === this._coat) return
    this._coat = next
    bindCatTexture(this.skin, next)
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
    const s = this._s
    const moving = this._gait === 'walk' || this._gait === 'run'
    const stride =
      this._gait === 'run' ? 11 + Math.min(8, speedEma * 1.2) : this._gait === 'walk' ? 7.5 + Math.min(4, speedEma) : 2.2
    this._phase += dt * stride
    const bob = moving ? Math.sin(this._phase) * (this._gait === 'run' ? 0.024 : 0.014) : 0

    // Default rest height for the torso (body centre); poses override below.
    let torsoY = this.height * (0.4 + bob)
    let torsoPitch = 0
    this.body.scale.set(1.05, 0.78, this._bodyScaleZ)

    if (moving) {
      const amp = this._gait === 'run' ? 0.75 : 0.48
      this.legL.rotation.x = Math.sin(this._phase) * amp
      this.legR.rotation.x = Math.sin(this._phase + Math.PI) * amp
      this.legBL.rotation.x = Math.sin(this._phase + Math.PI) * amp * 0.9
      this.legBR.rotation.x = Math.sin(this._phase) * amp * 0.9
      this.tail.rotation.x = Math.PI / 2.6
      this.tail.rotation.y = Math.sin(this._phase * 0.8) * 0.35
      this.neck.rotation.x = this._gait === 'run' ? -0.12 : -0.04
      this.head.rotation.x = 0
    } else if (this._idlePose === 'sit') {
      this._poseT += dt
      torsoY = this.height * 0.28
      torsoPitch = 0.15
      this.legL.rotation.x = 1.1
      this.legR.rotation.x = 1.1
      this.legBL.rotation.x = 0.35
      this.legBR.rotation.x = 0.35
      this.neck.rotation.x = -0.15
      this.head.rotation.x = Math.sin(this._poseT * 1.2) * 0.08
      this.tail.rotation.x = Math.PI / 2.6
      this.tail.rotation.y = Math.sin(this._poseT * 2.1) * 0.45
    } else if (this._idlePose === 'lick') {
      this._poseT += dt
      const dip = 0.5 + Math.sin(this._poseT * 8) * 0.35
      torsoPitch = 0.1
      this.neck.rotation.x = 0.45 + dip * 0.35
      this.head.rotation.x = dip * 0.4
      this.legL.rotation.x = 0.15
      this.legR.rotation.x = 0.55 + Math.sin(this._poseT * 8) * 0.2
      this.legBL.rotation.x = 0
      this.legBR.rotation.x = 0
      this.tail.rotation.x = Math.PI / 2.6
      this.tail.rotation.y = Math.sin(this._poseT) * 0.2
    } else if (this._idlePose === 'stretch') {
      this._poseT += dt
      const u = Math.min(1, this._poseT / 0.45)
      this.body.scale.set(1.05, 0.72, 1.55 + u * 0.25)
      torsoPitch = -0.2 * u
      this.neck.rotation.x = -0.25 * u
      this.head.rotation.x = -0.1 * u
      this.legL.rotation.x = -0.55 * u
      this.legR.rotation.x = -0.55 * u
      this.legBL.rotation.x = 0.35 * u
      this.legBR.rotation.x = 0.35 * u
      this.tail.rotation.x = Math.PI / 2.6 + u * 0.4
      this.tail.rotation.y = 0
    } else {
      this.neck.rotation.x = Math.sin(this._phase * 0.4) * 0.05
      this.head.rotation.x = Math.sin(this._phase * 0.55) * 0.04
      this.legL.rotation.x = 0
      this.legR.rotation.x = 0
      this.legBL.rotation.x = 0
      this.legBR.rotation.x = 0
      this.tail.rotation.x = Math.PI / 2.6
      this.tail.rotation.y = Math.sin(this._phase * 0.7) * 0.25
    }

    this.torso.position.set(0, torsoY, 0)
    this.torso.rotation.x = torsoPitch
    // Keep the neck pivot seated in the chest as the body scales on stretch.
    this.neck.position.set(0, 0.04 * s, 0.12 * s * (this.body.scale.z / 1.55))
  }

  dispose() {
    for (const geo of this._owned) {
      if (geo.isBufferGeometry) geo.dispose()
      else if (geo.isMaterial) geo.dispose()
    }
    this._owned.length = 0
  }
}
