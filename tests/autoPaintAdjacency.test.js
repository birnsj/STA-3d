import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addWallFloorPair,
  addWallWallPair,
  normalizeWallFloorPairs,
  normalizeWallWallPairs,
  removeWallWallPair,
  resolveAdjacency,
  wallCandidateAllowed,
  wallFloorAllowed,
  wallWallAllowed,
} from '../src/maps/autoPaint/adjacency.js'
import { resolveAutoPaintRuleset } from '../src/maps/autoPaint/rulesets.js'

describe('autoPaint adjacency', () => {
  it('empty whitelist allows everything', () => {
    const adj = resolveAdjacency({})
    assert.equal(wallWallAllowed(adj, 'a', 'b'), true)
    assert.equal(wallFloorAllowed(adj, 'wall', 'floor'), true)
  })

  it('wall-wall whitelist is undirected', () => {
    const adj = resolveAdjacency({
      wallWall: [{ a: 'tplStarshipWall32', b: 'tplStarshipWall32Corner' }],
    })
    assert.equal(wallWallAllowed(adj, 'tplStarshipWall32', 'tplStarshipWall32Corner'), true)
    assert.equal(wallWallAllowed(adj, 'tplStarshipWall32Corner', 'tplStarshipWall32'), true)
    assert.equal(wallWallAllowed(adj, 'tplStarshipWall32', 'other'), false)
    assert.equal(wallWallAllowed(adj, 'tplStarshipWall32', 'tplStarshipWall32'), true)
  })

  it('wall-floor whitelist is directed wall→floor', () => {
    const adj = resolveAdjacency({
      wallFloor: [{ wall: 'tplStarshipWall32', floor: 'tplStarshipFloor' }],
    })
    assert.equal(wallFloorAllowed(adj, 'tplStarshipWall32', 'tplStarshipFloor'), true)
    assert.equal(wallFloorAllowed(adj, 'tplStarshipWall32', 'floor'), false)
  })

  it('candidate checks neighbors and floors', () => {
    const adj = resolveAdjacency({
      wallWall: [{ a: 'w1', b: 'w2' }],
      wallFloor: [{ wall: 'w1', floor: 'f1' }],
    })
    assert.equal(wallCandidateAllowed(adj, 'w1', { neighborWalls: ['w2'], floors: ['f1'] }), true)
    assert.equal(wallCandidateAllowed(adj, 'w1', { neighborWalls: ['w3'], floors: ['f1'] }), false)
    assert.equal(wallCandidateAllowed(adj, 'w1', { neighborWalls: ['w2'], floors: ['f2'] }), false)
  })

  it('add/remove helpers normalize pairs', () => {
    let ww = addWallWallPair([], 'b', 'a')
    assert.deepEqual(normalizeWallWallPairs(ww), [{ a: 'a', b: 'b' }])
    ww = removeWallWallPair(ww, 'a', 'b')
    assert.deepEqual(ww, [])
    const wf = addWallFloorPair([], 'w', 'f')
    assert.deepEqual(normalizeWallFloorPairs(wf), [{ wall: 'w', floor: 'f' }])
  })

  it('ruleset resolve keeps adjacency', () => {
    const ruleset = resolveAutoPaintRuleset({
      id: 't',
      label: 'T',
      floors: { defaultTile: 'floor' },
      walls: { straight: 'tplStarshipWall32', corner: 'tplStarshipWall32Corner' },
      adjacency: {
        wallWall: [{ a: 'tplStarshipWall32', b: 'tplStarshipWall32Corner' }],
        wallFloor: [{ wall: 'tplStarshipWall32', floor: 'floor' }],
      },
    })
    assert.equal(ruleset.adjacency.wallWall.length, 1)
    assert.equal(ruleset.adjacency.wallFloor.length, 1)
  })
})
