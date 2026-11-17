// NPC dispositions (friendly / neutral / wary / hostile / aggressive) and animal dispositions
// (friendly / neutral / afraid / enemy) are two separate lists (awareness.json). Prototype only.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import awareness from '../src/data/adaptation/exploration/awareness.json' with { type: 'json' }
import { ANIMAL_DISPOSITIONS, dispositionName, normalizeAnimalDisposition, normalizeDisposition } from '../src/exploration/dispositions.js'
import { dispositionOf, joinsCombat } from '../src/exploration/awareness.js'

describe('disposition lists stay separate', () => {
  it('NPCs keep the five established dispositions', () => {
    assert.deepEqual(
      awareness.dispositions.map((entry) => entry.id),
      ['friendly', 'neutral', 'wary', 'hostile', 'aggressive'],
    )
  })

  it('animals have their own four', () => {
    assert.deepEqual(ANIMAL_DISPOSITIONS.map((entry) => entry.id), ['friendly', 'neutral', 'afraid', 'enemy'])
  })

  it('NPC ids are never rewritten into animal ids', () => {
    for (const id of ['friendly', 'neutral', 'wary', 'hostile', 'aggressive']) assert.equal(normalizeDisposition(id), id)
    assert.equal(dispositionName('aggressive'), 'Aggressive')
  })

  it('animal ids are never rewritten into NPC ids', () => {
    for (const id of ['friendly', 'neutral', 'afraid', 'enemy']) assert.equal(normalizeAnimalDisposition(id), id)
  })

  it('an unknown id is neutral in either list', () => {
    assert.equal(normalizeDisposition('bogus'), 'neutral')
    assert.equal(normalizeAnimalDisposition('bogus'), 'neutral')
    assert.equal(normalizeDisposition(null), 'neutral')
  })

  it('an animal id given to an NPC keeps its nearest NPC meaning; an NPC id given to an animal does the same', () => {
    assert.equal(normalizeDisposition('afraid'), 'wary')
    assert.equal(normalizeDisposition('enemy'), 'hostile')
    assert.equal(normalizeAnimalDisposition('wary'), 'afraid')
    assert.equal(normalizeAnimalDisposition('hostile'), 'enemy')
    assert.equal(normalizeAnimalDisposition('aggressive'), 'enemy')
  })

  it('NPC reactions: wary and hostile confront, aggressive goes straight to combat, all three join a fight', () => {
    const npc = (disposition) => ({ disposition })
    assert.equal(dispositionOf(npc('wary')).response, 'confront')
    assert.equal(dispositionOf(npc('hostile')).response, 'confront')
    assert.equal(dispositionOf(npc('aggressive')).response, 'combat')
    for (const id of ['wary', 'hostile', 'aggressive']) assert.equal(joinsCombat(npc(id)), true)
    for (const id of ['friendly', 'neutral']) assert.equal(joinsCombat(npc(id)), false)
  })
})
