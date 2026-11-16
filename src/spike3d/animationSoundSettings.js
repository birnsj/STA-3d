/**
 * Per-clip sound bindings for the Animation Viewer and runtime.
 * Defaults come from animationSounds.json; viewer overrides are mergeable / saveable JSON.
 * Each clip has an event id and a random chance (0–100). Chance 100 = always when triggered.
 */
import soundData from '../data/adaptation/animationSounds.json'

export const ANIMATION_SOUND_EVENTS = Object.freeze(soundData.events ?? [])

const DEFAULT_BINDINGS = Object.freeze({ ...(soundData.defaults ?? {}) })
const DEFAULT_CHANCES = Object.freeze({ ...(soundData.defaultChances ?? {}) })

/** Live overrides from the Animation Viewer (clip name → event id). Empty string = silence. */
let overrides = {}
/** Live chance overrides (clip name → 0..100). */
let chanceOverrides = {}

export const ANIMATION_SOUND_SETTINGS_VERSION = 2

export function listAnimationSoundEvents() {
  return ANIMATION_SOUND_EVENTS
}

export function defaultAnimationSoundBindings() {
  return { ...DEFAULT_BINDINGS }
}

export function defaultAnimationSoundChances() {
  return { ...DEFAULT_CHANCES }
}

export function cloneAnimationSoundSettings(src = null) {
  return { ...(src && typeof src === 'object' ? src : overrides) }
}

/** Resolved event id for a clip (override → default → ''). */
export function soundEventForClip(clipName, settings = null) {
  if (!clipName) return ''
  const table = settings && typeof settings === 'object' ? settings : overrides
  if (Object.prototype.hasOwnProperty.call(table, clipName)) {
    const value = table[clipName]
    return value == null ? '' : String(value)
  }
  return DEFAULT_BINDINGS[clipName] ?? ''
}

/** Chance 0–100 that a trigger actually plays (override → default → 100). */
export function soundChanceForClip(clipName, chances = null) {
  if (!clipName) return 100
  const table = chances && typeof chances === 'object' ? chances : chanceOverrides
  if (Object.prototype.hasOwnProperty.call(table, clipName)) {
    const value = Number(table[clipName])
    if (!Number.isFinite(value)) return 100
    return Math.min(100, Math.max(0, value))
  }
  const fallback = Number(DEFAULT_CHANCES[clipName])
  return Number.isFinite(fallback) ? Math.min(100, Math.max(0, fallback)) : 100
}

export function setAnimationSoundOverride(clipName, eventId) {
  if (!clipName) return
  if (eventId == null || eventId === DEFAULT_BINDINGS[clipName] || (eventId === '' && !DEFAULT_BINDINGS[clipName])) {
    const next = { ...overrides }
    delete next[clipName]
    overrides = next
    return
  }
  overrides = { ...overrides, [clipName]: String(eventId) }
}

export function setAnimationSoundChanceOverride(clipName, percent) {
  if (!clipName) return
  const value = Math.min(100, Math.max(0, Math.round(Number(percent))))
  if (!Number.isFinite(value)) return
  const defaultChance = Number.isFinite(Number(DEFAULT_CHANCES[clipName])) ? Number(DEFAULT_CHANCES[clipName]) : 100
  if (value === defaultChance) {
    const next = { ...chanceOverrides }
    delete next[clipName]
    chanceOverrides = next
    return
  }
  chanceOverrides = { ...chanceOverrides, [clipName]: value }
}

export function replaceAnimationSoundOverrides(next) {
  overrides = next && typeof next === 'object' ? { ...next } : {}
}

export function replaceAnimationSoundChanceOverrides(next) {
  chanceOverrides = {}
  if (!next || typeof next !== 'object') return
  for (const [clip, percent] of Object.entries(next)) {
    if (typeof clip !== 'string' || !clip) continue
    const value = Math.min(100, Math.max(0, Math.round(Number(percent))))
    if (!Number.isFinite(value)) continue
    chanceOverrides[clip] = value
  }
}

export function getAnimationSoundOverrides() {
  return { ...overrides }
}

export function getAnimationSoundChanceOverrides() {
  return { ...chanceOverrides }
}

export function serializeAnimationSoundSettings(
  bindings = overrides,
  chances = chanceOverrides,
) {
  return {
    schema: 'sta.animationSoundSettings',
    version: ANIMATION_SOUND_SETTINGS_VERSION,
    bindings: { ...bindings },
    chances: { ...chances },
  }
}

/**
 * @returns {{ settings: Record<string, string>, chances: Record<string, number> } | { error: string }}
 */
export function parseAnimationSoundSettingsFile(data) {
  if (!data || typeof data !== 'object') return { error: 'Not a JSON object.' }
  if (data.schema && data.schema !== 'sta.animationSoundSettings') {
    return { error: 'Not an animation sound settings file.' }
  }
  const raw = data.bindings && typeof data.bindings === 'object' ? data.bindings : data.settings ?? data
  if (!raw || typeof raw !== 'object') return { error: 'Missing bindings object.' }
  const settings = {}
  for (const [clip, eventId] of Object.entries(raw)) {
    if (typeof clip !== 'string' || !clip) continue
    // Ignore a nested chances key if someone saved flat.
    if (clip === 'chances' || clip === 'bindings') continue
    settings[clip] = eventId == null ? '' : String(eventId)
  }
  const chances = {}
  const rawChances = data.chances && typeof data.chances === 'object' ? data.chances : {}
  for (const [clip, percent] of Object.entries(rawChances)) {
    if (typeof clip !== 'string' || !clip) continue
    const value = Math.min(100, Math.max(0, Math.round(Number(percent))))
    if (!Number.isFinite(value)) continue
    chances[clip] = value
  }
  return { settings, chances }
}
