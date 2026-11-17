// Disposition ids, kept apart from awareness.js so mapFormat can normalize without importing it
// (that pulls battleMap → mapFormat and blanks the app).
//
// Two separate lists live in awareness.json:
//   dispositions        NPCs: friendly / neutral / wary / hostile / aggressive. They drive awareness, response and combat.
//   animalDispositions  ambient animals and horses: friendly / neutral / afraid / enemy. Presentation / roam behaviour only.
// Never fold one list into the other: an Afraid animal is not a Wary NPC.
import data from '../data/adaptation/exploration/awareness.json'

const NPC_DISPOSITIONS = Object.fromEntries(data.dispositions.map((entry) => [entry.id, entry]))
const ANIMAL_BY_ID = Object.fromEntries(data.animalDispositions.map((entry) => [entry.id, entry]))

export const ANIMAL_DISPOSITIONS = data.animalDispositions.map((entry) => ({ id: entry.id, name: entry.name }))

// An NPC given an animal id (afraid / enemy) keeps its nearest NPC meaning rather than quietly becoming neutral.
const NPC_FROM_ANIMAL = Object.freeze({ afraid: 'wary', enemy: 'hostile' })
// Older or hand-edited animal markers that used NPC ids.
const ANIMAL_FROM_NPC = Object.freeze({ wary: 'afraid', hostile: 'enemy', aggressive: 'enemy' })

/** An NPC disposition id (friendly / neutral / wary / hostile / aggressive); anything unknown is neutral. */
export function normalizeDisposition(id) {
  if (!id) return 'neutral'
  const mapped = NPC_DISPOSITIONS[id] ? id : (NPC_FROM_ANIMAL[id] ?? id)
  return NPC_DISPOSITIONS[mapped] ? mapped : 'neutral'
}

/** An animal disposition id (friendly / neutral / afraid / enemy); anything unknown is neutral. */
export function normalizeAnimalDisposition(id) {
  if (!id) return 'neutral'
  const mapped = ANIMAL_BY_ID[id] ? id : (ANIMAL_FROM_NPC[id] ?? id)
  return ANIMAL_BY_ID[mapped] ? mapped : 'neutral'
}

export function dispositionRecord(id) {
  return NPC_DISPOSITIONS[normalizeDisposition(id)]
}

export function dispositionName(id) {
  return dispositionRecord(id)?.name ?? id
}
