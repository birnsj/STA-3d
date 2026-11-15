import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WORLD_WALL_UNDERLAY } from '../src/maps/autoPaint/constants.js'
import { generateAutoPaintMap } from '../src/maps/autoPaint/generate.js'
import { getAutoPaintRuleset, listAutoPaintRulesets } from '../src/maps/autoPaint/rulesets.js'
import {
  generateSettlementLayout,
  rulesetUsesSettlementLayout,
} from '../src/maps/autoPaint/settlementLayout.js'

describe('Outdoor Template 32 / settlement layout', () => {
  it('lists the outdoor ruleset with outdoorSettlement', () => {
    const outdoor = getAutoPaintRuleset('outdoor-template-32')
    assert.ok(outdoor, 'outdoor-template-32 ruleset present')
    assert.equal(outdoor.environment, 'outdoorSettlement')
    assert.ok(rulesetUsesSettlementLayout(outdoor))
    assert.ok(listAutoPaintRulesets().some((entry) => entry.id === 'outdoor-template-32'))
  })

  it('lays grass, path, dirt yards edged with path, and underlay building shells', () => {
    let seed = 1
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }
    const layout = generateSettlementLayout(
      { width: 28, height: 20 },
      random,
      { grass: 'grass', dirt: 'ground', path: 'path', buildingScale: 1 },
    )
    assert.ok(layout.buildings.length >= 2, `expected multiple buildings, got ${layout.buildings.length}`)
    const faces = new Set(layout.buildings.map((building) => building.face))
    assert.ok(faces.size >= 2, 'buildings use more than one wall face')

    let grass = 0
    let path = 0
    let dirt = 0
    let underlay = 0
    for (const row of layout.tiles) {
      for (const id of row) {
        if (id === 'grass') grass += 1
        else if (id === 'path') path += 1
        else if (id === 'ground') dirt += 1
        else if (id === WORLD_WALL_UNDERLAY) underlay += 1
      }
    }
    assert.ok(grass > 0)
    assert.ok(path > 0)
    assert.ok(dirt > 0, 'dirt yards present')
    assert.ok(underlay > 0, 'templateWall underlay for Outdoor Template 32 packing')

    // Each building is a closed ring with a door gap (wood/stone floor) on one side.
    for (const building of layout.buildings) {
      const { rect } = building
      const roomFloor = building.interior || 'plankFloor'
      let ringWalls = 0
      let doorGaps = 0
      for (let y = rect.y0; y <= rect.y1; y++) {
        for (let x = rect.x0; x <= rect.x1; x++) {
          const onRing = x === rect.x0 || x === rect.x1 || y === rect.y0 || y === rect.y1
          if (!onRing) continue
          const id = layout.tiles[y][x]
          if (id === WORLD_WALL_UNDERLAY) ringWalls += 1
          else if (id === roomFloor) doorGaps += 1
        }
      }
      const ringCells = (rect.x1 - rect.x0 + 1) * 2 + (rect.y1 - rect.y0 - 1) * 2
      assert.equal(ringWalls + doorGaps, ringCells, 'building ring fully accounted for')
      assert.ok(doorGaps >= 1 && doorGaps <= 2, `door opening expected, got ${doorGaps}`)
      assert.ok(ringWalls >= ringCells - 2, 'walls close the box except the door')
    }

    // Path edging: some path cell neighbours grass (dirt→path where dirt met grass).
    let edged = false
    for (let y = 0; y < layout.tiles.length && !edged; y++) {
      for (let x = 0; x < layout.tiles[0].length && !edged; x++) {
        if (layout.tiles[y][x] !== 'path') continue
        const nearGrass = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ].some(([nx, ny]) => layout.tiles[ny]?.[nx] === 'grass')
        if (nearGrass) edged = true
      }
    }
    assert.ok(edged, 'path edging touches grass')
  })

  it('fenced fields get a closed fence ring rect and one mid-side gate cell', () => {
    let seed = 11
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }
    const layout = generateSettlementLayout(
      { width: 30, height: 24 },
      random,
      { grass: 'grass', dirt: 'ground', path: 'path', buildingScale: 1, fields: true, maxFields: 3 },
    )
    assert.ok(layout.fields.length >= 1, 'at least one field')
    assert.equal(layout.fenceRings?.length, layout.fields.length, 'one fence ring per field')
    for (let i = 0; i < layout.fields.length; i++) {
      const crop = layout.fields[i]
      const ring = layout.fenceRings[i]
      assert.equal(ring.rect.x0, crop.x0 - 1)
      assert.equal(ring.rect.y0, crop.y0 - 1)
      assert.equal(ring.rect.x1, crop.x1 + 1)
      assert.equal(ring.rect.y1, crop.y1 + 1)
      assert.equal(ring.doorKeys?.length, 1, 'one 64px gate cell')
      const [gx, gy] = ring.doorKeys[0].split(',').map(Number)
      const onRing =
        (gy === ring.rect.y0 || gy === ring.rect.y1) && gx > ring.rect.x0 && gx < ring.rect.x1
          ? true
          : (gx === ring.rect.x0 || gx === ring.rect.x1) && gy > ring.rect.y0 && gy < ring.rect.y1
      assert.ok(onRing, 'gate is mid-side on the fence ring')
    }
  })

  it('Building size slider scales footprints and large buildings get interior rooms', () => {
    const makeRandom = (start) => {
      let seed = start
      return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return seed / 0x100000000
      }
    }
    const small = generateSettlementLayout(
      { width: 36, height: 28 },
      makeRandom(3),
      { grass: 'grass', dirt: 'ground', path: 'path', buildingScale: 1, roomScale: 1 },
    )
    const large = generateSettlementLayout(
      { width: 36, height: 28 },
      makeRandom(3),
      { grass: 'grass', dirt: 'ground', path: 'path', buildingScale: 2, roomScale: 0.7 },
    )
    const avgArea = (layout) => {
      const areas = layout.buildings.map((building) => {
        const { rect } = building
        return (rect.x1 - rect.x0 + 1) * (rect.y1 - rect.y0 + 1)
      })
      return areas.reduce((sum, value) => sum + value, 0) / Math.max(1, areas.length)
    }
    assert.ok(avgArea(large) > avgArea(small), 'buildingScale 200% yields larger footprints than 100%')

    const multiRoom = large.buildings.filter((building) => (building.rooms?.length ?? 0) > 1)
    assert.ok(multiRoom.length >= 1, 'enlarged buildings subdivide into interior rooms')
    for (const building of multiRoom) {
      const interiorUnderlay = building.underlayKeys.filter((entry) => {
        const [x, y] = entry.split(',').map(Number)
        return x > building.rect.x0 && x < building.rect.x1 && y > building.rect.y0 && y < building.rect.y1
      })
      assert.ok(interiorUnderlay.length > 0, 'interior rooms are separated by underlay walls')
    }

    const open = generateSettlementLayout(
      { width: 36, height: 28 },
      makeRandom(3),
      { grass: 'grass', dirt: 'ground', path: 'path', buildingScale: 2, roomScale: 0.7, roomsInBuilding: 0 },
    )
    assert.ok(
      open.buildings.every((building) => (building.rooms?.length ?? 1) <= 1),
      'Rooms in building 0% keeps open floors',
    )

    const fullRooms = generateSettlementLayout(
      { width: 40, height: 30 },
      makeRandom(11),
      {
        grass: 'grass',
        dirt: 'ground',
        path: 'path',
        buildingScale: 1,
        roomScale: 0.7,
        roomsInBuilding: 1,
        doorsInBuilding: 1,
      },
    )
    const fullMulti = fullRooms.buildings.filter((building) => (building.rooms?.length ?? 0) > 1)
    assert.ok(fullMulti.length >= 1, 'Rooms in building 100% yields multi-room buildings at default Building size')

    const sparseRooms = generateSettlementLayout(
      { width: 40, height: 30 },
      makeRandom(11),
      {
        grass: 'grass',
        dirt: 'ground',
        path: 'path',
        buildingScale: 1.5,
        roomScale: 0.7,
        roomsInBuilding: 0.3,
        doorsInBuilding: 1,
      },
    )
    const fullAtScale = generateSettlementLayout(
      { width: 40, height: 30 },
      makeRandom(11),
      {
        grass: 'grass',
        dirt: 'ground',
        path: 'path',
        buildingScale: 1.5,
        roomScale: 0.7,
        roomsInBuilding: 1,
        doorsInBuilding: 1,
      },
    )
    const avgRooms = (layout) =>
      layout.buildings.reduce((sum, building) => sum + (building.rooms?.length ?? 1), 0) /
      Math.max(1, layout.buildings.length)
    assert.ok(
      avgRooms(sparseRooms) < avgRooms(fullAtScale),
      'Rooms in building 30% averages fewer rooms than 100%',
    )

    const sealed = generateSettlementLayout(
      { width: 36, height: 28 },
      makeRandom(3),
      {
        grass: 'grass',
        dirt: 'ground',
        path: 'path',
        buildingScale: 2,
        roomScale: 0.7,
        roomsInBuilding: 1,
        doorsInBuilding: 0,
      },
    )
    const sealedMulti = sealed.buildings.filter((entry) => (entry.rooms?.length ?? 0) > 1)
    assert.ok(sealedMulti.length >= 1, 'Doors 0% test needs multi-room buildings')
    for (const building of sealedMulti) {
      const interiorDoors = building.doorKeys.filter((entry) => {
        const [x, y] = entry.split(',').map(Number)
        return x > building.rect.x0 && x < building.rect.x1 && y > building.rect.y0 && y < building.rect.y1
      })
      assert.equal(interiorDoors.length, 0, 'Doors in building 0% skips interior doorways')
      assert.ok(building.doorKeys.length > 0, 'each building still has an exterior door')
    }
  })

  it('Generate Map packs Outdoor Template 32 walls, wood/stone floors, fields and rocks', () => {
    const source = {
      id: 'test-outdoor',
      name: 'Outdoor Test',
      width: 28,
      height: 20,
      mapType: 'colony',
      biome: 'temperate',
      ambient: 100,
    }
    let seed = 7
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }
    const { map, error } = generateAutoPaintMap(source, 'outdoor-template-32', random, {
      buildings: 1,
      rooms: 1,
    })
    assert.equal(error, undefined)
    assert.equal(map.mapType, 'colony')
    const walls = (map.templatePiecePlacements ?? []).filter((entry) =>
      String(entry.pieceId ?? '').includes('Outdoor') && String(entry.pieceId ?? '').includes('Wall32'),
    )
    assert.ok(walls.length >= 8, `expected Outdoor Template 32 wall pieces, got ${walls.length}`)
    const faces = new Set(
      walls.map((entry) => {
        if (entry.pieceId.includes('Prefab')) return 'prefab'
        if (entry.pieceId.includes('Barn')) return 'barn'
        if (entry.pieceId.includes('City')) return 'city'
        if (entry.pieceId.includes('Timber')) return 'timber'
        return 'other'
      }),
    )
    assert.ok(faces.size >= 2, 'multiple Outdoor Template 32 wall faces packed')
    assert.equal(map.autoPaint?.rulesetId, 'outdoor-template-32')
    assert.ok((map.markers?.playerStarts?.length ?? 0) <= 4)
    assert.ok((map.markers?.enemySpawns?.length ?? 0) <= 4)

    let underlay = 0
    let wood = 0
    let stone = 0
    let rocks = 0
    let trees = 0
    let crops = 0
    for (const row of map.tiles) {
      for (const id of row) {
        if (id === WORLD_WALL_UNDERLAY) underlay += 1
        if (id === 'plankFloor') wood += 1
        if (id === 'templeFloor') stone += 1
        if (id === 'rock') rocks += 1
        if (id === 'tree') trees += 1
        if (id === 'cropRows' || id === 'tallCrop') crops += 1
      }
    }
    const fencePieces = (map.templatePiecePlacements ?? []).filter((entry) =>
      String(entry.pieceId ?? '').startsWith('tplOutdoorFence'),
    )
    const gates = fencePieces.filter((entry) => entry.pieceId === 'tplOutdoorFenceGate64')
    const corners = fencePieces.filter((entry) => entry.pieceId === 'tplOutdoorFence64Corner')
    assert.ok(underlay > 0, 'templateWall underlay under 32 walls')
    assert.ok(wood > 0, 'wood plank floors in barn/timber buildings')
    assert.ok(stone > 0, 'stone flagstone floors in other buildings')
    assert.ok(rocks > 0, 'biome rocks on grass')
    assert.ok(trees > 0, 'biome trees on grass')
    assert.ok(fencePieces.length >= 8, `expected fence kit pieces, got ${fencePieces.length}`)
    assert.ok(corners.length >= 4, 'corner posts on field rings')
    assert.ok(gates.length >= 1, '64-wide fence gate placed')
    assert.ok(crops > 0, 'crop field interior present')
    assert.ok((map.areas ?? []).some((area) => String(area.name).startsWith('Field')), 'Field area labels')
  })
})
