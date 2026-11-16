import { describe, expect, it } from 'vitest'
import { createBlankMap, parseMapFile, serializeMap } from '../src/maps/mapFormat.js'
import { toggleMarker, updateSpawnMarker } from '../src/maps/mapEdits.js'
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

describe('roam profiles', () => {
  it('exposes human, horse, and chicken with different walk speeds', () => {
    expect(getRoamProfile('human').walkSpeed).toBeGreaterThan(getRoamProfile('horse').walkSpeed)
    expect(getRoamProfile('chicken').walkSpeed).toBeGreaterThan(getRoamProfile('human').walkSpeed)
    expect(walkSpeedFor('chicken', 1)).toBeCloseTo(getRoamProfile('chicken').walkSpeed)
    expect(walkSpeedFor('human', 2)).toBeCloseTo(getRoamProfile('human').walkSpeed * 2)
  })

  it('resolves legacy patrol to waypointPatrol and empty to idle', () => {
    expect(resolveAuthoredRoam(null, { patrol: [{ at: { x: 1, y: 1 }, wait: 1 }] }).mode).toBe('waypointPatrol')
    expect(resolveAuthoredRoam(null).mode).toBe('idle')
    expect(resolveAuthoredRoam({ mode: 'radiusWander', radius: 4 }).radius).toBe(4)
  })
})

describe('radius wander', () => {
  it('keeps the actor inside the authored radius of home', () => {
    const map = createBlankMap({ width: 20, height: 20 })
    // Open floor in the middle.
    for (let y = 1; y < 19; y++) for (let x = 1; x < 19; x++) map.tiles[y][x] = 'floor'
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
      expect(dist).toBeLessThanOrEqual(3.6)
    }
  })
})

describe('horse and chicken map round-trip', () => {
  it('keeps legacy horse spawns idle with no roam on disk', () => {
    let map = createBlankMap({ width: 12, height: 12 })
    map = toggleMarker(map, 'horseSpawns', { x: 3, y: 3 })
    const disk = serializeMap(map)
    expect(disk.markers.horseSpawns[0]).toEqual([3, 3])
    const loaded = parseMapFile(disk)
    expect(loaded.markers.horseSpawns[0].roam).toBeUndefined()
    const mount = createMountState(loaded)
    expect(mount.horses[0].roam.mode).toBe('idle')
  })

  it('round-trips chicken spawn with default wander roam', () => {
    let map = createBlankMap({ width: 12, height: 12 })
    map = toggleMarker(map, 'chickenSpawns', { x: 4, y: 5 })
    expect(map.markers.chickenSpawns[0].roam.mode).toBe('radiusWander')
    const disk = serializeMap(map)
    expect(disk.markers.chickenSpawns[0].roam.mode).toBe('radiusWander')
    const loaded = parseMapFile(disk)
    expect(loaded.markers.chickenSpawns[0].roam.mode).toBe('radiusWander')
    const ambient = createAmbientState(loaded)
    expect(ambient.animals[0].creatureId).toBe('chicken')
    expect(ambient.animals[0].roam.mode).toBe('radiusWander')
  })

  it('lets an author enable horse wander', () => {
    let map = createBlankMap({ width: 16, height: 16 })
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) map.tiles[y][x] = 'floor'
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
    expect(moved).toBeGreaterThan(0.05)
  })

  it('ticks ambient chickens without Spike3d', () => {
    let map = createBlankMap({ width: 16, height: 16 })
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) map.tiles[y][x] = 'floor'
    map = toggleMarker(map, 'chickenSpawns', { x: 8, y: 8 })
    let state = { ambient: createAmbientState(map) }
    const start = { ...state.ambient.animals[0].position }
    for (let i = 0; i < 40; i++) {
      state = tickAmbientAnimals(state, map, 0.25)
    }
    const animal = state.ambient.animals[0]
    const moved = Math.hypot(animal.position.x - start.x, animal.position.y - start.y)
    expect(moved).toBeGreaterThan(0.05)
  })

  it('scatters chickens when a party member runs at them', () => {
    let map = createBlankMap({ width: 20, height: 20 })
    for (let y = 1; y < 19; y++) for (let x = 1; x < 19; x++) map.tiles[y][x] = 'floor'
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
    const away = Math.hypot(animal.position.x - state.party.members.lead.position.x, animal.position.y - state.party.members.lead.position.y)
    const fromStart = Math.hypot(animal.position.x - start.x, animal.position.y - start.y)
    expect(fromStart).toBeGreaterThan(0.4)
    expect(away).toBeGreaterThan(0.8)
    expect(animal.scatter || fromStart > 1).toBeTruthy()
  })
})

describe('roam serialize', () => {
  it('omits idle horse roam and keeps wander', () => {
    expect(serializeRoam({ mode: 'idle' }, { omitIdle: true })).toBeNull()
    expect(parseRoam({ mode: 'radiusWander', radius: 5 })).toEqual({ mode: 'radiusWander', radius: 5 })
  })
})
