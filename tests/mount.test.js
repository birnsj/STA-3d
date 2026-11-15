import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canDismount,
  canMount,
  createMountState,
  dismountAll,
  finishDismount,
  getHorses,
  isMounted,
  mapSupportsMount,
  mountHorse,
  removeHorse,
  RIDE_SPEED_MULT,
  syncMountAfterParty,
  tickRideAnims,
} from '../src/exploration/mount.js'
import { createPartyState } from '../src/exploration/partyControl.js'

function outdoorMap() {
  return {
    width: 16,
    height: 16,
    mapType: 'colony',
    biome: 'temperate',
    name: 'Mount Test',
    tiles: Array.from({ length: 16 }, () => Array(16).fill('grass')),
    markers: { playerStarts: [{ x: 4, y: 4, facing: 0 }], enemySpawns: [] },
  }
}

function testCharacter(id = 'c1') {
  return {
    id,
    name: 'Test',
    portrait: { id: 'human-male-1', image: '/x.png', spriteSet: 'human-male', uniform: '#c9a227' },
    attributes: { control: 9, fitness: 9, presence: 9, daring: 9, insight: 9, reason: 9 },
    disciplines: { command: 2, conn: 2, security: 2, engineering: 2, science: 2, medicine: 2 },
    condition: { stress: 0, maxStress: 10, injuries: [], defeated: false },
  }
}

describe('exploration mount', () => {
  it('spawns a horse on outdoor maps and supports mount / dismount', () => {
    const map = outdoorMap()
    assert.equal(mapSupportsMount(map), true)
    const party = createPartyState(map, [testCharacter()])
    const mount = createMountState(map, party)
    assert.ok(mount?.horses?.length === 1)
    const lead = party.leaderId
    const horse = mount.horses[0]
    let state = {
      mode: 'EXPLORATION',
      party: {
        ...party,
        members: {
          ...party.members,
          [lead]: { ...party.members[lead], position: { ...horse.position } },
        },
      },
      mount,
    }
    assert.equal(canMount(state, lead), true)
    state = { ...state, world: { time: 0 } }
    state = mountHorse(state, lead)
    assert.equal(isMounted(state, lead), true)
    assert.equal(state.party.members[lead].mounted, true)
    assert.equal(state.party.members[lead].rideAnim?.clip, 'mount')
    assert.equal(canDismount(state, lead), false)
    assert.ok(RIDE_SPEED_MULT > 1)

    state = tickRideAnims({ ...state, world: { time: 2 } })
    assert.equal(state.party.members[lead].rideAnim, null)
    assert.equal(canDismount(state, lead), true)

    state = {
      ...state,
      party: {
        ...state.party,
        members: {
          ...state.party.members,
          [lead]: {
            ...state.party.members[lead],
            position: { x: 10, y: 10 },
            facing: { x: 1, y: 0 },
            mounted: true,
          },
        },
      },
    }
    state = syncMountAfterParty(state)
    assert.deepEqual(state.mount.horses[0].position, { x: 10, y: 10 })

    state = finishDismount(state, lead)
    assert.equal(isMounted(state, lead), false)
    assert.equal(state.party.members[lead].mounted, false)
  })

  it('uses authored markers.horseSpawns when present', () => {
    const map = {
      ...outdoorMap(),
      markers: {
        ...outdoorMap().markers,
        horseSpawns: [{ x: 7, y: 8, facing: 90 }],
      },
    }
    const party = createPartyState(map, [testCharacter()])
    const mount = createMountState(map, party)
    assert.equal(mount.horses.length, 1)
    assert.equal(mount.horses[0].id, 'horse-1')
    assert.deepEqual(mount.horses[0].position, { x: 7, y: 8 })
    assert.ok(Math.abs(mount.horses[0].heading - Math.PI / 2) < 1e-6)
  })

  it('removeHorse clears the mount and dismounts its rider', () => {
    const map = outdoorMap()
    const party = createPartyState(map, [testCharacter()])
    const mount = createMountState(map, party)
    const lead = party.leaderId
    const horse = mount.horses[0]
    let state = {
      mode: 'EXPLORATION',
      party: {
        ...party,
        members: {
          ...party.members,
          [lead]: { ...party.members[lead], position: { ...horse.position } },
        },
      },
      mount,
    }
    state = mountHorse(state, lead)
    state = removeHorse(state, horse.id)
    assert.equal(getHorses(state).length, 0)
    assert.equal(state.party.members[lead].mounted, false)
  })

  it('dismountAll clears every rider', () => {
    const map = outdoorMap()
    const party = createPartyState(map, [testCharacter()])
    const mount = createMountState(map, party)
    const lead = party.leaderId
    const horse = mount.horses[0]
    let state = {
      mode: 'EXPLORATION',
      party: {
        ...party,
        members: {
          ...party.members,
          [lead]: { ...party.members[lead], position: { ...horse.position } },
        },
      },
      mount,
    }
    state = mountHorse(state, lead)
    state = dismountAll(state)
    assert.equal(isMounted(state, lead), false)
  })
})
