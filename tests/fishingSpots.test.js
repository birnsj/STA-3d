import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { preferredFoodsOf } from '../src/data/adaptation/exploration/ambientCreatures.js'
import {
  canFishAtSpot,
  canStartFishing,
  createFishingState,
  FISHING_PHASE,
  FISHING_ROD_ID,
  fishingReadyToRoll,
  fishingSkill,
  fishRoll,
  partyHasFishingRod,
  previewFishing,
  startFishing,
  tickFishing,
} from '../src/exploration/fishingSpots.js'
import { createMissionResources } from '../src/rules/missionResources.js'
import { createBlankMap, parseMapFile, serializeMap } from '../src/maps/mapFormat.js'
import { placeFishingSpot, updateFishingSpot } from '../src/maps/mapEdits.js'
import { emptyInventory, grantItemToMember, partyOwnsItemId } from '../src/rules/inventory.js'
import { getItemById } from '../src/rules/equipment.js'
import { createCondition } from '../src/rules/personalCondition.js'
import { makeCharacter } from './support/characters.js'

function openWater(map, x, y) {
  map.tiles[y][x] = 'water'
  if (x + 1 < map.width) map.tiles[y][x + 1] = 'floor'
  return map
}

function memberState({ rod = false, attributes, disciplines } = {}) {
  const inventory = emptyInventory()
  const itemInstances = {}
  const partyBag = []
  if (rod) {
    itemInstances.rod1 = { id: 'rod1', itemId: FISHING_ROD_ID, quantity: 1 }
    partyBag.push('rod1')
  }
  const character = makeCharacter({
    name: 'Lead',
    attributes: attributes ?? { fitness: 12, control: 8, daring: 8, insight: 8, presence: 8, reason: 8 },
    disciplines: disciplines ?? { security: 5, command: 1, conn: 1, engineering: 1, science: 1, medicine: 1 },
    focuses: ['Survival'],
    inventory,
  })
  return {
    world: { time: 0 },
    seed: 1,
    resources: createMissionResources(),
    scenario: { taskCount: 0, traits: [] },
    missionLog: { nextId: 1, entries: [] },
    party: {
      leaderId: 'lead',
      memberIds: ['lead'],
      members: {
        lead: {
          id: 'lead',
          position: { x: 5, y: 4 },
          moving: false,
          character,
          condition: createCondition(),
        },
      },
      map: null,
    },
    itemInstances,
    groundItems: {},
    partyInventory: { bag: partyBag },
  }
}

function spotState({ rod = true, catchPool = ['fishTrout'], difficulty = 0 } = {}) {
  let map = createBlankMap({ width: 12, height: 12 })
  map = openWater(map, 4, 4)
  const placed = placeFishingSpot(map, { x: 4, y: 4 })
  map = updateFishingSpot(placed.map, placed.spot.id, { catchPool, difficulty })
  const base = memberState({ rod })
  return {
    state: {
      ...base,
      fishing: createFishingState(map),
      party: { ...base.party, map },
    },
    spotId: placed.spot.id,
    map,
  }
}

const freePurchase = { bonusDice: 0, momentum: 0 }

describe('fishing spot map parse/serialize', () => {
  it('round-trips fishingSpots with catch pool', () => {
    let map = createBlankMap({ width: 12, height: 12 })
    map = openWater(map, 4, 4)
    const placed = placeFishingSpot(map, { x: 4, y: 4 })
    assert.ok(placed)
    map = updateFishingSpot(placed.map, placed.spot.id, {
      difficulty: 3,
      size: 1.5,
      catchPool: ['fishTrout', 'fishBass'],
    })
    const disk = serializeMap(map)
    assert.equal(disk.fishingSpots.length, 1)
    assert.deepEqual(disk.fishingSpots[0].position, [4, 4])
    assert.equal(disk.fishingSpots[0].difficulty, 3)
    assert.deepEqual(disk.fishingSpots[0].catchPool, ['fishTrout', 'fishBass'])
    const loaded = parseMapFile(disk)
    assert.equal(loaded.fishingSpots[0].id, placed.spot.id)
    assert.equal(loaded.fishingSpots[0].difficulty, 3)
    assert.equal(loaded.fishingSpots[0].size, 1.5)
  })
})

describe('fishing rod gate and dice catch', () => {
  it('requires a fishing rod in the party bag to start', () => {
    const { state: without, spotId } = spotState({ rod: false })
    without.party.members.lead.position = { x: 5, y: 4 }
    assert.equal(partyHasFishingRod(without), false)
    assert.equal(canFishAtSpot(without, spotId, 'lead').ok, true)
    assert.equal(canStartFishing(without, spotId, 'lead').ok, false)
    assert.equal(canStartFishing(without, spotId, 'lead').reason, 'no rod')

    const { state: withRod, spotId: rodSpot } = spotState({ rod: true })
    withRod.party.members.lead.position = { x: 5, y: 4 }
    assert.equal(partyHasFishingRod(withRod), true)
    assert.equal(canStartFishing(withRod, rodSpot, 'lead').ok, true)
  })

  it('Fish on shore marks ready for the dice window without rolling', () => {
    let { state, spotId } = spotState({ catchPool: ['fishTrout'], difficulty: 0 })
    state.party.members.lead.position = { x: 5, y: 4 }
    assert.equal(fishingReadyToRoll(state, spotId, 'lead'), true)
    state = startFishing(state, { spotId, memberId: 'lead' })
    assert.equal(state.fishing.spots[spotId].session?.ready, true)
    assert.equal(state.lastFishing, undefined)
    assert.ok(previewFishing(state, spotId, 'lead').possible)
  })

  it('a successful fishRoll grants a pool fish into the party bag and leaves the ripple', () => {
    assert.ok(getItemById('fishTrout')?.shared)
    let { state, spotId } = spotState({ catchPool: ['fishTrout'], difficulty: 0 })
    state.party.members.lead.position = { x: 5, y: 4 }
    state = fishRoll(state, { spotId, memberId: 'lead', purchase: freePurchase, rng: () => 0 })
    assert.equal(state.fishing.spots[spotId].phase, FISHING_PHASE.idle)
    assert.equal(state.fishing.spots[spotId].visible, true)
    assert.equal(state.lastFishing?.success, true)
    assert.equal(state.lastFishing?.granted, true)
    assert.ok(state.lastFishing?.result)
    assert.ok(partyOwnsItemId(state, 'fishTrout'))
    assert.ok(state.partyInventory.bag.some((id) => state.itemInstances[id]?.itemId === 'fishTrout'))
  })

  it('a failed fishRoll grants nothing and leaves the ripple', () => {
    const { state: base, spotId } = spotState({ catchPool: ['fishTrout'], difficulty: 5 })
    const weak = memberState({
      rod: true,
      attributes: { fitness: 7, control: 7, daring: 7, insight: 7, presence: 7, reason: 7 },
      disciplines: { security: 1, command: 1, conn: 1, engineering: 1, science: 1, medicine: 1 },
    })
    const state = {
      ...weak,
      fishing: base.fishing,
      party: {
        ...weak.party,
        map: base.party.map,
        members: { lead: { ...weak.party.members.lead, position: { x: 5, y: 4 } } },
      },
    }

    let sawFail = false
    for (let seed = 0; seed < 40 && !sawFail; seed += 1) {
      const attempt = fishRoll(
        { ...state, seed, scenario: { taskCount: 0, traits: [] } },
        { spotId, memberId: 'lead', purchase: freePurchase },
      )
      if (attempt.lastFishing && !attempt.lastFishing.success) {
        assert.equal(attempt.fishing.spots[spotId].phase, FISHING_PHASE.idle)
        assert.equal(partyOwnsItemId(attempt, 'fishTrout'), false)
        sawFail = true
      }
    }
    assert.ok(sawFail, 'expected at least one failed fishing roll across seeds')
  })

  it('walks to shore then becomes ready for the dice window', () => {
    let { state, spotId } = spotState({ catchPool: ['fishTrout'], difficulty: 0 })
    state.party.members.lead.position = { x: 8, y: 8 }
    assert.equal(fishingReadyToRoll(state, spotId, 'lead'), false)
    state = startFishing(state, { spotId, memberId: 'lead' })
    assert.equal(state.fishing.spots[spotId].phase, FISHING_PHASE.approaching)
    const approach = state.fishing.spots[spotId].session.approach
    state = {
      ...state,
      party: {
        ...state.party,
        members: {
          lead: { ...state.party.members.lead, position: { ...approach }, moving: false },
        },
      },
    }
    state = tickFishing(state)
    assert.equal(state.fishing.spots[spotId].session?.ready, true)
    assert.equal(fishingReadyToRoll(state, spotId, 'lead'), true)
    assert.equal(state.lastFishing, undefined)
  })

  it('gives up the approach when the angler stops short of the shore (blocked path)', () => {
    let { state, spotId } = spotState({ catchPool: ['fishTrout'], difficulty: 0 })
    state.party.members.lead.position = { x: 8, y: 8 }
    state = startFishing(state, { spotId, memberId: 'lead' })
    assert.equal(state.fishing.spots[spotId].phase, FISHING_PHASE.approaching)
    // Standing still, but only just after the order: still given time to start walking.
    state = { ...state, world: { ...state.world, time: 0.5 } }
    state = tickFishing(state)
    assert.equal(state.fishing.spots[spotId].phase, FISHING_PHASE.approaching)
    // Still short of the shore well after the order: abandoned, so the ring and other anglers are free again.
    state = { ...state, world: { ...state.world, time: 3 } }
    state = tickFishing(state)
    assert.equal(state.fishing.spots[spotId].phase, FISHING_PHASE.idle)
    assert.equal(state.fishing.spots[spotId].session, null)
    assert.equal(state.party.members.lead.fishing, undefined)
  })

  it('moveTo with memberIds walks that angler even when someone else is selected', async () => {
    const { partyReducer } = await import('../src/exploration/partyControl.js')
    let { state, spotId } = spotState({ catchPool: ['fishTrout'], difficulty: 0 })
    // Second party member is selected/leader; angler is not.
    state.party.members.lead.position = { x: 8, y: 8 }
    state.party.members.other = {
      ...state.party.members.lead,
      id: 'other',
      position: { x: 9, y: 9 },
      character: { ...state.party.members.lead.character, name: 'Other' },
    }
    state.party.memberIds = ['lead', 'other']
    state.party.leaderId = 'other'
    state.party.selectedIds = ['other']
    state = startFishing(state, { spotId, memberId: 'lead' })
    const approach = state.fishing.spots[spotId].session.approach
    const party = partyReducer(state.party, { type: 'moveTo', target: approach, fresh: true, memberIds: ['lead'] })
    assert.equal(party.members.lead.order?.type, 'point')
    assert.deepEqual(party.members.lead.order?.target, approach)
    assert.ok(!party.members.other.order)
  })
})

describe('fishing skill', () => {
  it('sums Fitness + Security', () => {
    assert.equal(fishingSkill({ attributes: { fitness: 10 }, disciplines: { security: 4 } }), 14)
  })
})

describe('grantItemToMember and preferredFoods', () => {
  it('grants shared fish into the party bag', () => {
    const state = memberState()
    const result = grantItemToMember(state, 'lead', 'fishMinnow')
    assert.equal(result.ok, true)
    assert.equal(result.state.itemInstances[result.instanceId].itemId, 'fishMinnow')
    assert.ok(result.state.partyInventory.bag.includes(result.instanceId))
  })

  it('loads cat preferred foods', () => {
    const foods = preferredFoodsOf('cat')
    assert.ok(foods.itemIds.includes('fishTrout'))
    assert.ok(foods.tags.includes('fish'))
    const chicken = preferredFoodsOf('chicken')
    assert.deepEqual(chicken.itemIds, [])
  })
})
