// Fishing Spot hotspots: authored map.fishingSpots + session state (cast → splash → catch / deplete → respawn).
import { blocksMovement } from '../combat/battleMap.js'
import { getItemById } from '../rules/equipment.js'
import { getInstance, grantItemToMember } from '../rules/inventory.js'

export { grantItemToMember } from '../rules/inventory.js'
import { canAct, getMembers } from './partyControl.js'
import {
  authoredFishingSpotFields,
  clampDifficulty,
  clampRespawnSeconds,
  clampSize,
  DEFAULT_FISH_IDS,
} from './fishingAuthored.js'
import { isFishingWaterAt, shoreApproachTile } from './fishingWater.js'

export {
  clampDifficulty,
  clampRespawnSeconds,
  clampSize,
  DEFAULT_FISH_IDS,
  normalizeCatchPool,
} from './fishingAuthored.js'

function shoreTile(map, spotPos, from = null) {
  return shoreApproachTile(map, spotPos, from, {
    isWalkable: (cell) => !isFishingWaterAt(map, cell) && !blocksMovement(map, cell),
  })
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

/** Hook for future local-water relocation; v1 returns the home tile when it is still water. */
export function pickRespawnTile(spot, map, _rng = Math.random) {
  const home = spot.home ?? spot.position
  if (isFishingWaterAt(map, home)) return { ...home }
  return { ...spot.position }
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

/** Catch window seconds; higher difficulty / smaller size = shorter window. */
export function splashSecondsFor(spot) {
  const d = clampDifficulty(spot?.difficulty)
  const size = clampSize(spot?.size)
  return Math.max(0.7, (2.8 - d * 0.35) * (0.75 + size * 0.25))
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
  const map = next.party?.map ?? next.map
  const now = next.world?.time ?? 0
  return withSpot(next, spotId, {
    phase: FISHING_PHASE.depleted,
    visible: false,
    respawnAt: now + clampRespawnSeconds(spot.respawnSeconds),
    waitRemaining: 0,
    splashRemaining: 0,
    session: null,
    pendingFishId: null,
    lastCaught: caught,
    position: pickRespawnTile(spot, map),
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

export function tickFishing(state, dt) {
  if (!state.fishing?.spots || !(dt > 0)) return state
  let next = syncFishingApproach(state)
  const now = next.world?.time ?? 0
  for (const spot of Object.values(next.fishing.spots)) {
    if (spot.phase === FISHING_PHASE.depleted) {
      if (spot.respawnAt != null && now >= spot.respawnAt) {
        const map = next.party?.map ?? next.map
        const position = pickRespawnTile(spot, map)
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
        const fishId = pickFishId(spot)
        next = withSpot(next, spot.id, {
          phase: FISHING_PHASE.splash,
          waitRemaining: 0,
          splashRemaining: splashSecondsFor(spot),
          pendingFishId: fishId,
        })
        if (spot.session?.memberId) {
          next = setMemberFishing(next, spot.session.memberId, { spotId: spot.id, phase: 'splash' })
        }
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
