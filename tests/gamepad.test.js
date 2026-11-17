import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUTTON, createButtonEdgeTracker, dpadAxes, stickAxes } from '../src/input/gamepad.js'
import { createPartyState, partyReducer } from '../src/exploration/partyControl.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

function fakePad({ axes = [0, 0, 0, 0], buttons = [] } = {}) {
  const list = Array.from({ length: 16 }, (_, i) => ({ pressed: Boolean(buttons[i]), value: buttons[i] ? 1 : 0 }))
  return { axes, buttons: list }
}

describe('gamepad helpers', () => {
  it('applies a circular deadzone to the left stick', () => {
    assert.deepEqual(stickAxes(fakePad({ axes: [0.1, 0.05, 0, 0] }), 'left', 0.22), { x: 0, y: 0 })
    const moved = stickAxes(fakePad({ axes: [1, 0, 0, 0] }), 'left', 0.22)
    assert.ok(moved.x > 0.9)
    assert.equal(moved.y, 0)
  })

  it('reads the D-pad as a pan vector', () => {
    const buttons = []
    buttons[BUTTON.LEFT] = true
    buttons[BUTTON.UP] = true
    assert.deepEqual(dpadAxes(fakePad({ buttons })), { x: -1, y: -1 })
  })

  it('reports rising edges once per press', () => {
    const tracker = createButtonEdgeTracker([BUTTON.A, BUTTON.B])
    const held = fakePad({ buttons: { [BUTTON.A]: true } })
    assert.deepEqual(tracker.edges(held), [BUTTON.A])
    assert.deepEqual(tracker.edges(held), [])
    assert.deepEqual(tracker.edges(fakePad()), [])
    assert.deepEqual(tracker.edges(held), [BUTTON.A])
  })

  it('stopMove clears the selection order after stick-style moveTo', () => {
    const map = createBlankMap({ name: 'Pad Move', width: 20, height: 10 })
    map.markers.playerStarts = [{ x: 4, y: 4 }]
    const party = createPartyState(map, [makeCharacter({ id: 'lead', name: 'Lead' })])
    const lead = party.members[party.leaderId]
    const moving = partyReducer(party, { type: 'moveTo', target: { x: lead.position.x + 4, y: lead.position.y }, fresh: true })
    assert.ok(moving.members[party.leaderId].order)
    const stopped = partyReducer(moving, { type: 'stopMove' })
    assert.equal(stopped.members[party.leaderId].order, null)
  })
})
