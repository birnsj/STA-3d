import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { preferredFoodsOf } from '../src/data/adaptation/exploration/ambientCreatures.js'
import {
  canStartFishing,
  catchFish,
  createFishingState,
  FISHING_PHASE,
  FISHING_ROD_ID,
  fishingSkill,
  hasFishingRod,
  pickRespawnTile,
  RESPAWN_SEARCH_RADIUS,
  rollFishingSplash,
  splashSecondsFor,
  startFishing,
  tickFishing,
  waitSecondsFor,
} from '../src/exploration/fishingSpots.js'
import { createMissionResources } from '../src/rules/missionResources.js'
import { createBlankMap, parseMapFile, serializeMap } from '../src/maps/mapFormat.js'
import { placeFishingSpot, updateFishingSpot } from '../src/maps/mapEdits.js'
import { emptyInventory, grantItemToMember } from '../src/rules/inventory.js'
import { getItemById } from '../src/rules/equipment.js'
import { createCondition } from '../src/rules/personalCondition.js'
import { makeCharacter } from './support/characters.js'

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

  it('respawns at the same tile after the timer when there is no other water to move to', () => {
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

function pondMap(waterCells) {
  const map = createBlankMap({ width: 30, height: 12 })
  for (const [x, y] of waterCells) map.tiles[y][x] = 'water'
  return map
}
const row = (from, to, y) => Array.from({ length: to - from + 1 }, (_, i) => [from + i, y])
const spotAt = (x, y) => ({ id: 's1', position: { x, y }, home: { x, y } })

describe('fishing skill and splash roll', () => {
  const spot = { id: 's1', difficulty: 2, size: 1, catchPool: ['fishTrout'] }

  it('Fitness + Security lengthens the Catch window', () => {
    const base = splashSecondsFor(spot)
    const weak = splashSecondsFor(spot, { attributes: { fitness: 7 }, disciplines: { security: 1 }, focuses: [] })
    const strong = splashSecondsFor(spot, { attributes: { fitness: 11 }, disciplines: { security: 5 }, focuses: ['Survival'] })
    assert.ok(weak < base)
    assert.ok(strong > base)
    assert.equal(fishingSkill({ attributes: { fitness: 10 }, disciplines: { security: 4 } }), 14)
  })

  it('a successful splash roll lengthens the window further and may save Momentum', () => {
    const member = {
      id: 'lead',
      condition: createCondition(),
      character: makeCharacter({
        name: 'Lead',
        attributes: { fitness: 12 },
        disciplines: { security: 5 },
        focuses: ['Survival'],
        inventory: emptyInventory(),
      }),
    }
    // Diff 0 always succeeds once the character can roll; seed is stable.
    const easy = { ...spot, difficulty: 0 }
    const state = {
      seed: 1,
      resources: createMissionResources(),
      scenario: { taskCount: 0, traits: [] },
      world: { time: 0 },
      missionLog: { nextId: 1, entries: [] },
    }
    const rolled = rollFishingSplash(state, member, easy)
    assert.equal(rolled.lastFishing.success, true)
    assert.ok(rolled.splashSeconds > splashSecondsFor(easy, member.character))
    assert.ok(rolled.catchEase > 1)
    assert.equal(rolled.state.lastFishing.success, true)
    assert.ok(rolled.state.resources.momentum >= state.resources.momentum)
  })

  it('a hard splash roll can fail and leave only the skill-scaled window', () => {
    const member = {
      id: 'lead',
      condition: createCondition(),
      character: makeCharacter({
        name: 'Lead',
        attributes: { fitness: 7, control: 7, daring: 7, insight: 7, presence: 7, reason: 7 },
        disciplines: { security: 1, command: 1, conn: 1, engineering: 1, science: 1, medicine: 1 },
      }),
    }
    const hard = { ...spot, difficulty: 5 }
    const base = splashSecondsFor(hard, member.character)
    // Try a few seeds; at least one failure is enough to prove the branch.
    let sawFail = false
    for (let seed = 0; seed < 40 && !sawFail; seed += 1) {
      const rolled = rollFishingSplash(
        { seed, resources: createMissionResources(), scenario: { taskCount: 0, traits: [] }, world: { time: 0 }, missionLog: { nextId: 1, entries: [] } },
        member,
        hard,
      )
      if (rolled.lastFishing && !rolled.lastFishing.success) {
        assert.equal(rolled.splashSeconds, base)
        sawFail = true
      }
    }
    assert.ok(sawFail, 'expected at least one failed fishing roll across seeds')
  })
})

describe('fishing ripple relocation', () => {
  it('moves to other water in the same pond, never staying on the tile it left', () => {
    const map = pondMap(row(3, 8, 4))
    const seen = new Set()
    for (let i = 0; i < 20; i += 1) {
      const tile = pickRespawnTile(spotAt(4, 4), map, () => i / 20)
      assert.equal(map.tiles[tile.y][tile.x], 'water')
      assert.notDeepEqual(tile, { x: 4, y: 4 })
      seen.add(`${tile.x},${tile.y}`)
    }
    assert.ok(seen.size > 1, 'rng chooses between several tiles')
  })

  it('is decided by rng', () => {
    const map = pondMap(row(3, 8, 4))
    const low = pickRespawnTile(spotAt(4, 4), map, () => 0)
    const high = pickRespawnTile(spotAt(4, 4), map, () => 0.999)
    assert.notDeepEqual(low, high)
  })

  it('never lands on a tile another ripple holds', () => {
    const map = pondMap(row(3, 5, 4))
    const tile = pickRespawnTile(spotAt(4, 4), map, () => 0, [{ x: 3, y: 4 }])
    assert.deepEqual(tile, { x: 5, y: 4 })
  })

  it('ignores a separate pond and water beyond the search radius', () => {
    const map = pondMap([...row(3, 4, 4), ...row(10, 12, 4), ...row(3 + RESPAWN_SEARCH_RADIUS + 3, 3 + RESPAWN_SEARCH_RADIUS + 5, 8)])
    for (let i = 0; i < 10; i += 1) {
      assert.deepEqual(pickRespawnTile(spotAt(4, 4), map, () => i / 10), { x: 3, y: 4 })
    }
    const long = pondMap(row(3, 25, 4))
    for (let i = 0; i < 10; i += 1) {
      const tile = pickRespawnTile(spotAt(3, 4), long, () => i / 10)
      assert.ok(tile.x <= 3 + RESPAWN_SEARCH_RADIUS, `x ${tile.x} stays within the radius`)
    }
  })

  it('skips water with no shore tile to cast from', () => {
    // A 3x3 block of water: only its edge cells touch dry land; the middle cell has no shore.
    const map = pondMap([...row(3, 5, 3), ...row(3, 5, 4), ...row(3, 5, 5)])
    for (let i = 0; i < 20; i += 1) {
      assert.notDeepEqual(pickRespawnTile(spotAt(3, 3), map, () => i / 20), { x: 4, y: 4 })
    }
  })

  it('falls back to home when nothing else qualifies, and to its position when home is no longer water', () => {
    const lone = pondMap([[4, 4]])
    assert.deepEqual(pickRespawnTile(spotAt(4, 4), lone, () => 0.5), { x: 4, y: 4 })
    const drained = pondMap([])
    const spot = { id: 's1', position: { x: 6, y: 6 }, home: { x: 4, y: 4 } }
    assert.deepEqual(pickRespawnTile(spot, drained, () => 0.5), { x: 6, y: 6 })
  })

  it('relocates when the timer ends, and stays hidden at its old tile until then', () => {
    let map = pondMap(row(3, 8, 4))
    const placed = placeFishingSpot(map, { x: 4, y: 4 })
    map = updateFishingSpot(placed.map, placed.spot.id, { respawnSeconds: 10, difficulty: 0 })
    const id = placed.spot.id
    let state = {
      ...memberState({ rod: true }),
      fishing: createFishingState(map),
      party: { ...memberState({ rod: true }).party, map },
      world: { time: 0 },
    }
    state.party.members.lead.position = { x: 4, y: 3 }
    state = startFishing(state, { spotId: id, memberId: 'lead' })
    state = tickFishing(state, waitSecondsFor(state.fishing.spots[id]) + 0.05)
    state = tickFishing(state, 30)
    assert.equal(state.fishing.spots[id].phase, FISHING_PHASE.depleted)
    assert.deepEqual(state.fishing.spots[id].position, { x: 4, y: 4 })
    state = { ...state, world: { ...state.world, time: 100 } }
    state = tickFishing(state, 0.1, () => 0)
    const spot = state.fishing.spots[id]
    assert.equal(spot.phase, FISHING_PHASE.idle)
    assert.equal(spot.visible, true)
    assert.notDeepEqual(spot.position, { x: 4, y: 4 })
    assert.equal(map.tiles[spot.position.y][spot.position.x], 'water')
    assert.deepEqual(spot.home, { x: 4, y: 4 })
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
