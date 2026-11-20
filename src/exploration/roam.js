// Shared authored roam for NPCs, unmounted horses, and ambient creatures.
// Modes: idle | radiusWander | waypointPatrol. Species pacing from roamProfiles.json.
import roamData from '../data/adaptation/exploration/roamProfiles.json'
import awareness from '../data/adaptation/exploration/awareness.json'
import { tickWaypointAnim } from '../maps/waypointAnimRuntime.js'
import { distance, isClear, planRoute, slide, tileOf } from './navigation.js'

export const ROAM_MODES = Object.freeze(['idle', 'radiusWander', 'waypointPatrol'])

const MOVE = awareness.movement
const WAYPOINT_REACHED = 0.06
const STUCK_SECONDS = 1.5
const DEFAULT_ARRIVE = MOVE.arriveDistance ?? 0.35

const PROFILES = roamData.profiles ?? {}

export function getRoamProfile(profileId) {
  return PROFILES[profileId] ?? PROFILES.human
}

/** Authored speed multiplier (1 = profile default). */
export function roamSpeedMultiplier(authoredSpeed) {
  if (authoredSpeed == null || !Number.isFinite(authoredSpeed)) return 1
  return Math.max(0.1, Math.min(3, Number(authoredSpeed)))
}

export function walkSpeedFor(profileId, authoredSpeed) {
  const profile = getRoamProfile(profileId)
  return (profile.walkSpeed ?? MOVE.patrolSpeed) * roamSpeedMultiplier(authoredSpeed)
}

function randomInRange(min, max, rng = Math.random) {
  const lo = Number.isFinite(min) ? min : 1
  const hi = Number.isFinite(max) ? max : lo
  if (hi <= lo) return lo
  return lo + (hi - lo) * rng()
}

function pickIdlePose(profile, rng = Math.random) {
  const poses = profile?.idlePoses
  if (!poses?.length) return null
  return poses[Math.floor(rng() * poses.length)] ?? null
}

/**
 * Resolve authored roam + legacy NPC patrol into a normalised roam object.
 * @param {{ mode?: string, radius?: number, speed?: number, waypoints?: unknown[] }|null|undefined} roam
 * @param {{ patrol?: unknown[]|null }} [legacy]
 */
export function resolveAuthoredRoam(roam, legacy = {}) {
  const patrol = legacy.patrol?.length ? legacy.patrol : roam?.waypoints?.length ? roam.waypoints : null
  let mode = roam?.mode
  if (!ROAM_MODES.includes(mode)) {
    mode = patrol ? 'waypointPatrol' : 'idle'
  }
  const out = { mode }
  if (mode === 'radiusWander') {
    const radius = Number.isFinite(roam?.radius) ? Math.max(0.5, Number(roam.radius)) : 3
    out.radius = radius
  }
  if (roam?.speed != null && Number.isFinite(roam.speed) && roam.speed !== 1) {
    out.speed = roamSpeedMultiplier(roam.speed)
  }
  if (mode === 'waypointPatrol' && patrol) out.waypoints = patrol
  return out
}

/** Runtime patrol shape used by NPCController / waypoint mode (facing in radians). */
export function waypointsToPatrolRuntime(waypoints) {
  if (!waypoints?.length) return null
  const points = waypoints
    .map((point) => {
      const at = point.at ?? point.position
      const position = Array.isArray(at)
        ? { x: at[0], y: at[1] }
        : at && Number.isFinite(at.x)
          ? { x: at.x, y: at.y }
          : null
      if (!position) return null
      const facingDeg = point.facing
      return {
        position,
        wait: Number.isFinite(point.wait) ? Math.max(0, point.wait) : 0,
        facing: facingDeg != null && Number.isFinite(facingDeg) ? (facingDeg * Math.PI) / 180 : null,
        animation: typeof point.animation === 'string' && point.animation ? point.animation : null,
        animationDuration: Number.isFinite(point.animationDuration) ? point.animationDuration : null,
        animationLoop: point.animationLoop === true,
      }
    })
    .filter(Boolean)
  if (!points.length) return null
  return { points, index: 0, waitLeft: null }
}

function walkToward(map, position, pathState, goal, speed, seconds, arriveDistance) {
  let path = pathState.path ?? []
  const pathGoal = pathState.pathGoal
  const replan = !pathGoal || distance(pathGoal, goal) > 0.5 || !path.length
  if (replan) path = planRoute(map, position, goal)
  while (path.length > 1 && distance(position, path[0]) < WAYPOINT_REACHED) path = path.slice(1)
  const remaining = path.reduce((sum, point, i) => sum + distance(i ? path[i - 1] : position, point), 0)
  const best = replan ? Infinity : pathState.stuck?.best ?? Infinity
  const stuck = remaining < best - 0.05 ? { best: remaining, seconds: 0 } : { best, seconds: (pathState.stuck?.seconds ?? 0) + seconds }
  const waypoint = path[0]
  if (
    !waypoint ||
    remaining < arriveDistance ||
    (path.length === 1 && distance(position, waypoint) < WAYPOINT_REACHED) ||
    stuck.seconds > STUCK_SECONDS
  ) {
    return {
      position,
      path: [],
      pathGoal: null,
      stuck: { best: Infinity, seconds: 0 },
      arrived: true,
      direction: null,
      moving: false,
    }
  }
  const d = distance(position, waypoint)
  const step = Math.min(speed * seconds, d)
  const delta = { x: ((waypoint.x - position.x) / d) * step, y: ((waypoint.y - position.y) / d) * step }
  const next = slide(map, position, delta)
  return {
    position: next,
    path,
    pathGoal: { ...goal },
    stuck,
    arrived: false,
    direction: Math.atan2(delta.y, delta.x),
    moving: distance(next, position) > 1e-5,
  }
}

function tilesInRadius(home, radius) {
  const r = Math.ceil(radius)
  const tiles = []
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue
      tiles.push({ x: Math.round(home.x) + dx, y: Math.round(home.y) + dy })
    }
  }
  return tiles
}

function pickWanderGoal(map, home, radius, profile, lastGoal, rng = Math.random) {
  const minDist = profile.goalMinDist ?? 1
  const preferFar = profile.preferFar !== false
  const candidates = tilesInRadius(home, radius)
    .map((tile) => ({ x: tile.x, y: tile.y }))
    .filter((tile) => {
      if (!isClear(map, tile)) return false
      if (distance(tile, home) < minDist * 0.5) return false
      if (lastGoal && distance(tile, lastGoal) < 0.4) return false
      return true
    })
  if (!candidates.length) return null
  if (preferFar) {
    candidates.sort((a, b) => distance(b, home) - distance(a, home))
    const top = candidates.slice(0, Math.max(3, Math.ceil(candidates.length * 0.4)))
    return top[Math.floor(rng() * top.length)] ?? top[0]
  }
  // Chickens: prefer nearer jittery hops.
  candidates.sort((a, b) => distance(a, home) - distance(b, home))
  const near = candidates.slice(0, Math.max(4, Math.ceil(candidates.length * 0.5)))
  return near[Math.floor(rng() * near.length)] ?? near[0]
}

function tickIdle({ home, position }) {
  const atHome = distance(position, home.position) <= DEFAULT_ARRIVE
  if (atHome) {
    return {
      position: { ...home.position },
      heading: home.heading,
      moving: false,
      gait: 'idle',
      idlePose: null,
      waypointAnim: null,
      roamRuntime: { mode: 'idle' },
    }
  }
  // Drifted: walk home at a gentle pace.
  return null
}

/**
 * Advance one roam frame.
 * @param {{
 *   home: { position: {x,y}, heading: number },
 *   map: object,
 *   profileId: string,
 *   roam: ReturnType<typeof resolveAuthoredRoam>,
 *   runtime?: object,
 *   position: {x,y},
 *   heading: number,
 *   seconds: number,
 *   rng?: () => number,
 * }} args
 */
export function tickRoam({
  home,
  map,
  profileId,
  roam,
  runtime = null,
  position,
  heading,
  seconds,
  rng = Math.random,
}) {
  const profile = getRoamProfile(profileId)
  const arrive = DEFAULT_ARRIVE
  const speed = walkSpeedFor(profileId, roam?.speed)
  const mode = roam?.mode ?? 'idle'

  if (mode === 'idle') {
    const idle = tickIdle({ home, position, heading, seconds })
    if (idle) return idle
    const step = walkToward(map, position, runtime ?? {}, home.position, speed, seconds, arrive)
    return {
      position: step.position,
      heading: step.direction ?? heading,
      moving: step.moving,
      gait: step.moving ? 'walk' : 'idle',
      idlePose: null,
      waypointAnim: null,
      roamRuntime: { mode: 'idle', path: step.path, pathGoal: step.pathGoal, stuck: step.stuck },
    }
  }

  if (mode === 'waypointPatrol') {
    return tickWaypointRoam({
      map,
      position,
      heading,
      roam,
      runtime,
      speed,
      seconds,
      arrive,
    })
  }

  // radiusWander
  return tickRadiusWander({
    home,
    map,
    position,
    heading,
    roam,
    runtime,
    profile,
    speed,
    seconds,
    arrive,
    rng,
  })
}

function tickWaypointRoam({ map, position, heading, roam, runtime, speed, seconds, arrive }) {
  let patrol = runtime?.patrol
  if (!patrol && roam?.waypoints?.length) {
    patrol = waypointsToPatrolRuntime(roam.waypoints)
  }
  if (!patrol?.points?.length) {
    return {
      position,
      heading,
      moving: false,
      gait: 'idle',
      idlePose: null,
      waypointAnim: null,
      roamRuntime: { mode: 'waypointPatrol', patrol: null },
    }
  }

  const point = patrol.points[patrol.index]
  let look = null
  let waypointAnim = runtime?.waypointAnim ?? null
  let nextPatrol = patrol
  let goal = null

  if (distance(position, point.position) > arrive) {
    goal = point.position
  } else {
    const starting = patrol.waitLeft == null
    const waitLeft = (starting ? point.wait : patrol.waitLeft) - seconds
    if (point.facing !== null) look = point.facing
    waypointAnim = waitLeft > 0 ? tickWaypointAnim(waypointAnim, point, starting, seconds) : null
    nextPatrol =
      waitLeft > 0
        ? { ...patrol, waitLeft }
        : { ...patrol, index: (patrol.index + 1) % patrol.points.length, waitLeft: null }
  }

  if (goal) {
    const step = walkToward(map, position, runtime ?? {}, goal, speed, seconds, arrive)
    return {
      position: step.position,
      heading: step.direction ?? heading,
      moving: step.moving,
      gait: step.moving ? 'walk' : 'idle',
      idlePose: null,
      waypointAnim: null,
      roamRuntime: {
        mode: 'waypointPatrol',
        patrol: nextPatrol,
        path: step.path,
        pathGoal: step.pathGoal,
        stuck: step.stuck,
        waypointAnim: null,
      },
    }
  }

  return {
    position,
    heading: look ?? heading,
    moving: false,
    gait: 'idle',
    idlePose: waypointAnim?.name ?? null,
    waypointAnim,
    roamRuntime: {
      mode: 'waypointPatrol',
      patrol: nextPatrol,
      path: [],
      pathGoal: null,
      stuck: { best: Infinity, seconds: 0 },
      waypointAnim,
    },
  }
}

function tickRadiusWander({ home, map, position, heading, roam, runtime, profile, speed, seconds, arrive, rng }) {
  const radius = roam.radius ?? 3
  let state = runtime?.mode === 'radiusWander' ? { ...runtime } : { mode: 'radiusWander', goal: null, waitLeft: null, lastGoal: null, idlePose: null }

  // Waiting at a stop.
  if (state.waitLeft != null && state.waitLeft > 0 && !state.goal) {
    const waitLeft = state.waitLeft - seconds
    if (waitLeft > 0) {
      return {
        position,
        heading,
        moving: false,
        gait: 'idle',
        idlePose: state.idlePose,
        waypointAnim: null,
        roamRuntime: { ...state, waitLeft },
      }
    }
    state = { ...state, waitLeft: null, idlePose: null, goal: null }
  }

  // Need a goal.
  if (!state.goal) {
    const goal = pickWanderGoal(map, home.position, radius, profile, state.lastGoal, rng)
    if (!goal) {
      // Nowhere to go: brief wait then retry.
      return {
        position,
        heading,
        moving: false,
        gait: 'idle',
        idlePose: pickIdlePose(profile, rng),
        waypointAnim: null,
        roamRuntime: {
          ...state,
          waitLeft: randomInRange(0.3, 0.8, rng),
          idlePose: pickIdlePose(profile, rng),
        },
      }
    }
    state = { ...state, goal, path: [], pathGoal: null, stuck: { best: Infinity, seconds: 0 } }
  }

  const step = walkToward(map, position, state, state.goal, speed, seconds, arrive)
  if (!step.arrived) {
    return {
      position: step.position,
      heading: step.direction ?? heading,
      moving: step.moving,
      gait: step.moving ? 'walk' : 'idle',
      idlePose: null,
      waypointAnim: null,
      roamRuntime: {
        ...state,
        path: step.path,
        pathGoal: step.pathGoal,
        stuck: step.stuck,
        waitLeft: null,
      },
    }
  }

  // Arrived: start a species wait with optional idle pose.
  const wait = randomInRange(profile.waitMin, profile.waitMax, rng)
  const idlePose = pickIdlePose(profile, rng)
  const here = tileOf(position)
  return {
    position,
    heading: step.direction ?? heading,
    moving: false,
    gait: 'idle',
    idlePose,
    waypointAnim: null,
    roamRuntime: {
      mode: 'radiusWander',
      goal: null,
      lastGoal: { x: here.x, y: here.y },
      waitLeft: wait,
      idlePose,
      path: [],
      pathGoal: null,
      stuck: { best: Infinity, seconds: 0 },
    },
  }
}

/** Parse authored roam from disk (NPC or spawn marker). */
export function parseRoam(raw) {
  if (!raw || typeof raw !== 'object') return null
  const mode = ROAM_MODES.includes(raw.mode) ? raw.mode : null
  if (!mode) return null
  const roam = { mode }
  if (Number.isFinite(raw.radius)) roam.radius = Math.max(0.5, Number(raw.radius))
  if (Number.isFinite(raw.speed) && Number(raw.speed) !== 1) roam.speed = roamSpeedMultiplier(raw.speed)
  return roam
}

/** Serialize roam for disk; omit idle-only with no extras (horses default idle). */
export function serializeRoam(roam, { omitIdle = false } = {}) {
  if (!roam || !ROAM_MODES.includes(roam.mode)) return null
  if (omitIdle && roam.mode === 'idle' && roam.speed == null) return null
  const record = { mode: roam.mode }
  if (roam.mode === 'radiusWander') {
    record.radius = Number.isFinite(roam.radius) ? roam.radius : 3
  }
  if (Number.isFinite(roam.speed) && roam.speed !== 1) record.speed = roam.speed
  return record
}

export function defaultRoamForCreature(entry) {
  return resolveAuthoredRoam(entry?.defaultRoam ?? { mode: 'idle' })
}
