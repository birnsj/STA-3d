// Dev map editor: OpenArt CLI generation through /__openart (DEV only). Never calls paid APIs from unit tests —
// the Vite plugin honours OPENART_MOCK=1 for mocked jobs.
import { requestJson } from '../files/jsonHttp.js'
import { addTileLocal, getTile, PALETTE_GROUPS, revealTileInPalette, TILES } from './mapFormat.js'
import { bumpSpriteCache, canEditSprites } from './spriteFiles.js'
import { canEditTiles } from './tileFiles.js'

export const canUseOpenArt = import.meta.env.DEV && (canEditTiles || canEditSprites)

// Preferred image2image model for tile restyle (OpenArt model id).
export const DEFAULT_OPENART_IMAGE_MODEL = 'kling-3-omni'

const endpoint = '/__openart'

export function paletteGroupIdForTile(tileId) {
  for (const group of PALETTE_GROUPS) {
    if (group.tiles?.includes(tileId)) return group.id
  }
  return null
}

function cleanArtPath(path) {
  return String(path || '').split('?')[0]
}

// Catalogue tiles that use this sprite path as their main (or panel/alt) image.
export function tilesUsingImage(imagePath) {
  const clean = cleanArtPath(imagePath)
  if (!clean) return []
  return TILES.filter((tile) => {
    if (cleanArtPath(tile.image) === clean) return true
    if (cleanArtPath(tile.altImage) === clean) return true
    if (cleanArtPath(tile.bigImage) === clean) return true
    for (const href of Object.values(tile.panelImages ?? {})) {
      if (cleanArtPath(href) === clean) return true
    }
    for (const href of Object.values(tile.runImages ?? {})) {
      if (cleanArtPath(href) === clean) return true
    }
    return false
  })
}

export async function fetchOpenArtModels(refresh = false) {
  if (!canUseOpenArt) throw new Error('OpenArt is only available in the Vite DEV server.')
  const q = refresh ? '?action=models&refresh=1' : '?action=models'
  return requestJson(`${endpoint}${q}`, 'GET')
}

export async function fetchOpenArtStatus() {
  if (!canUseOpenArt) throw new Error('OpenArt is only available in the Vite DEV server.')
  return requestJson(`${endpoint}?action=status`, 'GET')
}

export async function fetchOpenArtResult(jobId) {
  if (!canUseOpenArt) throw new Error('OpenArt is only available in the Vite DEV server.')
  return requestJson(`${endpoint}?action=result&id=${encodeURIComponent(jobId)}`, 'GET')
}

export async function quoteOpenArtCost(model, mode) {
  if (!canUseOpenArt) throw new Error('OpenArt is only available in the Vite DEV server.')
  return requestJson(endpoint, 'POST', { op: 'cost', model, mode })
}

export async function startOpenArtGeneration({
  prompt,
  model,
  referenceImagePath = null,
  referencePng = null,
  tileLabel = null,
  dryRun = false,
}) {
  if (!canUseOpenArt) throw new Error('OpenArt is only available in the Vite DEV server.')
  return requestJson(endpoint, 'POST', {
    op: 'generate',
    prompt,
    model,
    referenceImagePath,
    referencePng,
    tileLabel,
    dryRun: Boolean(dryRun),
  })
}

export async function discardOpenArtJob() {
  if (!canUseOpenArt) throw new Error('OpenArt is only available in the Vite DEV server.')
  return requestJson(endpoint, 'POST', { op: 'discard' })
}

// Poll until the current job leaves queued/running (or timeout).
export async function waitForOpenArtJob({ intervalMs = 500, timeoutMs = 6 * 60 * 1000 } = {}) {
  const started = Date.now()
  for (;;) {
    const snap = await fetchOpenArtStatus()
    const status = snap.job?.status
    if (!snap.busy && status && status !== 'queued' && status !== 'running') return snap
    if (!snap.job) return snap
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for OpenArt generation')
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

function modelsSupporting(models, mode) {
  return (models ?? []).filter((entry) => (entry.modes?.image ?? []).some((item) => item.mode === mode))
}

export function openArtImageModels(catalog, { requireImage2Image = false } = {}) {
  const models = catalog?.models ?? []
  const list = requireImage2Image
    ? modelsSupporting(models, 'image2image')
    : models.filter((entry) => (entry.modes?.image ?? []).length > 0)
  // Keep the preferred default near the top of the picker.
  return [...list].sort((a, b) => {
    if (a.id === DEFAULT_OPENART_IMAGE_MODEL) return -1
    if (b.id === DEFAULT_OPENART_IMAGE_MODEL) return 1
    return 0
  })
}

export function pickDefaultOpenArtModel(models, currentId = '') {
  if (currentId && models.some((entry) => entry.id === currentId)) return currentId
  if (models.some((entry) => entry.id === DEFAULT_OPENART_IMAGE_MODEL)) return DEFAULT_OPENART_IMAGE_MODEL
  return models[0]?.id || ''
}

export function estimateOpenArtCredits(catalog, modelId, mode) {
  const items = catalog?.costs?.items ?? []
  const hit = items.find((item) => item.model === modelId && item.mode === mode)
  return hit?.totalCredits ?? hit?.unitCredits ?? null
}

export async function importOpenArtTile({ label, png, sourceId, groupId = null }) {
  if (!canUseOpenArt) throw new Error('OpenArt import needs the Vite DEV server.')
  const body = {
    op: 'createTileFromArt',
    label,
    png,
    sourceId,
    groupId: groupId || paletteGroupIdForTile(sourceId),
  }
  const result = await requestJson('/__tiles', 'PUT', body)
  addTileLocal(result.tile, result.groupId)
  result.cacheVersion = bumpSpriteCache(result.version ?? Date.now())
  result.image = getTile(result.id)?.image ?? result.image
  revealTileInPalette({
    tileId: result.id,
    groupId: result.groupId,
    label: result.label,
  })
  return result
}

// Sprite Sheets Accept: new PNG beside the template (never overwrite). Optionally also create a catalogue tile.
export async function importOpenArtSprite({
  label,
  png,
  templatePath = null,
  templatePng = null,
  sourceId = null,
}) {
  if (!canUseOpenArt) throw new Error('OpenArt import needs the Vite DEV server.')
  if (sourceId && canEditTiles && !templatePng) {
    return importOpenArtTile({ label, png, sourceId })
  }
  const result = await requestJson('/__sprites', 'PUT', {
    op: 'createSiblingFromArt',
    templatePath,
    templatePng,
    label,
    png,
  })
  result.cacheVersion = bumpSpriteCache(result.version ?? Date.now())
  return result
}
