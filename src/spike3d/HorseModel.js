import * as THREE from 'three'
import {
  HORSE_ATLAS,
  applyAtlasUvs,
  bindHorseTexture,
  horseCoatOf,
  normalizeHorseCoatId,
} from './horseTexture.js'

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

/**
 * Horse faces +Z; left is −X (right-handed). Positive reach matches exploration
 * mountSidePoint (heading + π/2). Local joint X must be negative or climb/dismount
 * land on the right and pop to the sim left pad.
 */
export const MOUNT_LEFT_REACH = 1.15
export const MOUNT_LEFT_X = -MOUNT_LEFT_REACH
/** Raised left climb waypoint X — still outside the barrel half-width (~0.33). */
export const MOUNT_LEFT_UP_X = -1.05
/** Local −Z of the stand pad (slightly aft of horse origin); mountSidePoint must match. */
export const MOUNT_LEFT_AFT = (-0.4 * HORSE_HEIGHT) / 28

/** Walk 4-beat offsets (radians on the gait cycle): hind→fore, left then right. */
const WALK_PHASE = {
  HL: 0,
  FL: Math.PI * 0.5,
  HR: Math.PI,
  FR: Math.PI * 1.5,
}

/** Run / gallop lead-leg offsets: hinds then fores with a short suspension gap. */
const RUN_PHASE = {
  HL: 0,
  HR: Math.PI * 0.22,
  FL: Math.PI * 0.95,
  FR: Math.PI * 1.18,
}

export class HorseModel {
  constructor(height = HORSE_HEIGHT, { coat = 'bay' } = {}) {
    this.height = height
    this._coat = normalizeHorseCoatId(coat)
    this.root = new THREE.Group()
    this.root.name = 'horse_model'
    this._owned = []

    // Scale so withers ≈ height (body authored around 28 body units tall).
    this._s = height / 28
    const s = this._s

    // Single material — atlas map when loaded; coat flat until then.
    this.skin = new THREE.MeshStandardMaterial({
      color: horseCoatOf(this._coat).fallback,
      metalness: 0.05,
      roughness: 0.88,
      flatShading: false,
    })
    this._owned.push(this.skin)
    bindHorseTexture(this.skin, this._coat)

    this.body = new THREE.Group()
    this.body.name = 'body'
    this.root.add(this.body)

    // Athletic riding-horse proportions (side-view reference): deep chest, short strong back,
    // level withers≈croup, long arched neck, long straight face. Nose toward +Z.
    this.barrel = this.addEllipsoid(this.body, [0, 13.6 * s, -0.4 * s], [3.9 * s, 5.9 * s, 7.8 * s], 'coat')
    // Rounded croup / hindquarters (sloping slightly aft).
    this.addEllipsoid(this.body, [0, 14.8 * s, -7.2 * s], [3.5 * s, 4.8 * s, 3.6 * s], 'coatDk')
    // Deep chest + sloping shoulder mass into the neck.
    this.addEllipsoid(this.body, [0, 14.2 * s, 6.4 * s], [3.7 * s, 5.4 * s, 3.4 * s], 'coat')
    this.addEllipsoid(this.body, [0, 16.6 * s, 4.2 * s], [2.6 * s, 2.4 * s, 2.8 * s], 'coat')

    // Saddle socket — rider parents / snaps here (just behind withers).
    this.saddle = new THREE.Group()
    this.saddle.name = 'saddle'
    this.saddle.position.set(0, 19.0 * s, -0.6 * s)
    this.body.add(this.saddle)
    this.addEllipsoid(this.saddle, [0, 0.15 * s, 0], [3.0 * s, 0.5 * s, 3.4 * s], 'saddle')

    // Left-side climb sockets on the root (tile units). −X = left of horse forward (+Z).
    // Kept off `body` so the ground pad does not bob with gait bounce.
    /** Stand pad the rider walks to before climbing (matches mountSidePoint offset). */
    this.mountLeft = new THREE.Group()
    this.mountLeft.name = 'mount_left'
    this.mountLeft.position.set(MOUNT_LEFT_X, 0, MOUNT_LEFT_AFT)
    this.root.add(this.mountLeft)
    /** Left stirrup step — low enough that the climb reads as a step-up, not a hover. */
    this.mountLeftUp = new THREE.Group()
    this.mountLeftUp.name = 'mount_left_up'
    this.mountLeftUp.position.set(MOUNT_LEFT_UP_X, 7.2 * s, MOUNT_LEFT_AFT)
    this.root.add(this.mountLeftUp)

    // Neck root at the withers; mesh is tilted up-and-forward so the joint stays animatable.
    this.neck = new THREE.Group()
    this.neck.name = 'neck'
    this.neck.position.set(0, 16.8 * s, 6.0 * s)
    this.body.add(this.neck)
    // Thick muscular column (was reading as a pipe — match a riding-horse crest).
    const neckColumn = this.addCapsule(this.neck, [0, 3.6 * s, 3.0 * s], 2.55 * s, 7.6 * s, 'coat')
    neckColumn.rotation.x = 0.78
    // Extra throat / base volume where the neck meets the shoulder.
    this.addEllipsoid(this.neck, [0, 1.2 * s, 1.1 * s], [2.35 * s, 2.6 * s, 2.8 * s], 'coat')
    // Crest / mane draping the top of the neck.
    const maneCrest = this.addEllipsoid(this.neck, [0.65 * s, 5.2 * s, 2.6 * s], [1.35 * s, 4.0 * s, 2.0 * s], 'mane')
    maneCrest.rotation.x = 0.72
    maneCrest.rotation.z = -0.12

    // Head at the poll — long straight profile, tapered muzzle, small upright ears.
    this.head = new THREE.Group()
    this.head.name = 'head'
    this.head.position.set(0, 8.4 * s, 7.0 * s)
    this.neck.add(this.head)
    // Skull / jowl.
    this.addEllipsoid(this.head, [0, 0.15 * s, 0.6 * s], [1.65 * s, 1.95 * s, 2.35 * s], 'coat')
    // Long face toward the nose.
    this.addEllipsoid(this.head, [0, -0.15 * s, 3.2 * s], [1.25 * s, 1.35 * s, 2.5 * s], 'coat')
    // Dark muzzle / nostril tip.
    this.addEllipsoid(this.head, [0, -0.35 * s, 5.35 * s], [0.95 * s, 0.85 * s, 1.05 * s], 'coatDk')
    // Cheek / jaw line under the skull.
    this.addEllipsoid(this.head, [0, -1.05 * s, 1.4 * s], [1.35 * s, 1.1 * s, 1.8 * s], 'coat')
    // Ears — small, pointed, at the poll.
    this.addEllipsoid(this.head, [0.95 * s, 2.05 * s, -0.35 * s], [0.28 * s, 1.15 * s, 0.5 * s], 'coat')
    this.addEllipsoid(this.head, [-0.95 * s, 2.05 * s, -0.35 * s], [0.28 * s, 1.15 * s, 0.5 * s], 'coat')
    // Forelock.
    this.addEllipsoid(this.head, [0.2 * s, 1.7 * s, -0.55 * s], [0.9 * s, 1.35 * s, 1.1 * s], 'mane')

    // Tail: dock → mid → tip joints (meshes hang along −Y, slightly aft).
    this.tailRoot = new THREE.Group()
    this.tailRoot.name = 'tail_root'
    this.tailRoot.position.set(0, 16.2 * s, -9.6 * s)
    this.body.add(this.tailRoot)
    this.addCapsule(this.tailRoot, [0, -1.7 * s, -0.4 * s], 1.2 * s, 3.0 * s, 'mane')

    this.tailMid = new THREE.Group()
    this.tailMid.name = 'tail_mid'
    this.tailMid.position.set(0, -3.4 * s, -0.6 * s)
    this.tailRoot.add(this.tailMid)
    this.addCapsule(this.tailMid, [0, -1.6 * s, -0.3 * s], 1.0 * s, 2.8 * s, 'mane')

    this.tailTip = new THREE.Group()
    this.tailTip.name = 'tail_tip'
    this.tailTip.position.set(0, -3.2 * s, -0.45 * s)
    this.tailMid.add(this.tailTip)
    this.addCapsule(this.tailTip, [0, -1.5 * s, -0.25 * s], 0.75 * s, 2.6 * s, 'mane')

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
    // Slightly finer stance; fore legs under the shoulder, hinds under the croup.
    const x = side * 2.45 * s
    const z = fore > 0 ? 5.0 * s : -5.6 * s
    const hipY = fore > 0 ? 11.4 * s : 12.1 * s

    const upper = new THREE.Group()
    upper.name = `upper_${tag}`
    upper.position.set(x, hipY, z)
    this.body.add(upper)
    const upperLen = fore > 0 ? 6.4 * s : 6.9 * s
    this.addCapsule(upper, [0, -upperLen * 0.48, 0], 1.35 * s, upperLen * 0.85, 'coat')

    const lower = new THREE.Group()
    lower.name = `lower_${tag}`
    lower.position.set(0, -upperLen, 0)
    upper.add(lower)
    const lowerLen = 6.1 * s
    // Black points from the knee/hock down (coatDk cannon + sock).
    this.addCapsule(lower, [0, -lowerLen * 0.42, 0], 0.9 * s, lowerLen * 0.65, 'coatDk')
    this.addCapsule(lower, [0, -lowerLen * 0.82, 0], 1.05 * s, lowerLen * 0.3, 'sock')

    const hoof = new THREE.Group()
    hoof.name = `hoof_${tag}`
    hoof.position.set(0, -lowerLen, 0)
    lower.add(hoof)
    this.addEllipsoid(hoof, [0, -0.35 * s, 0.35 * s], [1.1 * s, 0.65 * s, 1.5 * s], 'hoof')

    return { upper, lower, hoof, upperLen, lowerLen, side, fore, tag }
  }

  _mesh(geo, parent, pos, atlasKey) {
    applyAtlasUvs(geo, HORSE_ATLAS[atlasKey] ?? HORSE_ATLAS.coat)
    this._owned.push(geo)
    const mesh = new THREE.Mesh(geo, this.skin)
    mesh.position.set(pos[0], pos[1], pos[2])
    // Only main coat volumes cast — mane/saddle/hoof/socks stacked into an opaque black slab.
    mesh.castShadow = atlasKey === 'coat' || atlasKey === 'coatDk'
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
   *   trot?: number,
   *   run?: number,
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
    const trot = Math.min(1, Math.max(0, pose.trot ?? 0))
    const run = Math.min(1, Math.max(0, pose.run ?? 0))
    const w = Math.PI * 2 * gait
    // Trot / run reach farther and lift higher so faster gaits read at ride speed.
    const amp = (0.58 + trot * 0.28 + run * 0.4) * weight
    const liftMul = 0.55 + trot * 0.45 + run * 0.55
    const legLifts = pose.legLifts ?? [0, 0, 0, 0]
    // turn: −1 right … +1 left (bank into the turn). stopPlant: 0..1 settles the legs.
    const turn = pose.turn ?? 0
    const stopPlant = pose.stopPlant ?? 0

    this.body.position.y = (pose.bounce ?? 0) * this._s
    this.body.rotation.z = (pose.bodyRoll ?? 0) + turn * 0.16 * Math.max(weight, stopPlant * 0.35)
    this.body.rotation.y = (pose.bodyYaw ?? 0) + turn * 0.06 * weight

    // Geometry already carries the neck up-and-forward; joint pitch is a small additive tip.
    this.neck.rotation.x = (pose.neckPitch ?? 0.02) + Math.sin(w * 0.5) * 0.035 * weight
    this.neck.rotation.y = (pose.neckYaw ?? 0) + turn * 0.28 * Math.max(weight, 0.2)
    this.head.rotation.x = (pose.headPitch ?? 0.04) + Math.sin(w * 0.5 + 0.35) * 0.03 * weight
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

    // Walk = 4-beat. Trot = diagonal 2-beat. Run = lead-leg gallop (hinds→fores).
    // Idle legLifts (0–1) fold a hoof up then down. Turn: outside legs reach farther.
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i]
      const walkPhase = w + (WALK_PHASE[leg.tag] ?? 0)
      const trotPhase = leg.fore === leg.side ? w : w + Math.PI
      const runPhase = w + (RUN_PHASE[leg.tag] ?? 0)
      const sWalk = Math.sin(walkPhase)
      const sTrot = Math.sin(trotPhase)
      const sRun = Math.sin(runPhase)
      const s =
        run > 0.001 ? sRun * run + (sWalk * (1 - trot) + sTrot * trot) * (1 - run) : sWalk * (1 - trot) + sTrot * trot
      const outside = turn !== 0 && Math.sign(leg.side) === Math.sign(turn) ? 1.12 : turn !== 0 ? 0.88 : 1
      const plant = 1 - stopPlant * 0.85
      const swingLeg = s * amp * outside * plant
      const lift = Math.max(0, s) * amp * liftMul * plant
      const stamp = Math.min(1, Math.max(0, legLifts[i] ?? 0))
      const stampFold = stamp * (leg.fore > 0 ? 0.85 : 0.7)
      leg.upper.rotation.x = swingLeg + stamp * (leg.fore > 0 ? 0.28 : 0.22) + stopPlant * (leg.fore > 0 ? 0.08 : 0.12)
      leg.lower.rotation.x = lift + Math.abs(swingLeg) * (0.55 + trot * 0.25 + run * 0.2) + stampFold + stopPlant * 0.15
      leg.hoof.rotation.x = -(lift * 0.55 + stamp * 0.35)
    }
  }

  /** Swap coat atlas (bay / black / chestnut / grey / palomino). */
  setCoat(coatId) {
    const id = normalizeHorseCoatId(coatId)
    if (id === this._coat) return
    this._coat = id
    bindHorseTexture(this.skin, id)
  }

  dispose() {
    for (const item of this._owned) item.dispose?.()
    this._owned.length = 0
  }
}
