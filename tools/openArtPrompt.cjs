// Builds the full OpenArt prompt from a short designer intent.
// The UI only asks for the change (“Klingon”, “make it red”); geometry rules are applied here.

function buildTileRestylePrompt({ intent, tileLabel = null, hasReference = true } = {}) {
  const change = String(intent ?? '').trim()
  if (!change) throw new Error('Change text is required')

  if (!hasReference) {
    return [
      'Create a single isometric Star Trek Adventures game map tile sprite.',
      `Request: ${change}.`,
      'Transparent background outside the tile silhouette.',
      'No scenery, floors, characters, or extra objects.',
      'Keep a clean game-tile look suitable for an isometric map editor.',
    ].join(' ')
  }

  const name = tileLabel ? ` (“${String(tileLabel).trim()}”)` : ''
  return [
    `Edit this exact isometric game map tile sprite${name}.`,
    `User request: ${change}.`,
    'CRITICAL — treat the attached image as a hard template, not inspiration:',
    '- Keep the identical isometric/dimetric camera angle and perspective.',
    '- Keep the identical outer silhouette, proportions, and transparent pixels outside the shape.',
    '- Keep the same structure: edges, panel lines, openings, window placement, and overall geometry.',
    '- Change only materials, colours, weathering, faction styling, and surface detailing to satisfy the user request.',
    '- Do NOT flatten into an orthographic wall texture, front elevation, or seamless brick sheet.',
    '- Do NOT invent a new camera, crop, or reshape the footprint.',
    '- Do NOT add floors, sky, scenery, characters, or a new background.',
    '- Fill the same sprite bounds; keep transparency outside the original shape.',
    '- Output one clean game tile PNG (the editor will force-match the original pixel size and alpha silhouette).',
  ].join('\n')
}

module.exports = { buildTileRestylePrompt }
