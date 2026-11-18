// v2 art for the Bridge (TOS) tile set — matched to Constitution-class bridge reference:
// light-grey station walls with inset displays, bright-red turbolift, medium-grey outer deck,
// darker command pit, black/red consoles with jellybean lights, boxy captain's chair, blue-padded
// crew seats, thick red rail. Same renderer/sizes as other v2 art (engine.mjs).
//
// Run with: node scripts/makeTilesBridge.mjs --force [--sheet]
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'
import { blockScene, FORCE, floorScene, hash, imageHeightFor, outFile, OUT_H, OUT_W, render, renderTile, rgb, scale } from './v2/engine.mjs'
import { box, capsule, cylinder, objectScene, sphere, tileNoise, faceNoise, writeSheet } from './v2/kit.mjs'
import { builtWall } from './v2/walls.mjs'
import { glow, matte, metal } from './v2/objects.mjs'

const hex = rgb
const C = 16
const mod = (x, n) => ((x % n) + n) % n
const part = (sdf, mat) => ({ sdf, mat })
const WALL_H = 64

// Reference palette (TOS bridge set / lighting).
const WALL_GREY = hex('#c8c8ce')
const WALL_TRIM = hex('#9a9aa2')
const CHARCOAL = hex('#2a2a30')
const DECK_GREY = hex('#6e6e76')
const WELL_GREY = hex('#3c3c44')
const BRIDGE_RED = hex('#c42a2a')
const RED_EDGE = hex('#b82020')
const ARM_GREY = hex('#a8a8b0')
const SEAT_BLUE = hex('#6a8ab0')
const SCREEN_HUES = ['#5ab0ff', '#ffb24a', '#6ee08a', '#ff6a5a', '#ffe080'].map(hex)
const LIGHTS = ['#ff4a3a', '#ffc040', '#4aa8ff', '#5ae07a', '#ffffff'].map(hex)

function buttonAt(a, b, cell, seed, lit = 0.55) {
  const i = Math.floor(a / cell)
  const j = Math.floor(b / cell)
  const inCell = Math.max(Math.abs(mod(a, cell) - cell / 2), Math.abs(mod(b, cell) - cell / 2)) < cell * 0.32
  if (!inCell) return null
  if (hash(i, j, seed + 3) > lit) return { albedo: hex('#141418'), spec: 0.5, shininess: 50 }
  const colour = LIGHTS[Math.floor(hash(i, j, seed) * LIGHTS.length)]
  return { albedo: colour, emit: scale(colour, 0.85), tag: 'lights' }
}

const carpet = ({ colour, seed, alt = false }) => ({
  height: () => 0,
  surface(u, v) {
    const weave = (tileNoise(u * 4, v * 4, 32, seed) - 0.5) * 0.07
    const drift = (tileNoise(u, v, 4, seed + (alt ? 9 : 1)) - 0.5) * 0.08
    return { albedo: scale(colour, 1 + weave + drift), spec: 0.04, shininess: 8 }
  },
})
const deck = (alt) => carpet({ colour: DECK_GREY, seed: 71, alt })
const well = (alt) => carpet({ colour: WELL_GREY, seed: 72, alt })

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
    ? { albedo: hue, emit: scale(hue, 0.75), tag: 'glow' }
    : { albedo: hex('#05080c'), emit: scale(hue, 0.05), spec: 0.9, shininess: 90 }
}

// Station wall: light-grey bulkhead, red vertical accents, band of framed displays + button strip.
const stationBand = () => (H) => {
  const band = [H * 0.38, H * 0.72]
  const inScreen = (u, v) => v > band[0] + 1.4 && v < band[1] - 1.4 && mod(u, 16) > 2 && mod(u, 16) < 14
  const redPost = (u) => mod(u + 2, 16) < 1.2
  return {
    height(u, v, face) {
      if (face === 'top') return null
      if (inScreen(u, v)) return -0.8
      if (v > band[0] && v < band[1]) return 0.25
      if (redPost(u) && v > 8 && v < H - 4) return 0.35
      return null
    },
    surface(u, v, face) {
      if (face === 'top') return { albedo: WALL_TRIM, spec: 0.25, shininess: 28 }
      const slot = Math.floor(u / 16) + (face === 'left' ? 0 : 2)
      if (inScreen(u, v)) return display((mod(u, 16) - 2) / 12, (v - band[0] - 1.4) / (band[1] - band[0] - 2.8), slot)
      if (v > band[0] && v < band[1]) return { albedo: hex('#5a5a62'), spec: 0.3, shininess: 26 }
      if (v > band[0] - 5 && v <= band[0]) {
        return buttonAt(u, v - band[0], 2.1, slot + 11, 0.5) ?? { albedo: hex('#1a1a20'), spec: 0.4, shininess: 30 }
      }
      if (redPost(u) && v > 8 && v < H - 4) return { albedo: scale(BRIDGE_RED, 0.95), spec: 0.25, shininess: 28 }
      if (v < 8) return { albedo: scale(CHARCOAL, 0.95 + faceNoise(u, v, 8, 4) * 0.06), spec: 0.25, shininess: 28 }
      if (v > H - 4) return { albedo: scale(WALL_TRIM, 0.9), spec: 0.25, shininess: 26 }
      return { albedo: scale(WALL_GREY, 0.97 + faceNoise(u, v, 10, 5) * 0.05), spec: 0.12, shininess: 16 }
    },
  }
}
const stationWall = builtWall({
  kind: 'panels',
  colour: WALL_GREY,
  trim: WALL_TRIM,
  dark: hex('#8a8a92'),
  gloss: 0.15,
  seed: 81,
  extra: stationBand(),
})

// Main viewscreen: large dark screen in a light frame (neighbours join across the run).
const viewscreen = () => (H) => {
  const inScreen = (u, v) => v > H * 0.18 && v < H * 0.88
  return {
    height(u, v, face) {
      if (face === 'top') return null
      return inScreen(u, v) ? -1 : null
    },
    surface(u, v, face) {
      if (face === 'top') return { albedo: WALL_TRIM, spec: 0.25, shininess: 28 }
      if (!inScreen(u, v)) {
        return v < H * 0.18
          ? { albedo: CHARCOAL, spec: 0.25, shininess: 28 }
          : { albedo: WALL_GREY, spec: 0.15, shininess: 18 }
      }
      const w = face === 'left' ? u : u + 32
      if (hash(Math.floor(w * 1.4), Math.floor(v * 1.4), 9) > 0.985) {
        return { albedo: hex('#ffffff'), emit: hex('#dde8ff'), tag: 'glow' }
      }
      const nebula = Math.max(0, faceNoise(u, v, 2, 31) - 0.45) * faceNoise(u, v, 4, 32)
      return {
        albedo: hex('#02040a'),
        emit: scale(hex('#3050a0'), nebula * 0.55),
        spec: 0.9,
        shininess: 90,
        tag: 'glow',
      }
    },
  }
}
const viewscreenWall = builtWall({
  kind: 'panels',
  colour: WALL_GREY,
  trim: WALL_TRIM,
  dark: CHARCOAL,
  gloss: 0.15,
  seed: 82,
  extra: viewscreen(),
})

// Turbolift: bright saturated red double doors in a light-grey frame.
const liftDoors = () => (H) => ({
  height(u, v, face) {
    if (face === 'top') return null
    if (u > 5 && u < 27 && v < H * 0.8) return Math.abs(u - 16) < 0.35 ? -0.7 : 0.45
    return null
  },
  surface(u, v, face) {
    if (face === 'top') return { albedo: WALL_TRIM, spec: 0.25, shininess: 28 }
    if (u > 5 && u < 27 && v < H * 0.8) {
      if (Math.abs(u - 16) < 0.35) return { albedo: hex('#1a0606') }
      return { albedo: scale(BRIDGE_RED, 0.92 + (v / H) * 0.12), spec: 0.35, shininess: 32 }
    }
    if (u > 13 && u < 19 && Math.abs(v - H * 0.86) < 1.3) {
      return { albedo: hex('#ffe0a0'), emit: hex('#ffd080'), tag: 'lights' }
    }
    return { albedo: v < H * 0.1 ? CHARCOAL : WALL_GREY, spec: 0.12, shininess: 16 }
  },
})
const turboliftWall = builtWall({
  kind: 'panels',
  colour: WALL_GREY,
  trim: WALL_TRIM,
  dark: CHARCOAL,
  gloss: 0.15,
  seed: 83,
  extra: liftDoors(),
})

// Exterior: light saucer-hull grey with panel seams (matches Bridge Template hull).
const hullExtra = () => (H) => ({
  height(u, v, face) {
    if (face === 'top') return null
    const seamU = Math.abs(mod(u, 16) - 8) < 0.35
    const panel = Math.min(u - 2, 30 - u, v - 9, H - 8 - v)
    let h = 0
    if (seamU) h -= 0.4
    if (panel > 0) h -= 0.5 * Math.min(1, panel)
    return h === 0 ? null : h
  },
  surface(u, v, face) {
    if (face === 'top') return { albedo: hex('#d0d4dc'), spec: 0.35, shininess: 30 }
    if (v < 6) return { albedo: hex('#6a7080'), spec: 0.3, shininess: 28 }
    if (Math.abs(mod(u, 16) - 8) < 0.35) return { albedo: hex('#6a7080'), spec: 0.2, shininess: 22 }
    const panel = Math.min(u - 2, 30 - u, v - 9, H - 8 - v) > 0
    return {
      albedo: scale(panel ? hex('#9aa0ac') : hex('#b8bcc6'), 0.96 + faceNoise(u, v, 8, 84) * 0.08),
      spec: 0.32,
      shininess: 28,
    }
  },
})
const hullWall = builtWall({
  kind: 'panels',
  colour: hex('#b8bcc6'),
  trim: hex('#d0d4dc'),
  dark: hex('#6a7080'),
  across: 2,
  gloss: 0.25,
  seed: 84,
  extra: hullExtra(),
})

// ---------- objects ----------
const black = matte(hex('#1a1a1e'), { spec: 0.35, shininess: 34, vary: 0.05 })
const bluePad = matte(SEAT_BLUE, { spec: 0.3, shininess: 28, vary: 0.06 })
const steel = metal(hex('#8a8c92'), { grime: 0.03 })
const armMetal = metal(ARM_GREY, { spec: 0.4, grime: 0.03 })
const consoleDark = metal(hex('#1e1e24'), { spec: 0.35, grime: 0.03 })
const consoleRed = matte(RED_EDGE, { spec: 0.3, shininess: 30, vary: 0.04 })

const panelTop = (seed, lit) => (p, n) =>
  n[2] > 0.55 ? buttonAt(p[0], p[1], 2.2, seed, lit) ?? { albedo: hex('#2a2a32'), spec: 0.4, shininess: 34 } : consoleDark(p, n)

const screenFace = (slot, facing, at) => (p, n) => (facing(n) ? display(...at(p), slot) : consoleDark(p, n))

// TOS crew seat: four-prong base, pedestal, blue pad, black wraparound shell (open toward +y).
function crewSeat(x, y) {
  return [
    part(
      (p) =>
        Math.min(
          box(p, [x, y, 0.35], [5.2, 5.2, 0.35], 0.15),
          cylinder(p, x, y, 0.85, 0, 7.5, 0.2),
        ),
      black,
    ),
    part((p) => cylinder(p, x, y, 4.0, 7.5, 9.8, 0.9), bluePad),
    // Wraparound back/sides — open on the +y (approach) side.
    part(
      (p) => {
        const shell = Math.max(cylinder(p, x, y, 5.0, 8.5, 17.5, 1.1), -cylinder(p, x, y, 3.5, 8.5, 17.5, 0.9))
        const openFront = p[1] - (y + 1.2)
        return Math.max(shell, openFront)
      },
      black,
    ),
  ]
}

// Captain's chair on a short rectangular dais (command platform).
function captainsChair() {
  return objectScene({
    ground: well(false),
    top: 30,
    parts: [
      // Raised rectangular platform under the chair.
      part((p) => box(p, [C, C + 1, 1.2], [11, 10, 1.2], 0.4), metal(hex('#4a4a52'), { grime: 0.04 })),
      // Pedestal
      part((p) => Math.min(cylinder(p, C, C + 1, 3.2, 2, 10, 0.4), cylinder(p, C, C + 1, 6.5, 2, 3.2, 0.4)), steel),
      // Seat + tall boxy back (black)
      part(
        (p) =>
          Math.min(
            box(p, [C, C + 1, 12], [9, 8.5, 2.4], 1.4),
            box(p, [C, C + 8, 20], [9, 2, 10], 1.4),
            box(p, [C, C + 8.5, 28], [7, 1.4, 2.5], 0.8),
          ),
        black,
      ),
      // Light-grey armrests with jellybean pads
      part(
        (p) =>
          Math.min(
            box(p, [C - 10, C, 15.5], [2, 7.5, 1.8], 0.5),
            box(p, [C + 10, C, 15.5], [2, 7.5, 1.8], 0.5),
          ),
        (p, n) =>
          n[2] > 0.55 && p[1] < C + 2
            ? buttonAt(p[0] + 0.4, p[1], 1.7, 21, 0.85) ?? { albedo: hex('#2a2a30') }
            : armMetal(p, n),
      ),
    ],
  })
}

// Helm / navigation: wide wedge console (joins along x), red face, dual seats toward +y.
function helmConsole() {
  return objectScene({
    ground: well(false),
    top: 22,
    parts: [
      // Main body — black top, thick red front edge facing captain (+y)
      part((p) => Math.max(box(p, [C, C - 1, 6], [16, 7, 6], 0.6), p[2] - 12.5 + (p[1] - (C - 1)) * 0.4), panelTop(31, 0.55)),
      part((p) => box(p, [C, C + 5.5, 5], [15.5, 1.2, 5], 0.3), consoleRed),
      // Small readout facing the seats
      part((p) => box(p, [C, C - 7, 15], [6, 1.1, 3.2], 0.4), screenFace(1, (n) => n[1] > 0.45, (p) => [(p[0] - C + 5) / 10, (p[2] - 12.5) / 5])),
      ...crewSeat(C - 5.5, C + 10),
      ...crewSeat(C + 5.5, C + 10),
    ],
  })
}

// Outer-ring station against -x wall: black desk, red front lip toward the room, wall display, crew seat.
function stationConsole({ seed, slot, hood = false }) {
  const parts = [
    part((p) => Math.max(box(p, [C - 9, C, 6.5], [7, 16, 6.5], 0.6), p[2] - 13.5 + (p[0] - (C - 9)) * 0.35), panelTop(seed, 0.5)),
    // Red vertical face toward the bridge interior (+x)
    part((p) => box(p, [C - 2.2, C, 5.5], [1.1, 15.5, 5.5], 0.3), consoleRed),
    part(
      (p) => box(p, [C - 14.2, C, 19], [1.5, 12, 6], 0.5),
      screenFace(slot, (n) => n[0] > 0.45, (p) => [(C + 11 - p[1]) / 22, (p[2] - 14) / 10]),
    ),
    ...crewSeat(C + 6, C),
  ]
  if (hood) {
    parts.push(
      part((p) => Math.max(box(p, [C - 8.5, C + 5, 17], [3.8, 3.8, 4.2], 1), -box(p, [C - 5.2, C + 5, 17], [1.5, 2.2, 2.4], 0.4)), consoleDark),
      part((p) => sphere(p, [C - 7.2, C + 5, 17.5], 1.7), glow(hex('#5ad0ff'), 1.3)),
    )
  }
  return objectScene({ ground: deck(false), top: 28, parts })
}

// Thick red padded rail on black posts / charcoal divider (joins via railJoins).
const RAIL_DIRECTIONS = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] }
const segment2d = (p, a, b) => {
  const [abx, aby] = [b[0] - a[0], b[1] - a[1]]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (abx * abx + aby * aby)))
  return Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t)
}
function railing(ends) {
  const divider = (p) => Math.min(...ends.map((end) => Math.max(segment2d(p, [C, C], end) - 1.1, Math.abs(p[2] - 3.5) - 3.2) - 0.25))
  const posts = (p) => Math.min(...ends.map((end) => cylinder(p, (C + end[0]) / 2, (C + end[1]) / 2, 0.85, 6, 11)))
  const rail = (p) => Math.min(...ends.map((end) => capsule(p, [C, C, 12.5], [end[0], end[1], 12.5], 2.2)))
  return objectScene({
    ground: deck(false),
    top: 16,
    parts: [
      part(divider, metal(CHARCOAL, { spec: 0.35, grime: 0.03 })),
      part(posts, black),
      part(rail, matte(BRIDGE_RED, { spec: 0.4, shininess: 34, vary: 0.05 })),
    ],
  })
}
const endTowards = (d) => [C + RAIL_DIRECTIONS[d][0] * 17, C + RAIL_DIRECTIONS[d][1] * 17]
const railJoins = () => {
  const names = Object.keys(RAIL_DIRECTIONS)
  const sets = names.map((a) => [a])
  names.forEach((a, i) => names.slice(i + 1).forEach((b) => sets.push([a, b])))
  return sets.map((set) => [`tosRail-${set.join('-')}.png`, object(() => railing(set.map(endTowards)))])
}

const wall = (material) => () => renderTile(blockScene(WALL_H, material(WALL_H)), imageHeightFor(WALL_H))
const object = (scene) => () => render(scene(), { subsamples: 2 })
const JOBS = [
  ['tosVoid.png', () => new Uint8Array(OUT_W * OUT_H * 4)],
  ['tosDeck.png', () => render(floorScene(deck(false)))],
  ['tosDeck-alt.png', () => render(floorScene(deck(true)))],
  ['tosWell.png', () => render(floorScene(well(false)))],
  ['tosWell-alt.png', () => render(floorScene(well(true)))],
  ['tosWall.png', wall(stationWall)],
  ['tosViewscreen.png', wall(viewscreenWall)],
  ['tosTurbolift.png', wall(turboliftWall)],
  ['tosHull.png', wall(hullWall)],
  ['tosChair.png', object(captainsChair)],
  ['tosHelm.png', object(helmConsole)],
  ['tosStation.png', object(() => stationConsole({ seed: 41, slot: 0 }))],
  ['tosScience.png', object(() => stationConsole({ seed: 51, slot: 1, hood: true }))],
  ['tosRail.png', object(() => railing([endTowards('W'), endTowards('E')]))],
  ...railJoins(),
]

const sheet = process.argv.includes('--sheet')
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7).split(',')
const rendered = []
for (const [file, draw] of JOBS) {
  if (only && !only.some((prefix) => file.startsWith(prefix))) continue
  const target = outFile(file)
  if (fs.existsSync(target) && !FORCE) {
    console.log(`kept   ${file} (already exists)`)
    continue
  }
  const drawn = draw()
  const { width = OUT_W, height = OUT_H, bytes = drawn } = drawn.bytes ? drawn : {}
  fs.writeFileSync(target, encodePng(width, height, bytes))
  rendered.push({ id: file, bytes, width, height })
  console.log(`wrote  ${file}`)
}
if (sheet && rendered.length) writeSheet(fileURLToPath(new URL('../.tmp-sheet.png', import.meta.url)), rendered)
