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
  planMountAssignments,
  removeHorse,
  RIDE_SPEED_MULT,
  syncMountAfterParty,
  tickRideAnims,
  togglePartyMount,
} from '../src/exploration/mount.js'
import { createPartyState } from '../src/exploration/partyControl.js'

function outdoorMap(horseSpawns = [{ x: 5, y: 4, facing: 0 }]) {
  return {
    width: 16,
    height: 16,
    mapType: 'colony',
    biome: 'temperate',
    name: 'Mount Test',
    tiles: Array.from({ length: 16 }, () => Array(16).fill('grass')),
    markers: {
      playerStarts: [{ x: 4, y: 4, facing: 0 }],
      enemySpawns: [],
      horseSpawns,
    },
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
  it('does not spawn a horse without Horse Spawn markers', () => {
    const map = outdoorMap([])
    map.markers.horseSpawns = []
    assert.equal(mapSupportsMount(map), false)
    const party = createPartyState(map, [testCharacter()])
    assert.equal(createMountState(map, party), null)
  })

  it('spawns from Horse Spawn markers and supports mount / dismount', () => {
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

  it('assigns one horse per member and leaves extras on foot', () => {
    const map = outdoorMap([
      { x: 5, y: 4, facing: 0 },
      { x: 8, y: 4, facing: 0 },
    ])
    const party = createPartyState(map, [testCharacter('c1'), testCharacter('c2'), testCharacter('c3')])
    const mount = createMountState(map, party)
    assert.equal(mount.horses.length, 2)
    const state = { mode: 'EXPLORATION', party, mount, world: { time: 0 } }
    const ids = party.memberIds
    const assignments = planMountAssignments(state, ids)
    assert.equal(assignments.length, 2)
    assert.ok(assignments.some((entry) => entry.memberId === party.leaderId))

    const next = togglePartyMount(state, ids)
    const claimed = Object.values(next.party.members).filter(
      (member) => member.mounted || member.pendingMountHorseId,
    )
    assert.equal(claimed.length, 2)
    const walker = ids.find((id) => !next.party.members[id].mounted && !next.party.members[id].pendingMountHorseId)
    assert.ok(walker, 'third member stays on foot')
  })

  it('Ride preference locks the clicked horse to the lead, then fills the rest of the team', () => {
    const map = outdoorMap([
      { x: 12, y: 12, facing: 0 },
      { x: 5, y: 4, facing: 0 },
      { x: 8, y: 4, facing: 0 },
    ])
    const party = createPartyState(map, [testCharacter('c1'), testCharacter('c2'), testCharacter('c3')])
    const mount = createMountState(map, party)
    const state = { mode: 'EXPLORATION', party, mount, world: { time: 0 } }
    // Far horse is a worse nearest match — preferHorseId still gives it to the lead.
    const farId = mount.horses[0].id
    const assignments = planMountAssignments(state, party.memberIds, {
      preferHorseId: farId,
      preferMemberId: party.leaderId,
    })
    assert.equal(assignments.length, 3)
    assert.equal(assignments.find((entry) => entry.memberId === party.leaderId)?.horseId, farId)

    const next = togglePartyMount(state, party.memberIds, {
      preferHorseId: farId,
      preferMemberId: party.leaderId,
    })
    const claimed = Object.values(next.party.members).filter(
      (member) => member.mounted || member.pendingMountHorseId,
    )
    assert.equal(claimed.length, 3)
    assert.equal(next.party.members[party.leaderId].pendingMountHorseId, farId)
  })
})
