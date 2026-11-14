import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { blocksLineOfFire, blocksMovement, toBattleMap } from '../src/combat/battleMap.js'
import { getReachableTiles } from '../src/combat/movementSystem.js'
import { isClear, isClearLine, RADIUS } from '../src/exploration/navigation.js'
import { placePackedWallPieces, pieceKitFromRuleset, resolveAutoPaintRuleset } from '../src/maps/autoPaint/index.js'
import { createNullMap } from '../src/maps/mapFormat.js'
import { circleHitsTemplateWalls } from '../src/maps/templatePieces.js'

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

  it('lets a body walk north-south through both cells of a 96px Template 32 doorway', () => {
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
    // West door cell centreline must clear the wall strip (old west jamb sat on x=4).
    assert.equal(isClear(packed, { x: 4, y: 4.5 }, RADIUS), true)
    assert.equal(isClear(packed, { x: 5, y: 4.5 }, RADIUS), true)
    assert.ok(isClearLine(packed, { x: 4, y: 3 }, { x: 4, y: 5 }))
    assert.ok(isClearLine(packed, { x: 5, y: 3 }, { x: 5, y: 5 }))
  })
})
