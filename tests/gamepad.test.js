import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUTTON, createButtonEdgeTracker, dpadAxes, stickAxes } from '../src/input/gamepad.js'
import { stickMove } from '../src/input/stickMove.js'
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

describe('stick steering and queued walk-then-act orders', () => {
  const run = (steps) => {
    const calls = { cleared: 0, dispatched: [] }
    for (const [target, fresh] of steps) {
      stickMove(target, fresh, { clearPending: () => { calls.cleared += 1 }, dispatch: (action) => calls.dispatched.push(action) })
    }
    return calls
  }

  it('the first step of a push drops queued pickup / talk / mount orders and closes menus', () => {
    const calls = run([[{ x: 3, y: 4 }, true]])
    assert.equal(calls.cleared, 1)
    assert.deepEqual(calls.dispatched, [{ type: 'moveTo', target: { x: 3, y: 4 }, fresh: true }])
  })

  it('later steps of the same push only steer', () => {
    const calls = run([[{ x: 3, y: 4 }, true], [{ x: 3.5, y: 4 }, false], [{ x: 4, y: 4 }, false]])
    assert.equal(calls.cleared, 1)
    assert.equal(calls.dispatched.length, 3)
    assert.deepEqual(calls.dispatched.map((a) => a.fresh), [true, false, false])
  })

  it('a second push clears again', () => {
    assert.equal(run([[{ x: 1, y: 1 }, true], [{ x: 2, y: 1 }, false], [{ x: 1, y: 2 }, true]]).cleared, 2)
  })
})
