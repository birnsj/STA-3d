// Generate Map size snap — same presets as Dev Edit Properties (mapSizes.json via sizeFor).
import { MAP_SIZES, sizeFor, sizeIdOf } from '../mapGenerators.js'

/**
 * Snap open-map size to the closest Dev Edit size preset for this location type.
 * Exact preset matches are left alone.
 */
export function snapAutoPaintGenerateSize(mapType, width, height) {
  const currentId = sizeIdOf({ mapType, width, height })
  if (currentId !== 'custom') {
    return { width, height, sizeId: currentId, snapped: false }
  }

  const candidates = MAP_SIZES.map((entry) => {
    const size = sizeFor(mapType, entry.id)
    const areaDelta = Math.abs(size.width * size.height - width * height)
    const manhattan = Math.abs(size.width - width) + Math.abs(size.height - height)
    return { id: entry.id, ...size, areaDelta, manhattan }
  })
  candidates.sort((a, b) => a.areaDelta - b.areaDelta || a.manhattan - b.manhattan)
  const best = candidates[0]
  const snapped = best.width !== width || best.height !== height
  return { width: best.width, height: best.height, sizeId: best.id, snapped }
}
