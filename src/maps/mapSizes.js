// Map size presets shared by World Generation (Auto-Paint) and the Dev Edit Properties panel.
// Same lookup as mapGenerators.sizeFor / sizeIdOf, but with no dependency on the Legacy generator registry:
// Auto-Paint must not import generators/*. tests/mapSizes.test.js keeps the two in step.
import mapSizes from '../data/adaptation/maps/mapSizes.json'

export const MAP_SIZES = mapSizes.sizes
// Unknown location ids fall back to the first generator (Starship Deck), as generatorFor does.
const FALLBACK_TYPE = 'starshipDeck'

export function sizeFor(typeId, sizeId) {
  const [width, height] = (mapSizes.byType[typeId] ?? mapSizes.byType[FALLBACK_TYPE])[sizeId] ?? [16, 16]
  return { width, height }
}

// The preset the map's current dimensions match for its location, or 'custom'.
export function sizeIdOf(map) {
  const match = MAP_SIZES.find((size) => {
    const { width, height } = sizeFor(map.mapType, size.id)
    return width === map.width && height === map.height
  })
  return match?.id ?? 'custom'
}
