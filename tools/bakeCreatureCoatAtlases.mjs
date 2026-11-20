/**
 * Bake horse / cat / chicken coat albedo atlases under public/art/models/creatures/.
 * Layout matches spike3d horseTexture / catTexture / chickenTexture (2×3, flipY):
 *   horse:   coat | coatDk / mane | saddle / sock | hoof
 *   cat:     fur  | furDk  / belly | ear    / nose | pad
 *   chicken: feathers | feathersDk / comb | beak / leg | wattle
 *
 * Usage: node tools/bakeCreatureCoatAtlases.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'art', 'models', 'creatures')
const SIZE = 512
const COLS = 2
const ROWS = 3
// Integer cell sizes so Buffer pixel writes land (float indices are ignored by Node Buffer).
const CW = Math.floor(SIZE / COLS)
const CH = Math.floor(SIZE / ROWS)
const CELL_X = [0, CW]
const CELL_Y = [0, CH, CH * 2]

function hex(rgb) {
  return [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255]
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n))
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t))
}

function hash(x, y, seed) {
  let n = x * 374761393 + y * 668265263 + seed * 982451653
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function noise(x, y, seed) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = hash(x0, y0, seed)
  const b = hash(x0 + 1, y0, seed)
  const c = hash(x0, y0 + 1, seed)
  const d = hash(x0 + 1, y0 + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x, y, seed) {
  let amp = 0.5
  let f = 1
  let sum = 0
  for (let i = 0; i < 4; i++) {
    sum += amp * noise(x * f, y * f, seed + i * 17)
    amp *= 0.5
    f *= 2.05
  }
  return sum
}

function crcTable() {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

const CRC = crcTable()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(rgba, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Fill one atlas cell with a fur-like albedo.
 * opts: { base, dark?, light?, stripe?, stripeGap?, grain?, seed?, leather?, stone?, soft? }
 */
function fillCell(rgba, col, row, opts) {
  const dark = hex(opts.dark ?? opts.base)
  const light = hex(opts.light ?? opts.base)
  const grain = opts.grain ?? 0.12
  const seed = opts.seed ?? 1
  const x0 = CELL_X[col]
  const y0 = CELL_Y[row]
  // Last column / row absorb the leftover pixels so the atlas is fully covered.
  const cellW = col === COLS - 1 ? SIZE - x0 : CW
  const cellH = row === ROWS - 1 ? SIZE - y0 : CH

  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < cellW; x++) {
      const u = (x + 0.5) / cellW
      const v = (y + 0.5) / cellH
      const nx = x * 0.045
      const ny = y * 0.045
      const n = fbm(nx + seed, ny + seed * 0.7, seed)
      let tone = mix(dark, light, 0.35 + n * 0.55)

      if (opts.stripe) {
        const gap = opts.stripeGap ?? 10
        const band = Math.sin((x * 0.55 + y * 0.18) / gap * Math.PI)
        if (band > 0.25) tone = mix(tone, dark, 0.55 * ((band - 0.25) / 0.75))
      }

      if (opts.patches) {
        for (const patch of opts.patches) {
          const d = Math.hypot(u - patch.u, v - patch.v)
          if (d < patch.r) {
            const t = 1 - d / patch.r
            tone = mix(tone, hex(patch.colour), t * t)
          }
        }
      }

      if (opts.leather) {
        const stitch = Math.abs(((y + 8) % 42) - 21) < 1.2 || Math.abs(((x + 12) % 48) - 24) < 1.2
        const peb = fbm(nx * 2.2, ny * 2.2, seed + 9)
        tone = mix(dark, light, 0.25 + peb * 0.6)
        if (stitch) tone = mix(tone, hex(0x1a120e), 0.55)
      }

      if (opts.stone) {
        const p = fbm(nx * 1.6, ny * 1.6, seed + 3)
        tone = mix(dark, light, p)
        if (hash(x, y, seed) > 0.92) tone = mix(tone, light, 0.35)
      }

      if (opts.soft) {
        const edge = Math.min(u, 1 - u, v, 1 - v)
        if (edge < 0.08) tone = mix(tone, light, (0.08 - edge) / 0.08 * 0.25)
      }

      const g = (hash(x, y, seed + 99) - 0.5) * grain * 255
      const r = clamp(tone[0] + g, 0, 255)
      const gch = clamp(tone[1] + g * 0.9, 0, 255)
      const b = clamp(tone[2] + g * 0.8, 0, 255)
      const i = ((y0 + y) * SIZE + (x0 + x)) * 4
      rgba[i] = r
      rgba[i + 1] = gch
      rgba[i + 2] = b
      rgba[i + 3] = 255
    }
  }
}

function bakeAtlas(cells) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4, 255)
  cells.forEach((opts, index) => {
    const col = index % COLS
    const row = Math.floor(index / COLS)
    fillCell(rgba, col, row, opts)
  })
  return encodePng(rgba, SIZE, SIZE)
}

/** Horse coats: body / darker body / mane / saddle / sock / hoof */
const HORSES = {
  bay: [
    { base: 0xa87448, dark: 0x7a5230, light: 0xc49262, grain: 0.14, seed: 11, soft: true },
    { base: 0x6e4428, dark: 0x4a2e1a, light: 0x8a5a38, grain: 0.12, seed: 12, soft: true },
    { base: 0x1c1410, dark: 0x0a0806, light: 0x3a2c24, grain: 0.1, seed: 13 },
    { base: 0x4a3020, dark: 0x2a1a12, light: 0x6a4830, leather: true, seed: 14 },
    { base: 0x14110f, dark: 0x050403, light: 0x2a2420, grain: 0.08, seed: 15 },
    { base: 0x2a2218, dark: 0x100c08, light: 0x4a3a28, stone: true, seed: 16 },
  ],
  chestnut: [
    { base: 0xc87840, dark: 0x8a4820, light: 0xe09060, grain: 0.14, seed: 21, soft: true },
    { base: 0x9a5028, dark: 0x6a3018, light: 0xc07040, grain: 0.12, seed: 22, soft: true },
    { base: 0xb86838, dark: 0x7a4018, light: 0xd88858, grain: 0.12, seed: 23 },
    { base: 0x4a3020, dark: 0x2a1a12, light: 0x6a4830, leather: true, seed: 24 },
    { base: 0xf0e8dc, dark: 0xd8d0c4, light: 0xfff8f0, grain: 0.08, seed: 25 },
    { base: 0x3a2e20, dark: 0x181208, light: 0x5a4a34, stone: true, seed: 26 },
  ],
  palomino: [
    { base: 0xe0c070, dark: 0xb89848, light: 0xf0d898, grain: 0.13, seed: 31, soft: true },
    { base: 0xc8a858, dark: 0x987830, light: 0xe0c878, grain: 0.12, seed: 32, soft: true },
    { base: 0xf5eed8, dark: 0xe0d8c0, light: 0xfffaf0, grain: 0.1, seed: 33 },
    { base: 0x5a4030, dark: 0x3a2818, light: 0x7a5840, leather: true, seed: 34 },
    { base: 0xf8f4ec, dark: 0xe8e0d4, light: 0xffffff, grain: 0.06, seed: 35 },
    { base: 0x4a3c28, dark: 0x201808, light: 0x6a5840, stone: true, seed: 36 },
  ],
  grey: [
    { base: 0xc8c4bc, dark: 0x9a968e, light: 0xe8e4dc, grain: 0.14, seed: 41, soft: true },
    { base: 0x9a968e, dark: 0x6e6a64, light: 0xc0bcb4, grain: 0.12, seed: 42, soft: true },
    { base: 0xd8d4cc, dark: 0xb0aca4, light: 0xf0ece4, grain: 0.1, seed: 43 },
    { base: 0x4a4038, dark: 0x2a2420, light: 0x6a6058, leather: true, seed: 44 },
    { base: 0xf0ece8, dark: 0xd8d4d0, light: 0xffffff, grain: 0.06, seed: 45 },
    { base: 0x3a3630, dark: 0x181612, light: 0x5a544c, stone: true, seed: 46 },
  ],
  black: [
    { base: 0x2a2624, dark: 0x121010, light: 0x4a4440, grain: 0.12, seed: 51, soft: true },
    { base: 0x1a1614, dark: 0x080606, light: 0x322e2a, grain: 0.1, seed: 52, soft: true },
    { base: 0x181412, dark: 0x060404, light: 0x2e2824, grain: 0.1, seed: 53 },
    { base: 0x3a2c24, dark: 0x1a120e, light: 0x5a4438, leather: true, seed: 54 },
    { base: 0x10100e, dark: 0x040404, light: 0x242220, grain: 0.08, seed: 55 },
    { base: 0x1c1814, dark: 0x080604, light: 0x3a3228, stone: true, seed: 56 },
  ],
  white: [
    { base: 0xf0ece4, dark: 0xd8d4cc, light: 0xfffaf4, grain: 0.1, seed: 61, soft: true },
    { base: 0xe0dcd4, dark: 0xc8c4bc, light: 0xf4f0e8, grain: 0.1, seed: 62, soft: true },
    { base: 0xe8e4dc, dark: 0xd0ccc4, light: 0xf8f4ec, grain: 0.09, seed: 63 },
    { base: 0x5a4838, dark: 0x3a2c20, light: 0x7a6450, leather: true, seed: 64 },
    { base: 0xf8f6f2, dark: 0xe8e4e0, light: 0xffffff, grain: 0.05, seed: 65 },
    { base: 0x4a4438, dark: 0x242018, light: 0x6a6458, stone: true, seed: 66 },
  ],
}

/** Cat coats: fur / furDk / belly / ear / nose / pad */
const CATS = {
  orange: [
    { base: 0xd4923a, dark: 0xa86a20, light: 0xf0b060, grain: 0.16, seed: 71, soft: true },
    { base: 0xa86a28, dark: 0x7a4810, light: 0xd09048, grain: 0.14, seed: 72, soft: true },
    { base: 0xf0d8b0, dark: 0xd8c090, light: 0xfff0d8, grain: 0.1, seed: 73, soft: true },
    { base: 0xe8a878, dark: 0xc88858, light: 0xf8c898, grain: 0.12, seed: 74, soft: true },
    { base: 0xe09090, dark: 0xc07070, light: 0xf0b0b0, grain: 0.08, seed: 75 },
    { base: 0x3a2820, dark: 0x18100c, light: 0x5a4034, grain: 0.1, seed: 76 },
  ],
  tabby: [
    {
      base: 0xb89060,
      dark: 0x6a4a28,
      light: 0xd8b888,
      grain: 0.14,
      seed: 81,
      soft: true,
      stripe: true,
      stripeGap: 9,
    },
    {
      base: 0x8a6840,
      dark: 0x4a3018,
      light: 0xb08050,
      grain: 0.12,
      seed: 82,
      soft: true,
      stripe: true,
      stripeGap: 8,
    },
    { base: 0xe8d8c0, dark: 0xd0c0a8, light: 0xf8f0e0, grain: 0.1, seed: 83, soft: true },
    { base: 0xc8a078, dark: 0xa07850, light: 0xe0c098, grain: 0.12, seed: 84, soft: true },
    { base: 0xd08080, dark: 0xb06060, light: 0xe8a0a0, grain: 0.08, seed: 85 },
    { base: 0x2e241c, dark: 0x120e0a, light: 0x4a3a30, grain: 0.1, seed: 86 },
  ],
  grey: [
    { base: 0xa0a0a8, dark: 0x707078, light: 0xc8c8d0, grain: 0.14, seed: 91, soft: true },
    { base: 0x787880, dark: 0x484850, light: 0xa0a0a8, grain: 0.12, seed: 92, soft: true },
    { base: 0xe0e0e4, dark: 0xc8c8cc, light: 0xf4f4f8, grain: 0.1, seed: 93, soft: true },
    { base: 0xb8b0b0, dark: 0x908888, light: 0xd8d0d0, grain: 0.12, seed: 94, soft: true },
    { base: 0xd09098, dark: 0xb07078, light: 0xe8b0b8, grain: 0.08, seed: 95 },
    { base: 0x2a2828, dark: 0x100e0e, light: 0x444040, grain: 0.1, seed: 96 },
  ],
  black: [
    { base: 0x2e2a28, dark: 0x121010, light: 0x4a4440, grain: 0.12, seed: 101, soft: true },
    { base: 0x1c1816, dark: 0x080606, light: 0x342e2a, grain: 0.1, seed: 102, soft: true },
    { base: 0x5a5450, dark: 0x3a3632, light: 0x7a7470, grain: 0.1, seed: 103, soft: true },
    { base: 0x4a3a38, dark: 0x2a2220, light: 0x6a5450, grain: 0.1, seed: 104, soft: true },
    { base: 0x8a6060, dark: 0x6a4040, light: 0xaa8080, grain: 0.08, seed: 105 },
    { base: 0x1a1412, dark: 0x060404, light: 0x322824, grain: 0.1, seed: 106 },
  ],
  white: [
    { base: 0xf0eee8, dark: 0xd8d6d0, light: 0xfffcf8, grain: 0.1, seed: 111, soft: true },
    { base: 0xe0ded8, dark: 0xc8c6c0, light: 0xf4f2ec, grain: 0.1, seed: 112, soft: true },
    { base: 0xf8f6f2, dark: 0xe8e6e2, light: 0xffffff, grain: 0.08, seed: 113, soft: true },
    { base: 0xf0d8d0, dark: 0xe0c0b8, light: 0xffe8e0, grain: 0.1, seed: 114, soft: true },
    { base: 0xf0a0a8, dark: 0xd08088, light: 0xffc0c8, grain: 0.08, seed: 115 },
    { base: 0xd0a0a0, dark: 0xb08080, light: 0xe8c0c0, grain: 0.1, seed: 116 },
  ],
  calico: [
    {
      base: 0xf0eee8,
      dark: 0xd8d4cc,
      light: 0xfffaf4,
      grain: 0.12,
      seed: 121,
      soft: true,
      patches: [
        { u: 0.32, v: 0.35, r: 0.34, colour: 0xd4923a },
        { u: 0.72, v: 0.55, r: 0.28, colour: 0x2a2420 },
        { u: 0.55, v: 0.22, r: 0.2, colour: 0xc87840 },
      ],
    },
    {
      base: 0xa86a28,
      dark: 0x4a3018,
      light: 0xd09048,
      grain: 0.12,
      seed: 122,
      soft: true,
      patches: [
        { u: 0.4, v: 0.4, r: 0.3, colour: 0x1c1816 },
        { u: 0.7, v: 0.65, r: 0.25, colour: 0xe8e0d4 },
      ],
    },
    { base: 0xf4ecdc, dark: 0xe0d8c8, light: 0xfff8f0, grain: 0.1, seed: 123, soft: true },
    { base: 0xe8b090, dark: 0xc88860, light: 0xf8d0b0, grain: 0.12, seed: 124, soft: true },
    { base: 0xe09090, dark: 0xc07070, light: 0xf0b0b0, grain: 0.08, seed: 125 },
    { base: 0x3a2820, dark: 0x18100c, light: 0x5a4034, grain: 0.1, seed: 126 },
  ],
}

/** Chicken coats: feathers / feathersDk / comb / beak / leg / wattle */
const CHICKENS = {
  yellow: [
    { base: 0xf0c832, dark: 0xd0a018, light: 0xffe060, grain: 0.14, seed: 131, soft: true },
    { base: 0xd8a820, dark: 0xb08810, light: 0xf0c840, grain: 0.12, seed: 132, soft: true },
    { base: 0xc43c2c, dark: 0x8a2018, light: 0xe06050, grain: 0.1, seed: 133 },
    { base: 0xe8a020, dark: 0xc08010, light: 0xf8c040, grain: 0.1, seed: 134 },
    { base: 0xd4a017, dark: 0xa87810, light: 0xe8c040, grain: 0.1, seed: 135 },
    { base: 0xb03028, dark: 0x781810, light: 0xd05040, grain: 0.1, seed: 136 },
  ],
  white: [
    { base: 0xf2eee6, dark: 0xd8d4cc, light: 0xfffcf8, grain: 0.1, seed: 141, soft: true },
    { base: 0xe0dcd4, dark: 0xc8c4bc, light: 0xf4f0e8, grain: 0.1, seed: 142, soft: true },
    { base: 0xc43c2c, dark: 0x8a2018, light: 0xe06050, grain: 0.1, seed: 143 },
    { base: 0xe8a020, dark: 0xc08010, light: 0xf8c040, grain: 0.1, seed: 144 },
    { base: 0xd4a017, dark: 0xa87810, light: 0xe8c040, grain: 0.1, seed: 145 },
    { base: 0xb03028, dark: 0x781810, light: 0xd05040, grain: 0.1, seed: 146 },
  ],
}

mkdirSync(OUT, { recursive: true })

let written = 0
for (const [id, cells] of Object.entries(HORSES)) {
  const path = join(OUT, `horse-${id}.png`)
  writeFileSync(path, bakeAtlas(cells))
  written += 1
  console.log('wrote', path)
}
for (const [id, cells] of Object.entries(CATS)) {
  const path = join(OUT, `cat-${id}.png`)
  writeFileSync(path, bakeAtlas(cells))
  written += 1
  console.log('wrote', path)
}
for (const [id, cells] of Object.entries(CHICKENS)) {
  const path = join(OUT, `chicken-${id}.png`)
  writeFileSync(path, bakeAtlas(cells))
  written += 1
  console.log('wrote', path)
}
console.log(`baked ${written} coat atlases (${SIZE}×${SIZE})`)
