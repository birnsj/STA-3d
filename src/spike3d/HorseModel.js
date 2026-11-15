import * as THREE from 'three'
import { HORSE_ATLAS, applyAtlasUvs, bindHorseTexture, HORSE_FALLBACK_COLOUR } from './horseTexture.js'

/**
 * Procedural horse for spike3d (exploration mount). Body units match HumanoidModel scale
 * so a saddle socket sits at a readable height under an officer.
 *
 * One shared albedo PNG (`/art/models/creatures/horse.png`); each mesh's UVs sit in an atlas panel.
 */

const RAD = 20
const CAP = 6

/** Approximate withers height in world units (human ~1.95). Riding scale, not pony. */
export const HORSE_HEIGHT = 2.35

export class HorseModel {
  constructor(height = HORSE_HEIGHT) {
    this.height = height
    this.root = new THREE.Group()
    this.root.name = 'horse_model'
    this._owned = []

    // Scale so withers ≈ height (body authored around 28 body units tall).
    this._s = height / 28
    const s = this._s

    // Single material — atlas map when loaded; bay flat until then.
    this.skin = new THREE.MeshStandardMaterial({
      color: HORSE_FALLBACK_COLOUR,
      metalness: 0.05,
      roughness: 0.88,
      flatShading: false,
    })
    this._owned.push(this.skin)
    bindHorseTexture(this.skin)

    this.body = new THREE.Group()
    this.body.name = 'body'
    this.root.add(this.body)

    // Barrel along +Z (nose toward +Z at yaw 0, same facing convention as humanoids).
    this.barrel = this.addEllipsoid(this.body, [0, 14 * s, 0], [4.2 * s, 5.2 * s, 9.5 * s], 'coat')
    this.addEllipsoid(this.body, [0, 15.2 * s, -7.5 * s], [3.6 * s, 4.4 * s, 3.2 * s], 'coatDk')
    this.addEllipsoid(this.body, [0, 14.5 * s, 7.2 * s], [3.4 * s, 4.0 * s, 2.8 * s], 'coat')

    // Saddle socket — rider parents / snaps here.
    this.saddle = new THREE.Group()
    this.saddle.name = 'saddle'
    this.saddle.position.set(0, 19.2 * s, -0.4 * s)
    this.body.add(this.saddle)
    this.addEllipsoid(this.saddle, [0, 0.2 * s, 0], [3.2 * s, 0.55 * s, 3.6 * s], 'saddle')

    this.neck = new THREE.Group()
    this.neck.name = 'neck'
    this.neck.position.set(0, 17 * s, 8.2 * s)
    this.body.add(this.neck)
    this.addCapsule(this.neck, [0, 3.2 * s, 1.6 * s], 2.1 * s, 6.5 * s, 'coat')
    this.addEllipsoid(this.neck, [0, 5.5 * s, 0.4 * s], [1.4 * s, 3.5 * s, 1.8 * s], 'mane')

    this.head = new THREE.Group()
    this.head.name = 'head'
    this.head.position.set(0, 7.2 * s, 3.4 * s)
    this.neck.add(this.head)
    this.addEllipsoid(this.head, [0, 0.4 * s, 1.8 * s], [2.0 * s, 2.2 * s, 3.6 * s], 'coat')
    this.addEllipsoid(this.head, [0, -0.2 * s, 4.6 * s], [1.35 * s, 1.2 * s, 1.6 * s], 'coatDk')
    this.addEllipsoid(this.head, [1.1 * s, 1.6 * s, 0.2 * s], [0.35 * s, 1.4 * s, 0.9 * s], 'coat')
    this.addEllipsoid(this.head, [-1.1 * s, 1.6 * s, 0.2 * s], [0.35 * s, 1.4 * s, 0.9 * s], 'coat')
    this.addEllipsoid(this.head, [0, 2.2 * s, -0.6 * s], [1.2 * s, 1.6 * s, 1.4 * s], 'mane')

    // Tail: dock → mid → tip joints (meshes hang along −Y, slightly aft).
    this.tailRoot = new THREE.Group()
    this.tailRoot.name = 'tail_root'
    this.tailRoot.position.set(0, 16.5 * s, -10.2 * s)
    this.body.add(this.tailRoot)
    this.addCapsule(this.tailRoot, [0, -1.6 * s, -0.35 * s], 1.15 * s, 2.8 * s, 'mane')

    this.tailMid = new THREE.Group()
    this.tailMid.name = 'tail_mid'
    this.tailMid.position.set(0, -3.2 * s, -0.55 * s)
    this.tailRoot.add(this.tailMid)
    this.addCapsule(this.tailMid, [0, -1.5 * s, -0.25 * s], 0.95 * s, 2.6 * s, 'mane')

    this.tailTip = new THREE.Group()
    this.tailTip.name = 'tail_tip'
    this.tailTip.position.set(0, -3.0 * s, -0.4 * s)
    this.tailMid.add(this.tailTip)
    this.addCapsule(this.tailTip, [0, -1.4 * s, -0.2 * s], 0.7 * s, 2.4 * s, 'mane')

    /** @deprecated use tailRoot — kept for callers that still expect `.tail` */
    this.tail = this.tailRoot

    this.legs = [
      this._makeLeg('FL', 1, 1),
      this._makeLeg('FR', -1, 1),
      this._makeLeg('HL', 1, -1),
      this._makeLeg('HR', -1, -1),
    ]

    this.applyPose({})
  }

  _makeLeg(tag, side, fore) {
    const s = this._s
    const x = side * 2.6 * s
    const z = fore > 0 ? 5.2 * s : -5.8 * s
    const hipY = fore > 0 ? 11.5 * s : 12.2 * s

    const upper = new THREE.Group()
    upper.name = `upper_${tag}`
    upper.position.set(x, hipY, z)
    this.body.add(upper)
    const upperLen = fore > 0 ? 6.2 * s : 6.8 * s
    this.addCapsule(upper, [0, -upperLen * 0.48, 0], 1.55 * s, upperLen * 0.85, 'coat')

    const lower = new THREE.Group()
    lower.name = `lower_${tag}`
    lower.position.set(0, -upperLen, 0)
    upper.add(lower)
    const lowerLen = 6.0 * s
    this.addCapsule(lower, [0, -lowerLen * 0.45, 0], 1.05 * s, lowerLen * 0.7, 'coatDk')
    this.addCapsule(lower, [0, -lowerLen * 0.82, 0], 1.15 * s, lowerLen * 0.28, 'sock')

    const hoof = new THREE.Group()
    hoof.name = `hoof_${tag}`
    hoof.position.set(0, -lowerLen, 0)
    lower.add(hoof)
    this.addEllipsoid(hoof, [0, -0.35 * s, 0.35 * s], [1.2 * s, 0.7 * s, 1.6 * s], 'hoof')

    return { upper, lower, hoof, upperLen, lowerLen, side, fore, tag }
  }

  _mesh(geo, parent, pos, atlasKey) {
    applyAtlasUvs(geo, HORSE_ATLAS[atlasKey] ?? HORSE_ATLAS.coat)
    this._owned.push(geo)
    const mesh = new THREE.Mesh(geo, this.skin)
    mesh.position.set(pos[0], pos[1], pos[2])
    mesh.castShadow = false
    mesh.receiveShadow = false
    parent.add(mesh)
    return mesh
  }

  addEllipsoid(parent, pos, radii, atlasKey = 'coat') {
    const mesh = this._mesh(new THREE.SphereGeometry(1, RAD, Math.round(RAD * 0.75)), parent, pos, atlasKey)
    mesh.scale.set(radii[0], radii[1], radii[2])
    return mesh
  }

  addCapsule(parent, pos, radius, length, atlasKey = 'coat', axis = 'y') {
    const geo = new THREE.CapsuleGeometry(radius, Math.max(0.001, length), CAP, RAD)
    const mesh = this._mesh(geo, parent, pos, atlasKey)
    if (axis === 'z') mesh.rotation.x = Math.PI / 2
    if (axis === 'x') mesh.rotation.z = Math.PI / 2
    return mesh
  }

  /**
   * Neck/head pitch: +X tips the nose toward +Z / the ground (forward & down); −X arches back.
   * @param {{
   *   gait?: number,
   *   weight?: number,
   *   neckPitch?: number,
   *   neckYaw?: number,
   *   headPitch?: number,
   *   headYaw?: number,
   *   tailSwing?: number,
   *   tailCurl?: number,
   *   bounce?: number,
   *   legLifts?: number[],
   * }} pose
   */
  applyPose(pose = {}) {
    const gait = pose.gait ?? 0
    const weight = pose.weight ?? 0
    const w = Math.PI * 2 * gait
    const amp = 0.55 * weight
    const legLifts = pose.legLifts ?? [0, 0, 0, 0]
    // turn: −1 right … +1 left (bank into the turn). stopPlant: 0..1 settles the legs.
    const turn = pose.turn ?? 0
    const stopPlant = pose.stopPlant ?? 0

    this.body.position.y = (pose.bounce ?? 0) * this._s
    this.body.rotation.z = (pose.bodyRoll ?? 0) + turn * 0.16 * Math.max(weight, stopPlant * 0.35)
    this.body.rotation.y = (pose.bodyYaw ?? 0) + turn * 0.06 * weight

    // Default pitch is near-level; +X still tips the nose down a little when posed.
    this.neck.rotation.x = (pose.neckPitch ?? 0.06) + Math.sin(w * 0.5) * 0.04 * weight
    this.neck.rotation.y = (pose.neckYaw ?? 0) + turn * 0.28 * Math.max(weight, 0.2)
    this.head.rotation.x = (pose.headPitch ?? 0.08) + Math.sin(w * 0.5 + 0.35) * 0.03 * weight
    this.head.rotation.y = (pose.headYaw ?? 0) + turn * 0.12 * Math.max(weight, 0.2)

    // Articulated tail: dock / mid / tip follow swing + curl (more sway when moving).
    const swing = pose.tailSwing ?? 0
    const curl = pose.tailCurl ?? 0.45
    const gaitSway = Math.sin(w * 0.55) * 0.22 * Math.max(0.15, weight)
    const gaitCurl = Math.sin(w * 0.7 + 1) * 0.18 * Math.max(0.15, weight)
    this.tailRoot.rotation.x = curl + gaitCurl
    this.tailRoot.rotation.y = swing + gaitSway
    this.tailRoot.rotation.z = swing * 0.15
    this.tailMid.rotation.x = curl * 0.55 + gaitCurl * 0.7
    this.tailMid.rotation.y = swing * 0.75 + gaitSway * 0.85
    this.tailMid.rotation.z = swing * 0.1
    this.tailTip.rotation.x = curl * 0.4 + gaitCurl * 0.5
    this.tailTip.rotation.y = swing * 0.55 + gaitSway * 0.7
    this.tailTip.rotation.z = -swing * 0.08

    // Diagonal pairs: FL+HR / FR+HL. Idle legLifts (0–1) fold a hoof up then down.
    // +lower.x folds the knee/hock so the cannon swings forward (+Z).
    // Turn: outside legs reach a little farther; stopPlant damps swing into a plant.
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i]
      const phase = leg.fore === leg.side ? w : w + Math.PI
      const outside = turn !== 0 && Math.sign(leg.side) === Math.sign(turn) ? 1.12 : turn !== 0 ? 0.88 : 1
      const plant = 1 - stopPlant * 0.85
      const swingLeg = Math.sin(phase) * amp * outside * plant
      const lift = Math.max(0, Math.sin(phase)) * amp * 0.55 * plant
      const stamp = Math.min(1, Math.max(0, legLifts[i] ?? 0))
      const stampFold = stamp * (leg.fore > 0 ? 0.85 : 0.7)
      leg.upper.rotation.x = swingLeg + stamp * (leg.fore > 0 ? 0.28 : 0.22) + stopPlant * (leg.fore > 0 ? 0.08 : 0.12)
      leg.lower.rotation.x = lift + Math.abs(swingLeg) * 0.65 + stampFold + stopPlant * 0.15
      leg.hoof.rotation.x = -(lift * 0.55 + stamp * 0.35)
    }
  }

  dispose() {
    for (const item of this._owned) item.dispose?.()
    this._owned.length = 0
  }
}
