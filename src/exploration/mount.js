// Prototype mount / ride (not STA book). One procedural horse on outdoor maps; climb on / off in exploration.
// Do not import challengeObjects here: PlayerController → mount → challengeObjects → partyControl → controllers
// is a cycle that TDZ-crashes INTERACT_RANGE and blacks the app.
import challengeData from '../data/adaptation/exploration/challenges.json'
import { usesBiome } from '../maps/mapGenerators.js'
import { canAct, getMembers } from './partyControl.js'
import { isClear, nearestWalkableTile } from './navigation.js'
import { RIDE_SPEED_MULT } from './mountConstants.js'

export { RIDE_SPEED_MULT }

/** Same tile reach as challenge interact (challenges.json); keep local to avoid import cycles. */
export const MOUNT_INTERACT_RANGE = challengeData.interactRange

/** Match HumanoidAnimator CLIP_META.mount / dismount lengths. */
export const MOUNT_CLIP_SECONDS = 1.15
export const DISMOUNT_CLIP_SECONDS = 1.0

const HORSE_ID = 'horse-1'

function worldTime(state) {
  return state?.world?.time ?? 0
}

function dist(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))
}

/** Authored Horse Spawn markers, or outdoor / colony-style maps (auto-spawn beside the lead). */
export function mapSupportsMount(map) {
  return Boolean(map && ((map.markers?.horseSpawns?.length ?? 0) > 0 || usesBiome(map)))
}

function spawnBeside(map, origin, offset) {
  const candidates = [
    { x: origin.x + offset.x, y: origin.y + offset.y },
    { x: origin.x - offset.x, y: origin.y + offset.y },
    { x: origin.x + offset.x, y: origin.y - offset.y },
    { x: origin.x + 2, y: origin.y },
    { x: origin.x, y: origin.y + 2 },
  ]
  for (const at of candidates) {
    const tile = { x: Math.round(at.x), y: Math.round(at.y) }
    const walk = nearestWalkableTile(map, tile)
    if (walk && isClear(map, { x: walk.x, y: walk.y })) return { x: walk.x, y: walk.y }
  }
  return { x: origin.x + 1.5, y: origin.y + 1.5 }
}

function headingFromFacingDegrees(facing) {
  if (!Number.isFinite(facing)) return 0
  return (facing * Math.PI) / 180
}

function horsesFromMap(map) {
  const authored = map?.markers?.horseSpawns
  if (!authored?.length) return null
  return authored.map((entry, index) => {
    const position = { x: entry.x, y: entry.y }
    const heading =
      entry.heading != null && Number.isFinite(entry.heading)
        ? entry.heading
        : headingFromFacingDegrees(entry.facing ?? 0)
    return {
      id: index === 0 ? HORSE_ID : `${HORSE_ID}-${index + 1}`,
      position,
      heading,
      riderId: null,
    }
  })
}

/**
 * @returns {{ horses: Array<{ id: string, position: {x,y}, heading: number, riderId: string|null }> } | null}
 */
export function createMountState(map, party) {
  if (!mapSupportsMount(map)) return null
  const authored = horsesFromMap(map)
  if (authored?.length) return { horses: authored }
  const lead = party?.members?.[party.leaderId] ?? getMembers(party)?.[0]
  const origin = lead?.position ?? map.markers?.playerStarts?.[0] ?? { x: 2, y: 2 }
  const facing = lead?.facing ?? { x: 1, y: 0 }
  const heading = Math.atan2(facing.y || 0, facing.x || 1)
  const position = spawnBeside(map, origin, { x: facing.y * 2.2 || 2.2, y: -(facing.x * 2.2) || 0 })
  return {
    horses: [
      {
        id: HORSE_ID,
        position,
        heading,
        riderId: null,
      },
    ],
  }
}

export function getHorses(state) {
  return state?.mount?.horses ?? []
}

export function horseById(state, horseId) {
  return getHorses(state).find((horse) => horse.id === horseId) ?? null
}

export function horseForRider(state, memberId) {
  return getHorses(state).find((horse) => horse.riderId === memberId) ?? null
}

export function isMounted(state, memberId) {
  return Boolean(horseForRider(state, memberId))
}

export function horsesInMountRange(state, memberId) {
  const member = state.party?.members?.[memberId]
  if (!member || !canAct(member) || state.mode === 'COMBAT') return []
  if (isMounted(state, memberId)) return []
  return getHorses(state).filter((horse) => !horse.riderId && dist(member.position, horse.position) <= MOUNT_INTERACT_RANGE)
}

export function canMount(state, memberId, horseId = null) {
  const member = state.party?.members?.[memberId]
  if (!member || !canAct(member) || member.sneaking) return false
  if (isMounted(state, memberId)) return false
  const horses = horsesInMountRange(state, memberId)
  if (!horses.length) return false
  if (horseId) return horses.some((horse) => horse.id === horseId)
  return true
}

export function canDismount(state, memberId) {
  const member = state.party?.members?.[memberId]
  if (!member || !canAct(member)) return false
  // Wait out climb-on / climb-off before another toggle.
  if (member.rideAnim) return false
  return isMounted(state, memberId)
}

function withHorses(state, horses) {
  return { ...state, mount: { ...(state.mount || {}), horses } }
}

/** Climb on: snap rider onto the horse and play the mount clip. */
export function mountHorse(state, memberId, horseId = null) {
  if (!canMount(state, memberId, horseId)) return state
  const horses = horsesInMountRange(state, memberId)
  const horse = (horseId ? horses.find((entry) => entry.id === horseId) : horses[0]) ?? null
  if (!horse) return state
  const member = state.party.members[memberId]
  const facing = member.facing ?? { x: Math.cos(horse.heading), y: Math.sin(horse.heading) }
  const heading = Math.atan2(facing.y || 0, facing.x || 1)
  const nextHorses = getHorses(state).map((entry) =>
    entry.id === horse.id
      ? { ...entry, riderId: memberId, position: { ...entry.position }, heading }
      : entry,
  )
  const members = {
    ...state.party.members,
    [memberId]: {
      ...member,
      position: { ...horse.position },
      heading,
      facing: { x: Math.cos(heading), y: Math.sin(heading) },
      sneaking: false,
      mounted: true,
      rideAnim: { clip: 'mount', endsAt: worldTime(state) + MOUNT_CLIP_SECONDS },
      order: null,
      path: [],
      moving: false,
      running: false,
      pace: null,
    },
  }
  return withHorses({ ...state, party: { ...state.party, members } }, nextHorses)
}

/** Start the dismount clip while still seated; finishDismount lands them when it ends. */
export function beginDismount(state, memberId) {
  if (!canDismount(state, memberId)) return state
  const member = state.party.members[memberId]
  return {
    ...state,
    party: {
      ...state.party,
      members: {
        ...state.party.members,
        [memberId]: {
          ...member,
          rideAnim: { clip: 'dismount', endsAt: worldTime(state) + DISMOUNT_CLIP_SECONDS },
          order: null,
          path: [],
          moving: false,
          running: false,
          pace: null,
        },
      },
    },
  }
}

/** Climb off beside the horse (end of dismount clip, or forced / combat). */
export function finishDismount(state, memberId) {
  const horse = horseForRider(state, memberId)
  const member = state.party?.members?.[memberId]
  if (!member) return state
  if (!horse && !member.mounted && !member.rideAnim) return state
  const anchor = horse?.position ?? member.position
  const heading = horse?.heading ?? member.heading ?? 0
  const side = {
    x: anchor.x + Math.cos(heading + Math.PI / 2) * 1.1,
    y: anchor.y + Math.sin(heading + Math.PI / 2) * 1.1,
  }
  const land = nearestWalkableTile(state.party.map, { x: Math.round(side.x), y: Math.round(side.y) })
  const position = land ? { x: land.x, y: land.y } : side
  const nextHorses = getHorses(state).map((entry) =>
    entry.riderId === memberId ? { ...entry, riderId: null, position: { ...entry.position } } : entry,
  )
  const members = {
    ...state.party.members,
    [memberId]: {
      ...member,
      position,
      moving: false,
      running: false,
      pace: null,
      mounted: false,
      rideAnim: null,
      order: null,
      path: [],
    },
  }
  return withHorses({ ...state, party: { ...state.party, members } }, nextHorses)
}

/** UI / ring: begin the climb-off animation. */
export function dismountHorse(state, memberId) {
  return beginDismount(state, memberId)
}

/**
 * Advance mount / dismount hold clips. Called each exploration tick.
 * Mount: clear rideAnim → rideIdle. Dismount: land beside the horse.
 */
export function tickRideAnims(state) {
  const members = state.party?.members
  if (!members) return state
  const now = worldTime(state)
  let next = state
  for (const id of Object.keys(members)) {
    const member = next.party.members[id]
    const anim = member?.rideAnim
    if (!anim || !(anim.endsAt <= now)) continue
    if (anim.clip === 'dismount') {
      next = finishDismount(next, id)
    } else {
      next = {
        ...next,
        party: {
          ...next.party,
          members: {
            ...next.party.members,
            [id]: { ...next.party.members[id], rideAnim: null },
          },
        },
      }
    }
  }
  return next
}

/** Toggle mount for the lead (or given member): dismount if riding, else mount nearest horse. */
export function toggleMount(state, memberId) {
  if (canDismount(state, memberId)) return beginDismount(state, memberId)
  if (canMount(state, memberId)) return mountHorse(state, memberId)
  return state
}

/** Whether this member can climb onto this horse now (in range, free saddle). */
export function canMountHorse(state, memberId, horseId) {
  return canMount(state, memberId, horseId)
}

/** Whether this member is the rider of this horse. */
export function canDismountHorse(state, memberId, horseId) {
  const horse = horseById(state, horseId)
  return Boolean(horse && horse.riderId === memberId && canDismount(state, memberId))
}

/**
 * Prototype Attack: shoot / scare the horse off the map (not STA combat).
 * Dismounts its rider first. Caller adds noise / log.
 */
export function removeHorse(state, horseId) {
  const horse = horseById(state, horseId)
  if (!horse) return state
  let next = state
  if (horse.riderId) next = finishDismount(next, horse.riderId)
  const horses = getHorses(next).filter((entry) => entry.id !== horseId)
  return horses.length ? withHorses(next, horses) : { ...next, mount: null }
}

/**
 * Keep horse glued to its rider after party movement; clear riders who can no longer act.
 */
export function syncMountAfterParty(state) {
  const horses = getHorses(state)
  if (!horses.length) return state
  let changed = false
  let members = state.party.members
  const next = horses.map((horse) => {
    if (!horse.riderId) return horse
    const rider = members[horse.riderId]
    if (!rider || !canAct(rider)) {
      changed = true
      if (rider?.mounted) {
        members = { ...members, [horse.riderId]: { ...rider, mounted: false } }
      }
      return { ...horse, riderId: null }
    }
    const heading =
      rider.facing && (rider.facing.x || rider.facing.y)
        ? Math.atan2(rider.facing.y, rider.facing.x)
        : horse.heading
    if (
      horse.position.x !== rider.position.x ||
      horse.position.y !== rider.position.y ||
      horse.heading !== heading
    ) {
      changed = true
      return { ...horse, position: { ...rider.position }, heading }
    }
    return horse
  })
  if (!changed) return state
  const withParty = members === state.party.members ? state : { ...state, party: { ...state.party, members } }
  return withHorses(withParty, next)
}

/**
 * Auto-dismount everyone when combat starts (skip climb-off anim).
 * Always clears riderIds + mounted / rideAnim flags so ride speed cannot stick through a fight.
 */
export function dismountAll(state) {
  const horses = getHorses(state)
  const members = state.party?.members
  if (!members) return state
  let next = state
  for (const horse of horses) {
    if (horse.riderId) next = finishDismount(next, horse.riderId)
  }
  const clearedHorses = getHorses(next).map((horse) => (horse.riderId ? { ...horse, riderId: null } : horse))
  let clearedMembers = next.party.members
  let memberChanged = false
  for (const id of Object.keys(clearedMembers)) {
    const member = clearedMembers[id]
    if (!member?.mounted && !member?.rideAnim) continue
    if (!memberChanged) {
      clearedMembers = { ...clearedMembers }
      memberChanged = true
    }
    clearedMembers[id] = { ...member, mounted: false, rideAnim: null }
  }
  const horsesChanged = clearedHorses.some((horse, i) => horse !== getHorses(next)[i])
  if (!memberChanged && !horsesChanged) return next
  let result = memberChanged ? { ...next, party: { ...next.party, members: clearedMembers } } : next
  if (horsesChanged) result = withHorses(result, clearedHorses)
  return result
}
