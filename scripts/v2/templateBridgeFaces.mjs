// TOS Bridge wall faces + prop materials for Template Pieces (Bridge Template kit).
// Same Constitution-class look as makeTilesBridge.mjs — light-grey walls, red accents,
// bright turbolift, deck/pit greys, black/red consoles — without importing the tile generator.
import { bevel, groove, hash, noise, rgb, scale, smoothstep } from './engine.mjs'

const WALL_GREY = rgb('#c8c8ce')
const WALL_TRIM = rgb('#9a9aa2')
const CHARCOAL = rgb('#2a2a30')
const FRAME = rgb('#5a5a62')
const HULL = rgb('#b8bcc6')
const HULL_PANEL = rgb('#9aa0ac')
const HULL_TRIM = rgb('#d0d4dc')
const HULL_DARK = rgb('#6a7080')
const BRIDGE_RED = rgb('#c42a2a')
const DECK_GREY = rgb('#6e6e76')
const WELL_GREY = rgb('#3c3c44')
const SEAT_BLUE = rgb('#6a8ab0')
const ARM_GREY = rgb('#a8a8b0')
const SCREEN_HUES = [rgb('#5ab0ff'), rgb('#ffb24a'), rgb('#6ee08a'), rgb('#ff6a5a'), rgb('#ffe080')]
const LIGHTS = [rgb('#ff4a3a'), rgb('#ffc040'), rgb('#4aa8ff'), rgb('#5ae07a'), rgb('#ffffff')]

const mod = (value, n) => ((value % n) + n) % n
const faceNoise = (u, v, freq, seed) => noise(u / freq, v / freq, seed)

function display(x, y, slot) {
  const hue = SCREEN_HUES[slot % SCREEN_HUES.length]
  const kind = slot % 4
  let on = false
  if (kind === 0) on = mod(x * 7, 1) < 0.6 && y < 0.2 + hash(Math.floor(x * 7), slot, 5) * 0.7
  if (kind === 1) {
    const r = Math.hypot(x - 0.5, (y - 0.5) * 0.8)
    on = Math.abs(r - 0.32) < 0.025 || Math.abs(r - 0.16) < 0.02 || (r < 0.32 && Math.abs(Math.atan2(y - 0.5, x - 0.5) - 0.7) < 0.12)
  }
  if (kind === 2) on = Math.abs(y - 0.5 - Math.sin(x * 14 + slot) * 0.22 * Math.sin(x * 3)) < 0.05
  if (kind === 3) on = (mod(x * 5, 1) < 0.08 || mod(y * 3, 1) < 0.1) && hash(Math.floor(x * 5), Math.floor(y * 3), slot) > 0.3
  return on
    ? { albedo: hue, emit: scale(hue, 0.75), tag: 'lights' }
    : { albedo: rgb('#05080c'), emit: scale(hue, 0.05), spec: 0.9, shininess: 90 }
}

function buttonAt(u, v, pitch, seed, lit) {
  const col = Math.floor(u / pitch)
  const row = Math.floor(v / pitch)
  const cx = (col + 0.5) * pitch
  const cy = (row + 0.5) * pitch
  if (Math.hypot(u - cx, v - cy) > pitch * 0.3) return null
  if (hash(col, row, seed) < 0.4) return { albedo: rgb('#141418'), spec: 0.4, shininess: 28 }
  const hue = LIGHTS[Math.floor(hash(col, row, seed + 3) * LIGHTS.length) % LIGHTS.length]
  return { albedo: hue, emit: scale(hue, lit), tag: 'lights' }
}

function bulkheadHeight(u, v, H) {
  let h = 0
  if (v < 7) h += 0.55 + groove(v - 7, 0.55, 0.55)
  if (v > H - 6) h += 0.45 + groove(v - (H - 6), 0.55, 0.45)
  h += groove(u, 0.3, 0.25) + groove(32 - u, 0.3, 0.25)
  return h
}

/** Station ring: light-grey bulkhead, red posts, display band + jellybean strip. */
function tosStationMaterial(H) {
  const band = [H * 0.38, H * 0.72]
  const inScreen = (u, v) => v > band[0] + 1.4 && v < band[1] - 1.4 && mod(u, 16) > 2 && mod(u, 16) < 14
  const redPost = (u) => mod(u + 2, 16) < 1.2
  return {
    height(u, v, face) {
      if (face === 'top') {
        const edge = Math.min(u, 32 - u)
        return bevel(edge, 1.2, 1) + groove(edge - 0.8, 0.3, 0.2)
      }
      if (face === 'end') return bulkheadHeight(u, v, H)
      if (inScreen(u, v)) return -0.8
      if (v > band[0] && v < band[1]) return 0.25
      if (redPost(u) && v > 8 && v < H - 4) return 0.35
      return bulkheadHeight(u, v, H)
    },
    surface(u, v, face) {
      if (face === 'top') return { albedo: WALL_TRIM, spec: 0.25, shininess: 28 }
      if (face === 'end') {
        return { albedo: scale(WALL_GREY, 0.96 + faceNoise(u, v, 8, 5) * 0.05), spec: 0.12, shininess: 16 }
      }
      const slot = Math.floor(u / 16) + (face === 'left' ? 0 : 2)
      if (inScreen(u, v)) return display((mod(u, 16) - 2) / 12, (v - band[0] - 1.4) / (band[1] - band[0] - 2.8), slot)
      if (v > band[0] && v < band[1]) return { albedo: FRAME, spec: 0.3, shininess: 26 }
      if (v > band[0] - 5 && v <= band[0]) {
        return buttonAt(u, v - band[0], 2.1, slot + 11, 0.55) ?? { albedo: rgb('#1a1a20'), spec: 0.4, shininess: 30 }
      }
      if (redPost(u) && v > 8 && v < H - 4) return { albedo: scale(BRIDGE_RED, 0.95), spec: 0.25, shininess: 28 }
      if (v < 8) return { albedo: scale(CHARCOAL, 0.95 + faceNoise(u, v, 8, 4) * 0.06), spec: 0.25, shininess: 28 }
      if (v > H - 4) return { albedo: scale(WALL_TRIM, 0.9), spec: 0.25, shininess: 26 }
      return { albedo: scale(WALL_GREY, 0.97 + faceNoise(u, v, 10, 5) * 0.05), spec: 0.12, shininess: 16 }
    },
  }
}

function tosViewscreenMaterial(H) {
  const inScreen = (u, v) => v > H * 0.18 && v < H * 0.88
  return {
    height(u, v, face) {
      if (face === 'top') {
        const edge = Math.min(u, 32 - u)
        return bevel(edge, 1.2, 1)
      }
      if (face === 'end') return bulkheadHeight(u, v, H)
      return inScreen(u, v) ? -1 : bulkheadHeight(u, v, H)
    },
    surface(u, v, face) {
      if (face === 'top') return { albedo: WALL_TRIM, spec: 0.25, shininess: 28 }
      if (face === 'end' || !inScreen(u, v)) {
        return v < H * 0.18 ? { albedo: CHARCOAL, spec: 0.25, shininess: 28 } : { albedo: WALL_GREY, spec: 0.15, shininess: 18 }
      }
      const w = face === 'left' ? u : u + 32
      if (hash(Math.floor(w * 1.4), Math.floor(v * 1.4), 9) > 0.985) {
        return { albedo: rgb('#ffffff'), emit: rgb('#dde8ff'), tag: 'lights' }
      }
      const nebula = Math.max(0, faceNoise(u, v, 2, 31) - 0.45) * faceNoise(u, v, 4, 32)
      return { albedo: rgb('#02040a'), emit: scale(rgb('#3050a0'), nebula * 0.55), spec: 0.9, shininess: 90, tag: 'lights' }
    },
  }
}

function tosTurboliftMaterial(H) {
  return {
    height(u, v, face) {
      if (face === 'top') {
        const edge = Math.min(u, 32 - u)
        return bevel(edge, 1.2, 1)
      }
      if (face === 'end') return bulkheadHeight(u, v, H)
      if (u > 5 && u < 27 && v < H * 0.8) return Math.abs(u - 16) < 0.35 ? -0.7 : 0.45
      return bulkheadHeight(u, v, H)
    },
    surface(u, v, face) {
      if (face === 'top') return { albedo: WALL_TRIM, spec: 0.25, shininess: 28 }
      if (u > 5 && u < 27 && v < H * 0.8) {
        if (Math.abs(u - 16) < 0.35) return { albedo: rgb('#1a0606') }
        return { albedo: scale(BRIDGE_RED, 0.92 + (v / H) * 0.12), spec: 0.35, shininess: 32 }
      }
      if (u > 13 && u < 19 && Math.abs(v - H * 0.86) < 1.3) {
        return { albedo: rgb('#ffe0a0'), emit: rgb('#ffd080'), tag: 'lights' }
      }
      return { albedo: v < H * 0.1 ? CHARCOAL : WALL_GREY, spec: 0.12, shininess: 16 }
    },
  }
}

/** Exterior saucer hull: light silver-grey panels, rivets, seams, kick/cap. */
function tosHullMaterial(H) {
  const rivet = (u, v) => {
    const cu = Math.abs(mod(u, 8) - 4)
    const cv = Math.abs(mod(v, 10) - 5)
    return cu < 0.55 && cv < 0.55
  }
  const seamU = (u) => Math.abs(mod(u, 16) - 8) < 0.35
  const seamV = (v) => Math.abs(v - H * 0.48) < 0.4 || Math.abs(v - H * 0.72) < 0.35
  return {
    height(u, v, face) {
      if (face === 'top') {
        const edge = Math.min(u, 32 - u)
        return bevel(edge, 1.5, 1.2) + groove(edge - 1, 0.4, 0.3)
      }
      let h = 0
      if (v < 6) h += 0.7 + groove(v - 6, 0.6, 0.5)
      if (v > H - 5) h += 0.55 + groove(v - (H - 5), 0.5, 0.4)
      if (seamU(u)) h -= 0.45
      if (seamV(v)) h -= 0.35
      const panel = Math.min(u - 2, 30 - u, v - 9, H - 8 - v)
      if (panel > 0) h -= 0.55 * smoothstep(0, 1.4, panel)
      if (rivet(u, v) && v > 8 && v < H - 6) h += 0.55
      h += groove(u, 0.25, 0.2) + groove(32 - u, 0.25, 0.2)
      return h
    },
    surface(u, v, face) {
      const ao = 0.7 + 0.3 * smoothstep(0, 14, v)
      if (face === 'top') {
        return { albedo: scale(HULL_TRIM, 0.94 + noise(u / 5, v / 5, 84) * 0.08), spec: 0.35, shininess: 30 }
      }
      if (v < 6) return { albedo: scale(HULL_DARK, 0.95), spec: 0.3, shininess: 28, ao }
      if (v > H - 5) return { albedo: scale(HULL_TRIM, 0.96), spec: 0.32, shininess: 28, ao }
      if (seamU(u) || seamV(v)) return { albedo: scale(HULL_DARK, 0.9), spec: 0.2, shininess: 22, ao }
      if (rivet(u, v) && v > 8 && v < H - 6) {
        return { albedo: scale(HULL_TRIM, 1.05), spec: 0.55, shininess: 45, ao }
      }
      const panel = Math.min(u - 2, 30 - u, v - 9, H - 8 - v) > 0
      const base = panel ? HULL_PANEL : HULL
      const brush = 0.96 + noise(u * 0.3, v * 4, face === 'left' ? 84 : 85) * 0.08
      return { albedo: scale(base, brush), spec: 0.32, shininess: 28, ao }
    },
  }
}

/** Exterior with a band of circular viewports. */
function tosHullWindowMaterial(H) {
  const base = tosHullMaterial(H)
  const band = [H * 0.36, H * 0.62]
  const inPort = (u, v) => {
    if (v < band[0] || v > band[1]) return false
    const local = mod(u, 10.5)
    const cx = 5.25
    const cy = (band[0] + band[1]) / 2
    return Math.hypot(local - cx, (v - cy) * 1.15) < 3.2
  }
  return {
    height(u, v, face) {
      if (face !== 'top' && face !== 'end' && inPort(u, v)) return -1.1
      return base.height(u, v, face)
    },
    surface(u, v, face) {
      if (face !== 'top' && face !== 'end' && inPort(u, v)) {
        const local = mod(u, 10.5)
        const cx = 5.25
        const cy = (band[0] + band[1]) / 2
        const r = Math.hypot(local - cx, (v - cy) * 1.15)
        if (r > 2.7) return { albedo: HULL_DARK, spec: 0.4, shininess: 36 }
        if (hash(Math.floor(u * 2), Math.floor(v * 2), 41) > 0.97) {
          return { albedo: rgb('#ffffff'), emit: rgb('#c8d8ff'), tag: 'lights' }
        }
        return {
          albedo: rgb('#04060c'),
          emit: scale(rgb('#203868'), 0.25 + faceNoise(u, v, 3, 42) * 0.2),
          spec: 0.9,
          shininess: 80,
          tag: 'lights',
        }
      }
      return base.surface(u, v, face)
    },
  }
}

/** Exterior docking / service bay hatch. */
function tosHullBayMaterial(H) {
  const base = tosHullMaterial(H)
  const inBay = (u, v) => u > 6 && u < 26 && v > H * 0.22 && v < H * 0.78
  return {
    height(u, v, face) {
      if (face !== 'top' && face !== 'end' && inBay(u, v)) {
        if (Math.abs(u - 16) < 0.4 || Math.abs(v - H * 0.5) < 0.35) return -0.7
        return 0.55
      }
      return base.height(u, v, face)
    },
    surface(u, v, face) {
      if (face !== 'top' && face !== 'end' && inBay(u, v)) {
        if (Math.abs(u - 16) < 0.4 || Math.abs(v - H * 0.5) < 0.35) return { albedo: HULL_DARK, spec: 0.25, shininess: 24 }
        if (u > 14 && u < 18 && v > H * 0.7 && v < H * 0.76) {
          return { albedo: rgb('#60ff90'), emit: rgb('#40e070'), tag: 'lights' }
        }
        return { albedo: scale(HULL_PANEL, 0.92 + (v / H) * 0.08), spec: 0.35, shininess: 30 }
      }
      return base.surface(u, v, face)
    },
  }
}

const BRIDGE_WALL_MAKERS = {
  tosStation: tosStationMaterial,
  tosViewscreen: tosViewscreenMaterial,
  tosTurbolift: tosTurboliftMaterial,
  tosHull: tosHullMaterial,
  tosHullWindow: tosHullWindowMaterial,
  tosHullBay: tosHullBayMaterial,
}

export const BRIDGE_WALL_FACES = Object.keys(BRIDGE_WALL_MAKERS)

export function isBridgeWallFace(face) {
  return Boolean(face && BRIDGE_WALL_MAKERS[face])
}

export function bridgeWallMaterial(height, face) {
  const H = Math.max(32, height || 92)
  const make = BRIDGE_WALL_MAKERS[face]
  return make ? make(H) : tosStationMaterial(H)
}

function carpetPlate(colour, seed) {
  return {
    height() {
      return 0
    },
    surface(u, v) {
      const weave = (noise(u * 4, v * 4, seed) - 0.5) * 0.07
      const drift = (noise(u, v, seed + 1) - 0.5) * 0.08
      return { albedo: scale(colour, 1 + weave + drift), spec: 0.04, shininess: 8 }
    },
  }
}

function tosChairMaterial() {
  const body = rgb('#1a1a1e')
  return {
    height(u, v, face) {
      if (face === 'top') return bevel(Math.min(u, 32 - u, v, 32 - v), 1.2, 0.8)
      return 0.2
    },
    surface(u, v, face) {
      if (face === 'top') return { albedo: scale(body, 0.95 + noise(u / 8, v / 8, 161) * 0.06), spec: 0.35, shininess: 34 }
      if (v < 10) return { albedo: scale(ARM_GREY, 0.92 + noise(u * 0.4, v * 4, 162) * 0.08), spec: 0.4, shininess: 36 }
      return { albedo: scale(body, 0.94 + noise(u / 6, v / 6, 163) * 0.06), spec: 0.35, shininess: 34 }
    },
  }
}

function tosSeatPadMaterial() {
  return {
    height() {
      return 0.1
    },
    surface() {
      return { albedo: scale(SEAT_BLUE, 0.96), spec: 0.28, shininess: 26 }
    },
  }
}

function tosConsoleMaterial() {
  const body = rgb('#1e1e24')
  return {
    height(u, v, face) {
      if (face === 'top') return 0.15
      return 0.1
    },
    surface(u, v, face) {
      if (face === 'top') {
        const btn = buttonAt(u, v, 2.2, 31, 0.55)
        if (btn) return btn
        return { albedo: rgb('#2a2a32'), spec: 0.4, shininess: 34 }
      }
      return { albedo: scale(body, 0.94 + noise(u * 0.3, v * 4, 41) * 0.06), spec: 0.35, shininess: 30 }
    },
  }
}

function tosConsoleRedMaterial() {
  return {
    height() {
      return 0.15
    },
    surface() {
      return { albedo: scale(BRIDGE_RED, 0.95), spec: 0.3, shininess: 30 }
    },
  }
}

function tosConsoleScreenMaterial() {
  return {
    height() {
      return -0.4
    },
    surface(u, v) {
      return display(u / 32, v / 40, Math.floor(u / 10) + 1)
    },
  }
}

function tosRailMaterial() {
  return {
    height(u, v, face) {
      if (face === 'top') return bevel(Math.min(u, 32 - u), 0.8, 0.6)
      return 0.15
    },
    surface(u, v, face) {
      if (v < 8) return { albedo: scale(CHARCOAL, 0.95), spec: 0.35, shininess: 30 }
      if (face === 'top' || v > 16) return { albedo: scale(BRIDGE_RED, 0.96 + noise(u / 5, v / 5, 201) * 0.04), spec: 0.4, shininess: 34 }
      return { albedo: scale(rgb('#8a8c92'), 0.92), spec: 0.4, shininess: 36 }
    },
  }
}

function tosHullPlateMaterial() {
  return {
    height(u, v, face) {
      if (face === 'top') {
        const seam = Math.min(Math.abs(mod(u, 16) - 8), Math.abs(mod(v, 16) - 8))
        return groove(seam, 0.4, 0.25)
      }
      return 0
    },
    surface(u, v, face) {
      if (face !== 'top') return { albedo: scale(HULL_DARK, 0.95), spec: 0.3, shininess: 26 }
      const panel = (Math.floor(u / 16) + Math.floor(v / 16)) % 2 === 0
      const base = panel ? HULL : HULL_PANEL
      return { albedo: scale(base, 0.97 + noise(u / 8, v / 8, 90) * 0.06), spec: 0.3, shininess: 26 }
    },
  }
}

export function bridgePropMaterial(kind) {
  switch (kind) {
    case 'tosDeck':
      return carpetPlate(DECK_GREY, 71)
    case 'tosWell':
      return carpetPlate(WELL_GREY, 72)
    case 'tosHullPlate':
      return tosHullPlateMaterial()
    case 'tosChair':
      return tosChairMaterial()
    case 'tosSeatPad':
      return tosSeatPadMaterial()
    case 'tosConsole':
      return tosConsoleMaterial()
    case 'tosConsoleRed':
      return tosConsoleRedMaterial()
    case 'tosConsoleScreen':
      return tosConsoleScreenMaterial()
    case 'tosRail':
      return tosRailMaterial()
    default:
      return null
  }
}
