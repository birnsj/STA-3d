// Exploration tests need NPCs standing on a map's enemy spawns. The game stopped auto-injecting them (designer,
// 2026-11-17: empty maps stay empty), so a test that wants them places them on the map the way the editor does.
import { spawnFacing } from '../../src/maps/facing.js'

const GUARDS = [
  { id: 'guardA', name: 'Guard A', characterId: 'klingonWarrior1', disposition: 'wary', alertGroupId: 'security-a', alertMethod: 'shout' },
  { id: 'guardB', name: 'Guard B', characterId: 'klingonWarrior2', disposition: 'hostile', responseType: 'alarm', alertGroupId: 'security-a', alertMethod: 'shout' },
  { id: 'guardC', name: 'Guard C', characterId: 'klingonWarrior3', disposition: 'aggressive', alertGroupId: 'security-b', alertMethod: 'shout' },
]

// Call after the map's enemySpawns are set. Mutates and returns the map.
export function withFallbackNpcs(map) {
  const spawns = map.markers.enemySpawns
  map.npcs = GUARDS.slice(0, spawns.length).map((guard, index) => ({ ...guard, position: { x: spawns[index].x, y: spawns[index].y }, facing: spawnFacing(map, spawns[index]) }))
  return map
}
