// Generate New Map size snap — World Generation owns these presets (seeded from former deck sizes).

const SIZE_PRESETS = Object.freeze({
  small: { width: 14, height: 10 },
  medium: { width: 20, height: 14 },
  large: { width: 28, height: 20 },
  huge: { width: 40, height: 28 },
  gigantic: { width: 80, height: 56 },
})

const SIZE_IDS = Object.freeze(['small', 'medium', 'large', 'huge', 'gigantic'])

function sizeIdOf(width, height) {
  for (const id of SIZE_IDS) {
    const size = SIZE_PRESETS[id]
    if (size.width === width && size.height === height) return id
  }
  return 'custom'
}

/**
 * Snap open-map size to the closest World Generation preset.
 * `mapType` is ignored (kept for call-site compatibility).
 */
export function snapAutoPaintGenerateSize(_mapType, width, height) {
  const currentId = sizeIdOf(width, height)
  if (currentId !== 'custom') {
    return { width, height, sizeId: currentId, snapped: false }
  }

  const candidates = SIZE_IDS.map((id) => {
    const size = SIZE_PRESETS[id]
    const areaDelta = Math.abs(size.width * size.height - width * height)
    const manhattan = Math.abs(size.width - width) + Math.abs(size.height - height)
    return { id, ...size, areaDelta, manhattan }
  })
  candidates.sort((a, b) => a.areaDelta - b.areaDelta || a.manhattan - b.manhattan)
  const best = candidates[0]
  const snapped = best.width !== width || best.height !== height
  return { width: best.width, height: best.height, sizeId: best.id, snapped }
}
