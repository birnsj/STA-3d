// Disposition ids for NPCs and ambient animals (awareness.json). Kept separate so mapFormat can
// normalize without importing awareness.js (that pulls battleMap → mapFormat and blanks the app).
import data from '../data/adaptation/exploration/awareness.json'

const DISPOSITIONS = Object.fromEntries(data.dispositions.map((entry) => [entry.id, entry]))

/** Older map / content ids → current list (afraid / enemy replaced wary / hostile / aggressive). */
const DISPOSITION_ALIASES = Object.freeze({
  wary: 'afraid',
  hostile: 'enemy',
  aggressive: 'enemy',
})

export const ANIMAL_DISPOSITIONS = data.dispositions.map((entry) => ({ id: entry.id, name: entry.name }))

/** Map legacy disposition ids onto the current four (friendly / neutral / afraid / enemy). */
export function normalizeDisposition(id) {
  if (!id) return 'neutral'
  const mapped = DISPOSITION_ALIASES[id] ?? id
  return DISPOSITIONS[mapped] ? mapped : 'neutral'
}

export function dispositionRecord(id) {
  return DISPOSITIONS[normalizeDisposition(id)]
}

export function dispositionName(id) {
  return dispositionRecord(id)?.name ?? id
}
