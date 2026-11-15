/**
 * Board / spike3d directional key (cast shadows + figure shading).
 * Shared by World Generation’s Sun slider and Spike3dScene._placeSun.
 */
import { CAST_TILE } from '../maps/mapShadows.js'

const STORAGE_KEY = 'sta.boardSunSettings'

/** Warm key matching the previous hard-coded DirectionalLight. */
export const DEFAULT_BOARD_SUN_COLOUR = '#fff2e0'

/** Default orbit matches CAST_TILE (shadow toward screen bottom / +x+y). */
function defaultAzimuthDeg() {
  const len = Math.hypot(CAST_TILE.dx, CAST_TILE.dy) || 1
  // Light comes from the opposite of the cast offset.
  const deg = (Math.atan2(-CAST_TILE.dx / len, -CAST_TILE.dy / len) * 180) / Math.PI
  return ((Math.round(deg) % 360) + 360) % 360
}

export function normalizeBoardSunColour(raw) {
  if (typeof raw !== 'string') return DEFAULT_BOARD_SUN_COLOUR
  let value = raw.trim()
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    value = `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return DEFAULT_BOARD_SUN_COLOUR
  return value.toLowerCase()
}

export const DEFAULT_BOARD_SUN_SETTINGS = Object.freeze({
  azimuthDeg: defaultAzimuthDeg(),
  elevationDeg: 48,
  distance: 20,
  colour: DEFAULT_BOARD_SUN_COLOUR,
})

export function cloneBoardSunSettings(src = DEFAULT_BOARD_SUN_SETTINGS) {
  const base = { ...DEFAULT_BOARD_SUN_SETTINGS, ...src }
  return {
    azimuthDeg: ((Math.round(Number(base.azimuthDeg)) % 360) + 360) % 360,
    elevationDeg: Math.min(85, Math.max(5, Math.round(Number(base.elevationDeg)))),
    distance: Math.min(40, Math.max(8, Number(base.distance) || DEFAULT_BOARD_SUN_SETTINGS.distance)),
    colour: normalizeBoardSunColour(base.colour),
  }
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return cloneBoardSunSettings(JSON.parse(raw))
  } catch {
    return null
  }
}

let current = loadStored() ?? cloneBoardSunSettings()
let sunEpoch = 0
const listeners = new Set()

export function getBoardSunSettings() {
  return cloneBoardSunSettings(current)
}

/** Bumps when the Sun slider / colour changes — floor lighting / mapLayers watch this to repaint casts. */
export function boardSunEpoch() {
  return sunEpoch
}

export function setBoardSunSettings(partial) {
  current = cloneBoardSunSettings({ ...current, ...partial })
  sunEpoch += 1
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    /* ignore quota */
  }
  for (const fn of listeners) fn(getBoardSunSettings())
  return getBoardSunSettings()
}

/** Subscribe to sun slider changes (React panels). Returns unsubscribe. */
export function subscribeBoardSunSettings(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function offsetFromSpherical(azimuthDeg, elevationDeg, distance) {
  const az = (azimuthDeg * Math.PI) / 180
  const el = (elevationDeg * Math.PI) / 180
  const d = Math.max(0.5, distance)
  const cosEl = Math.cos(el)
  return {
    x: Math.sin(az) * cosEl * d,
    y: Math.sin(el) * d,
    z: Math.cos(az) * cosEl * d,
  }
}

/** World offset of the key from the look-at point (tile x/z). */
export function boardSunOffset(settings = current) {
  const s = cloneBoardSunSettings(settings)
  return offsetFromSpherical(s.azimuthDeg, s.elevationDeg, s.distance)
}

/**
 * Soft fill opposite the key so the shaded side stays readable as Sun orbit moves.
 * Lower / closer than the key; no shadow cast.
 */
export function boardSunFillOffset(settings = current) {
  const s = cloneBoardSunSettings(settings)
  return offsetFromSpherical(
    (s.azimuthDeg + 180) % 360,
    Math.min(55, Math.max(20, s.elevationDeg - 12)),
    Math.max(10, s.distance * 0.7),
  )
}

/** 0..1 saturation of the sun key (pale warm white ≈ 0.1, pure red ≈ 1). */
export function boardSunColourSaturation(settings = current) {
  const hex = cloneBoardSunSettings(settings).colour.slice(1)
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (!(max > 0)) return 0
  return (max - min) / max
}
