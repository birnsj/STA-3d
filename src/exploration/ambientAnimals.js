// Ambient creatures (non-mount): spawn from registry marker kinds, tick via shared roam.js.
// Scatter: profile.scatter + map Disposition. Afraid flees party nearby; Neutral bolts from runners
// (chicken/cat profiles); Friendly / Enemy do not flee.
import { AMBIENT_CREATURES } from '../data/adaptation/exploration/ambientCreatures.js'
import { canAct, getMembers } from './partyControl.js'
import { distance, isClear, planRoute, slide } from './navigation.js'
import {
  catCoatForSpawnIndex,
  chickenCoatForSpawnIndex,
  normalizeCatCoatId,
  normalizeChickenCoatId,
} from '../data/adaptation/exploration/animalCoats.js'
import { getRoamProfile, resolveAuthoredRoam, tickRoam } from './roam.js'
import { normalizeAnimalDisposition } from './dispositions.js'

/** Fallback flee tuning when Disposition is Afraid but the roam profile has no scatter block. */
const AFRAID_SCATTER = Object.freeze({
  scareRadius: 3.5,
  burstSpeed: 5.8,
  fleeDistance: 4,
  settleSeconds: 0.4,
})

function headingFromFacingDegrees(facing) {
  if (!Number.isFinite(facing)) return 0
  return (facing * Math.PI) / 180
}

function animalsFromMap(map) {
  const animals = []
  AMBIENT_CREATURES.forEach((creature) => {
    const spawns = map?.markers?.[creature.markerKind] ?? []
    spawns.forEach((entry, index) => {
      const position = { x: entry.x, y: entry.y }
      const heading =
        entry.heading != null && Number.isFinite(entry.heading)
          ? entry.heading
          : headingFromFacingDegrees(entry.facing ?? 0)
      const roam = resolveAuthoredRoam(entry.roam ?? creature.defaultRoam)
      animals.push({
        id: `${creature.id}-${index + 1}`,
        creatureId: creature.id,
        actor: creature.actor,
        profileId: creature.profileId,
        position,
        heading,
        home: { position: { ...position }, heading },
        roam,
        roamRuntime: null,
        scatter: null,
        moving: false,
        gait: 'idle',
        idlePose: null,
        // Cats / chickens: authored coat, else cycle coat atlases; horses use mount state.
        coat:
          creature.actor === 'cat'
            ? entry.coat
              ? normalizeCatCoatId(entry.coat)
              : catCoatForSpawnIndex(index)
            : creature.actor === 'chicken'
              ? entry.coat
                ? normalizeChickenCoatId(entry.coat)
                : chickenCoatForSpawnIndex(index)
              : null,
        disposition: normalizeAnimalDisposition(entry.disposition ?? 'neutral'),
      })
    })
  })
  return animals
}

export function mapHasAmbientAnimals(map) {
  return AMBIENT_CREATURES.some((creature) => (map?.markers?.[creature.markerKind]?.length ?? 0) > 0)
}

/**
 * @returns {{ animals: object[] } | null}
 */
export function createAmbientState(map) {
  const animals = animalsFromMap(map)
  if (!animals.length) return null
  return { animals }
}

export function getAmbientAnimals(state) {
  return state?.ambient?.animals ?? []
}

/** Running (or near-run pace) party members — Neutral animals with scatter only react to these. */
function runningScareThreats(state) {
  if (!state?.party) return []
  return getMembers(state.party).filter((member) => {
    if (!canAct(member) || !member.position) return false
    if (member.running) return true
    const pace = member.pace ? Math.hypot(member.pace.x, member.pace.y) : 0
    // Mounted or foot burst that isn't flagged running yet still reads as a charge.
    return pace >= 3.2
  })
}

/** Any acting party member (Afraid animals flee approach, not only a charge). */
function nearbyPartyThreats(state) {
  if (!state?.party) return []
  return getMembers(state.party).filter((member) => canAct(member) && member.position)
}

/**
 * Scatter config for this animal from Disposition + roam profile.
 * Afraid → flee (profile scatter or AFRAID_SCATTER). Friendly / Enemy → none.
 * Neutral → profile.scatter only (chickens / cats bolt from runners).
 */
function scatterConfigForAnimal(animal, profile) {
  const disposition = normalizeAnimalDisposition(animal.disposition)
  if (disposition === 'friendly' || disposition === 'enemy') return null
  if (disposition === 'afraid') {
    const base = profile.scatter ?? AFRAID_SCATTER
    // Slightly wider scare when authored Afraid.
    return {
      ...base,
      scareRadius: Math.max(base.scareRadius ?? 2.5, 3.2),
      fleeDistance: Math.max(base.fleeDistance ?? 3, 3.6),
    }
  }
  return profile.scatter ?? null
}

function threatsForAnimal(animal, state) {
  const disposition = normalizeAnimalDisposition(animal.disposition)
  if (disposition === 'afraid') return nearbyPartyThreats(state)
  return runningScareThreats(state)
}

function nearestThreat(animal, threats) {
  let best = null
  let bestDist = Infinity
  for (const threat of threats) {
    const d = distance(animal.position, threat.position)
    if (d < bestDist) {
      bestDist = d
      best = threat
    }
  }
  return best ? { threat: best, dist: bestDist } : null
}

/** Pick a clear flee tile away from the threat, biased outward from home. */
function pickFleeGoal(map, animal, threat, scatter, rng = Math.random) {
  const fleeDistance = scatter.fleeDistance ?? 3
  const home = animal.home?.position ?? animal.position
  const roamRadius = animal.roam?.radius ?? 3
  const maxFromHome = Math.max(roamRadius + 1.5, fleeDistance + 0.5)
  const awayX = animal.position.x - threat.position.x
  const awayY = animal.position.y - threat.position.y
  const len = Math.hypot(awayX, awayY) || 1
  const baseAngle = Math.atan2(awayY, awayX) + (rng() - 0.5) * 0.9
  const candidates = []
  for (let i = 0; i < 10; i++) {
    const angle = baseAngle + (i % 2 === 0 ? 1 : -1) * (i * 0.28)
    const dist = fleeDistance * (0.75 + rng() * 0.45)
    const goal = {
      x: Math.round(animal.position.x + Math.cos(angle) * dist),
      y: Math.round(animal.position.y + Math.sin(angle) * dist),
    }
    if (!isClear(map, goal)) continue
    if (distance(goal, home) > maxFromHome) continue
    if (distance(goal, threat.position) < distance(animal.position, threat.position)) continue
    candidates.push(goal)
  }
  if (candidates.length) return candidates[Math.floor(rng() * candidates.length)]
  // Fallback: step directly away if clear.
  const step = {
    x: animal.position.x + (awayX / len) * Math.min(fleeDistance, 2),
    y: animal.position.y + (awayY / len) * Math.min(fleeDistance, 2),
  }
  return isClear(map, step) ? step : null
}

function stepFlee(map, position, pathState, goal, speed, seconds) {
  let path = pathState?.path ?? []
  const pathGoal = pathState?.pathGoal
  // Keep the path while the goal is stable — replan only when empty or goal moved.
  const replan = !pathGoal || distance(pathGoal, goal) > 0.35 || !path.length
  if (replan) path = planRoute(map, position, goal)
  while (path.length > 1 && distance(position, path[0]) < 0.08) path = path.slice(1)
  const waypoint = path[0]
  if (!waypoint || distance(position, goal) < 0.4) {
    return { position, path: [], pathGoal: null, arrived: true, direction: null, moving: false }
  }
  const d = distance(position, waypoint)
  if (d < 1e-5) {
    return { position, path: path.slice(1), pathGoal: { ...goal }, arrived: false, direction: null, moving: false }
  }
  const step = Math.min(speed * seconds, d)
  const delta = { x: ((waypoint.x - position.x) / d) * step, y: ((waypoint.y - position.y) / d) * step }
  const next = slide(map, position, delta)
  const moved = distance(next, position)
  return {
    position: next,
    path,
    pathGoal: { ...goal },
    arrived: false,
    direction: moved > 1e-4 ? Math.atan2(delta.y, delta.x) : null,
    moving: moved > 1e-4,
  }
}

/** Start or keep one flee run — do not re-roll the goal every frame (that spun facing/anim). */
function shouldRepickFlee(scatter, animal, hit, scareRadius) {
  if (!scatter?.goal) return Boolean(hit && hit.dist <= scareRadius)
  if (!hit || hit.dist > scareRadius * 1.15) return false
  // Still fleeing toward a locked goal.
  if (distance(animal.position, scatter.goal) > 0.45) return false
  // Arrived but still scared — pick a new bolt.
  return true
}

function tickScatter(animal, map, seconds, scatterCfg, threats, rng) {
  let scatter = animal.scatter
  const hit = nearestThreat(animal, threats)
  const scareRadius = scatterCfg.scareRadius ?? 2.5

  if (shouldRepickFlee(scatter, animal, hit, scareRadius)) {
    const goal = pickFleeGoal(map, animal, hit.threat, scatterCfg, rng)
    if (goal) {
      scatter = {
        goal,
        path: [],
        pathGoal: null,
        settle: scatterCfg.settleSeconds ?? 0.35,
        fromId: hit.threat.id,
      }
    }
  }

  if (!scatter?.goal) {
    return { ...animal, scatter: null }
  }

  const burst = scatterCfg.burstSpeed ?? 5
  const step = stepFlee(map, animal.position, scatter, scatter.goal, burst, seconds)
  // Hold last heading when the step didn't move (slide/stuck) so the mesh doesn't twitch.
  const heading = step.direction != null ? step.direction : animal.heading
  if (!step.arrived) {
    return {
      ...animal,
      position: step.position,
      heading,
      moving: step.moving,
      gait: step.moving ? 'run' : 'walk',
      idlePose: null,
      roamRuntime: null,
      scatter: { ...scatter, path: step.path, pathGoal: step.pathGoal, settle: scatterCfg.settleSeconds ?? 0.35 },
    }
  }

  // Still in scare range after arriving: bolt again next frame via shouldRepickFlee.
  if (hit && hit.dist <= scareRadius) {
    return {
      ...animal,
      position: step.position,
      heading,
      moving: false,
      gait: 'idle',
      idlePose: null,
      roamRuntime: null,
      scatter: { ...scatter, goal: scatter.goal, settle: scatter.settle, path: [], pathGoal: null },
    }
  }

  const settle = (scatter.settle ?? 0) - seconds
  if (settle > 0) {
    return {
      ...animal,
      position: step.position,
      heading,
      moving: false,
      gait: 'idle',
      idlePose: null,
      roamRuntime: null,
      scatter: { ...scatter, goal: null, settle, path: [], pathGoal: null },
    }
  }

  return {
    ...animal,
    position: step.position,
    heading,
    moving: false,
    gait: 'idle',
    idlePose: null,
    roamRuntime: null,
    scatter: null,
  }
}

/** Presentation fields Spike3d / Pixi read — ignore roamRuntime timer churn for React dirtying. */
const POS_EPS = 1e-4
const HEADING_EPS = 0.002

function presentationChanged(prev, next) {
  if (prev.gait !== next.gait || prev.moving !== next.moving || prev.idlePose !== next.idlePose) return true
  if (Math.abs((prev.heading ?? 0) - (next.heading ?? 0)) > HEADING_EPS) return true
  if (Math.abs((prev.position?.x ?? 0) - (next.position?.x ?? 0)) > POS_EPS) return true
  if (Math.abs((prev.position?.y ?? 0) - (next.position?.y ?? 0)) > POS_EPS) return true
  const prevScatter = Boolean(prev.scatter?.goal)
  const nextScatter = Boolean(next.scatter?.goal)
  return prevScatter !== nextScatter
}

/**
 * Advance ambient creatures one frame. Frozen when combat is active (caller should skip).
 * Only replaces ambient state when a creature's on-board presentation changes — roam timer
 * ticks mutate roamRuntime in place so idle animals do not force ExplorationScreen commits.
 */
export function tickAmbientAnimals(state, map, seconds, rng = Math.random) {
  const ambient = state?.ambient
  if (!ambient?.animals?.length || !map) return state
  let changed = false
  const animals = ambient.animals.map((animal) => {
    const profile = getRoamProfile(animal.profileId)
    const scatterCfg = scatterConfigForAnimal(animal, profile)
    const threats = scatterCfg ? threatsForAnimal(animal, state) : []
    if (scatterCfg && (threats.length || animal.scatter)) {
      const next = tickScatter(animal, map, seconds, scatterCfg, threats, rng)
      if (next.scatter || animal.scatter) {
        if (presentationChanged(animal, next)) {
          changed = true
          return next
        }
        // Still fleeing/settling but pose unchanged this frame — keep sim fields without a new React identity.
        animal.scatter = next.scatter
        animal.roamRuntime = next.roamRuntime
        return animal
      }
      // Fall through to normal roam when not scattering.
      if (next !== animal) {
        if (presentationChanged(animal, next)) {
          animal = next
          changed = true
        } else {
          animal.scatter = next.scatter
          animal.roamRuntime = next.roamRuntime
        }
      }
    }

    const result = tickRoam({
      home: animal.home,
      map,
      profileId: animal.profileId,
      roam: animal.roam,
      runtime: animal.roamRuntime,
      position: animal.position,
      heading: animal.heading,
      seconds,
      rng,
    })
    const next = {
      ...animal,
      position: result.position,
      heading: result.heading,
      moving: result.moving,
      gait: result.gait,
      idlePose: result.idlePose,
      roamRuntime: result.roamRuntime,
      scatter: null,
    }
    if (presentationChanged(animal, next)) {
      changed = true
      return next
    }
    // Idle / tiny sub-epsilon drift: keep the same object identity for React; advance runtime in place.
    animal.roamRuntime = result.roamRuntime
    animal.scatter = null
    return animal
  })
  return changed ? { ...state, ambient: { ...ambient, animals } } : state
}
