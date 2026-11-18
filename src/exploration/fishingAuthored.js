// Authored Fishing Spot field clamps / defaults (shared by mapFormat parse and runtime). No mapFormat imports.

export const DEFAULT_FISH_IDS = Object.freeze(['fishMinnow', 'fishTrout', 'fishSalmon', 'fishBass'])

const DEFAULT_DIFFICULTY = 2
const DEFAULT_SIZE = 1

export function clampDifficulty(value) {
  if (!Number.isFinite(value)) return DEFAULT_DIFFICULTY
  return Math.min(5, Math.max(0, Math.round(value)))
}

export function clampSize(value) {
  if (!Number.isFinite(value)) return DEFAULT_SIZE
  return Math.min(2, Math.max(0.5, Math.round(value * 100) / 100))
}

export function normalizeCatchPool(raw) {
  const list = Array.isArray(raw) ? raw : []
  const ids = [...new Set(list.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))]
  return ids.length ? ids : [...DEFAULT_FISH_IDS]
}

export function authoredFishingSpotFields(raw) {
  return {
    fishable: raw.fishable !== false,
    difficulty: clampDifficulty(raw.difficulty),
    size: clampSize(raw.size),
    catchPool: normalizeCatchPool(raw.catchPool),
  }
}
