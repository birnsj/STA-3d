// Recent maps for Dev Edit File → Open Recent (localStorage; presentation only).

const STORAGE_KEY = 'sta.mapEditor.recentMaps'
const MAX_RECENT = 10

function readRaw() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((entry) => entry && typeof entry.id === 'string' && entry.id.trim())
      .map((entry) => ({ id: entry.id.trim(), name: String(entry.name || entry.id).trim() || entry.id }))
      .slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function writeRaw(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_RECENT)))
  } catch {
    // Quota / private mode — Open Recent just stays empty.
  }
  return entries.slice(0, MAX_RECENT)
}

/** [{ id, name }] most-recent first. */
export function listRecentMaps() {
  return readRaw()
}

/** Push a map to the front of the recent list (load / save). */
export function noteRecentMap({ id, name }) {
  if (!id || typeof id !== 'string') return listRecentMaps()
  const entry = { id, name: name || id }
  return writeRaw([entry, ...readRaw().filter((other) => other.id !== id)])
}

/** Drop one id (deleted map or failed load). */
export function removeRecentMap(id) {
  if (!id) return listRecentMaps()
  return writeRaw(readRaw().filter((entry) => entry.id !== id))
}

/**
 * Keep only ids that still exist; refresh display names from `available` summaries.
 * @param {{ id: string, name?: string }[]} available
 */
export function pruneRecentMaps(available) {
  const byId = new Map((available ?? []).map((entry) => [entry.id, entry]))
  const next = readRaw()
    .filter((entry) => byId.has(entry.id))
    .map((entry) => ({ id: entry.id, name: byId.get(entry.id)?.name || entry.name }))
  return writeRaw(next)
}
