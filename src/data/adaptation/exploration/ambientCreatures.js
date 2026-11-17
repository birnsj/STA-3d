// Ambient creature registry (chicken, cat, …). Add a row + roam profile + actor to ship a new animal.
import data from './ambientCreatures.json'

export const AMBIENT_CREATURES = data.creatures ?? []

export function ambientCreatureById(id) {
  return AMBIENT_CREATURES.find((entry) => entry.id === id) ?? null
}

export function ambientCreatureByMarkerKind(kind) {
  return AMBIENT_CREATURES.find((entry) => entry.markerKind === kind) ?? null
}

export function ambientMarkerKinds() {
  return AMBIENT_CREATURES.map((entry) => entry.markerKind)
}

export function isAmbientMarkerKind(kind) {
  return AMBIENT_CREATURES.some((entry) => entry.markerKind === kind)
}

/** Preferred foods for an ambient creature (item ids and/or tags). Empty when unset. */
export function preferredFoodsOf(creatureId) {
  const creature = ambientCreatureById(creatureId)
  const foods = creature?.preferredFoods
  return {
    itemIds: Array.isArray(foods?.itemIds) ? [...foods.itemIds] : [],
    tags: Array.isArray(foods?.tags) ? [...foods.tags] : [],
  }
}
