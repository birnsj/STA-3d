import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { preferredFoodsOf } from '../src/data/adaptation/exploration/ambientCreatures.js'
import {
  canStartFishing,
  catchFish,
  createFishingState,
  FISHING_PHASE,
  FISHING_ROD_ID,
  hasFishingRod,
  startFishing,
  tickFishing,
  waitSecondsFor,
} from '../src/exploration/fishingSpots.js'
import { createBlankMap, parseMapFile, serializeMap } from '../src/maps/mapFormat.js'
import { placeFishingSpot, updateFishingSpot } from '../src/maps/mapEdits.js'
import { emptyInventory, grantItemToMember } from '../src/rules/inventory.js'
import { getItemById } from '../src/rules/equipment.js'
import { createCondition } from '../src/rules/personalCondition.js'

function openWater(map, x, y) {
  map.tiles[y][x] = 'water'
  // Shore tile beside it
  if (x + 1 < map.width) map.tiles[y][x + 1] = 'floor'
  return map
}

function memberState({ rod = false } = {}) {
  const inventory = emptyInventory()
  const itemInstances = {}
  if (rod) {
    itemInstances.rod1 = { id: 'rod1', itemId: FISHING_ROD_ID, quantity: 1 }
    inventory.bag = ['rod1']
  }
  return {
    world: { time: 0 },
    party: {
      leaderId: 'lead',
      memberIds: ['lead'],
      members: {
        lead: {
          id: 'lead',
          position: { x: 5, y: 4 },
          moving: false,
          character: {
            name: 'Lead',
            equipment: [],
            inventory,
          },
          condition: createCondition(),
        },
      },
      map: null,
    },
    itemInstances,
    groundItems: {},
  }
}

describe('fishing spot map parse/serialize', () => {
  it('round-trips fishingSpots with catch pool', () => {
    let map = createBlankMap({ width: 12, height: 12 })
    map = openWater(map, 4, 4)
    const placed = placeFishingSpot(map, { x: 4, y: 4 })
    assert.ok(placed)
    map = updateFishingSpot(placed.map, placed.spot.id, {
      difficulty: 3,
      size: 1.5,
      respawnSeconds: 30,
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

describe('fishing rod gate and catch', () => {
  it('requires a fishing rod to start', () => {
    let map = createBlankMap({ width: 12, height: 12 })
    map = openWater(map, 4, 4)
    const placed = placeFishingSpot(map, { x: 4, y: 4 })
    map = placed.map
    const fishing = createFishingState(map)
    const without = { ...memberState({ rod: false }), fishing, party: { ...memberState().party, map } }
    without.party.members.lead.position = { x: 5, y: 4 }
    assert.equal(hasFishingRod(without, 'lead'), false)
    assert.equal(canStartFishing(without, placed.spot.id, 'lead').ok, false)

    const withRod = { ...memberState({ rod: true }), fishing, party: { ...memberState({ rod: true }).party, map } }
    withRod.party.members.lead.position = { x: 5, y: 4 }
    assert.equal(hasFishingRod(withRod, 'lead'), true)
    assert.equal(canStartFishing(withRod, placed.spot.id, 'lead').ok, true)
  })

  it('catch during splash grants a pool fish', () => {
    assert.ok(getItemById('fishTrout'))
    let map = createBlankMap({ width: 12, height: 12 })
    map = openWater(map, 4, 4)
    const placed = placeFishingSpot(map, { x: 4, y: 4 })
    map = updateFishingSpot(placed.map, placed.spot.id, { catchPool: ['fishTrout'], difficulty: 0 })
    let state = {
      ...memberState({ rod: true }),
      fishing: createFishingState(map),
      party: { ...memberState({ rod: true }).party, map },
      world: { time: 0 },
    }
    state.party.members.lead.position = { x: 5, y: 4 }
    state = startFishing(state, { spotId: placed.spot.id, memberId: 'lead' })
    assert.equal(state.fishing.spots[placed.spot.id].phase, FISHING_PHASE.waiting)
    const wait = waitSecondsFor(state.fishing.spots[placed.spot.id])
    state = tickFishing(state, wait + 0.05)
    assert.equal(state.fishing.spots[placed.spot.id].phase, FISHING_PHASE.splash)
    state = catchFish(state, { spotId: placed.spot.id, rng: () => 0 })
    assert.equal(state.fishing.spots[placed.spot.id].phase, FISHING_PHASE.depleted)
    const bag = state.party.members.lead.character.inventory.bag.filter(Boolean)
    assert.ok(bag.some((id) => state.itemInstances[id]?.itemId === 'fishTrout'))
  })

  it('splash timeout depletes without a grant', () => {
    let map = createBlankMap({ width: 12, height: 12 })
    map = openWater(map, 4, 4)
    const placed = placeFishingSpot(map, { x: 4, y: 4 })
    map = updateFishingSpot(placed.map, placed.spot.id, { difficulty: 0, size: 2 })
    let state = {
      ...memberState({ rod: true }),
      fishing: createFishingState(map),
      party: { ...memberState({ rod: true }).party, map },
      world: { time: 0 },
    }
    state.party.members.lead.position = { x: 5, y: 4 }
    state = startFishing(state, { spotId: placed.spot.id, memberId: 'lead' })
    state = tickFishing(state, waitSecondsFor(state.fishing.spots[placed.spot.id]) + 0.05)
    assert.equal(state.fishing.spots[placed.spot.id].phase, FISHING_PHASE.splash)
    state = tickFishing(state, 30)
    assert.equal(state.fishing.spots[placed.spot.id].phase, FISHING_PHASE.depleted)
    assert.equal(state.fishing.spots[placed.spot.id].visible, false)
    const fishCount = Object.values(state.itemInstances).filter((entry) =>
      ['fishMinnow', 'fishTrout', 'fishSalmon', 'fishBass'].includes(entry.itemId),
    ).length
    assert.equal(fishCount, 0)
  })

  it('respawns at the same tile after the timer', () => {
    let map = createBlankMap({ width: 12, height: 12 })
    map = openWater(map, 4, 4)
    const placed = placeFishingSpot(map, { x: 4, y: 4 })
    map = updateFishingSpot(placed.map, placed.spot.id, { respawnSeconds: 10, difficulty: 0 })
    let state = {
      ...memberState({ rod: true }),
      fishing: createFishingState(map),
      party: { ...memberState({ rod: true }).party, map },
      world: { time: 0 },
    }
    state.party.members.lead.position = { x: 5, y: 4 }
    state = startFishing(state, { spotId: placed.spot.id, memberId: 'lead' })
    state = tickFishing(state, waitSecondsFor(state.fishing.spots[placed.spot.id]) + 0.05)
    state = tickFishing(state, 30)
    assert.equal(state.fishing.spots[placed.spot.id].phase, FISHING_PHASE.depleted)
    state = { ...state, world: { ...state.world, time: 100 } }
    state = tickFishing(state, 0.1)
    assert.equal(state.fishing.spots[placed.spot.id].phase, FISHING_PHASE.idle)
    assert.equal(state.fishing.spots[placed.spot.id].visible, true)
    assert.deepEqual(state.fishing.spots[placed.spot.id].position, { x: 4, y: 4 })
  })
})

describe('grantItemToMember and preferredFoods', () => {
  it('grants into the bag', () => {
    const state = memberState()
    const result = grantItemToMember(state, 'lead', 'fishMinnow')
    assert.equal(result.ok, true)
    assert.equal(result.state.itemInstances[result.instanceId].itemId, 'fishMinnow')
  })

  it('loads cat preferred foods', () => {
    const foods = preferredFoodsOf('cat')
    assert.ok(foods.itemIds.includes('fishTrout'))
    assert.ok(foods.tags.includes('fish'))
    const chicken = preferredFoodsOf('chicken')
    assert.deepEqual(chicken.itemIds, [])
  })
})
