// The away team on the outer ring of an NPC's or a challenge object's radial menu (designer request 2026-10-11): who
// could do the button last hovered and who is best at it, from the same recommendation the panels use. Only members
// within interact range of the object or NPC appear on the band (designer 2026-10-16).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import brigFile from '../maps/Deck 10 Brig.json'
import { createExplorationState } from '../src/exploration/explorationState.js'
import { npcButtonPerformer, ringPartyView } from '../src/exploration/ringParty.js'
import { createBlankMap, parseMapFile } from '../src/maps/mapFormat.js'
import { objectFor } from '../src/world/objects.js'
import { makeCharacter } from './support/characters.js'
import { withFallbackNpcs } from './support/fallbackNpcs.js'

const scientist = (id, equipment) => makeCharacter({ id, name: id, attributes: { reason: 12 }, disciplines: { science: 5 }, equipment })

// Party stands next to the NPC so they are on its ring band (interact range is 2 tiles).
function npcState() {
  const map = createBlankMap({ name: 'Ring Test Room', width: 16, height: 12 })
  map.markers.playerStarts = [
    { x: 9, y: 6 },
    { x: 9, y: 7 },
  ]
  map.markers.enemySpawns = [{ x: 10, y: 6 }]
  withFallbackNpcs(map)
  return createExplorationState(map, [scientist('alpha', [{ itemId: 'scienceTricorder' }]), scientist('beta', [])], 1, { enemiesActive: false })
}

const byId = (view) => Object.fromEntries(view.members.map((member) => [member.id, member]))

describe('Ring party band (Prototype)', () => {
  it('NPC Scan: only those in range appear; among them, only those who can scan are judged; the best gets the star', () => {
    const state = npcState()
    const npcId = Object.keys(state.world.npcs)[0]
    const view = ringPartyView(state, { npcId }, 'scan')
    const { alpha, beta } = byId(view)
    assert.equal(view.members.length, 2)
    assert.equal(view.hasTask, true)
    assert.equal(alpha.available, true)
    assert.equal(alpha.possible, true)
    assert.equal(typeof alpha.targetNumber, 'number')
    assert.equal(alpha.best, true)
    assert.equal(beta.available, false)
    assert.equal(beta.reason, 'Carries no tricorder.')
    assert.equal(beta.targetNumber, null)
  })

  it('NPC band omits members out of interact range', () => {
    const state = npcState()
    const npcId = Object.keys(state.world.npcs)[0]
    const far = { ...state.party.members.beta, position: { x: 1, y: 1 } }
    const moved = { ...state, party: { ...state.party, members: { ...state.party.members, beta: far } } }
    const view = ringPartyView(moved, { npcId }, 'scan')
    assert.deepEqual(
      view.members.map((member) => member.id),
      ['alpha'],
    )
  })

  it('Info, Go To, Use Item and no button hovered: no comparison; only in-range members listed', () => {
    const state = npcState()
    const npcId = Object.keys(state.world.npcs)[0]
    for (const buttonId of ['info', 'goTo', 'useItem', null]) {
      const view = ringPartyView(state, { npcId }, buttonId)
      assert.equal(view.hasTask, false, String(buttonId))
      assert.equal(view.members.length, 2)
      assert.ok(view.members.every((member) => member.available && member.targetNumber === null && !member.best))
    }
  })

  it('Talk ranks on Presence + Command and Attack on Control + Security; the pick, else the best, performs', () => {
    const map = createBlankMap({ name: 'Ring Test Room', width: 16, height: 12 })
    map.markers.playerStarts = [
      { x: 9, y: 6 },
      { x: 9, y: 7 },
    ]
    map.markers.enemySpawns = [{ x: 10, y: 6 }]
    withFallbackNpcs(map)
    const talker = makeCharacter({ id: 'talker', name: 'Talker', attributes: { presence: 12, control: 7 }, disciplines: { command: 5, security: 1 } })
    const shooter = makeCharacter({ id: 'shooter', name: 'Shooter', attributes: { presence: 7, control: 12 }, disciplines: { command: 1, security: 5 } })
    const state = createExplorationState(map, [talker, shooter], 1, { enemiesActive: false })
    const npcId = Object.keys(state.world.npcs)[0]
    assert.deepEqual(ringPartyView(state, { npcId }, 'talk').bestIds, ['talker'])
    assert.deepEqual(ringPartyView(state, { npcId }, 'attack').bestIds, ['shooter'])
    assert.equal(npcButtonPerformer(state, npcId, 'attack'), 'shooter')
    assert.equal(npcButtonPerformer(state, npcId, 'attack', 'talker'), 'talker')
  })

  it('object approach: members out of reach are omitted; the rest match the object recommendation', () => {
    const team = [
      makeCharacter({ id: 'alpha', name: 'Alpha', attributes: { control: 11, reason: 10 }, disciplines: { engineering: 4 }, equipment: [{ itemId: 'engineeringToolkit' }] }),
      makeCharacter({ id: 'beta', name: 'Beta', attributes: { daring: 11 }, disciplines: { security: 4 } }),
      makeCharacter({ id: 'gamma', name: 'Gamma', attributes: { reason: 11 }, disciplines: { science: 4 } }),
    ]
    const start = createExplorationState(parseMapFile({ ...brigFile, objectPlacements: {} }, 'Deck 10 Brig'), team, 3, { enemiesActive: false })
    const definition = start.scenario.definitions.find((candidate) => candidate.actions.some((action) => !action.routine))
    const action = definition.actions.find((candidate) => !candidate.routine)
    const [x, y] = definition.position
    const spots = { alpha: { x: x + 1, y }, beta: { x: x + 30, y: y + 30 }, gamma: { x, y: y + 1 } }
    const members = Object.fromEntries(start.party.memberIds.map((id) => [id, { ...start.party.members[id], position: spots[id] }]))
    const state = { ...start, party: { ...start.party, members } }

    const view = ringPartyView(state, { objectId: definition.id }, action.id)
    const expected = objectFor(state.scenario, definition.id).recommend(state, action.id, ['alpha', 'gamma'])
    const entries = byId(view)
    assert.equal(view.hasTask, true)
    assert.equal(entries.beta, undefined)
    assert.deepEqual(
      view.members.map((member) => member.id).sort(),
      ['alpha', 'gamma'],
    )
    for (const id of ['alpha', 'gamma']) {
      assert.equal(entries[id].available, true)
      assert.equal(entries[id].targetNumber, expected.entries[id].targetNumber)
      assert.equal(entries[id].best, expected.bestIds.includes(id))
    }
  })

  it('Fish ranks the party on Fitness + Security when the party has a rod', () => {
    const map = createBlankMap({ name: 'Fish Ring', width: 12, height: 12 })
    map.tiles[4][4] = 'water'
    map.tiles[4][5] = 'floor'
    map.markers.playerStarts = [
      { x: 5, y: 4 },
      { x: 5, y: 5 },
    ]
    map.fishingSpots = [{ id: 'pond', position: { x: 4, y: 4 }, difficulty: 2, size: 1, fishable: true }]
    const angler = makeCharacter({
      id: 'alpha',
      name: 'alpha',
      attributes: { fitness: 12 },
      disciplines: { security: 5 },
    })
    const other = makeCharacter({ id: 'beta', name: 'beta', attributes: { fitness: 7 }, disciplines: { security: 1 } })
    let state = createExplorationState(map, [angler, other], 1, { enemiesActive: false })
    // The rod sits in the party bag, not on any one member.
    state = {
      ...state,
      itemInstances: { ...state.itemInstances, rod1: { id: 'rod1', itemId: 'fishingRod', quantity: 1 } },
      partyInventory: { bag: [...state.partyInventory.bag, 'rod1'] },
    }
    const spotId = Object.keys(state.fishing.spots)[0]
    assert.ok(spotId)
    const view = ringPartyView(state, { fishingId: spotId }, 'fish')
    assert.equal(view.hasTask, true)
    const entries = byId(view)
    assert.equal(entries.alpha?.available, true)
    assert.equal(entries.alpha?.best, true)
    // Rod is party-shared: beta can Fish as well as alpha.
    assert.equal(entries.beta?.available, true)
    assert.equal(entries.beta?.best, false)
  })
})
