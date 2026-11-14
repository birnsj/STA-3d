import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

const stored = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: (key) => stored.delete(key),
  },
})

const { listRecentMaps, noteRecentMap, pruneRecentMaps, removeRecentMap } = await import('../src/maps/mapRecent.js')

describe('mapRecent', () => {
  beforeEach(() => {
    stored.clear()
  })

  it('notes maps most-recent first and reorders on reopen', () => {
    noteRecentMap({ id: 'a', name: 'Alpha' })
    noteRecentMap({ id: 'b', name: 'Beta' })
    noteRecentMap({ id: 'a', name: 'Alpha Renamed' })
    const list = listRecentMaps()
    assert.equal(list[0].id, 'a')
    assert.equal(list[0].name, 'Alpha Renamed')
    assert.equal(list[1].id, 'b')
    assert.equal(list.length, 2)
  })

  it('removes and prunes missing files', () => {
    noteRecentMap({ id: 'keep', name: 'Keep' })
    noteRecentMap({ id: 'gone', name: 'Gone' })
    removeRecentMap('gone')
    assert.deepEqual(
      listRecentMaps().map((entry) => entry.id),
      ['keep'],
    )
    noteRecentMap({ id: 'stale', name: 'Stale' })
    pruneRecentMaps([{ id: 'keep', name: 'Keep Updated' }])
    assert.deepEqual(listRecentMaps(), [{ id: 'keep', name: 'Keep Updated' }])
  })
})
