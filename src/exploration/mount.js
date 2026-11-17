// Prototype mount / ride (not STA book). Horses only from authored Horse Spawn markers; climb on / off in exploration.
// Do not import challengeObjects here: PlayerController → mount → challengeObjects → partyControl → controllers
// is a cycle that TDZ-crashes INTERACT_RANGE and blacks the app.
import challengeData from '../data/adaptation/exploration/challenges.json'
import { canAct } from './partyControl.js'
import { isClear, nearestWalkableTile, planRoute, RADIUS } from './navigation.js'
import { resolveAuthoredRoam, tickRoam } from './roam.js'
import { RIDE_RUN_SPEED_MULT, RIDE_SPEED_MULT } from './mountConstants.js'
import { MOUNT_LEFT_AFT, MOUNT_LEFT_REACH } from '../spike3d/HorseModel.js'
import { normalizeDisposition } from './dispositions.js'
import { horseCoatForSpawnIndex, horseCoatLabel, normalizeHorseCoatId } from '../spike3d/horseTexture.js'

export { RIDE_RUN_SPEED_MULT, RIDE_SPEED_MULT }

/** Same tile reach as challenge interact (challenges.json); keep local to avoid import cycles. */
export const MOUNT_INTERACT_RANGE = challengeData.interactRange

/** Match HumanoidAnimator CLIP_META.mount / dismount lengths. */
export const MOUNT_CLIP_SECONDS = 1.45
export const DISMOUNT_CLIP_SECONDS = 1.3

const HORSE_ID = 'horse-1'

function worldTime(state) {
  return state?.world?.time ?? 0
}

function dist(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))
}

/** True when the map has at least one authored Horse Spawn marker. */
export function mapSupportsMount(map) {
  return Boolean(map && (map.markers?.horseSpawns?.length ?? 0) > 0)
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
    const coat = entry.coat ? normalizeHorseCoatId(entry.coat) : horseCoatForSpawnIndex(index)
    // Default idle when roam omitted (legacy maps stand at spawn).
    const roam = resolveAuthoredRoam(entry.roam ?? { mode: 'idle' })
    return {
      id: index === 0 ? HORSE_ID : `${HORSE_ID}-${index + 1}`,
      position,
      heading,
      home: { position: { ...position }, heading },
      roam,
      roamRuntime: null,
      gait: 'idle',
      riderId: null,
      coat,
      label: horseCoatLabel(coat),
      disposition: normalizeDisposition(entry.disposition ?? 'neutral'),
    }
  })
}

/**
 * @returns {{ horses: Array<{ id: string, position: {x,y}, heading: number, riderId: string|null, coat: string, label: string }> } | null}
 */
export function createMountState(map, _party) {
  const horses = horsesFromMap(map)
  if (!horses?.length) return null
  return { horses }
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

/**
 * Climb-up / climb-off stand point beside the horse (left of facing).
 * Exact continuous pad matching HorseModel mountLeft (no tile-centre snap — that caused dismount pops).
 */
export function mountSidePoint(map, horse) {
  const heading = horse?.heading ?? 0
  const origin = horse?.position ?? { x: 0, y: 0 }
  const reach = MOUNT_LEFT_REACH
  const aft = MOUNT_LEFT_AFT
  const at = {
    x: origin.x + Math.cos(heading + Math.PI / 2) * reach + Math.cos(heading) * aft,
    y: origin.y + Math.sin(heading + Math.PI / 2) * reach + Math.sin(heading) * aft,
  }
  if (!map) return at
  // Prefer the joint itself so climb-off lands where the mesh ended.
  if (isClear(map, at, RADIUS)) return at
  const walk = nearestWalkableTile(map, { x: Math.round(at.x), y: Math.round(at.y) })
  if (walk && isClear(map, { x: walk.x, y: walk.y }, RADIUS)) return { x: walk.x, y: walk.y }
  return at
}

function smooth01(u) {
  const t = Math.min(1, Math.max(0, u))
  return t * t * (3 - 2 * t)
}

/**
 * Attach blend from world clock: mount 0→1, dismount 1→0.
 * Keeps sim / Spike3d / animator on one clock so climb-off does not detach mid-air.
 */
export function rideAttachBlend(anim, now = worldTime({ world: { time: 0 } })) {
  if (!anim?.endsAt || !anim.clip) return anim?.clip === 'dismount' ? 1 : anim?.clip === 'mount' ? 0 : 1
  const dur = anim.clip === 'dismount' ? DISMOUNT_CLIP_SECONDS : MOUNT_CLIP_SECONDS
  if (!(dur > 0)) return anim.clip === 'dismount' ? 0 : 1
  const remaining = (anim.endsAt - now) / dur
  if (anim.clip === 'dismount') return Math.min(1, Math.max(0, remaining))
  return Math.min(1, Math.max(0, 1 - remaining))
}

/**
 * Map-space climb path matching HorseActor attach (blend 0 = mount pad, 1 = saddle).
 */
export function mountClimbMapPos(horse, blend) {
  const t = Math.min(1, Math.max(0, Number(blend) || 0))
  const seat = { x: horse.position.x, y: horse.position.y }
  const ground = mountSidePoint(null, horse)
  const stirrup = {
    x: seat.x + (ground.x - seat.x) * 0.88,
    y: seat.y + (ground.y - seat.y) * 0.88,
  }
  const approach = {
    x: ground.x + (stirrup.x - ground.x) * 0.4,
    y: ground.y + (stirrup.y - ground.y) * 0.4,
  }
  // Keep in sync with HorseActor climb phases — long plant so dismount ends planted on the joint.
  const plantEnd = 0.4
  const stirrupEnd = 0.58
  if (t <= plantEnd) {
    const u = smooth01(t / plantEnd)
    return { x: ground.x + (approach.x - ground.x) * u, y: ground.y + (approach.y - ground.y) * u }
  }
  if (t <= stirrupEnd) {
    const u = smooth01((t - plantEnd) / (stirrupEnd - plantEnd))
    return { x: approach.x + (stirrup.x - approach.x) * u, y: approach.y + (stirrup.y - approach.y) * u }
  }
  const u = smooth01((t - stirrupEnd) / (1 - stirrupEnd))
  let x = stirrup.x + (seat.x - stirrup.x) * u
  let y = stirrup.y + (seat.y - stirrup.y) * u
  const ox = stirrup.x - seat.x
  const oy = stirrup.y - seat.y
  const len = Math.hypot(ox, oy) || 1
  const keep = (1 - u) * (1 - u) * 0.28
  x += (ox / len) * keep
  y += (oy / len) * keep
  return { x, y }
}

/** Close enough to climb: near the horse and near the side stand (or already beside it). */
function inMountReach(member, horse, map) {
  if (!member || !horse) return false
  const side = mountSidePoint(map, horse)
  const toHorse = dist(member.position, horse.position)
  const toSide = dist(member.position, side)
  // Prefer the side pad; allow a slightly wider horse radius so a near miss still locks on.
  return toSide <= 0.7 || (toHorse <= 1.15 && toSide <= 1.35)
}

export function horsesInMountRange(state, memberId) {
  const member = state.party?.members?.[memberId]
  if (!member || !canAct(member) || state.mode === 'COMBAT') return []
  if (isMounted(state, memberId)) return []
  const map = state.party?.map
  return getHorses(state).filter((horse) => {
    if (horse.riderId) return false
    // Still require being in interact band of the horse so far-away Ride walks over.
    if (dist(member.position, horse.position) > MOUNT_INTERACT_RANGE) return false
    return inMountReach(member, horse, map)
  })
}

export function canMount(state, memberId, horseId = null) {
  const member = state.party?.members?.[memberId]
  if (!member || !canAct(member) || member.sneaking) return false
  if (member.rideAnim) return false
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

/** Climb on: lock to the horse (sim at horse tile) and play the mount clip (visual side→saddle). */
export function mountHorse(state, memberId, horseId = null) {
  if (!canMount(state, memberId, horseId)) return state
  const horses = horsesInMountRange(state, memberId)
  const horse = (horseId ? horses.find((entry) => entry.id === horseId) : horses[0]) ?? null
  if (!horse) return state
  const member = state.party.members[memberId]
  // Face the same way as the horse so the climb reads from the near side.
  const heading = horse.heading ?? Math.atan2(member.facing?.y || 0, member.facing?.x || 1)
  const nextHorses = getHorses(state).map((entry) =>
    entry.id === horse.id
      ? { ...entry, riderId: memberId, position: { ...entry.position }, heading }
      : entry,
  )
  const members = {
    ...state.party.members,
    [memberId]: {
      ...member,
      // Sim centre locks to the horse; Spike3d lerps the mesh from the side into the saddle.
      position: { ...horse.position },
      heading,
      facing: { x: Math.cos(heading), y: Math.sin(heading) },
      sneaking: false,
      mounted: true,
      pendingMountHorseId: null,
      rideAnim: { clip: 'mount', endsAt: worldTime(state) + MOUNT_CLIP_SECONDS },
      rideAttachBlend: 0,
      order: null,
      path: [],
      moving: false,
      running: false,
      pace: null,
    },
  }
  return withHorses({ ...state, party: { ...state.party, members } }, nextHorses)
}

/** Horses already ridden or claimed by a walk-to-mount. */
function unavailableHorseIds(state) {
  const taken = new Set()
  for (const horse of getHorses(state)) {
    if (horse.riderId) taken.add(horse.id)
  }
  for (const member of Object.values(state.party?.members ?? {})) {
    if (member?.pendingMountHorseId) taken.add(member.pendingMountHorseId)
  }
  return taken
}

/**
 * Pair able members with free horses: leader first, then party order; each gets nearest remaining horse.
 * Extra members get no horse and stay on foot.
 * opts.preferHorseId + opts.preferMemberId: lock that pair first (Ride on a specific horse).
 */
export function planMountAssignments(state, memberIds, opts = {}) {
  const taken = unavailableHorseIds(state)
  let free = getHorses(state).filter((horse) => !taken.has(horse.id))
  const freeCount = free.length
  const leaderId = state.party?.leaderId
  const order = [...(memberIds ?? [])].filter((id) => {
    const member = state.party?.members?.[id]
    return member && canAct(member) && !member.mounted && !member.sneaking && !member.rideAnim && !member.pendingMountHorseId
  })
  order.sort((a, b) => {
    if (a === leaderId) return -1
    if (b === leaderId) return 1
    return (state.party.memberIds?.indexOf(a) ?? 0) - (state.party.memberIds?.indexOf(b) ?? 0)
  })
  if (!free.length || !order.length) return []

  const usedMembers = new Set()
  const usedHorses = new Set()
  const assignments = []
  const maxAssign = Math.min(order.length, freeCount)

  // Ride click: give the chosen horse to the preferred member (usually the lead) before nearest-fill.
  const preferHorseId = opts.preferHorseId ?? null
  const preferMemberId = opts.preferMemberId ?? leaderId
  if (preferHorseId && preferMemberId && order.includes(preferMemberId) && free.some((horse) => horse.id === preferHorseId)) {
    usedMembers.add(preferMemberId)
    usedHorses.add(preferHorseId)
    assignments.push({ memberId: preferMemberId, horseId: preferHorseId })
    free = free.filter((horse) => horse.id !== preferHorseId)
  }

  // Leader-first: each remaining member claims their nearest still-free horse (not global pair matching).
  for (const memberId of order) {
    if (assignments.length >= maxAssign) break
    if (usedMembers.has(memberId)) continue
    const member = state.party.members[memberId]
    let best = null
    for (const horse of free) {
      if (usedHorses.has(horse.id)) continue
      const d = dist(member.position, horse.position)
      if (!best || d < best.d || (d === best.d && String(horse.id).localeCompare(String(best.horseId)) < 0)) {
        best = { horseId: horse.id, d }
      }
    }
    if (!best) break
    usedMembers.add(memberId)
    usedHorses.add(best.horseId)
    assignments.push({ memberId, horseId: best.horseId })
  }
  return assignments
}

/** planRoute may stop short of an unreachable stand; only claim when the path end is beside the horse. */
const MOUNT_SIDE_PATH_REACH = 0.85

function routeReachesMountSide(path, side, from) {
  const end = path?.length ? path[path.length - 1] : from
  return dist(end, side) <= MOUNT_SIDE_PATH_REACH
}

/** @returns {object|null} updated member, or null when the mount side is not reachable. */
function walkToMountSide(state, memberId, horse) {
  const map = state.party.map
  const member = state.party.members[memberId]
  const side = mountSidePoint(map, horse)
  const path = planRoute(map, member.position, side, RADIUS)
  if (!routeReachesMountSide(path, side, member.position)) return null
  return {
    ...member,
    pendingMountHorseId: horse.id,
    sneaking: false,
    order: { type: 'point', target: side, run: false },
    path,
    replanIn: 0.5,
    stall: { seconds: 0, best: Infinity },
  }
}

/** Drop walk-to-mount claims and their walk orders (fresh move, Escape, combat start). */
export function clearPendingMountClaims(state) {
  const members = state.party?.members
  if (!members) return state
  let changed = false
  const next = { ...members }
  for (const id of Object.keys(next)) {
    if (!next[id]?.pendingMountHorseId) continue
    next[id] = {
      ...next[id],
      pendingMountHorseId: null,
      order: null,
      path: [],
      moving: false,
      running: false,
      pace: null,
    }
    changed = true
  }
  return changed ? { ...state, party: { ...state.party, members: next } } : state
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
          rideAttachBlend: 1,
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
  // Prefer the climb foot already on the pad (tickRideAnims); else the continuous mountLeft joint.
  const pad = horse ? mountSidePoint(null, horse) : null
  const onPad =
    pad &&
    Number.isFinite(member.position?.x) &&
    Math.hypot(member.position.x - pad.x, member.position.y - pad.y) <= 0.2
  const position = onPad ? { ...member.position } : pad ? { ...pad } : { ...member.position }
  const heading = horse?.heading ?? member.heading ?? 0
  const nextHorses = getHorses(state).map((entry) =>
    entry.riderId === memberId ? { ...entry, riderId: null, position: { ...entry.position } } : entry,
  )
  const members = {
    ...state.party.members,
    [memberId]: {
      ...member,
      position,
      heading,
      facing: { x: Math.cos(heading), y: Math.sin(heading) },
      moving: false,
      running: false,
      pace: null,
      mounted: false,
      pendingMountHorseId: null,
      rideAnim: null,
      rideAttachBlend: null,
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
 * Unmounted horses with authored roam (wander / waypoint). Mounted horses skip this —
 * Ride / syncMountAfterParty owns their motion.
 */
export function tickUnmountedHorseRoam(state, map, seconds) {
  const horses = getHorses(state)
  if (!horses.length || !map || !(seconds > 0)) return state
  let changed = false
  const next = horses.map((horse) => {
    if (horse.riderId) return horse
    const roam = resolveAuthoredRoam(horse.roam ?? { mode: 'idle' })
    if (roam.mode === 'idle') {
      if (horse.gait === 'idle' && !horse.roamRuntime) return horse
      changed = true
      return { ...horse, gait: 'idle', roamRuntime: null, moving: false }
    }
    const result = tickRoam({
      home: horse.home ?? { position: horse.position, heading: horse.heading },
      map,
      profileId: 'horse',
      roam,
      runtime: horse.roamRuntime,
      position: horse.position,
      heading: horse.heading,
      seconds,
    })
    changed = true
    return {
      ...horse,
      position: result.position,
      heading: result.heading,
      gait: result.gait,
      moving: result.moving,
      roamRuntime: result.roamRuntime,
    }
  })
  return changed ? withHorses(state, next) : state
}

/**
 * Advance mount / dismount hold clips. Called each exploration tick.
 * Mount: clear rideAnim → rideIdle. Dismount: land beside the horse.
 * Attach blend is driven from world.time (same clock as endsAt) so Spike3d seek/attach
 * cannot finish mid-air while the sim already cleared riderId.
 */
export function tickRideAnims(state) {
  const members = state.party?.members
  if (!members) return state
  const now = worldTime(state)
  let next = state
  // Walk-to-mount: climb on when each claimant reaches their horse; drop stalled / unreachable claims.
  for (const id of Object.keys(next.party.members)) {
    const member = next.party.members[id]
    const horseId = member?.pendingMountHorseId
    if (!horseId) continue
    const horse = horseById(next, horseId)
    const walking = Boolean(member.order) || (member.path?.length ?? 0) > 0
    if (!horse || horse.riderId || (!walking && !canMount(next, id, horseId))) {
      next = {
        ...next,
        party: {
          ...next.party,
          members: {
            ...next.party.members,
            [id]: {
              ...member,
              pendingMountHorseId: null,
              ...(walking
                ? {}
                : { order: null, path: [], moving: false, running: false, pace: null }),
            },
          },
        },
      }
      continue
    }
    if (canMount(next, id, horseId)) next = mountHorse(next, id, horseId)
  }
  // Clock blend + climb-foot position so LEAD / camera / plant match the mesh (no centre→pad snap).
  for (const id of Object.keys(next.party.members)) {
    const member = next.party.members[id]
    const anim = member?.rideAnim
    if (!anim) continue
    const horse = horseForRider(next, id)
    const blend = rideAttachBlend(anim, now)
    const heading = horse?.heading ?? member.heading ?? 0
    const climb = horse ? mountClimbMapPos(horse, blend) : member.position
    const sameBlend = member.rideAttachBlend === blend
    const samePos =
      member.position?.x === climb.x && member.position?.y === climb.y && member.heading === heading
    if (sameBlend && samePos) continue
    next = {
      ...next,
      party: {
        ...next.party,
        members: {
          ...next.party.members,
          [id]: {
            ...member,
            rideAttachBlend: blend,
            position: { x: climb.x, y: climb.y },
            heading,
            facing: { x: Math.cos(heading), y: Math.sin(heading) },
          },
        },
      },
    }
  }
  for (const id of Object.keys(next.party.members)) {
    const member = next.party.members[id]
    const anim = member?.rideAnim
    if (!anim || !(anim.endsAt <= now)) continue
    if (anim.clip === 'dismount') {
      // Only plant once the shared blend has reached the mount joint (not mid-stirrup).
      if ((member.rideAttachBlend ?? rideAttachBlend(anim, now)) > 0.001) continue
      next = finishDismount(next, id)
    } else {
      next = {
        ...next,
        party: {
          ...next.party,
          members: {
            ...next.party.members,
            [id]: { ...next.party.members[id], rideAnim: null, rideAttachBlend: null },
          },
        },
      }
    }
  }
  return next
}

/**
 * Team mount: assign free horses to the given members (leader first). Enough horses → they
 * walk over and climb on; shortfall → the rest stay on foot. If any are already riding /
 * walking to a horse, those dismount / cancel instead.
 * opts: { preferHorseId, preferMemberId } — Ride on a specific horse locks that saddle first.
 */
export function togglePartyMount(state, memberIds, opts = {}) {
  const ids = (memberIds?.length ? memberIds : [state.party?.leaderId]).filter(
    (id) => id && state.party?.members?.[id],
  )
  const able = ids.filter((id) => canAct(state.party.members[id]))
  if (!able.length) return state

  const anyMounted = able.some((id) => {
    const member = state.party.members[id]
    return member.mounted || member.rideAnim || member.pendingMountHorseId || isMounted(state, id)
  })
  if (anyMounted) {
    let next = state
    for (const id of able) {
      const member = next.party.members[id]
      if (member?.pendingMountHorseId) {
        next = {
          ...next,
          party: {
            ...next.party,
            members: {
              ...next.party.members,
              [id]: {
                ...member,
                pendingMountHorseId: null,
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
      if (canDismount(next, id)) next = beginDismount(next, id)
      else if (next.party.members[id]?.mounted) next = finishDismount(next, id)
    }
    return next
  }

  const assignments = planMountAssignments(state, able, opts)
  if (!assignments.length) return state
  let next = state
  for (const { memberId, horseId } of assignments) {
    const horse = horseById(next, horseId)
    if (!horse || horse.riderId) continue
    if (canMount(next, memberId, horseId)) {
      next = mountHorse(next, memberId, horseId)
      continue
    }
    const walked = walkToMountSide(next, memberId, horse)
    if (!walked) continue
    next = {
      ...next,
      party: { ...next.party, members: { ...next.party.members, [memberId]: walked } },
    }
  }
  return next
}

/** Toggle mount for one member (ring / legacy); prefer togglePartyMount for M. */
export function toggleMount(state, memberId) {
  return togglePartyMount(state, memberId ? [memberId] : null)
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
    // Climb path moves the rider beside the horse — do not drag the horse onto the mount pad.
    if (rider.rideAnim) {
      if (horse.heading !== heading) {
        changed = true
        return { ...horse, heading }
      }
      return horse
    }
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
 * Clears pending walk-to-mount claims/orders, riderIds, and mounted / rideAnim so combat
 * exit cannot remount or keep a horse reserved.
 */
export function dismountAll(state) {
  const members = state.party?.members
  if (!members) return state
  // Drop walk-to-mount reservations before forced climb-off so claims cannot survive the fight.
  let next = clearPendingMountClaims(state)
  for (const horse of getHorses(next)) {
    if (horse.riderId) next = finishDismount(next, horse.riderId)
  }
  const clearedHorses = getHorses(next).map((horse) => (horse.riderId ? { ...horse, riderId: null } : horse))
  let clearedMembers = next.party.members
  let memberChanged = false
  for (const id of Object.keys(clearedMembers)) {
    const member = clearedMembers[id]
    if (!member?.mounted && !member?.rideAnim && !member?.pendingMountHorseId) continue
    if (!memberChanged) {
      clearedMembers = { ...clearedMembers }
      memberChanged = true
    }
    clearedMembers[id] = {
      ...member,
      mounted: false,
      rideAnim: null,
      rideAttachBlend: null,
      pendingMountHorseId: null,
    }
  }
  const horsesChanged = clearedHorses.some((horse, i) => horse !== getHorses(next)[i])
  if (!memberChanged && !horsesChanged) return next
  let result = memberChanged ? { ...next, party: { ...next.party, members: clearedMembers } } : next
  if (horsesChanged) result = withHorses(result, clearedHorses)
  return result
}
