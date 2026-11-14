import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAP_GENERATORS, MAP_SIZES, sizeFor as legacySizeFor, sizeIdOf as legacySizeIdOf } from '../src/maps/mapGenerators.js'
import * as shared from '../src/maps/mapSizes.js'

// Auto-Paint reads sizes from mapSizes.js so it never imports the Legacy generators; the two must agree.
describe('shared map sizes match the Dev Edit presets', () => {
  it('lists the same presets', () => {
    assert.deepEqual(shared.MAP_SIZES, MAP_SIZES)
  })

  it('gives the same size for every location and preset, and for an unknown location', () => {
    for (const type of [...MAP_GENERATORS.map((entry) => entry.id), 'notALocation']) {
      for (const { id } of MAP_SIZES) assert.deepEqual(shared.sizeFor(type, id), legacySizeFor(type, id), `${type} ${id}`)
    }
    assert.deepEqual(shared.sizeFor('starshipDeck', 'notASize'), legacySizeFor('starshipDeck', 'notASize'))
  })

  it('recognises a preset and a custom size the same way', () => {
    for (const type of MAP_GENERATORS.map((entry) => entry.id)) {
      for (const { id } of MAP_SIZES) {
        const map = { mapType: type, ...legacySizeFor(type, id) }
        assert.equal(shared.sizeIdOf(map), legacySizeIdOf(map), `${type} ${id}`)
      }
      assert.equal(shared.sizeIdOf({ mapType: type, width: 5, height: 7 }), 'custom')
    }
  })
})
