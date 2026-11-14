import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { blocksLineOfFire, blocksMovement, toBattleMap } from '../src/combat/battleMap.js'
import { getReachableTiles } from '../src/combat/movementSystem.js'
import { findTilePath, isClear, isClearLine, planRoute, RADIUS, slide } from '../src/exploration/navigation.js'
import { placePackedWallPieces, pieceKitFromRuleset, resolveAutoPaintRuleset } from '../src/maps/autoPaint/index.js'
import { createNullMap } from '../src/maps/mapFormat.js'
import { circleHitsTemplateWalls, templatePieceGivesCover } from '../src/maps/templatePieces.js'

function underlayMap(cells, pieces) {
  const map = createNullMap({ name: 'edge', width: 10, height: 10 })
  const tiles = map.tiles.map((row) => row.map(() => 'floor'))
  for (const [x, y] of cells) tiles[y][x] = 'templateWall'
  return {
    ...map,
    tiles,
    floorUnder: Object.fromEntries(cells.map(([x, y]) => [`${x},${y}`, 'floor'])),
    templatePiecePlacements: pieces,
  }
}

describe('templateWall edge collision', () => {
  it('does not full-cell block movement on templateWall, but still blocks sight', () => {
    const map = underlayMap([[4, 4]], [])
    assert.equal(blocksMovement(map, { x: 4, y: 4 }), false)
    assert.equal(blocksLineOfFire(map, { x: 4, y: 4 }), true)
    assert.equal(blocksMovement(map, { x: 3, y: 3 }), false)
  })

  it('blocks a body against a 32-thick south-edge straight, not the open half of the cell', () => {
    // Underlay (4,4): tipAlongX → (5,5), short 64×32 covers [4,5]×[4.5,5]
    const map = underlayMap(
      [[4, 4]],
      [
        {
          id: 'w1',
          pieceId: 'tplStarshipWall32',
          position: { x: 5, y: 5 },
          rotation: 180,
          scale: 1,
          order: 0,
        },
      ],
    )
    assert.equal(circleHitsTemplateWalls(map, { x: 4.5, y: 4.75 }, RADIUS), true)
    // Cell centre sits 0.5 north of the strip; default radius 0.28 stays clear.
    assert.equal(isClear(map, { x: 4, y: 4 }, RADIUS), true)
    assert.equal(isClear(map, { x: 4.5, y: 4.75 }, RADIUS), false)
  })

  it('stops a combat step that crosses the wall strip while allowing the open underlay cell', () => {
    const map = underlayMap(
      [[4, 4]],
      [
        {
          id: 'w1',
          pieceId: 'tplStarshipWall32',
          position: { x: 5, y: 5 },
          rotation: 180,
          scale: 1,
          order: 0,
        },
      ],
    )
    const battle = toBattleMap(map)
    assert.ok(battle.templatePiecePlacements?.length)
    // Standing north of the wall can step onto the underlay centre.
    assert.ok(isClearLine(battle, { x: 4, y: 3 }, { x: 4, y: 4 }))
    // Crossing south through the strip is blocked.
    assert.equal(isClearLine(battle, { x: 4, y: 4 }, { x: 4, y: 5 }), false)
    const reach = getReachableTiles(battle, { x: 4, y: 3 }, 2)
    assert.ok(reach.has('4,4'), 'underlay cell reachable')
    // Direct south neighbour across the strip must not be a 1-step reach from underlay.
    const fromUnderlay = getReachableTiles(battle, { x: 4, y: 4 }, 1)
    assert.ok(!fromUnderlay.has('4,5'), '1-step south across strip blocked')
  })

  it('keeps Null full-cell solid', () => {
    const map = createNullMap({ width: 4, height: 4 })
    assert.equal(blocksMovement(map, { x: 1, y: 1 }), true)
    assert.equal(isClear(map, { x: 1, y: 1 }, 0.2), false)
  })

  it('carries floorUnder and Template Pieces into the battle map', () => {
    const map = underlayMap(
      [[4, 4]],
      [
        {
          id: 'w1',
          pieceId: 'tplStarshipWall32',
          position: { x: 5, y: 5 },
          rotation: 180,
          scale: 1,
          order: 0,
        },
      ],
    )
    const battle = toBattleMap(map)
    assert.equal(battle.floorUnder['4,4'], 'floor')
    assert.equal(battle.templatePiecePlacements.length, 1)
  })

  it('lets a body walk north-south through the 64px clear span between doorway jambs', () => {
    const map = createNullMap({ name: 'door', width: 12, height: 10 })
    const tiles = map.tiles.map((row) => row.map(() => 'floor'))
    for (const [x, y] of [
      [2, 4],
      [3, 4],
      [6, 4],
      [7, 4],
    ]) {
      tiles[y][x] = 'templateWall'
    }
    const packed = placePackedWallPieces(
      { ...map, tiles, floorUnder: {}, templatePiecePlacements: [] },
      pieceKitFromRuleset(
        resolveAutoPaintRuleset({
          id: 'door-clear',
          walls: {
            straight: 'tplStarshipWall32',
            straightLong: 'tplStarshipWall32PlainLong',
            corner: 'tplStarshipWall32Corner',
            hull: null,
            hullLong: null,
            hullCorner: null,
            doorFrame: null,
          },
          floors: { defaultTile: 'floor', variants: [] },
          doors: { underlayTile: 'doorway' },
        }),
      ),
      { doorKeys: ['4,4', '5,4'] },
    )
    // Opening is jamb · Doorway · Doorway · jamb (clear 4.5–5.5). Body radius must stay
    // inside that span — samples near a jamb edge fail even though the door lining is clear.
    assert.equal(isClear(packed, { x: 5, y: 4.5 }, RADIUS), true)
    assert.equal(isClear(packed, { x: 5.1, y: 4.5 }, RADIUS), true)
    assert.ok(isClearLine(packed, { x: 5, y: 3 }, { x: 5, y: 5 }))
    assert.ok(isClearLine(packed, { x: 5.1, y: 3 }, { x: 5.1, y: 5 }))
  })

  it('does not phase through a bulkhead strip after overlapping it', () => {
    // Underlay (4,4): south strip [4,5]×[4.5,5]. Stand overlapping the strip, shove south —
    // must not free-move to the far side (old slide did when !isClear(from)).
    const map = underlayMap(
      [[4, 4]],
      [
        {
          id: 'w1',
          pieceId: 'tplStarshipWall32',
          position: { x: 5, y: 5 },
          rotation: 180,
          scale: 1,
          order: 0,
        },
      ],
    )
    const stuck = { x: 4.5, y: 4.75 }
    assert.equal(isClear(map, stuck, RADIUS), false)
    let pos = stuck
    for (let i = 0; i < 30; i++) pos = slide(map, pos, { x: 0, y: 0.1 })
    assert.ok(pos.y < 5.2, `must not cross south of the strip (ended y=${pos.y})`)
    assert.equal(isClear(map, pos, RADIUS), true, 'unstick should leave clear space')
  })

  it('A* does not hop south across a wall strip, and routes through the doorway centre', () => {
    const map = createNullMap({ name: 'path', width: 12, height: 10 })
    const tiles = map.tiles.map((row) => row.map(() => 'floor'))
    for (const [x, y] of [
      [2, 4],
      [3, 4],
      [6, 4],
      [7, 4],
    ]) {
      tiles[y][x] = 'templateWall'
    }
    const packed = placePackedWallPieces(
      { ...map, tiles, floorUnder: {}, templatePiecePlacements: [] },
      pieceKitFromRuleset(
        resolveAutoPaintRuleset({
          id: 'door-path',
          walls: {
            straight: 'tplStarshipWall32',
            straightLong: 'tplStarshipWall32PlainLong',
            corner: 'tplStarshipWall32Corner',
            hull: null,
            hullLong: null,
            hullCorner: null,
            doorFrame: null,
          },
          floors: { defaultTile: 'floor', variants: [] },
          doors: { underlayTile: 'doorway' },
        }),
      ),
      { doorKeys: ['4,4', '5,4'] },
    )
    // Strip-blind A* used to link (3,4)→(3,5); continuous clearance must refuse that edge.
    const blocked = findTilePath(packed, { x: 3, y: 3 }, { x: 3, y: 5 })
    assert.ok(
      !blocked.some((t, i) => i > 0 && blocked[i - 1].x === 3 && blocked[i - 1].y === 4 && t.x === 3 && t.y === 5),
      'no one-step hop across the bulkhead strip',
    )
    const path = findTilePath(packed, { x: 5, y: 3 }, { x: 5, y: 6 })
    assert.ok(
      path.some((t) => t.x === 5 && (t.y === 4 || t.y === 5)),
      'path uses the doorway column',
    )
    const end = path[path.length - 1]
    assert.equal(end.x, 5)
    assert.equal(end.y, 6)
    const route = planRoute(packed, { x: 5, y: 3 }, { x: 5, y: 6 })
    assert.ok(route.length >= 1)
    assert.ok(isClearLine(packed, { x: 5, y: 3 }, route[0]) || route[0].x === 5)
  })
})

describe('Template Piece collision cache and solid props', () => {
  const placement = (pieceId, x, y) => ({ id: pieceId + x + y, pieceId, position: { x, y }, rotation: 0, scale: 1, order: 0 })
  const probe = { x: 4.6, y: 4.6 }

  it('blocks on a solid outdoor prop but not on an outdoor floor overlay', () => {
    assert.equal(circleHitsTemplateWalls(underlayMap([], [placement('tplOutdoorTree', 5, 5)]), probe, RADIUS), true)
    assert.equal(circleHitsTemplateWalls(underlayMap([], [placement('tplOutdoorGrass', 5, 5)]), probe, RADIUS), false)
  })

  it('sees a new placement list immediately (edits return new arrays, so the cache must not go stale)', () => {
    const before = underlayMap([], [])
    assert.equal(circleHitsTemplateWalls(before, probe, RADIUS), false)
    const after = { ...before, templatePiecePlacements: [placement('tplOutdoorTree', 5, 5)] }
    assert.equal(circleHitsTemplateWalls(after, probe, RADIUS), true)
    assert.equal(circleHitsTemplateWalls(before, probe, RADIUS), false)
  })

  it('still reports cover from the cached footprints', () => {
    const map = underlayMap([], [placement('tplOutdoorTree', 5, 5)])
    assert.equal(templatePieceGivesCover(map, { x: 4, y: 4 }), true)
    assert.equal(templatePieceGivesCover(map, { x: 8, y: 8 }), false)
  })
})
