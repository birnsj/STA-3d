import * as THREE from 'three'
import { clearLiveClip, reportLiveClip } from '../dev/animClipDebug.js'
import { blastReactionAnimation, blastStaggerAnimation, isExplosionInjury } from '../rules/appearance.js'
import { facingToYaw, makeIsoCamera, syncIsoCamera } from './isoProjection.js'
import { resolveSpike3dAppearance } from './appearance.js'
import { clipSeconds, IDLE_FIDGET_GAP, IDLE_FIDGETS } from './clips.js'
import { ProceduralBody, PROCEDURAL_HEIGHT } from './ProceduralBody.js'
import { HorseActor } from './HorseActor.js'
import { HumanoidRagdoll } from './HumanoidRagdoll.js'
import {
  boardSunColourSaturation,
  boardSunFillOffset,
  boardSunOffset,
  getBoardSunSettings,
} from './boardSunSettings.js'
import { CONTACT_SHADOW_FILL_OPACITY, createContactShadow } from './contactShadow.js'
import { addColliderMeshes, addOccluderMeshes, buildMapColliders, occluderPunchesActor } from './mapColliders.js'
import { PhysicsWorld } from './PhysicsWorld.js'
import { cloneRagdollSettings, DEFAULT_RAGDOLL_SETTINGS } from './ragdollSettings.js'

const HEIGHT = PROCEDURAL_HEIGHT

// Soft enough that large horse meshes do not stamp opaque black slabs on the board.
const SHADOW_FLOOR_OPACITY = 0.28
/** Key must outrank hemi/fill so the Sun slider’s orbit reads on mesh shading and cast direction. */
const HEMI_INTENSITY = 0.55
const SUN_INTENSITY = 1.35
const FILL_INTENSITY = 0.22
const RIM_INTENSITY = 0.16
const TONE_EXPOSURE = 1.05

// Knock direction = damage source → victim (map x/y → world x/z). Strength from ragdollSettings.
// Never treat the victim tile as the blast origin — that zeros the vector and used to flop everyone the same way.
function blastImpulseFromReact(blastReact, seed = '', settings = DEFAULT_RAGDOLL_SETTINGS) {
  const injury = blastReact?.injury
  const origin = injury?.source?.blastOrigin
  const victim = blastReact?.from ?? injury?.source?.at ?? blastReact?.land
  let dx = 0
  let dz = 0
  if (origin && victim) {
    dx = (victim.x ?? 0) - (origin.x ?? 0)
    dz = (victim.y ?? 0) - (origin.y ?? 0)
  }
  // Standing on the charge (or missing origin): use the throw facing / from→land already computed by the rules.
  if (!(dx || dz) && blastReact?.facing) {
    dx = blastReact.facing.x || 0
    dz = blastReact.facing.y || 0
  }
  if (!(dx || dz) && blastReact?.from && blastReact?.land) {
    dx = blastReact.land.x - blastReact.from.x
    dz = blastReact.land.y - blastReact.from.y
  }
  if (!(dx || dz)) {
    dx = 0
    dz = 1
  }
  const len = Math.hypot(dx, dz) || 1
  dx /= len
  dz /= len
  const s = { ...DEFAULT_RAGDOLL_SETTINGS, ...settings }
  // Mild radius boost so larger blasts still feel stronger without ignoring the tuned shove/lift.
  const radius = Number(injury?.source?.blastRadius) || Number(injury?.source?.radius) || Number(injury?.radius) || 2
  const radiusBoost = 1 + Math.max(0, radius - 2) * 0.12 + (String(seed).length % 3) * 0.03
  const power = (Number(s.power) || 0) * radiusBoost
  const lift = (Number(s.lift) || 0) * radiusBoost
  return {
    impulse: { x: dx * power, y: lift, z: dz * power },
    point: victim ? { x: victim.x, y: HEIGHT * 0.55, z: victim.y } : null,
  }
}

class SpikeActor {
  constructor(id, host, { uniform, enemy = false, appearance = null } = {}) {
    this.id = id
    this.host = host
    this.scene = host.scene
    this.enemy = enemy
    this.ragdollActive = false
    this._blastKey = null
    this._staggerCallback = null
    this._pendingBlast = null
    this._beam = null
    this._settleFallClip = null
    this._ragdollSettledToPose = false
    this._deathLocked = false
    this._lastSeen = performance.now()

    this.root = new THREE.Group()
    this.root.name = `spike_actor_${id}`
    const resolved = appearance ?? resolveSpike3dAppearance({ uniform, enemy })
    this.body = new ProceduralBody({ height: HEIGHT, uniform: resolved.uniform ?? uniform, appearance: resolved })
    this.root.add(this.body.root)
    // Soft foot fill; mesh cast shadows land on the scene ShadowMaterial floor plane.
    this.shadow = createContactShadow({ width: HEIGHT * 0.55, depth: HEIGHT * 0.32 })
    this.root.add(this.shadow)
    this.ragdoll = null
    // Match setPose key so the first pose does not rebuild hair/race meshes (showcase blink).
    this._appearanceKey = resolved
      ? `${resolved.species}|${resolved.gender}|${resolved.hairStyle}|${resolved.hairColour}|${resolved.klingonArmour}|${resolved.outfit ?? ''}|${resolved.uniform ?? ''}`
      : null
    this._paintX = 0
    this._paintZ = 0
    this._tx = 0
    this._tz = 0
    this._yaw = Math.PI / 4
    this._yawTarget = this._yaw
    this._posReady = false
    this._pendingTravel = 0
    this._mounted = false
    this._mountBlend = null
    this._rideEndsAt = null
    this._rideClip = null
    this._worldTimeAtPose = null
    this._poseWallMs = 0
    // Idle fidgets (same catalogue / gap as sprite FigureView) — only while the resolved clip is idle.
    this._fidget = null
    this._nextFidgetAt = null
    this._lastFidget = null
    this.scene.add(this.root)
  }

  _fidgetGapMs() {
    const [minGap, maxGap] = IDLE_FIDGET_GAP
    return (minGap + Math.random() * (maxGap - minGap)) * 1000
  }

  _clearFidget() {
    this._fidget = null
    this._nextFidgetAt = null
  }

  /**
   * Attach blend 0 = mount pad, 1 = saddle. Advances with wall clock between sparse sim pose stamps
   * so climb-off does not freeze then jump when React catches up.
   */
  _liveMountBlend() {
    if (this._rideEndsAt != null && this._rideClip && this._worldTimeAtPose != null) {
      const dur = clipSeconds(this._rideClip) || (this._rideClip === 'dismount' ? 1.3 : 1.45)
      const now = this._worldTimeAtPose + Math.max(0, (performance.now() - (this._poseWallMs || 0)) / 1000)
      const remaining = (this._rideEndsAt - now) / dur
      if (this._rideClip === 'dismount') return Math.min(1, Math.max(0, remaining))
      return Math.min(1, Math.max(0, 1 - remaining))
    }
    return this._mountBlend
  }

  /** Base idle, or a one-shot fidget when the gap elapses (never the same twice in a row). */
  _idleOrFidget(now) {
    if (this._fidget && (now >= this._fidget.endsAt || this.body.current === 'idle')) {
      this._fidget = null
      this._nextFidgetAt = now + this._fidgetGapMs()
    }
    if (this._nextFidgetAt === null) this._nextFidgetAt = now + this._fidgetGapMs()
    if (!this._fidget && now >= this._nextFidgetAt && IDLE_FIDGETS.length) {
      const choices = IDLE_FIDGETS.filter((name) => name !== this._lastFidget)
      const pool = choices.length ? choices : IDLE_FIDGETS
      this._lastFidget = pool[Math.floor(Math.random() * pool.length)]
      this._fidget = {
        name: this._lastFidget,
        endsAt: now + clipSeconds(this._lastFidget) * 1000,
      }
    }
    return this._fidget?.name ?? 'idle'
  }

  /** @deprecated use this.body.model — kept for ragdoll material hand-off */
  get model() {
    return this.body.model
  }

  get physics() {
    return this.host.physics
  }

  // Matches Pixi figure depth (x+y+0.5) so occluderPunchesActor can compare against block x+y.
  // Horse uses +0.55; a mounted rider must sort above that or the barrel paints over them.
  paintKey() {
    if (this.ragdollActive && this.ragdoll?.bodies?.hips) {
      const t = this.ragdoll.bodies.hips.translation()
      return t.x + t.z + 0.5
    }
    const bias = this._mounted ? 0.62 : 0.5
    return this._paintX + this._paintZ + bias
  }

  setVisible(visible) {
    // 'waiting' = pre-beam-in: keep the actor alive but draw nothing (matches sprite alpha 0).
    // Ragdoll drives the procedural mesh in place — keep the actor root visible while flopping.
    const show = Boolean(visible) && this._beam !== 'waiting'
    this.root.visible = show
    if (this.shadow) this.shadow.visible = show && !this.ragdollActive
    if (this.ragdoll?.root) this.ragdoll.root.visible = false
  }

  setPose({
    position,
    facing,
    gait,
    animation,
    down,
    beam,
    blastReact,
    onStaggerDone,
    colour,
    appearance,
    mounted,
    mountBlend,
    rideEndsAt,
    rideClip,
    worldTime,
  }) {
    this._staggerCallback = onStaggerDone ?? null
    this._down = Boolean(down)
    this._beam = beam ?? null
    // Shared with exploration rideAttachBlend (0 = mount pad, 1 = saddle). Null = not in a climb.
    this._mountBlend = mountBlend == null || !Number.isFinite(Number(mountBlend)) ? null : Number(mountBlend)
    this._rideEndsAt = Number.isFinite(rideEndsAt) ? rideEndsAt : null
    this._rideClip = rideClip === 'mount' || rideClip === 'dismount' ? rideClip : null
    this._worldTimeAtPose = Number.isFinite(worldTime) ? worldTime : null
    this._poseWallMs = performance.now()
    const wasMounted = this._mounted
    this._mounted = Boolean(mounted)
    if (wasMounted && !this._mounted && this.shadow) {
      this.shadow.visible = this.root.visible && !this.ragdollActive
    }
    this._lastSeen = performance.now()
    if (!down && this._deathLocked) this._deathLocked = false
    if (appearance) {
      const key = `${appearance.species}|${appearance.gender}|${appearance.hairStyle}|${appearance.hairColour}|${appearance.klingonArmour}|${appearance.outfit ?? ''}|${appearance.uniform ?? ''}`
      if (key !== this._appearanceKey) {
        this._appearanceKey = key
        this.body.setAppearance(appearance)
      }
    } else if (colour != null && colour !== this._colourKey) {
      this._colourKey = colour
      this.body.setUniform(colour)
    }
    if (!position) return

    // Always track the sim tile (landing tile during a blast) even while physics drives the mesh.
    this._yawTarget = facingToYaw(facing)
    if (!this.ragdollActive) {
      // Climb attach was authoritative — keep feet on the mount joint instead of snapping from the saddle track.
      if (wasMounted && !this._mounted) {
        this._tx = this.root.position.x
        this._tz = this.root.position.z
        this._paintX = this._tx
        this._paintZ = this._tz
        this._yaw = this.root.rotation.y
        this._yawTarget = this._yaw
        this._pendingTravel = 0
      } else {
        if (this._posReady) {
          this._pendingTravel = Math.hypot(position.x - this._tx, position.y - this._tz)
        }
        this._tx = position.x
        this._tz = position.y
        // Mounted riders are seated on the horse each frame — don't plant feet on the tile.
        // Snap with the sim (same as LEAD / rings) so the label doesn't jitter against the mesh.
        if (!this._mounted) {
          this.root.position.set(this._tx, 0, this._tz)
          this._paintX = this._tx
          this._paintZ = this._tz
        }
      }
      if (!this._posReady) {
        this._posReady = true
        this._yaw = this._yawTarget
        this.root.rotation.y = this._yaw
      }
    } else {
      this._tx = position.x
      this._tz = position.y
    }

    const blastKey = blastReact?.injury?.id ?? (blastReact ? `br:${this.id}` : null)
    if (blastReact && isExplosionInjury(blastReact.injury) && blastKey && blastKey !== this._blastKey) {
      this._blastKey = blastKey
      this._requestRagdoll(blastReact, down)
      return
    }

    if (this.ragdollActive) {
      if (!down && !blastReact) this._clearRagdoll()
      return
    }

    // Defeated after ragdoll: keep the death rest — don't let idle/fidget/fall-replay stand them up or sink them.
    if (this._deathLocked && down) {
      reportLiveClip(this.id, this._settleFallClip || this.body.current || 'fallBlastBack')
      return
    }

    // Prefer explicit clip from unitPose / figure.pose; gait is the exploration fallback.
    let clip = animation || null
    if (!clip) {
      if (gait === 'run') clip = 'run'
      else if (gait === 'sneakWalk') clip = 'sneakWalk'
      else if (gait === 'sneakIdle') clip = 'sneakIdle'
      else if (gait === 'walk') clip = 'walk'
      else if (gait === 'stepBack') clip = 'stepBack'
      else clip = this._mounted ? 'rideIdle' : 'idle'
    }
    // Mounted: never play foot idle / standing fidgets — stay in the saddle loop.
    if (this._mounted && (clip === 'idle' || IDLE_FIDGETS.includes(clip))) {
      clip = 'rideIdle'
    }
    // Standing idle: random look-around / shift / etc. Walk, combat poses, beam-wait clear the timer.
    if (clip === 'idle' && !this._down && !this._mounted && this._beam !== 'waiting') {
      clip = this._idleOrFidget(performance.now())
    } else {
      this._clearFidget()
    }
    // Defeated fall (no ragdoll): play the tip, then lock a death rest once the hold finishes.
    if (down && String(clip).startsWith('fall')) {
      this._settleFallClip = clip
      if (this.body.current === clip && this.body.actionDone) {
        this.body.applyDeathRest(clip)
        this._deathLocked = true
      } else {
        this.body.play(clip)
      }
      reportLiveClip(this.id, clip)
      return
    }
    this.body.play(clip)
    // Climb clips scrub from world-clock blend so attach + pose hit the mount joint together.
    const climbBlend = this._liveMountBlend()
    if ((clip === 'mount' || clip === 'dismount') && climbBlend != null) {
      const u = clip === 'mount' ? climbBlend : 1 - climbBlend
      this.body.seek?.(u)
    }
    reportLiveClip(this.id, this.body.current || clip)
  }

  _requestRagdoll(blastReact, down) {
    // Rapier only boots on impact — walk/idle never touch the physics world.
    if (this.physics) {
      this._activateRagdoll(blastReact, down)
      return
    }
    this._pendingBlast = { blastReact, down }
    this.host.ensurePhysics().then((physics) => {
      if (!physics || !this._pendingBlast) return
      const pending = this._pendingBlast
      this._pendingBlast = null
      this._activateRagdoll(pending.blastReact, pending.down)
    })
  }

  _activateRagdoll(blastReact, down) {
    if (!this.physics) return
    this.root.updateWorldMatrix(true, true)
    this.ragdollActive = true
    this._ragdollSettledToPose = false
    this.body.root.visible = true
    // Floor pose after settle: defeat uses the blast fall; stagger uses the shared getUp-matched fall.
    this._settleFallClip = down
      ? blastReactionAnimation(blastReact?.injury, this.id)
      : blastStaggerAnimation()
    if (!this.ragdoll) {
      this.ragdoll = new HumanoidRagdoll(this.physics, this.scene, {
        height: HEIGHT,
        materials: this.body.materials,
      })
    }
    const settings = cloneRagdollSettings(this.host.ragdollSettings)
    this.ragdoll.setTuning(settings)
    this.physics.setGravity(settings.gravity)
    const { impulse, point } = blastImpulseFromReact(blastReact, this.id, settings)
    // Jointed ragdoll drives the procedural mesh; death rest is applied when it settles.
    this.body.root.userData.humanoidModel = this.body.model
    this.ragdoll.activate(this.body.root, impulse, point)
    this._pendingStaggerClear = !down
  }

  /** Drop physics and plant the procedural figure on the landing tile in a death / fall rest pose. */
  _finishRagdollOntoFloor() {
    if (this._ragdollSettledToPose) return
    this._ragdollSettledToPose = true
    this.ragdoll?.disposeBodies()
    this.ragdollActive = false
    this.root.position.set(this._tx, 0, this._tz)
    this.root.rotation.set(0, this._yawTarget, 0)
    this.root.quaternion.setFromEuler(this.root.rotation)
    this._yaw = this._yawTarget
    this._paintX = this._tx
    this._paintZ = this._tz
    // Undo physics local TRS before planting the animator death rest.
    this.body.model?.restoreBindLocals?.()
    const clip = this._settleFallClip || 'fallBlastBack'
    this.body.applyDeathRest(clip)
    // Defeated: lock the corpse. Stagger survivors stay unlocked so getUp can play.
    this._deathLocked = Boolean(this._down)
    reportLiveClip(this.id, clip)
  }

  _clearRagdoll() {
    this.ragdoll?.disposeBodies()
    this.ragdollActive = false
    this._ragdollSettledToPose = false
    this._settleFallClip = null
    this._deathLocked = false
    this._blastKey = null
    this._pendingStaggerClear = false
    this._pendingBlast = null
    this.body.root.visible = true
    this.root.rotation.set(0, this._yawTarget, 0)
    this.root.quaternion.setFromEuler(this.root.rotation)
    this._yaw = this._yawTarget
    // Snap joints back to bind locals, then idle (ragdoll rewrote position + quaternion).
    this.body.model?.restoreBindLocals?.()
    this.body.play('idle', { force: true })
  }

  update(dt) {
    if (this.ragdollActive) {
      reportLiveClip(this.id, 'ragdoll')
      if (this.ragdoll?.settled) {
        this._finishRagdollOntoFloor()
        if (this._pendingStaggerClear) {
          this._pendingStaggerClear = false
          this._staggerCallback?.()
        }
        // Fall pose is now animator-driven; continue into the normal update path.
      } else {
        return
      }
    }
    if (this._posReady && dt > 0) {
      this._pendingTravel = 0
      if (!this._mounted) {
        this.root.position.set(this._tx, 0, this._tz)
        const yawK = 1 - Math.exp(-16 * dt)
        let dy = this._yawTarget - this._yaw
        while (dy > Math.PI) dy -= Math.PI * 2
        while (dy < -Math.PI) dy += Math.PI * 2
        this._yaw += dy * yawK
        this.root.rotation.y = this._yaw
        this._paintX = this._tx
        this._paintZ = this._tz
      } else if (this.shadow) {
        this.shadow.visible = false
      }
    }
    // Death-locked corpses keep their last applied rest — don't let the animator ease them.
    if (!(this._deathLocked && this._down)) {
      const climbBlend = this._liveMountBlend()
      const climbClip = this.body.current === 'mount' || this.body.current === 'dismount'
      if (climbClip && climbBlend != null) {
        // Don't let paint-dt race the sim clock — scrub to the shared blend every frame.
        const u = this.body.current === 'mount' ? climbBlend : 1 - climbBlend
        this.body.seek?.(u)
      } else {
        this.body.update(dt, null)
      }
      // After a non-ragdoll defeat fall holds its last frame, lock the corpse on a death rest.
      if (this._down && !this.ragdollActive) {
        const clip = this.body.current
        if (String(clip || '').startsWith('fall') && this.body.actionDone) {
          this._settleFallClip = clip
          this.body.applyDeathRest(clip)
          this._deathLocked = true
        }
      }
    }
    reportLiveClip(this.id, this.body.current || 'idle')
    if (this.shadow) {
      // Counter-rotate so the ellipse stays axis-aligned on the floor (reads as a contact blob).
      this.shadow.rotation.y = -this._yaw
      const bounce = this.body.bodyY
      const squash = 1 + Math.min(0.12, bounce * 0.8)
      // Plane lies in local XY; after rot.x = -π/2 that is the floor.
      this.shadow.scale.set(squash, 1 / squash, 1)
      // Soft fill only — cast silhouette comes from the scene shadow map.
      const strength = getBoardSunSettings().shadowStrength ?? 1
      this.shadow.material.opacity =
        (CONTACT_SHADOW_FILL_OPACITY + Math.min(0.08, bounce * 0.5)) * strength
    }
  }

  dispose() {
    clearLiveClip(this.id)
    this._pendingBlast = null
    this.ragdoll?.dispose()
    this.ragdoll = null
    this.scene.remove(this.root)
    this.shadow?.geometry?.dispose?.()
    this.shadow?.material?.dispose?.()
    this.shadow = null
    this.body.dispose()
  }
}

export class Spike3dScene {
  constructor(canvas, map) {
    this.canvas = canvas
    this.map = map
    this.actors = new Map()
    this.horses = new Map()
    this.physics = null
    this._physicsPromise = null
    this._ready = false
    this._disposed = false
    this._last = performance.now()

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      // Explore↔combat freezes this canvas with drawImage/toDataURL; without it the buffer is often blank.
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    // Cast onto an invisible Three floor plane (Pixi still owns the art); bake once per frame
    // before painter-order passes so every character keeps a silhouette.
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = TONE_EXPOSURE
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.autoClear = false
    this.renderer.sortObjects = true

    this.scene = new THREE.Scene()
    this.camera = makeIsoCamera()
    /** True after at least one frame drew with a real SVG viewBox (handoff cover waits on this). */
    this._paintedOnce = false

    // Soft board-matched light: hemi carries most of the look; key casts floor shadows without crushing cloth.
    this.hemi = new THREE.HemisphereLight(0xd0dae8, 0x3a424c, HEMI_INTENSITY)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xfff2e0, SUN_INTENSITY)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.035
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 80
    this._fitShadowCamera(map)
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
    // Fill tracks opposite the Sun slider so one side stays bright as the key orbits.
    this.fill = new THREE.DirectionalLight(0xc8d4e4, FILL_INTENSITY)
    this.scene.add(this.fill)
    this.scene.add(this.fill.target)
    this.rim = new THREE.DirectionalLight(0xb0c4d8, RIM_INTENSITY)
    this.rim.position.set(-2, 5, 8)
    this.scene.add(this.rim)
    this._placeSun(0, 0)

    this.shadowFloor = this._makeShadowFloor(map)
    this.scene.add(this.shadowFloor)

    this.colliders = buildMapColliders(map)
    // Depth-only wall/prop boxes: characters fail the depth test behind solids so Pixi art shows through.
    this.occluderGroup = addOccluderMeshes(this.scene, this.colliders, THREE)
    this.colliderGroup = addColliderMeshes(this.scene, this.colliders, THREE)

    // Same tip-over knobs as Animation Viewer (ragdollSettings.js).
    this.ragdollSettings = cloneRagdollSettings()

    this._viewBox = null
    this._poses = []
  }

  /** Orthographic shadow frustum sized to the map (tile units = world x/z). */
  _fitShadowCamera(map) {
    const span = Math.max(map?.width ?? 32, map?.height ?? 32) * 0.65 + 8
    const cam = this.sun.shadow.camera
    cam.left = -span
    cam.right = span
    cam.top = span
    cam.bottom = -span
    cam.updateProjectionMatrix()
  }

  /** Aim key + opposite fill from boardSunSettings (World Generation Sun slider / colour). */
  _placeSun(tx, tz) {
    const settings = getBoardSunSettings()
    const key = boardSunOffset(settings)
    const fill = boardSunFillOffset(settings)
    const sat = boardSunColourSaturation(settings)
    const shadowStrength = settings.shadowStrength ?? 1
    this.sun.color.set(settings.colour)
    // Saturated keys outrank hemi so red/blue suns read on cloth; pale warm white stays soft.
    this.sun.intensity = SUN_INTENSITY * (1 + sat * 0.55)
    if (this.hemi) {
      this.hemi.intensity = HEMI_INTENSITY * (1 - sat * 0.35)
      this.hemi.color.set(settings.colour).lerp(new THREE.Color(0xd0dae8), 0.55 - sat * 0.25)
    }
    this.sun.target.position.set(tx, 0, tz)
    this.sun.target.updateMatrixWorld()
    this.sun.position.set(tx + key.x, key.y, tz + key.z)
    // Slider 1 = prior full cast; 0 fades the ShadowMaterial floor to nothing.
    this.sun.castShadow = shadowStrength > 0.001
    if (this.shadowFloor?.material) {
      this.shadowFloor.material.opacity = SHADOW_FLOOR_OPACITY * shadowStrength
      this.shadowFloor.visible = shadowStrength > 0.001
    }
    if (this.fill) {
      this.fill.target.position.set(tx, 0, tz)
      this.fill.target.updateMatrixWorld()
      this.fill.position.set(tx + fill.x, fill.y, tz + fill.z)
    }
  }

  /** Invisible receiver — ShadowMaterial draws only where the shadow map hits. */
  _makeShadowFloor(map) {
    const pad = 6
    const w = (map?.width ?? 32) + pad * 2
    const d = (map?.height ?? 32) + pad * 2
    const geo = new THREE.PlaneGeometry(w, d)
    const mat = new THREE.ShadowMaterial({
      opacity: SHADOW_FLOOR_OPACITY,
      transparent: true,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'shadow_floor'
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set((map?.width ?? 32) / 2 - 0.5, 0.01, (map?.height ?? 32) / 2 - 0.5)
    mesh.receiveShadow = true
    mesh.castShadow = false
    mesh.renderOrder = -2
    mesh.frustumCulled = false
    return mesh
  }

  /** Toggle colorWrite on body meshes so a bake pass can refresh the shadow map without painting bodies. */
  _setCasterColorWrite(on) {
    const visit = (root) => {
      root?.traverse?.((obj) => {
        if (!obj.isMesh || obj.name === 'contact_shadow' || obj.name === 'shadow_floor') return
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const mat of mats) {
          if (mat && 'colorWrite' in mat) mat.colorWrite = on
        }
      })
    }
    for (const actor of this.actors.values()) visit(actor.root)
    for (const horse of this.horses.values()) visit(horse.root)
  }

  async init() {
    // Pose animation only until an explosion needs Rapier.
    // No internal rAF — Pixi boardScene/battleScene call frame() after syncing the SVG viewBox
    // so 3D feet stay on the Pixi rings while the camera follows.
    this._ready = true
  }

  /**
   * One paint driven by the Pixi ticker (same viewBox sample as the rings/map).
   * poses: spike pose list; viewBox: { x, y, width, height } from the board SVG.
   * fadedKeys: tile keys / template ids whose Pixi walls are see-through — drop those occluders
   * so the full body shows and wall-fade does the read-through (no character silhouette).
   */
  frame(poses, viewBox, fadedKeys = null) {
    if (this._disposed || !this._ready) return
    this._poses = poses ?? []
    this._viewBox = viewBox
    this._syncFadedOccluders(fadedKeys)
    const now = performance.now()
    const dt = Math.min(0.05, (now - this._last) / 1000)
    this._last = now
    this._paint(dt)
  }

  _syncFadedOccluders(fadedKeys) {
    this._fadedOccluders = fadedKeys instanceof Set ? fadedKeys : null
    // Visibility is applied per actor in _paint (painter-order punch); keep a baseline for empty poses.
    if (!this.occluderGroup) return
    for (const mesh of this.occluderGroup.children) {
      const key = mesh.userData?.fadeKey
      mesh.visible = !key || !this._fadedOccluders?.has(key)
    }
  }

  /** Only solids in front of this actor write depth — stops low walls/crates eating feet in front. */
  _syncOccludersForActor(actor) {
    if (!this.occluderGroup) return
    const paint = actor.paintKey()
    const faded = this._fadedOccluders
    for (const mesh of this.occluderGroup.children) {
      const key = mesh.userData?.fadeKey
      if (key && faded?.has(key)) {
        mesh.visible = false
        continue
      }
      const depth = mesh.userData?.tileDepth
      mesh.visible = depth == null || occluderPunchesActor(depth, paint)
    }
  }

  /** Create the Rapier world + map colliders the first time a blast needs a ragdoll. */
  ensurePhysics() {
    if (this.physics) return Promise.resolve(this.physics)
    if (this._physicsPromise) return this._physicsPromise
    const gravity = this.ragdollSettings?.gravity ?? DEFAULT_RAGDOLL_SETTINGS.gravity
    this._physicsPromise = PhysicsWorld.create({ x: 0, y: gravity, z: 0 })
      .then((world) => {
        if (this._disposed) {
          world.dispose()
          return null
        }
        world.addLevelColliders(this.colliders)
        this.physics = world
        return world
      })
      .catch((err) => {
        console.error('[spike3d] Rapier init failed', err)
        this._physicsPromise = null
        return null
      })
    return this._physicsPromise
  }

  /** Apply Animation Viewer / game ragdoll knobs (gravity + next activate tuning). */
  setRagdollSettings(settings) {
    this.ragdollSettings = cloneRagdollSettings(settings)
    this.physics?.setGravity(this.ragdollSettings.gravity)
  }

  setSize(width, height) {
    if (width < 1 || height < 1) return
    this.renderer.setSize(width, height, false)
  }

  setViewBox(viewBox) {
    this._viewBox = viewBox
  }

  setPoses(poses) {
    this._poses = poses ?? []
  }

  /** Debug: show translucent boxes for solid wall / floor colliders (Z while spike3d is on). */
  setCollidersVisible(on) {
    if (this.colliderGroup) this.colliderGroup.visible = Boolean(on)
  }

  toggleCollidersVisible() {
    const next = !this.colliderGroup?.visible
    this.setCollidersVisible(next)
    return next
  }

  _syncActors() {
    const seen = new Set()
    const seenHorses = new Set()
    const now = performance.now()
    for (const pose of this._poses) {
      if (!pose?.id) continue
      if (pose.kind === 'horse') {
        seenHorses.add(pose.id)
        let horse = this.horses.get(pose.id)
        if (!horse) {
          horse = new HorseActor(pose.id, this, { coat: pose.coat })
          this.horses.set(pose.id, horse)
        }
        horse.setPose(pose)
        continue
      }
      seen.add(pose.id)
      let actor = this.actors.get(pose.id)
      if (!actor) {
        actor = new SpikeActor(pose.id, this, {
          uniform: pose.colour,
          enemy: pose.enemy,
          appearance: pose.appearance,
        })
        this.actors.set(pose.id, actor)
      }
      actor.setPose(pose)
    }
    // Linger before dispose so a one-frame pose gap (beam filter, reconcile order) cannot blink bodies out.
    const LINGER_MS = 400
    for (const [id, actor] of this.actors) {
      if (seen.has(id)) continue
      if (now - (actor._lastSeen ?? 0) < LINGER_MS) continue
      actor.dispose()
      this.actors.delete(id)
    }
    for (const [id, horse] of this.horses) {
      if (seenHorses.has(id)) continue
      if (now - (horse._lastSeen ?? 0) < LINGER_MS) continue
      horse.dispose()
      this.horses.delete(id)
    }
  }

  _anyRagdoll() {
    for (const actor of this.actors.values()) {
      if (actor.ragdollActive) return true
    }
    return false
  }

  _paint(dt) {
    this._syncActors()
    for (const horse of this.horses.values()) horse.update(dt)
    for (const actor of this.actors.values()) actor.update(dt)
    // Seat riders on saddles after both horse and actor have advanced this frame.
    // Prefer clock mountBlend; fall back to animator progress only if the sim did not publish one.
    for (const horse of this.horses.values()) {
      if (!horse._riderId) continue
      const rider = this.actors.get(horse._riderId)
      if (!rider) continue
      let blend = 1
      const live = rider._liveMountBlend?.()
      if (live != null) {
        blend = live
      } else {
        const clip = rider.body?.current
        if (clip === 'mount') blend = rider.body?.progress ?? 0
        else if (clip === 'dismount') blend = 1 - (rider.body?.progress ?? 0)
      }
      horse.attachRider(rider, blend)
    }
    // Step Rapier only while at least one body is tumbling.
    if (this.physics && this._anyRagdoll()) this.physics.step(dt)

    this.renderer.setScissorTest(false)
    this.renderer.clear()
    // Wait for the SVG viewBox — drawing with the default ortho camera places figures wrong for a frame.
    if (!this._viewBox?.width) return
    syncIsoCamera(this.camera, this._viewBox, this.renderer)
    this._paintedOnce = true

    {
      let sx = 0
      let sz = 0
      const n = this._poses.length
      if (n) {
        for (const p of this._poses) {
          sx += p.position?.x ?? 0
          sz += p.position?.y ?? 0
        }
        sx /= n
        sz /= n
      } else {
        sx = (this.map?.width ?? 0) / 2
        sz = (this.map?.height ?? 0) / 2
      }
      this._placeSun(sx, sz)
    }

    // Painter order by tile x+z. Mounted horse+rider share one pass so depth sorts
    // limbs against the barrel (clearDepth between them made every rider mesh win or lose as a slab).
    const ridden = new Set()
    const groups = []
    for (const horse of this.horses.values()) {
      const rider = horse._riderId ? this.actors.get(horse._riderId) : null
      if (rider) {
        ridden.add(rider.id)
        const hp = horse.paintKey()
        const rp = rider.paintKey()
        groups.push({
          id: horse.id,
          paint: Math.max(hp, rp),
          lead: rp >= hp ? rider : horse,
          items: [horse, rider],
        })
      } else {
        groups.push({ id: horse.id, paint: horse.paintKey(), lead: horse, items: [horse] })
      }
    }
    for (const actor of this.actors.values()) {
      if (ridden.has(actor.id)) continue
      groups.push({ id: actor.id, paint: actor.paintKey(), lead: actor, items: [actor] })
    }
    groups.sort((a, b) => {
      const d = a.paint - b.paint
      return d !== 0 ? d : String(a.id).localeCompare(String(b.id))
    })

    // Bake the shadow map with every caster visible, then painter-order color passes reuse it
    // (autoUpdate is false — otherwise each pass would only cast the visible group).
    if (groups.length === 0) {
      this.renderer.shadowMap.needsUpdate = true
      this.renderer.render(this.scene, this.camera)
    } else {
      for (const g of groups) for (const item of g.items) item.setVisible(true)
      this._setCasterColorWrite(false)
      this.renderer.shadowMap.needsUpdate = true
      this.renderer.render(this.scene, this.camera)
      this._setCasterColorWrite(true)
      for (const g of groups) for (const item of g.items) item.setVisible(false)
      for (const g of groups) {
        this.renderer.clearDepth()
        this._syncOccludersForActor(g.lead)
        for (const item of g.items) item.setVisible(true)
        this.renderer.render(this.scene, this.camera)
        for (const item of g.items) item.setVisible(false)
      }
      for (const g of groups) for (const item of g.items) item.setVisible(true)
      // Restore fade-only visibility so debug collider toggle / next frame start clean.
      this._syncFadedOccluders(this._fadedOccluders)
    }
  }

  dispose() {
    this._disposed = true
    for (const actor of this.actors.values()) actor.dispose()
    this.actors.clear()
    for (const horse of this.horses.values()) horse.dispose()
    this.horses.clear()
    this.physics?.dispose()
    this.physics = null
    this._physicsPromise = null
    if (this.shadowFloor) {
      this.scene.remove(this.shadowFloor)
      this.shadowFloor.geometry?.dispose?.()
      this.shadowFloor.material?.dispose?.()
      this.shadowFloor = null
    }
    this.occluderGroup?.userData?.dispose?.()
    if (this.occluderGroup) this.scene.remove(this.occluderGroup)
    this.occluderGroup = null
    this.colliderGroup?.userData?.dispose?.()
    if (this.colliderGroup) this.scene.remove(this.colliderGroup)
    this.colliderGroup = null
    this.renderer.dispose()
  }
}
