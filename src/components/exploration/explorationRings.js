// The radial menus of exploration (ExplorationScreen.jsx): a party member's, a challenge object's and an NPC's, the
// ring's party band, and the card beside an NPC's ring. Pure: they build button lists from the exploration state.
import { controllerFor } from '../../actors/controllers.js'
import { conversationIdFor } from '../../conversation/defaultConversations.js'
import { SCAN_TRAIT } from '../../combat/combatScan.js'
import { dispositionName, isDown, STATE, stateName } from '../../exploration/awareness.js'
import { challengeFor } from '../../exploration/challengeObjects.js'
import { previewObjectShot } from '../../exploration/explorationEnvironment.js'
import { canScan, canScanNpc, scanRadius } from '../../exploration/partyScan.js'
import { canDismount, canDismountHorse, canMountHorse, horseById, isMounted } from '../../exploration/mount.js'
import { fishingSpotById, partyHasFishingRod } from '../../exploration/fishingSpots.js'
import { fishingScanId } from '../../exploration/partyScan.js'
import { challengeScanner, destructibleScanner, destructibleShooter, fishingPerformer, fishingScanner, groundItemScanner, npcButtonPerformer, ringPartyView } from '../../exploration/ringParty.js'
import { canAct } from '../../exploration/partyControl.js'
import { getEquippedItems } from '../../rules/equipment.js'
import { canReceiveItem, isSharedInstance, resolveItem } from '../../rules/inventory.js'
import { groundItemFor } from '../../world/GroundItem.js'
import itemsData from '../../data/adaptation/items.json'
import { getFaction } from '../../rules/factions.js'
import { conditionSummary, getProtection, isDefeated, normalizeCondition } from '../../rules/personalCondition.js'
import { destructibleScanCard, isDestructibleScanned } from '../../world/destructibleScan.js'

const NOT_BUILT = 'Not built yet.'

// Tooltip lines for a ring's Scan button after a successful scan (UnitActionRing button.details).
// Scan readings show only while hovering that pulsing button — never on the side card.
function infoToDetails(info) {
  if (!info) return []
  const rows = (info.rows ?? []).filter(Boolean).map(([label, value]) => `${label}: ${value}`)
  return [...rows, ...(info.tips ?? [])]
}

// Scan-hover payload builders (includeScan: true). Side cards use includeScan: false so readings stay on the button tip.

// A party member's radial menu (right-click; left-click only selects): Scan, Use, Switch, Search,
// First Aid, Attack, Inventory, Sneak and Beam Out, each for that character only. Use, Search, First Aid and Attack
// are shown but not built yet (they may later act on objects). Inventory replaced Interact (designer request, 2026-10-18).
// When mounted, Dismount is included (horse hit target is off while ridden so selection works like on foot).
// actions: { scan, switchTo, inventory, sneak, beamOut, dismount }.
export function memberMenuButtons(state, member, actions) {
  const up = !isDefeated(member.condition)
  const scan = canScan(state, member.id)
  const radius = scanRadius(member.character)
  const name = member.character.name
  const isOnlySelected = state.party.selectedIds.length === 1 && state.party.selectedIds[0] === member.id
  const mounted = Boolean(member.mounted)
  const canGetOff = mounted && canDismount(state, member.id)
  const unbuilt = (id, label, icon) => ({ id, label, icon, enabled: false, title: `${label}: ${NOT_BUILT}` })
  const buttons = [
    { id: 'scan', label: 'Scan', icon: 'scan', enabled: scan.possible, title: scan.possible ? `Scan (Reason + Science): location and environment, plus life signs and enemies within ${radius} tiles.` : `Scan: ${scan.reason}`, onClick: actions.scan },
    unbuilt('useItem', 'Use', 'useItem'),
    { id: 'switch', label: 'Switch', icon: 'switch', enabled: up && !isOnlySelected, title: `Switch to ${name}: select them and make them the lead.`, onClick: actions.switchTo },
    unbuilt('search', 'Search', 'search'),
    unbuilt('firstAid', 'First Aid', 'firstAid'),
    unbuilt('attack', 'Attack', 'attack'),
    {
      id: 'inventory',
      label: 'Inventory',
      icon: 'inventory',
      enabled: true,
      title: `Inventory: open ${name}'s carried gear (I).`,
      onClick: actions.inventory,
    },
    { id: 'sneak', label: 'Sneak', icon: 'sneak', enabled: up && !mounted, active: member.sneaking, title: mounted ? 'Sneak: dismount first.' : `Sneak: ${name} crouches and moves slowly, harder to notice.`, onClick: actions.sneak },
    {
      id: 'beamOut',
      label: 'Beam Out',
      icon: 'beamOut',
      enabled: !state.conversation,
      title: state.conversation ? 'Beam Out: not during a conversation.' : `Beam Out: ${name} beams up and leaves the mission. Once everyone has beamed out, the mission ends.`,
      onClick: actions.beamOut,
    },
  ]
  if (mounted) {
    const allSelected =
      state.party.memberIds.length > 0 &&
      state.party.memberIds.every((id) => state.party.selectedIds.includes(id))
    const teamOff = allSelected && member.id === state.party.leaderId
    buttons.splice(2, 0, {
      id: 'dismount',
      label: 'Dismount',
      icon: 'switch',
      enabled: Boolean(canGetOff && actions.dismount),
      title: canGetOff
        ? teamOff
          ? 'Dismount: the whole selected team climbs off.'
          : `Dismount: ${name} climbs off beside the horse.`
        : 'Dismount: not riding.',
      onClick: actions.dismount,
    })
  }
  return buttons
}

// A challenge object's radial menu (left click on it while in reach): Scan (Reason + Science, tricorder range), then one
// button per approach it offers now. actions: { open(actionId), scan(memberId) }; activeId: the approach the open panel
// is on (lit); pickedId: who is picked on the party band for Scan.
export function objectMenuButtons(state, objectId, actions, activeId = null, pickedId = null) {
  const challenge = challengeFor(state, objectId)
  if (!challenge) return []
  const view = challenge.view(state.scenario)
  const scanner = challengeScanner(state, objectId, pickedId)
  const scanned = isDestructibleScanned(state.objectScans, objectId)
  const canScanNow = Boolean(scanner?.check.possible)
  const scanTitle = scanned
    ? 'Scanned by the party — hover for tricorder readings.'
    : !scanner
      ? 'Scan: select a character first.'
      : canScanNow
        ? `${scanner.member.character.name} scans the ${view.name} (Reason + Science): read its current state.`
        : `Scan (${scanner.member.character.name}): ${scanner.check.reason}`
  const approaches = challenge.listedActions(state).map(({ action, available, reason }) => ({
    id: action.id,
    label: action.label,
    icon: action.icon ?? 'interact',
    enabled: available,
    active: action.id === activeId,
    title: available ? `${action.label}: ${action.description}` : reason,
    onClick: () => actions.open(action.id),
  }))
  return [
    {
      id: 'scan',
      label: 'Scan',
      icon: 'scan',
      enabled: scanned || canScanNow,
      pulse: scanned ? 'dim' : false,
      title: scanTitle,
      ...(scanned ? { details: infoToDetails(objectInfo(state, objectId, { includeScan: true })) } : {}),
      onClick: canScanNow ? () => actions.scan(scanner.member.id) : undefined,
      keepOpen: true,
    },
    ...approaches,
  ]
}

// Fishing Spot ring (left-click the ripple): Scan + Fish, with the party band above (like a challenge object).
// Fish arms the cast (pick a member, then Roll on the outer arc); Scan fires immediately.
// actions: { scan(memberId), fish() }; fishingAction: 'fish' when the cast is armed; pickedId: band pick.
export function fishingSpotMenuButtons(state, spotId, actions, pickedId = null, fishingAction = null) {
  const spot = fishingSpotById(state, spotId)
  if (!spot || spot.visible === false) return []
  const scanner = fishingScanner(state, spotId, pickedId)
  const scanned = isDestructibleScanned(state.objectScans, fishingScanId(spotId))
  const canScanNow = Boolean(scanner?.check.possible)
  const scanTitle = scanned
    ? 'Scanned by the party — hover for difficulty and catch notes.'
    : !scanner
      ? 'Scan: select a character first.'
      : canScanNow
        ? `${scanner.member.character.name} scans the fishing spot (Reason + Science).`
        : `Scan (${scanner.member.character.name}): ${scanner.check.reason}`
  const performer = fishingPerformer(state, spotId, pickedId)
  const check = performer?.check ?? { ok: false, reason: 'Select a character first.' }
  const hasRod = partyHasFishingRod(state)
  const canArm = Boolean(spot.fishable && hasRod && check.ok)
  const title = !spot.fishable
    ? 'Fish: this spot is not fishable.'
    : !hasRod
      ? 'Fish: no rod.'
      : fishingAction === 'fish'
        ? 'Fish: pick who casts, then Roll above them.'
        : canArm
          ? 'Fish: choose who casts from the shore (Fitness + Security).'
          : `Fish: ${check.reason}`
  return [
    {
      id: 'scan',
      label: 'Scan',
      icon: 'scan',
      enabled: scanned || canScanNow,
      pulse: scanned ? 'dim' : false,
      title: scanTitle,
      ...(scanned ? { details: infoToDetails(fishingSpotInfo(state, spotId, { includeScan: true })) } : {}),
      onClick: canScanNow ? () => actions.scan(scanner.member.id) : undefined,
      keepOpen: true,
    },
    {
      id: 'fish',
      label: 'Fish',
      icon: 'interact',
      enabled: canArm || fishingAction === 'fish',
      active: fishingAction === 'fish',
      title,
      keepOpen: true,
      onClick: () => actions.fish(),
      pulse: !fishingAction && canArm,
    },
  ]
}

// Card beside a Fishing Spot ring / Scan hover. includeScan: tricorder difficulty & catch (Scan button tip only).
export function fishingSpotInfo(state, spotId, { includeScan = false } = {}) {
  const spot = fishingSpotById(state, spotId)
  if (!spot) return null
  const scan = state.objectScans?.[fishingScanId(spotId)]
  const scanned = isDestructibleScanned(state.objectScans, fishingScanId(spotId))
  const rows = [['Type', 'Fishing Spot']]
  const tips = []
  if (includeScan && scanned) {
    rows.push(['Difficulty', String(spot.difficulty)])
    if (spot.catchPool?.length) {
      rows.push(['Catch', spot.catchPool.map((id) => id.replace(/^fish/, '')).join(', ')])
    }
    tips.push('Ripples mark fishable water. Cast from the shore with a fishing rod.')
    if (scan?.success) tips.push(`Scanned by ${state.party.members[scan.memberId]?.character.name ?? 'the away team'}.`)
  } else if (scan && !scan.success) {
    tips.push('Scan failed: no clear readings. Scan again to retry.')
  } else if (!scanned) {
    tips.push('Scan to learn how hard it is to catch here.')
  } else {
    tips.push('Hover Scan for tricorder readings.')
  }
  return { title: 'Fishing Spot', rows, tips }
}

// Card beside a challenge object's ring / Scan hover. includeScan: authored description (Scan button tip only).
export function objectInfo(state, objectId, { includeScan = false } = {}) {
  const challenge = challengeFor(state, objectId)
  if (!challenge) return null
  const view = challenge.view(state.scenario)
  const scan = state.objectScans?.[objectId]
  const scanned = isDestructibleScanned(state.objectScans, objectId)
  const rows = [
    ['Type', view.type ? view.type.charAt(0).toUpperCase() + view.type.slice(1) : 'Object'],
    ['State', view.stateLabel || view.state || '—'],
  ]
  const tips = []
  if (includeScan && scanned) {
    if (view.description) tips.push(view.description)
    if (scan?.success) tips.push(`Scanned by ${state.party.members[scan.memberId]?.character.name ?? 'the away team'}.`)
  } else if (scan && !scan.success) {
    tips.push('Scan failed: no clear readings. Scan again to retry.')
  } else if (!scanned) {
    tips.push('Scan for a tricorder reading of its current state.')
  } else {
    tips.push('Hover Scan for tricorder readings.')
  }
  return { title: view.name, rows, tips }
}

// A destructible object's radial menu (left click on it; designer request 2026-10-12): Fire, by the member picked on the
// band or else the best shot; Scan (designer request 2026-10-17: hazards and countermeasures); Sabotage and Defuse are
// shown but not built yet. fire(memberId) / scan(memberId) open those actions. After a success, Scan pulses and hover
// shows the reading — no second scan, no side card.
export function destructibleMenuButtons(state, objectId, actions, pickedId = null) {
  const record = state.environment.destructibles[objectId]
  const shooterId = destructibleShooter(state, objectId, pickedId)
  const preview = shooterId ? previewObjectShot(state, shooterId, objectId) : previewObjectShot(state, pickedId ?? state.party.selectedIds[0] ?? state.party.leaderId, objectId)
  const name = shooterId ? state.party.members[shooterId].character.name : null
  const blast = record.explosion ? ` It explodes at 0 Structure (radius ${record.explosion.radius}): everyone near it is caught.` : ''
  const fireTitle = shooterId
    ? `${name} fires at the ${record.name} (${preview.weapon.name}, Difficulty ${preview.prepared.difficulty}): ${preview.damage} Structure on a hit.${blast}`
    : `Fire: ${preview.reason ?? 'nobody has a shot.'}`
  const scanner = destructibleScanner(state, objectId, pickedId)
  const scanned = isDestructibleScanned(state.objectScans, objectId)
  const canScanNow = Boolean(scanner?.check.possible)
  const scanTitle = scanned
    ? 'Scanned by the party — hover for Structure, hazards and countermeasures.'
    : !scanner
      ? 'Scan: select a character first.'
      : canScanNow
        ? `${scanner.member.character.name} scans the ${record.name} (Reason + Science): the hazards it may release and how to counteract them.`
        : `Scan (${scanner.member.character.name}): ${scanner.check.reason}`
  const unbuilt = (id, label, icon) => ({ id, label, icon, enabled: false, title: `${label}: ${NOT_BUILT}` })
  return [
    { id: 'fire', label: 'Fire', icon: 'attack', enabled: Boolean(shooterId), title: fireTitle, onClick: () => actions.fire(shooterId) },
    {
      id: 'scan',
      label: 'Scan',
      icon: 'scan',
      enabled: scanned || canScanNow,
      pulse: scanned ? 'dim' : false,
      title: scanTitle,
      ...(scanned ? { details: infoToDetails(destructibleInfo(state, objectId, { includeScan: true })) } : {}),
      onClick: canScanNow ? () => actions.scan(scanner.member.id) : undefined,
      keepOpen: true,
    },
    unbuilt('sabotage', 'Sabotage', 'sabotage'),
    unbuilt('defuse', 'Defuse', 'defuse'),
  ]
}

// Destructible Structure card / Scan hover. includeScan: hazards and countermeasures (Scan tip only).
export function destructibleInfo(state, objectId, { includeScan = false } = {}) {
  const record = state.environment.destructibles[objectId]
  const scanned = isDestructibleScanned(state.objectScans, objectId)
  const card = destructibleScanCard(record, { scanned: includeScan && scanned })
  const scan = state.objectScans?.[objectId]
  if (includeScan && scan?.success) {
    card.tips.push(`Scanned by ${state.party.members[scan.memberId]?.character.name ?? 'the away team'}.`)
  } else if (scan && !scan.success) {
    card.tips.push('Scan failed: no clear readings. Scan again to retry.')
  } else if (scanned && !includeScan) {
    card.tips.push('Hover Scan for tricorder readings.')
  }
  return card
}

// The character who would scan this NPC: the one picked on the ring's party band when they can, else the selected
// characters (the lead first): the first who can, else the first of them with the reason.
// Returns { member, check } or null when nobody is picked or selected.
function npcScanner(state, npcId, pickedId = null) {
  const { party } = state
  if (pickedId && canScanNpc(state, pickedId, npcId).possible) return { member: party.members[pickedId], check: canScanNpc(state, pickedId, npcId) }
  const ids = [party.leaderId, ...party.selectedIds.filter((id) => id !== party.leaderId)].filter((id) => party.selectedIds.includes(id))
  if (!ids.length) return null
  const checks = ids.map((id) => ({ member: party.members[id], check: canScanNpc(state, id, npcId) }))
  return checks.find(({ check }) => check.possible) ?? checks[0]
}

const SOCIAL_TEXT = { persuade: { label: 'Persuade' }, intimidate: { label: 'Intimidate' } }

// An NPC's radial menu (left click on an NPC the party can see; designer requests 2026-10-09): Talk, when they have a
// conversation of their own or one by faction (out of reach, the selected characters walk over first); Scan (one
// selected character scans them); Info (a card beside the ring); Attack; Go To. Use Item and First Aid are shown but
// not built yet. Persuade and Intimidate left the ring when Talk gained the Klingon encounter (designer decision, Oct
// 2026): they are now options inside a conversation (conversationScope.js); partySocial.js keeps the rules and the
// cards keep showing what they did.
// actions: { talk, scan, info, attack, goTo }; infoOpen: whether the card is showing; pickedId:
// the member picked on the party band (they scan or ask when they can, and open fire; unpicked, the best does).
export function npcMenuButtons(state, npc, inTalkRange, infoOpen, actions, pickedId = null) {
  const up = !isDown(npc)
  const canTalk = controllerFor(npc).canTalk(npc)
  const talkTitle = !conversationIdFor(npc) ? `${npc.name} has nothing to say.` : !up ? `${npc.name} can't talk now.` : inTalkRange ? `Talk to ${npc.name}.` : `Walk over to ${npc.name} and talk.`
  const scanner = npcScanner(state, npc.id, pickedId)
  const scanned = Boolean(state.npcScans?.[npc.id]?.success)
  const canScanNow = Boolean(scanner?.check.possible)
  const scanTitle = scanned
    ? 'Scanned by the party — hover for condition, Protection and equipment.'
    : !scanner
      ? 'Scan: select a character first.'
      : canScanNow
        ? `${scanner.member.character.name} scans ${npc.name} (Reason + Science): condition and equipment.`
        : `Scan (${scanner.member.character.name}): ${scanner.check.reason}`
  const attacker = state.party.members[npcButtonPerformer(state, npc.id, 'attack', pickedId)]
  const unbuilt = (id, label, icon) => ({ id, label, icon, enabled: false, title: `${label}: ${NOT_BUILT}` })
  return [
    { id: 'talk', label: 'Talk', enabled: canTalk, icon: 'talk', title: talkTitle, onClick: actions.talk },
    {
      id: 'scan',
      label: 'Scan',
      icon: 'scan',
      enabled: scanned || canScanNow,
      pulse: scanned ? 'dim' : false,
      title: scanTitle,
      ...(scanned ? { details: infoToDetails(npcInfo(state, npc, { includeScan: true })) } : {}),
      onClick: canScanNow ? () => actions.scan(scanner.member.id) : undefined,
      keepOpen: true,
    },
    { id: 'info', label: 'Info', icon: 'info', enabled: true, active: infoOpen, title: infoOpen ? 'Hide what the party knows about them.' : `What the party knows about ${npc.name}.`, onClick: actions.info, keepOpen: true },
    unbuilt('useItem', 'Use Item', 'useItem'),
    unbuilt('firstAid', 'First Aid', 'firstAid'),
    { id: 'attack', label: 'Attack', icon: 'attack', enabled: up, title: !up ? `${npc.name} is down.` : attacker ? `Attack ${npc.name}: ${attacker.character.name} opens fire, starting a fight.` : `Attack ${npc.name}: starts a fight.`, onClick: actions.attack },
    { id: 'goTo', label: 'Go To', icon: 'move', enabled: true, title: `Walk the selected characters over to ${npc.name}.`, onClick: actions.goTo },
  ]
}

// The ring's party band (exploration/ringParty.js): each member's TN for the button last hovered, a star on the best,
// and the member picked to do the next action (clicking a slice picks or unpicks them).
// target: { objectId }, { npcId } or { destructibleId }; buttons: the ring's buttons; hoveredId: the button last hovered (null: none yet).
export function ringPartyBand(state, target, buttons, hoveredId, pickedId, onPick) {
  const button = buttons.find((candidate) => candidate.id === hoveredId) ?? null
  const view = ringPartyView(state, target, button?.id ?? null)
  const caption = !button ? 'Hover an action: who is best at it' : !view.hasTask ? `${button.label}: no roll to compare` : view.allTied ? `${button.label}: all equally suited` : `Best at ${button.label}`
  const slices = view.members.map((entry) => {
    const { character } = state.party.members[entry.id]
    const picked = entry.id === pickedId
    const odds = !view.hasTask
      ? null
      : entry.reason ?? (entry.possible ? `TN ${entry.targetNumber}, Difficulty ${entry.difficulty}, ${Math.round(entry.chance * 100)}% chance` : "Can't succeed.")
    const label = !view.hasTask ? null : !entry.available ? '-' : entry.possible ? `${entry.best ? '\u2605 ' : ''}TN ${entry.targetNumber}` : "Can't"
    return {
      id: entry.id,
      character,
      label,
      best: entry.best,
      picked,
      available: entry.available,
      title: [`${character.name}${odds ? `: ${odds}` : ''}`, picked ? 'Picked for the next action. Click to unpick.' : 'Click to pick them for the next action.'].join('\n'),
    }
  })
  return { caption, slices, onPick }
}
const AWARENESS_ORDER = [STATE.UNAWARE, STATE.SUSPICIOUS, STATE.INVESTIGATING, STATE.ALERTED, STATE.COMBAT_READY]

// Card beside an NPC's ring / Scan hover. includeScan: condition, Protection, equipment (Scan tip only).
export function npcInfo(state, npc, { includeScan = false } = {}) {
  const { character } = npc
  const factionName = (npc.faction && npc.faction !== character.faction?.id ? getFaction(npc.faction)?.name : character.faction?.name) ?? 'Unknown'
  const noticed = state.party.memberIds.map((id) => npc.awareness[id]?.state ?? STATE.UNAWARE).sort((a, b) => AWARENESS_ORDER.indexOf(b) - AWARENESS_ORDER.indexOf(a))[0]
  const rows = [
    ['Species', character.species?.name || 'Unknown'],
    ['Faction', factionName],
    ['Disposition', dispositionName(npc.disposition)],
    ['Noticed you', isDown(npc) ? 'Down' : stateName(noticed ?? STATE.UNAWARE)],
  ]
  const scan = state.npcScans?.[npc.id]
  const tips = []
  if (includeScan && scan?.success) {
    const condition = normalizeCondition(npc.condition)
    rows.push(['Condition', conditionSummary(character, condition) || 'Unhurt'])
    rows.push(['Protection', `Stun ${getProtection(character, { injuryType: 'stun' }).value} / Deadly ${getProtection(character, { injuryType: 'deadly' }).value}`])
    const gear = getEquippedItems(character).map((item) => item.name)
    rows.push(['Equipment', gear.length ? gear.join(', ') : 'None'])
    tips.push(`Scanned by ${state.party.members[scan.memberId]?.character.name ?? 'the away team'}.`)
    tips.push(`In a fight it starts scanned, with the trait ${SCAN_TRAIT.name}: your attacks on it are easier.`)
  } else if (scan && !scan.success) {
    tips.push('Scan failed: no clear readings. Scan again to retry.')
  } else if (scan?.success) {
    tips.push('Hover Scan for tricorder readings.')
  } else {
    tips.push('Scan them for their condition and equipment.')
  }
  const social = state.npcSocial?.[npc.id]
  if (social?.last) tips.unshift(socialResultText(state, npc, social.last))
  if (social?.intimidated) tips.push('Intimidated: in conversation, every check with them passes without a roll.')
  else if (social?.checkDifficulty) {
    const change = social.checkDifficulty
    tips.push(`${change < 0 ? 'Persuaded' : 'Angered'}: checks in conversation with them are ${change < 0 ? 'easier' : 'harder'} (Difficulty ${change > 0 ? '+' : ''}${change}).`)
  }
  return { title: npc.name, rows, tips }
}

// The latest Persuade / Intimidate on this NPC, for its card.
function socialResultText(state, npc, last) {
  const asker = state.party.members[last.memberId]?.character.name ?? 'The away team'
  const verb = SOCIAL_TEXT[last.kind].label
  const roll = last.set > 0 ? `${last.set} vs ${last.resistSuccesses}` : 'no successes'
  if (last.provoked) return `${verb} by ${asker} failed (${roll}): ${npc.name} attacks.`
  if (!last.passed) {
    const angrier = last.after !== last.before ? ` and is now ${dispositionName(last.after)}` : ''
    return `${verb} by ${asker} failed (${roll}): ${npc.name} refused${angrier}.`
  }
  const result = last.stoodDown ? 'stands down' : last.after !== last.before ? `is now ${dispositionName(last.after)}` : 'is unmoved'
  return `${verb} by ${asker} worked (${roll}): ${npc.name} ${result}.`
}

// A dropped inventory item's ring: Scan (catalogue reading), Pick Up, Go To.
// Out of reach, Pick Up walks over then picks up (same as a quick left-click on the prop).
// actions: { scan(memberId), pickup(memberId), goTo }; pickedId: who is picked on the party band for Scan.
export function groundItemMenuButtons(state, instanceId, actions, pickedId = null) {
  const item = groundItemFor(instanceId)
  const view = item.view(state)
  const name = view?.name ?? resolveItem(state, instanceId)?.def.name ?? 'Item'
  const pickable = view?.pickable !== false && state.groundItems?.[instanceId]?.pickable !== false
  const inPickupRange = item.membersInPickupRange(state)
  const orderedIds = [...new Set([state.party.leaderId, ...state.party.selectedIds])].filter(Boolean)
  const shared = isSharedInstance(state, instanceId)
  const fits = (id) => Boolean(state.party.members[id]) && canReceiveItem(state, id, instanceId)
  const pickerId =
    orderedIds.find((id) => inPickupRange.some((member) => member.id === id) && fits(id)) ??
    orderedIds.find((id) => fits(id)) ??
    null
  const picker = pickerId ? state.party.members[pickerId] : null
  const canGrabNow = Boolean(pickerId && inPickupRange.some((member) => member.id === pickerId))
  const canPick = pickable && Boolean(pickerId)
  const reason = !pickable
    ? 'This item cannot be picked up.'
    : !picker
      ? shared
        ? 'The party bag is full.'
        : 'Select a character with bag space first.'
      : canGrabNow
        ? `${picker.character.name} picks up the ${name}.`
        : `${picker.character.name} walks over and picks up the ${name}.`
  const scanner = groundItemScanner(state, instanceId, pickedId)
  const scanned = isDestructibleScanned(state.objectScans, instanceId)
  const canScanNow = Boolean(scanner?.check.possible)
  const scanTitle = scanned
    ? 'Scanned by the party — hover for catalogue readings.'
    : !scanner
      ? 'Scan: select a character first.'
      : canScanNow
        ? `${scanner.member.character.name} scans the ${name} (Reason + Science): identify it and read its catalogue entry.`
        : `Scan (${scanner.member.character.name}): ${scanner.check.reason}`
  return [
    {
      id: 'scan',
      label: 'Scan',
      icon: 'scan',
      enabled: scanned || canScanNow,
      pulse: scanned ? 'dim' : false,
      title: scanTitle,
      ...(scanned ? { details: infoToDetails(groundItemInfo(state, instanceId, { includeScan: true })) } : {}),
      onClick: canScanNow ? () => actions.scan(scanner.member.id) : undefined,
      keepOpen: true,
    },
    {
      id: 'pickup',
      label: 'Pick Up',
      icon: 'interact',
      enabled: canPick,
      title: reason,
      onClick: () => actions.pickup(pickerId),
    },
    {
      id: 'goTo',
      label: 'Go To',
      icon: 'move',
      enabled: true,
      title: `Walk to the ${name}.`,
      onClick: actions.goTo,
    },
  ]
}

// A horse's radial menu (left-click, same as NPCs): Ride, Dismount, Attack. Free horses show a neutral ground ring.
// Ride walks over when out of range (like Talk). Attack is a prototype remove (not STA combat).
// actions: { ride, dismount, attack }.
export function horseMenuButtons(state, horseId, actions) {
  const horse = horseById(state, horseId)
  if (!horse) return []
  const memberId = state.party.leaderId
  const member = state.party.members[memberId]
  const up = Boolean(member && canAct(member))
  const riddenByLead = horse.riderId === memberId
  const free = !horse.riderId
  const inRange = canMountHorse(state, memberId, horseId)
  const canRide = up && free && !isMounted(state, memberId)
  const canGetOff = up && canDismountHorse(state, memberId, horseId)
  const rideTitle = !up
    ? 'Ride: the lead cannot act.'
    : !free
      ? riddenByLead
        ? 'Ride: already mounted.'
        : 'Ride: someone else is on this horse.'
      : isMounted(state, memberId)
        ? 'Ride: dismount first.'
        : inRange
          ? 'Ride: climb on from beside the horse.'
          : 'Walk to the near side, then climb on.'
  const dismountTitle = !up
    ? 'Dismount: the lead cannot act.'
    : canGetOff
      ? 'Dismount: climb off onto the near side.'
      : 'Dismount: the lead is not riding this horse.'
  const attackTitle = !up
    ? 'Attack: the lead cannot act.'
    : 'Attack: shoot or scare the horse off (prototype — removes it).'
  return [
    {
      id: 'ride',
      label: 'Ride',
      icon: 'interact',
      enabled: canRide,
      title: rideTitle,
      onClick: actions.ride,
    },
    {
      id: 'dismount',
      label: 'Dismount',
      icon: 'switch',
      enabled: canGetOff,
      title: dismountTitle,
      onClick: actions.dismount,
    },
    {
      id: 'attack',
      label: 'Attack',
      icon: 'attack',
      enabled: up,
      title: attackTitle,
      onClick: actions.attack,
    },
  ]
}

// Card beside a ground item's ring / Scan hover. includeScan: catalogue description (Scan tip only).
export function groundItemInfo(state, instanceId, { includeScan = false } = {}) {
  const resolved = resolveItem(state, instanceId)
  const view = groundItemFor(instanceId).view(state)
  if (!view && !resolved) return null
  const name = view?.name ?? resolved?.def.name ?? 'Item'
  const categoryId = resolved?.def.category ?? null
  const category = categoryId ? itemsData.categories?.[categoryId] ?? categoryId : 'Item'
  const scan = state.objectScans?.[instanceId]
  const scanned = isDestructibleScanned(state.objectScans, instanceId)
  const rows = [['Category', category]]
  const tips = []
  if (includeScan && scanned) {
    if (resolved?.def.description) tips.push(resolved.def.description)
    if (scan?.success) tips.push(`Scanned by ${state.party.members[scan.memberId]?.character.name ?? 'the away team'}.`)
  } else if (scan && !scan.success) {
    tips.push('Scan failed: no clear readings. Scan again to retry.')
  } else if (!scanned) {
    tips.push('Scan for a tricorder reading of this item.')
  } else {
    tips.push('Hover Scan for tricorder readings.')
  }
  return { title: name, rows, tips }
}

