// Fishing Spot hotspots: authored map.fishingSpots + session state.
// Ring flow (designer 2026-11-17): click ripple → Scan / Fish → pick caster → Roll arc → Fitness + Security
// roll → success grants a fish into the party bag. The ripple stays put (no deplete / relocate / Catch).
import fishingData from '../data/adaptation/exploration/fishing.json'
import { blocksMovement } from '../combat/battleMap.js'
import { getItemById } from '../rules/equipment.js'
import { grantItemToMember, partyBagFreeSlots, partyOwnsItemId } from '../rules/inventory.js'
import { prepareTask } from '../rules/taskPreparation.js'
import { augmentTaskContext, augmentTaskSpec } from '../ships/serviceEffects.js'
import { canAct } from './partyControl.js'
import { rollPartyTask } from './partyTaskRoll.js'
import {
  authoredFishingSpotFields,
  clampDifficulty,
  DEFAULT_FISH_IDS,
} from './fishingAuthored.js'
import { isFishingWaterAt, shoreApproachTile } from './fishingWater.js'
import { addLogEntry } from './missionLog.js'

export { grantItemToMember } from '../rules/inventory.js'
export {
  clampDifficulty,
  clampSize,
  DEFAULT_FISH_IDS,
  normalizeCatchPool,
} from './fishingAuthored.js'

export const FISHING_TASK = fishingData.task
export const FISHING_ROD_ID = 'fishingRod'

/** Session phases: idle (ready) or approaching shore before the roll. Ripple never hides. */
export const FISHING_PHASE = Object.freeze({
  idle: 'idle',
  approaching: 'approaching',
})

// How long the angler may stand still short of the shore before the approach is abandoned (world seconds).
// Gives the move order time to start; a blocked path never reaches the shore tile.
const APPROACH_GIVE_UP_SECONDS = 1.5

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

export function authoredFishingSpot(raw, position) {
  return {
    id: String(raw.id),
    position: { x: position.x, y: position.y },
    home: { x: position.x, y: position.y },
    ...authoredFishingSpotFields(raw),
  }
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
      session: null,
    }
  }
  return { spots }
}

export function fishingSpotViews(state) {
  return Object.values(state.fishing?.spots ?? {})
    .filter((spot) => spot.visible !== false)
    .map((spot) => ({
      id: spot.id,
      position: spot.position,
      size: spot.size,
      phase: spot.phase,
      fishable: spot.fishable,
    }))
}

export function fishingSpotById(state, spotId) {
  return state.fishing?.spots?.[spotId] ?? null
}

/** Fishing gate: the party bag holds a rod, so every able angler may Fish. */
export function partyHasFishingRod(state) {
  return partyOwnsItemId(state, FISHING_ROD_ID)
}

/** Fitness + Security. Missing stats use the reference skill so incomplete test characters keep a base TN. */
export function fishingSkill(character) {
  const fitness = character?.attributes?.fitness
  const security = character?.disciplines?.security
  if (!Number.isFinite(fitness) || !Number.isFinite(security)) return fishingData.referenceSkill
  return fitness + security
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

function clearSpotSession(state, spotId) {
  const spot = fishingSpotById(state, spotId)
  if (!spot) return state
  let next = state
  if (spot.session?.memberId) next = clearMemberFishing(next, spot.session.memberId)
  return withSpot(next, spotId, { phase: FISHING_PHASE.idle, session: null })
}

/**
 * Whether this member could cast here if the party had a rod (shore + able).
 * Used by the party band so TNs stay visible when Fish is dim for no rod.
 */
export function canFishAtSpot(state, spotId, memberId) {
  const spot = fishingSpotById(state, spotId)
  if (!spot) return { ok: false, reason: 'Unknown fishing spot.' }
  if (!spot.fishable) return { ok: false, reason: 'This spot is not fishable.' }
  if (spot.phase === FISHING_PHASE.approaching && spot.session?.memberId && spot.session.memberId !== memberId) {
    return { ok: false, reason: 'Someone is already fishing here.' }
  }
  const member = state.party?.members?.[memberId]
  if (!canAct(member)) return { ok: false, reason: 'That character cannot act.' }
  const approach = shoreTile(state.party.map, spot.position, member.position)
  if (!approach) return { ok: false, reason: 'No shore tile to cast from.' }
  return { ok: true, approach }
}

/** Full Fish gate: canFishAtSpot + party rod in the shared bag. */
export function canStartFishing(state, spotId, memberId) {
  if (!partyHasFishingRod(state)) return { ok: false, reason: 'no rod' }
  return canFishAtSpot(state, spotId, memberId)
}

function memberOnShore(member, approach) {
  return Math.round(member.position.x) === approach.x && Math.round(member.position.y) === approach.y
}

/** prepareTask for the casting roll (Fitness + Security at the spot's Difficulty). */
export function previewFishing(state, spotId, memberId) {
  const member = state.party?.members?.[memberId]
  const spot = fishingSpotById(state, spotId)
  if (!member?.character || !spot) return { possible: false, blockers: ['Unknown fishing attempt.'] }
  return prepareTask(
    member.character,
    augmentTaskSpec({ ...FISHING_TASK, difficulty: clampDifficulty(spot.difficulty) }),
    augmentTaskContext({ traits: state.scenario?.traits, side: 'player', condition: member.condition }),
  )
}

/**
 * True when the angler is on the shore and ready for the dice window (not mid-walk).
 * The screen opens PreRollWindow; this does not roll.
 */
export function fishingReadyToRoll(state, spotId, memberId) {
  const check = canStartFishing(state, spotId, memberId)
  if (!check.ok) return false
  const member = state.party.members[memberId]
  return Boolean(member && !member.moving && memberOnShore(member, check.approach))
}

/**
 * Cast roll from the dice window (same purchase / Momentum path as challenge and conversation rolls).
 * Success grants a shared fish into the party bag. Ripple stays idle either way.
 */
export function fishRoll(state, { spotId, memberId, purchase, rng = Math.random } = {}) {
  const check = canStartFishing(state, spotId, memberId)
  if (!check.ok) return state
  const spot = fishingSpotById(state, spotId)
  const member = state.party.members[memberId]
  if (!memberOnShore(member, check.approach)) return state
  const prepared = previewFishing(state, spotId, memberId)
  const rolled = rollPartyTask(state, { prepared, purchase })
  if (!rolled) return state

  const name = member.character?.name ?? 'Angler'
  const messages = []
  let fishId = null
  let granted = false
  let next = rolled.state

  if (rolled.result.success) {
    if (partyBagFreeSlots(next) < 1) {
      messages.push('Caught something, but the party bag is full.')
    } else {
      fishId = pickFishId(spot, rng)
      if (fishId) {
        const grant = grantItemToMember(next, memberId, fishId)
        next = grant.state
        granted = grant.ok
        if (granted) messages.push(`Caught a ${getItemById(fishId)?.name ?? fishId}.`)
      }
    }
  } else {
    messages.push('Nothing biting.')
  }

  const lastFishing = {
    key: rolled.state.scenario.taskCount - 1,
    memberId,
    spotId,
    performerId: memberId,
    success: rolled.result.success,
    successes: rolled.result.successes,
    difficulty: prepared.difficulty,
    result: rolled.result,
    prepared,
    messages,
    momentumSaved: rolled.saving.saved,
    momentumLost: rolled.saving.lost ?? 0,
    bonusDice: rolled.purchase.bonusDice,
    momentumSpentOnDice: rolled.purchase.momentum ?? 0,
    threatAddedForDice: rolled.purchase.threatAdded ?? 0,
    fishId,
    granted,
  }
  next = {
    ...next,
    lastFishing,
  }
  next = addLogEntry(next, {
    kind: 'task',
    text: `${name}: Fishing (Fitness + Security vs ${prepared.difficulty}): ${rolled.result.success ? 'succeeded' : 'failed'}.`,
    story: { event: rolled.result.success ? 'taskSuccess' : 'taskFailure', performer: name, label: 'Fishing' },
  })
  if (granted && fishId) {
    next = addLogEntry(next, {
      kind: 'task',
      text: `${name} caught a ${getItemById(fishId)?.name ?? fishId}.`,
      story: { event: 'taskSuccess', performer: name, label: 'Fishing' },
    })
  }
  return clearSpotSession(next, spotId)
}

/**
 * Fish from the ring: walk to shore when needed. Does not roll — the screen opens the dice window once ready.
 */
export function startFishing(state, { spotId, memberId }) {
  const check = canStartFishing(state, spotId, memberId)
  if (!check.ok) return state
  const member = state.party.members[memberId]
  if (memberOnShore(member, check.approach) && !member.moving) {
    // Already on shore: session marks ready for the UI dice window.
    let next = withSpot(state, spotId, {
      phase: FISHING_PHASE.idle,
      session: { memberId, approach: check.approach, ready: true },
    })
    next = setMemberFishing(next, memberId, { spotId, phase: 'ready' })
    return next
  }
  let next = withSpot(state, spotId, {
    phase: FISHING_PHASE.approaching,
    session: { memberId, approach: check.approach, moving: true, startedAt: state.world?.time ?? 0 },
  })
  next = setMemberFishing(next, memberId, { spotId, phase: 'approaching' })
  return next
}

/** When the angler arrives on the shore tile, mark ready for the dice window (do not roll). */
export function syncFishingApproach(state) {
  let next = state
  for (const spot of Object.values(state.fishing?.spots ?? {})) {
    if (spot.phase !== FISHING_PHASE.approaching || !spot.session?.memberId) continue
    const memberId = spot.session.memberId
    const member = next.party.members[memberId]
    if (!member || !canAct(member)) {
      next = clearSpotSession(next, spot.id)
      continue
    }
    const approach = spot.session.approach
    if (memberOnShore(member, approach) && !member.moving) {
      if (!canStartFishing(next, spot.id, memberId).ok) {
        next = clearSpotSession(next, spot.id)
        continue
      }
      next = withSpot(next, spot.id, {
        phase: FISHING_PHASE.idle,
        session: { memberId, approach, ready: true },
      })
      next = setMemberFishing(next, memberId, { spotId: spot.id, phase: 'ready' })
    } else if (
      !member.moving &&
      (next.world?.time ?? 0) - (spot.session.startedAt ?? 0) > APPROACH_GIVE_UP_SECONDS
    ) {
      // The walk ended short of the shore (blocked path): give up so the ring and other anglers are not locked out.
      next = clearSpotSession(next, spot.id)
    }
  }
  return next
}

/** World tick: finishes an approach walk so the dice window can open. Ripples never deplete or move. */
export function tickFishing(state) {
  if (!state.fishing?.spots) return state
  return syncFishingApproach(state)
}

export function cancelFishing(state, spotId) {
  const spot = fishingSpotById(state, spotId)
  if (!spot?.session) return state
  return clearSpotSession(state, spotId)
}
