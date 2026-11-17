import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  catCoatForSpawnIndex,
  normalizeCatCoatId,
  normalizeChickenCoatId,
  normalizeHorseCoatId,
} from '../src/data/adaptation/exploration/animalCoats.js'
import {
  createAmbientState,
  tickAmbientAnimals,
} from '../src/exploration/ambientAnimals.js'
import { createMountState, tickUnmountedHorseRoam } from '../src/exploration/mount.js'
import {
  getRoamProfile,
  parseRoam,
  resolveAuthoredRoam,
  serializeRoam,
  tickRoam,
  walkSpeedFor,
} from '../src/exploration/roam.js'
import { createBlankMap, parseMapFile, serializeMap } from '../src/maps/mapFormat.js'
import { toggleMarker, updateSpawnMarker } from '../src/maps/mapEdits.js'

function openFloor(map, inset = 1) {
  for (let y = inset; y < map.height - inset; y++) {
    for (let x = inset; x < map.width - inset; x++) map.tiles[y][x] = 'floor'
  }
  return map
}

describe('roam profiles', () => {
  it('exposes human, horse, and chicken with different walk speeds', () => {
    assert.ok(getRoamProfile('human').walkSpeed > getRoamProfile('horse').walkSpeed)
    assert.ok(getRoamProfile('chicken').walkSpeed > getRoamProfile('human').walkSpeed)
    assert.ok(Math.abs(walkSpeedFor('chicken', 1) - getRoamProfile('chicken').walkSpeed) < 1e-9)
    assert.ok(Math.abs(walkSpeedFor('human', 2) - getRoamProfile('human').walkSpeed * 2) < 1e-9)
  })

  it('resolves legacy patrol to waypointPatrol and empty to idle', () => {
    assert.equal(resolveAuthoredRoam(null, { patrol: [{ at: { x: 1, y: 1 }, wait: 1 }] }).mode, 'waypointPatrol')
    assert.equal(resolveAuthoredRoam(null).mode, 'idle')
    assert.equal(resolveAuthoredRoam({ mode: 'radiusWander', radius: 4 }).radius, 4)
  })
})

describe('radius wander', () => {
  it('keeps the actor inside the authored radius of home', () => {
    const map = openFloor(createBlankMap({ width: 20, height: 20 }))
    const home = { position: { x: 10, y: 10 }, heading: 0 }
    const roam = { mode: 'radiusWander', radius: 3 }
    let position = { ...home.position }
    let heading = 0
    let runtime = null
    let rngCalls = 0
    const rng = () => {
      rngCalls += 1
      return (rngCalls % 10) / 10
    }
    for (let i = 0; i < 200; i++) {
      const result = tickRoam({
        home,
        map,
        profileId: 'chicken',
        roam,
        runtime,
        position,
        heading,
        seconds: 0.2,
        rng,
      })
      position = result.position
      heading = result.heading
      runtime = result.roamRuntime
      const dist = Math.hypot(position.x - home.position.x, position.y - home.position.y)
      assert.ok(dist <= 3.6)
    }
  })
})

describe('horse and chicken map round-trip', () => {
  it('keeps legacy horse spawns idle with no roam on disk', () => {
    let map = createBlankMap({ width: 12, height: 12 })
    map = toggleMarker(map, 'horseSpawns', { x: 3, y: 3 })
    const disk = serializeMap(map)
    assert.deepEqual(disk.markers.horseSpawns[0], [3, 3])
    const loaded = parseMapFile(disk)
    assert.equal(loaded.markers.horseSpawns[0].roam, undefined)
    const mount = createMountState(loaded)
    assert.equal(mount.horses[0].roam.mode, 'idle')
  })

  it('round-trips chicken spawn with default wander roam', () => {
    let map = createBlankMap({ width: 12, height: 12 })
    map = toggleMarker(map, 'chickenSpawns', { x: 4, y: 5 })
    assert.equal(map.markers.chickenSpawns[0].roam.mode, 'radiusWander')
    const disk = serializeMap(map)
    assert.equal(disk.markers.chickenSpawns[0].roam.mode, 'radiusWander')
    const loaded = parseMapFile(disk)
    assert.equal(loaded.markers.chickenSpawns[0].roam.mode, 'radiusWander')
    const ambient = createAmbientState(loaded)
    assert.equal(ambient.animals[0].creatureId, 'chicken')
    assert.equal(ambient.animals[0].roam.mode, 'radiusWander')
  })

  it('lets an author enable horse wander', () => {
    let map = openFloor(createBlankMap({ width: 16, height: 16 }))
    map = toggleMarker(map, 'horseSpawns', { x: 8, y: 8 })
    map = updateSpawnMarker(map, 'horseSpawns', { x: 8, y: 8 }, { roam: { mode: 'radiusWander', radius: 2 } })
    const mount = createMountState(map)
    let state = { mount, world: { map, time: 0 }, party: { members: {} } }
    const start = { ...mount.horses[0].position }
    for (let i = 0; i < 40; i++) {
      state = tickUnmountedHorseRoam(state, map, 0.25)
    }
    const horse = state.mount.horses[0]
    const moved = Math.hypot(horse.position.x - start.x, horse.position.y - start.y)
    assert.ok(moved > 0.05)
  })

  it('ticks ambient chickens without Spike3d', () => {
    let map = openFloor(createBlankMap({ width: 16, height: 16 }))
    map = toggleMarker(map, 'chickenSpawns', { x: 8, y: 8 })
    let state = { ambient: createAmbientState(map), party: { memberIds: [], members: {} } }
    const start = { ...state.ambient.animals[0].position }
    for (let i = 0; i < 40; i++) {
      state = tickAmbientAnimals(state, map, 0.25)
    }
    const animal = state.ambient.animals[0]
    const moved = Math.hypot(animal.position.x - start.x, animal.position.y - start.y)
    assert.ok(moved > 0.05)
  })

  it('scatters chickens when a party member runs at them', () => {
    let map = openFloor(createBlankMap({ width: 20, height: 20 }))
    map = toggleMarker(map, 'chickenSpawns', { x: 10, y: 10 })
    let state = {
      ambient: createAmbientState(map),
      party: {
        memberIds: ['lead'],
        members: {
          lead: {
            id: 'lead',
            position: { x: 10.4, y: 10.2 },
            running: true,
            pace: { x: 4, y: 0 },
            condition: null,
          },
        },
      },
    }
    const start = { ...state.ambient.animals[0].position }
    let rng = 0
    const nextRng = () => {
      rng += 1
      return (rng % 7) / 7
    }
    for (let i = 0; i < 12; i++) {
      state = tickAmbientAnimals(state, map, 0.1, nextRng)
    }
    const animal = state.ambient.animals[0]
    const away = Math.hypot(
      animal.position.x - state.party.members.lead.position.x,
      animal.position.y - state.party.members.lead.position.y,
    )
    const fromStart = Math.hypot(animal.position.x - start.x, animal.position.y - start.y)
    assert.ok(fromStart > 0.4)
    assert.ok(away > 0.8)
    assert.ok(animal.scatter || fromStart > 1)
  })
})

describe('ambient dirty-skip and coats', () => {
  it('keeps ambient state identity while an idle chicken only advances roamRuntime', () => {
    let map = openFloor(createBlankMap({ width: 16, height: 16 }))
    map = toggleMarker(map, 'chickenSpawns', { x: 8, y: 8 })
    let state = {
      ambient: createAmbientState(map),
      party: { memberIds: [], members: {} },
    }
    state.ambient.animals[0].roam = { mode: 'idle' }
    state.ambient.animals[0].roamRuntime = null
    let sameAmbient = 0
    for (let i = 0; i < 20; i++) {
      const prev = state.ambient
      state = tickAmbientAnimals(state, map, 0.033)
      if (state.ambient === prev) sameAmbient += 1
    }
    assert.equal(sameAmbient, 20)
  })

  it('replaces ambient state when a chicken actually moves', () => {
    let map = openFloor(createBlankMap({ width: 16, height: 16 }))
    map = toggleMarker(map, 'chickenSpawns', { x: 8, y: 8 })
    let state = { ambient: createAmbientState(map), party: { memberIds: [], members: {} } }
    const start = { ...state.ambient.animals[0].position }
    let replaced = 0
    for (let i = 0; i < 40; i++) {
      const prev = state.ambient
      state = tickAmbientAnimals(state, map, 0.25)
      if (state.ambient !== prev) replaced += 1
    }
    const moved = Math.hypot(
      state.ambient.animals[0].position.x - start.x,
      state.ambient.animals[0].position.y - start.y,
    )
    assert.ok(moved > 0.05)
    assert.ok(replaced > 0)
  })

  it('round-trips authored chicken coat and normalizes unknown coats', () => {
    let map = createBlankMap({ width: 12, height: 12 })
    map = toggleMarker(map, 'chickenSpawns', { x: 4, y: 5 })
    map = updateSpawnMarker(map, 'chickenSpawns', { x: 4, y: 5 }, { coat: 'white' })
    const disk = serializeMap(map)
    assert.equal(disk.markers.chickenSpawns[0].coat, 'white')
    const loaded = parseMapFile(disk)
    const ambient = createAmbientState(loaded)
    assert.equal(ambient.animals[0].coat, 'white')
    assert.equal(normalizeChickenCoatId('not-a-coat'), 'yellow')
    assert.equal(normalizeCatCoatId('not-a-coat'), 'orange')
    assert.equal(normalizeHorseCoatId('not-a-coat'), 'bay')
    assert.equal(catCoatForSpawnIndex(0), 'orange')
    assert.equal(catCoatForSpawnIndex(1), 'tabby')
  })
})

describe('roam serialize', () => {
  it('omits idle horse roam and keeps wander', () => {
    assert.equal(serializeRoam({ mode: 'idle' }, { omitIdle: true }), null)
    assert.deepEqual(parseRoam({ mode: 'radiusWander', radius: 5 }), { mode: 'radiusWander', radius: 5 })
  })
})
