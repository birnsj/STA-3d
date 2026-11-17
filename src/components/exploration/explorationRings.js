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
import { canStartFishing, fishingSpotById, hasFishingRod } from '../../exploration/fishingSpots.js'
import { challengeScanner, destructibleScanner, destructibleShooter, groundItemScanner, npcButtonPerformer, ringPartyView } from '../../exploration/ringParty.js'
import { canAct } from '../../exploration/partyControl.js'
import { getEquippedItems } from '../../rules/equipment.js'
import { bagFreeSlots, resolveItem } from '../../rules/inventory.js'
import { groundItemFor } from '../../world/GroundItem.js'
import itemsData from '../../data/adaptation/items.json'
import { getFaction } from '../../rules/factions.js'
import { conditionSummary, getProtection, isDefeated, normalizeCondition } from '../../rules/personalCondition.js'
import { destructibleScanCard, isDestructibleScanned } from '../../world/destructibleScan.js'

const NOT_BUILT = 'Not built yet.'

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
  const scanTitle = !scanner
    ? 'Scan: select a character first.'
    : scanner.check.possible
      ? scanned
        ? `${scanner.member.character.name} scans the ${view.name} again (Reason + Science): refresh its readings.`
        : `${scanner.member.character.name} scans the ${view.name} (Reason + Science): read its current state.`
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
      enabled: Boolean(scanner?.check.possible),
      title: scanTitle,
      onClick: () => actions.scan(scanner.member.id),
      keepOpen: true,
    },
    ...approaches,
  ]
}

// Fishing Spot ring (left-click the ripple): Fish only — not started from the player ring.
// actions: { fish(memberId) }; pickedId: who is chosen on the party band.
export function fishingSpotMenuButtons(state, spotId, actions, pickedId = null) {
  const spot = fishingSpotById(state, spotId)
  if (!spot || !spot.visible) return []
  const member =
    (pickedId && state.party.members[pickedId] && canAct(state.party.members[pickedId]) ? state.party.members[pickedId] : null) ||
    state.party.members[state.party.leaderId]
  const memberId = member?.id
  const check = memberId ? canStartFishing(state, spotId, memberId) : { ok: false, reason: 'Select a character first.' }
  const hasRod = memberId ? hasFishingRod(state, memberId) : false
  const title = !spot.fishable
    ? 'Fish: this spot is not fishable.'
    : !hasRod
      ? `Fish: ${member?.character?.name ?? 'Character'} needs a fishing rod.`
      : check.ok
        ? `Fish: ${member.character.name} casts from the shore.`
        : `Fish: ${check.reason}`
  return [
    {
      id: 'fish',
      label: 'Fish',
      icon: 'interact',
      enabled: Boolean(check.ok),
      title,
      onClick: () => actions.fish(memberId),
    },
  ]
}

// The card beside a challenge object's ring: name / type / state always; authored description after a successful scan.
export function objectInfo(state, objectId) {
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
  if (scanned && view.description) tips.push(view.description)
  else if (!scanned) tips.push('Scan for a tricorder reading of its current state.')
  if (scan?.success) {
    tips.push(`Scanned by ${state.party.members[scan.memberId]?.character.name ?? 'the away team'}.`)
  } else if (scan) {
    tips.push('Scan failed: no clear readings. Scan again to retry.')
  }
  return { title: view.name, rows, tips }
}

// A destructible object's radial menu (left click on it; designer request 2026-10-12): Fire, by the member picked on the
// band or else the best shot; Scan (designer request 2026-10-17: hazards and countermeasures); Sabotage and Defuse are
// shown but not built yet. fire(memberId) / scan(memberId) open those actions.
// infoOpen: whether the Structure / hazards card beside the ring is showing (toggled by Scan once scanned).
export function destructibleMenuButtons(state, objectId, actions, pickedId = null, infoOpen = false) {
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
  const scanTitle = !scanner
    ? 'Scan: select a character first.'
    : !scanner.check.possible
      ? `Scan (${scanner.member.character.name}): ${scanner.check.reason}`
      : scanned
        ? infoOpen
          ? 'Hide the Structure and hazard card.'
          : 'Show the Structure and hazard card (Scan again to refresh readings).'
        : `${scanner.member.character.name} scans the ${record.name} (Reason + Science): the hazards it may release and how to counteract them.`
  const unbuilt = (id, label, icon) => ({ id, label, icon, enabled: false, title: `${label}: ${NOT_BUILT}` })
  return [
    { id: 'fire', label: 'Fire', icon: 'attack', enabled: Boolean(shooterId), title: fireTitle, onClick: () => actions.fire(shooterId) },
    {
      id: 'scan',
      label: 'Scan',
      icon: 'scan',
      enabled: Boolean(scanner?.check.possible) || scanned,
      active: infoOpen,
      title: scanTitle,
      onClick: () => {
        if (scanned) actions.toggleInfo()
        else if (scanner?.check.possible) actions.scan(scanner.member.id)
      },
      keepOpen: true,
    },
    unbuilt('sabotage', 'Sabotage', 'sabotage'),
    unbuilt('defuse', 'Defuse', 'defuse'),
  ]
}

// The card beside a destructible's ring: Structure always; hazards and countermeasures after a successful scan.
export function destructibleInfo(state, objectId) {
  const record = state.environment.destructibles[objectId]
  const card = destructibleScanCard(record, { scanned: isDestructibleScanned(state.objectScans, objectId) })
  const scan = state.objectScans?.[objectId]
  if (scan?.success) {
    card.tips.push(`Scanned by ${state.party.members[scan.memberId]?.character.name ?? 'the away team'}.`)
  } else if (scan) {
    card.tips.push('Scan failed: no clear readings. Scan again to retry.')
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
  const scanTitle = !scanner ? 'Scan: select a character first.' : scanner.check.possible ? `${scanner.member.character.name} scans ${npc.name} (Reason + Science): condition and equipment.` : `Scan (${scanner.member.character.name}): ${scanner.check.reason}`
  const attacker = state.party.members[npcButtonPerformer(state, npc.id, 'attack', pickedId)]
  const unbuilt = (id, label, icon) => ({ id, label, icon, enabled: false, title: `${label}: ${NOT_BUILT}` })
  return [
    { id: 'talk', label: 'Talk', icon: 'talk', enabled: canTalk, title: talkTitle, onClick: actions.talk },
    { id: 'scan', label: 'Scan', icon: 'scan', enabled: Boolean(scanner?.check.possible), title: scanTitle, onClick: () => actions.scan(scanner.member.id) },
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

// The card beside an NPC's ring: what the party can see, plus their condition and equipment once a scan has succeeded.
export function npcInfo(state, npc) {
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
  if (scan?.success) {
    const condition = normalizeCondition(npc.condition)
    rows.push(['Condition', conditionSummary(character, condition) || 'Unhurt'])
    rows.push(['Protection', `Stun ${getProtection(character, { injuryType: 'stun' }).value} / Deadly ${getProtection(character, { injuryType: 'deadly' }).value}`])
    const gear = getEquippedItems(character).map((item) => item.name)
    rows.push(['Equipment', gear.length ? gear.join(', ') : 'None'])
    tips.push(`Scanned by ${state.party.members[scan.memberId]?.character.name ?? 'the away team'}.`)
    tips.push(`In a fight it starts scanned, with the trait ${SCAN_TRAIT.name}: your attacks on it are easier.`)
  } else if (scan) {
    tips.push('Scan failed: no clear readings. Scan again to retry.')
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
  const pickerId =
    orderedIds.find((id) => inPickupRange.some((member) => member.id === id) && bagFreeSlots(state.party.members[id].character) > 0) ??
    orderedIds.find((id) => state.party.members[id] && bagFreeSlots(state.party.members[id].character) > 0) ??
    null
  const picker = pickerId ? state.party.members[pickerId] : null
  const canGrabNow = Boolean(pickerId && inPickupRange.some((member) => member.id === pickerId))
  const canPick = pickable && Boolean(pickerId)
  const reason = !pickable
    ? 'This item cannot be picked up.'
    : !picker
      ? 'Select a character with bag space first.'
      : bagFreeSlots(picker.character) < 1
        ? `${picker.character.name}'s bag is full.`
        : canGrabNow
          ? `${picker.character.name} picks up the ${name}.`
          : `${picker.character.name} walks over and picks up the ${name}.`
  const scanner = groundItemScanner(state, instanceId, pickedId)
  const scanned = isDestructibleScanned(state.objectScans, instanceId)
  const scanTitle = !scanner
    ? 'Scan: select a character first.'
    : scanner.check.possible
      ? scanned
        ? `${scanner.member.character.name} scans the ${name} again (Reason + Science): refresh its readings.`
        : `${scanner.member.character.name} scans the ${name} (Reason + Science): identify it and read its catalogue entry.`
      : `Scan (${scanner.member.character.name}): ${scanner.check.reason}`
  return [
    {
      id: 'scan',
      label: 'Scan',
      icon: 'scan',
      enabled: Boolean(scanner?.check.possible),
      title: scanTitle,
      onClick: () => actions.scan(scanner.member.id),
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

// The card beside a ground item's ring: name / category always; catalogue description after a successful scan.
export function groundItemInfo(state, instanceId) {
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
  if (scanned && resolved?.def.description) tips.push(resolved.def.description)
  else if (!scanned) tips.push('Scan for a tricorder reading of this item.')
  if (scan?.success) {
    tips.push(`Scanned by ${state.party.members[scan.memberId]?.character.name ?? 'the away team'}.`)
  } else if (scan) {
    tips.push('Scan failed: no clear readings. Scan again to retry.')
  }
  return { title: name, rows, tips }
}

