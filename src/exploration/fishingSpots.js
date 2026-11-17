// Fishing Spot hotspots: authored map.fishingSpots + session state (cast → splash → catch / deplete → respawn).
import fishingData from '../data/adaptation/exploration/fishing.json'
import { blocksMovement } from '../combat/battleMap.js'
import { getItemById } from '../rules/equipment.js'
import { getInstance, grantItemToMember } from '../rules/inventory.js'
import { savableMomentum, saveMomentum } from '../rules/missionResources.js'
import { deriveSeed, seededRandomInt } from '../rules/seededRandom.js'
import { prepareTask } from '../rules/taskPreparation.js'
import { resolveStaTask, rollDice, TASK_DICE } from '../rules/taskResolver.js'
import { augmentTaskContext, augmentTaskSpec } from '../ships/serviceEffects.js'

export { grantItemToMember } from '../rules/inventory.js'
import { canAct, getMembers } from './partyControl.js'
import { TASK_SEED_OFFSET } from './challengeObjects.js'
import {
  authoredFishingSpotFields,
  clampDifficulty,
  clampRespawnSeconds,
  clampSize,
  DEFAULT_FISH_IDS,
} from './fishingAuthored.js'
import { isFishingWaterAt, shoreApproachTile } from './fishingWater.js'
import { addLogEntry } from './missionLog.js'

export {
  clampDifficulty,
  clampRespawnSeconds,
  clampSize,
  DEFAULT_FISH_IDS,
  normalizeCatchPool,
} from './fishingAuthored.js'

export const FISHING_TASK = fishingData.task

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function shoreTile(map, spotPos, from = null) {
  return shoreApproachTile(map, spotPos, from, {
    isWalkable: (cell) => !isFishingWaterAt(map, cell) && !blocksMovement(map, cell),
  })
}

/** Shore tile to cast from (or walk to). Null when the spot has no adjacent dry walkable tile. */
export function fishingShoreTile(state, spotId, from = null) {
  const spot = fishingSpotById(state, spotId)
  if (!spot) return null
  const map = state.party?.map ?? state.map
  return shoreTile(map, spot.position, from)
}

export const FISHING_ROD_ID = 'fishingRod'

export const FISHING_PHASE = Object.freeze({
  idle: 'idle',
  approaching: 'approaching',
  waiting: 'waiting',
  splash: 'splash',
  depleted: 'depleted',
})

export function authoredFishingSpot(raw, position) {
  return {
    id: String(raw.id),
    position: { x: position.x, y: position.y },
    home: { x: position.x, y: position.y },
    ...authoredFishingSpotFields(raw),
  }
}

// How far (tiles, each way) a ripple may drift from its authored home, so it stays in the water the designer placed it in.
export const RESPAWN_SEARCH_RADIUS = 6

/**
 * Where a depleted ripple comes back. Searches the water connected to the spot's home within RESPAWN_SEARCH_RADIUS
 * (4-way, so a separate pond is never reached), keeps tiles that have a shore to cast from and no other ripple on them,
 * drops the tile it just left, and picks one with rng. With no such tile it falls back to the home tile if that is still
 * water, else to where it already is.
 * @param {Array<{x:number,y:number}>} [taken] tiles held by the other spots
 */
export function pickRespawnTile(spot, map, rng = Math.random, taken = []) {
  const home = spot.home ?? spot.position
  const fallback = isFishingWaterAt(map, home) ? { ...home } : { ...spot.position }
  if (!isFishingWaterAt(map, home)) return fallback

  const key = (cell) => `${cell.x},${cell.y}`
  const blocked = new Set(taken.map(key))
  blocked.add(key(spot.position))
  const seen = new Set([key(home)])
  const queue = [home]
  const options = []
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head]
    if (!blocked.has(key(cell)) && shoreTile(map, cell)) options.push({ x: cell.x, y: cell.y })
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: cell.x + dx, y: cell.y + dy }
      if (Math.max(Math.abs(next.x - home.x), Math.abs(next.y - home.y)) > RESPAWN_SEARCH_RADIUS) continue
      if (seen.has(key(next)) || !isFishingWaterAt(map, next)) continue
      seen.add(key(next))
      queue.push(next)
    }
  }
  if (!options.length) return fallback
  return options[Math.min(options.length - 1, Math.floor(rng() * options.length))]
}

export function createFishingState(map) {
  const spots = {}
  for (const raw of map.fishingSpots ?? []) {
    if (!raw?.id || raw.position == null) continue
    const authored = authoredFishingSpot(raw, raw.position)
    spots[authored.id] = {
      ...authored,
      phase: FISHING_PHASE.idle,
      visible: true,
      respawnAt: null,
      waitRemaining: 0,
      splashRemaining: 0,
      session: null,
      pendingFishId: null,
    }
  }
  return { spots }
}

export function fishingSpotViews(state) {
  return Object.values(state.fishing?.spots ?? {})
    .filter((spot) => spot.visible && spot.phase !== FISHING_PHASE.depleted)
    .map((spot) => ({
      id: spot.id,
      position: spot.position,
      size: spot.size,
      phase: spot.phase,
      fishable: spot.fishable,
      splash: spot.phase === FISHING_PHASE.splash,
      // Larger Catch button when the roll succeeded or the angler is skilled (presentation only).
      catchEase: spot.phase === FISHING_PHASE.splash ? (spot.catchEase ?? 1) : 1,
    }))
}

export function fishingSpotById(state, spotId) {
  return state.fishing?.spots?.[spotId] ?? null
}

function memberOwnsItemId(state, memberId, itemId) {
  const member = state.party?.members?.[memberId]
  const inventory = member?.character?.inventory
  if (!inventory) return false
  const ids = [...Object.values(inventory.slots ?? {}), ...(inventory.bag ?? [])].filter(Boolean)
  return ids.some((instanceId) => getInstance(state, instanceId)?.itemId === itemId)
}

export function hasFishingRod(state, memberId) {
  return memberOwnsItemId(state, memberId, FISHING_ROD_ID)
}

export function membersWithRod(state) {
  return getMembers(state.party).filter((member) => canAct(member) && hasFishingRod(state, member.id))
}

/** Wait seconds before splash; higher difficulty waits longer. */
export function waitSecondsFor(spot) {
  const d = clampDifficulty(spot?.difficulty)
  return 2.5 + d * 0.9
}

/** Fitness + Security. Missing stats use the reference skill so incomplete test characters keep the base window. */
export function fishingSkill(character) {
  const fitness = character?.attributes?.fitness
  const security = character?.disciplines?.security
  if (!Number.isFinite(fitness) || !Number.isFinite(security)) return fishingData.referenceSkill
  return fitness + security
}

/**
 * Catch window seconds. Higher spot difficulty / smaller size shortens it; Fitness + Security lengthens it
 * (passive, around referenceSkill). character null = authored base only.
 */
export function splashSecondsFor(spot, character = null) {
  const d = clampDifficulty(spot?.difficulty)
  const size = clampSize(spot?.size)
  const base = Math.max(0.85, (3.0 - d * 0.35) * (0.8 + size * 0.3))
  if (!character) return base
  const { perPoint, minFactor, maxFactor } = fishingData.window
  const factor = clamp(1 + perPoint * (fishingSkill(character) - fishingData.referenceSkill), minFactor, maxFactor)
  return Math.max(0.85, base * factor)
}

/** How much larger than default the Catch button should be (1 = normal). */
export function catchEaseFor(spot, character, rollSuccess = false) {
  const size = clampSize(spot?.size)
  const skill = fishingSkill(character)
  const skillBoost = clamp((skill - fishingData.referenceSkill) * 0.06, -0.15, 0.45)
  return clamp(0.95 + (size - 1) * 0.25 + skillBoost + (rollSuccess ? 0.35 : 0), 0.9, 1.8)
}

/**
 * Splash-start task: Fitness + Security at the spot's Difficulty. Success lengthens the window further and may
 * save Momentum. Always 2d20 (no bought dice) — the roll is timed, not a panel purchase.
 */
export function rollFishingSplash(state, member, spot) {
  const character = member?.character
  const baseSplash = splashSecondsFor(spot, character)
  const ease = catchEaseFor(spot, character, false)
  // Incomplete characters (no Fitness / Security yet) keep the passive window and skip the roll.
  const fitness = character?.attributes?.fitness
  const security = character?.disciplines?.security
  if (!character || !Number.isFinite(fitness) || !Number.isFinite(security)) {
    return { state, splashSeconds: baseSplash, catchEase: ease, lastFishing: null }
  }

  const prepared = prepareTask(
    character,
    augmentTaskSpec({ ...FISHING_TASK, difficulty: clampDifficulty(spot.difficulty) }),
    augmentTaskContext({ traits: state.scenario?.traits, side: 'player', condition: member.condition }),
  )
  if (!prepared.possible) {
    return { state, splashSeconds: baseSplash, catchEase: ease, lastFishing: null }
  }

  const key = state.scenario?.taskCount ?? 0
  const random = seededRandomInt(deriveSeed(state.seed ?? 0, TASK_SEED_OFFSET + key))
  const result = resolveStaTask({
    leader: { task: prepared.task, dice: rollDice(random, TASK_DICE) },
    difficulty: prepared.difficulty,
    ignoreComplications: prepared.ignoreComplications,
    bonusMomentum: prepared.bonusMomentum,
  })
  const resources = state.resources ?? { momentum: 0, threat: 0 }
  const saved = result.success ? saveMomentum(resources, savableMomentum(result)) : { resources, saved: 0 }
  let splashSeconds = baseSplash
  if (result.success) {
    const { windowFactor, extraSeconds } = fishingData.rollSuccess
    splashSeconds = Math.max(baseSplash, baseSplash * windowFactor + extraSeconds)
  }
  const catchEase = catchEaseFor(spot, character, result.success)
  const lastFishing = {
    key,
    memberId: member.id,
    spotId: spot.id,
    success: result.success,
    successes: result.successes,
    difficulty: prepared.difficulty,
    splashSeconds,
    momentumSaved: saved.saved,
  }
  let next = {
    ...state,
    resources: saved.resources,
    scenario: state.scenario ? { ...state.scenario, taskCount: key + 1 } : state.scenario,
    lastFishing,
  }
  const name = character.name ?? 'Angler'
  next = addLogEntry(next, {
    kind: 'task',
    text: `${name}: Fishing (Fitness + Security vs ${prepared.difficulty}): ${result.success ? 'succeeded' : 'failed'}.`,
    story: { event: result.success ? 'taskSuccess' : 'taskFailure', performer: name, label: 'Fishing' },
  })
  return { state: next, splashSeconds, catchEase, lastFishing }
}

function beginSplash(state, spot) {
  const memberId = spot.session?.memberId
  const member = memberId ? state.party?.members?.[memberId] : null
  const rolled = rollFishingSplash(state, member, spot)
  let next = withSpot(rolled.state, spot.id, {
    phase: FISHING_PHASE.splash,
    waitRemaining: 0,
    splashRemaining: rolled.splashSeconds,
    pendingFishId: pickFishId(spot),
    catchEase: rolled.catchEase,
    catchRollSuccess: Boolean(rolled.lastFishing?.success),
  })
  if (memberId) next = setMemberFishing(next, memberId, { spotId: spot.id, phase: 'splash' })
  return next
}

function withSpot(state, spotId, patch) {
  const prev = state.fishing?.spots?.[spotId]
  if (!prev) return state
  return {
    ...state,
    fishing: {
      ...state.fishing,
      spots: {
        ...state.fishing.spots,
        [spotId]: { ...prev, ...patch },
      },
    },
  }
}

function clearMemberFishing(state, memberId) {
  const member = state.party?.members?.[memberId]
  if (!member?.fishing) return state
  const { fishing: _drop, ...rest } = member
  return {
    ...state,
    party: {
      ...state.party,
      members: { ...state.party.members, [memberId]: rest },
    },
  }
}

function setMemberFishing(state, memberId, fishing) {
  const member = state.party?.members?.[memberId]
  if (!member) return state
  return {
    ...state,
    party: {
      ...state.party,
      members: {
        ...state.party.members,
        [memberId]: { ...member, fishing },
      },
    },
  }
}

function pickFishId(spot, rng = Math.random) {
  const pool = (spot.catchPool?.length ? spot.catchPool : DEFAULT_FISH_IDS).filter((id) => getItemById(id))
  const list = pool.length ? pool : DEFAULT_FISH_IDS.filter((id) => getItemById(id))
  if (!list.length) return null
  const index = Math.min(list.length - 1, Math.floor(rng() * list.length))
  return list[index]
}

function depleteSpot(state, spotId, { caught = false } = {}) {
  const spot = fishingSpotById(state, spotId)
  if (!spot) return state
  let next = state
  const memberId = spot.session?.memberId
  if (memberId) next = clearMemberFishing(next, memberId)
  const now = next.world?.time ?? 0
  // The ripple moves when it comes back (tickFishing), not here: it is hidden until then.
  return withSpot(next, spotId, {
    phase: FISHING_PHASE.depleted,
    visible: false,
    respawnAt: now + clampRespawnSeconds(spot.respawnSeconds),
    waitRemaining: 0,
    splashRemaining: 0,
    session: null,
    pendingFishId: null,
    lastCaught: caught,
  })
}

export function canStartFishing(state, spotId, memberId) {
  const spot = fishingSpotById(state, spotId)
  if (!spot) return { ok: false, reason: 'Unknown fishing spot.' }
  if (!spot.fishable) return { ok: false, reason: 'This spot is not fishable.' }
  if (!spot.visible || spot.phase === FISHING_PHASE.depleted) return { ok: false, reason: 'The ripple is gone.' }
  if (spot.phase !== FISHING_PHASE.idle && spot.session?.memberId !== memberId) {
    return { ok: false, reason: 'Someone is already fishing here.' }
  }
  const member = state.party?.members?.[memberId]
  if (!canAct(member)) return { ok: false, reason: 'That character cannot act.' }
  if (!hasFishingRod(state, memberId)) return { ok: false, reason: 'Needs a fishing rod.' }
  const approach = shoreTile(state.party.map, spot.position, member.position)
  if (!approach) return { ok: false, reason: 'No shore tile to cast from.' }
  return { ok: true, approach }
}

export function startFishing(state, { spotId, memberId }) {
  const check = canStartFishing(state, spotId, memberId)
  if (!check.ok) return state
  const spot = fishingSpotById(state, spotId)
  const member = state.party.members[memberId]
  const atShore =
    Math.round(member.position.x) === check.approach.x && Math.round(member.position.y) === check.approach.y
  let next = withSpot(state, spotId, {
    phase: atShore ? FISHING_PHASE.waiting : FISHING_PHASE.approaching,
    waitRemaining: atShore ? waitSecondsFor(spot) : 0,
    splashRemaining: 0,
    pendingFishId: null,
    session: { memberId, approach: check.approach },
  })
  next = setMemberFishing(next, memberId, { spotId, phase: atShore ? 'waiting' : 'approaching' })
  if (!atShore) {
    // Caller / reducer also dispatches moveTo; we record the approach target here.
    next = {
      ...next,
      fishing: {
        ...next.fishing,
        spots: {
          ...next.fishing.spots,
          [spotId]: {
            ...next.fishing.spots[spotId],
            session: { ...next.fishing.spots[spotId].session, moving: true },
          },
        },
      },
    }
  }
  return next
}

/** When the angler arrives on the shore tile, begin the wait. */
export function syncFishingApproach(state) {
  let next = state
  for (const spot of Object.values(state.fishing?.spots ?? {})) {
    if (spot.phase !== FISHING_PHASE.approaching || !spot.session?.memberId) continue
    const member = next.party.members[spot.session.memberId]
    if (!member || !canAct(member)) {
      next = depleteSpot(clearMemberFishing(next, spot.session.memberId), spot.id)
      continue
    }
    const approach = spot.session.approach
    if (Math.round(member.position.x) === approach.x && Math.round(member.position.y) === approach.y && !member.moving) {
      next = withSpot(next, spot.id, {
        phase: FISHING_PHASE.waiting,
        waitRemaining: waitSecondsFor(spot),
        session: { ...spot.session, moving: false },
      })
      next = setMemberFishing(next, member.id, { spotId: spot.id, phase: 'waiting' })
    }
  }
  return next
}

export function tickFishing(state, dt, rng = Math.random) {
  if (!state.fishing?.spots || !(dt > 0)) return state
  let next = syncFishingApproach(state)
  const now = next.world?.time ?? 0
  for (const spot of Object.values(next.fishing.spots)) {
    if (spot.phase === FISHING_PHASE.depleted) {
      if (spot.respawnAt != null && now >= spot.respawnAt) {
        const map = next.party?.map ?? next.map
        const taken = Object.values(next.fishing.spots)
          .filter((other) => other.id !== spot.id)
          .map((other) => other.position)
        const position = pickRespawnTile(spot, map, rng, taken)
        next = withSpot(next, spot.id, {
          phase: FISHING_PHASE.idle,
          visible: true,
          position,
          respawnAt: null,
          waitRemaining: 0,
          splashRemaining: 0,
          session: null,
          pendingFishId: null,
        })
      }
      continue
    }
    if (spot.phase === FISHING_PHASE.waiting) {
      const left = Math.max(0, (spot.waitRemaining ?? 0) - dt)
      if (left > 0) {
        next = withSpot(next, spot.id, { waitRemaining: left })
      } else {
        next = beginSplash(next, next.fishing.spots[spot.id] ?? spot)
      }
      continue
    }
    if (spot.phase === FISHING_PHASE.splash) {
      const left = Math.max(0, (spot.splashRemaining ?? 0) - dt)
      if (left > 0) next = withSpot(next, spot.id, { splashRemaining: left })
      else next = depleteSpot(next, spot.id, { caught: false })
    }
  }
  return next
}

export function catchFish(state, { spotId, rng = Math.random } = {}) {
  const spot = fishingSpotById(state, spotId)
  if (!spot || spot.phase !== FISHING_PHASE.splash) return state
  const memberId = spot.session?.memberId
  if (!memberId) return depleteSpot(state, spotId, { caught: false })
  const fishId = spot.pendingFishId || pickFishId(spot, rng)
  if (!fishId) return depleteSpot(state, spotId, { caught: false })
  const granted = grantItemToMember(state, memberId, fishId)
  // Full bag: still deplete the spot (existing inventory conventions refuse the grant).
  return depleteSpot(granted.state, spotId, { caught: granted.ok })
}

export function cancelFishing(state, spotId) {
  const spot = fishingSpotById(state, spotId)
  if (!spot?.session) return state
  let next = clearMemberFishing(state, spot.session.memberId)
  return withSpot(next, spotId, {
    phase: FISHING_PHASE.idle,
    waitRemaining: 0,
    splashRemaining: 0,
    session: null,
    pendingFishId: null,
    visible: true,
  })
}
