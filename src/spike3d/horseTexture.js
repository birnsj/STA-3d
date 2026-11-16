/**
 * Albedo PNG atlas for the procedural horse, plus recoloured coat variants.
 * Flat bay colour until the map loads (same pattern as uniformTextures).
 *
 * Atlas layout is a fixed 2×3 grid (u half / v thirds), matching horse.png:
 *   top:    coat | coatDk
 *   middle: mane | saddle
 *   bottom: sock | hoof
 *
 * Coats other than `bay` are derived at runtime (luminance × tint) so we do not need
 * separate artist atlases for black / chestnut / grey / palomino.
 */

import * as THREE from 'three'

// Bump ?v= when coat tint recipes change so browsers drop a stale atlas cache.
export const HORSE_TEXTURE_URL = '/art/models/creatures/horse.png?v=4'

/** Fallback coat while the atlas loads (matches prior flat horse). */
export const HORSE_FALLBACK_COLOUR = 0xb89068

/**
 * Spawn order cycles these ids. Each coat gets its own tinted atlas from the base PNG
 * (`tint: null` would keep the authored atlas as-is).
 */
export const HORSE_COATS = Object.freeze({
  white: Object.freeze({
    id: 'white',
    label: 'White',
    fallback: 0xf4f1ea,
    tint: Object.freeze({ coat: '#f8f5ef', coatDk: '#e4e0d8', mane: '#d0ccc4', sock: '#fffef9' }),
  }),
  bay: Object.freeze({
    id: 'bay',
    label: 'Bay',
    fallback: 0xc49262,
    tint: Object.freeze({ coat: '#d4a070', coatDk: '#a07048', mane: '#3a2c22', sock: '#faf6f0' }),
  }),
  chestnut: Object.freeze({
    id: 'chestnut',
    label: 'Chestnut',
    fallback: 0xe09060,
    tint: Object.freeze({ coat: '#f09868', coatDk: '#c06838', mane: '#6a4030', sock: '#fffaf4' }),
  }),
  palomino: Object.freeze({
    id: 'palomino',
    label: 'Palomino',
    fallback: 0xf0d898,
    tint: Object.freeze({ coat: '#f8e0a8', coatDk: '#e0bc70', mane: '#fff8ec', sock: '#fffef8' }),
  }),
  grey: Object.freeze({
    id: 'grey',
    label: 'Grey',
    fallback: 0xe8e4dc,
    tint: Object.freeze({ coat: '#f2eee6', coatDk: '#c8c4bc', mane: '#7a7874', sock: '#faf8f4' }),
  }),
  black: Object.freeze({
    id: 'black',
    label: 'Black',
    fallback: 0x5a5450,
    // Soft charcoal rather than near-black so fur grain still reads on the board.
    tint: Object.freeze({ coat: '#7a7470', coatDk: '#4a4644', mane: '#322e2c', sock: '#f0ece4' }),
  }),
})

/** Each spawn index gets a different coat; further horses wrap. */
export const HORSE_COAT_CYCLE = Object.freeze(['white', 'bay', 'chestnut', 'palomino', 'grey', 'black'])

export function normalizeHorseCoatId(coatId) {
  if (coatId && HORSE_COATS[coatId]) return coatId
  return 'bay'
}

export function horseCoatOf(coatId) {
  return HORSE_COATS[normalizeHorseCoatId(coatId)]
}

export function horseCoatLabel(coatId) {
  return horseCoatOf(coatId).label
}

/** Coat id for spawn index 0..n (Horse Spawn marker order). */
export function horseCoatForSpawnIndex(index) {
  const i = Math.max(0, Math.floor(Number(index) || 0))
  return HORSE_COAT_CYCLE[i % HORSE_COAT_CYCLE.length]
}

const U0 = 0
const U1 = 0.5
const U2 = 1
const V0 = 0
const V1 = 1 / 3
const V2 = 2 / 3
const V3 = 1

/** Atlas UV rects (Three.js: v=0 bottom, flipY texture). */
export const HORSE_ATLAS = Object.freeze({
  coat: { u0: U0, v0: V2, u1: U1, v1: V3 },
  coatDk: { u0: U1, v0: V2, u1: U2, v1: V3 },
  mane: { u0: U0, v0: V1, u1: U1, v1: V2 },
  saddle: { u0: U1, v0: V1, u1: U2, v1: V2 },
  sock: { u0: U0, v0: V0, u1: U1, v1: V1 },
  hoof: { u0: U1, v0: V0, u1: U2, v1: V1 },
})

/** @type {THREE.Texture | null} */
let baseTex = null
/** @type {Map<string, THREE.Texture>} */
const coatTex = new Map()
/** @type {Map<string, Set<THREE.Material>>} */
const pendingByCoat = new Map()
let loading = false
let loader = null

function getLoader() {
  if (!loader) loader = new THREE.TextureLoader()
  return loader
}

function paintFlat(mat, coatId) {
  if (!mat) return
  mat.map = null
  mat.color.setHex(horseCoatOf(coatId).fallback)
  mat.needsUpdate = true
}

function paintMapped(mat, map) {
  if (!mat) return
  mat.map = map
  // Slight warm lift so coats read under dim/rain lighting without washing out albedo.
  mat.color.setHex(0xfffaf2)
  mat.roughness = 0.72
  mat.needsUpdate = true
}

function parseHex(hex) {
  const raw = String(hex || '').replace('#', '')
  const full = raw.length === 3 ? [...raw].map((ch) => ch + ch).join('') : raw
  const n = parseInt(full, 16)
  if (!Number.isFinite(n)) return { r: 1, g: 1, b: 1 }
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

/**
 * Remap a geometry's 0–1 UVs into an atlas panel.
 * @param {THREE.BufferGeometry} geo
 * @param {{ u0: number, v0: number, u1: number, v1: number }} region
 */
export function applyAtlasUvs(geo, region) {
  const uv = geo.attributes.uv
  if (!uv || !region) return geo
  const { u0, v0, u1, v1 } = region
  const du = u1 - u0
  const dv = v1 - v0
  // Inset slightly so sphere poles don't bleed into a neighbour panel.
  const padU = du * 0.04
  const padV = dv * 0.04
  const iu0 = u0 + padU
  const iv0 = v0 + padV
  const idu = du - padU * 2
  const idv = dv - padV * 2
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, iu0 + uv.getX(i) * idu, iv0 + uv.getY(i) * idv)
  }
  uv.needsUpdate = true
  return geo
}

function regionPixelBox(region, width, height, flipY) {
  // Atlas UV v=0 is texture bottom when flipY is true (Three default for TextureLoader images).
  const u0 = Math.floor(region.u0 * width)
  const u1 = Math.ceil(region.u1 * width)
  const vBottom = flipY ? region.v0 : 1 - region.v1
  const vTop = flipY ? region.v1 : 1 - region.v0
  const y0 = Math.floor((1 - vTop) * height)
  const y1 = Math.ceil((1 - vBottom) * height)
  return { x0: u0, x1: u1, y0, y1 }
}

function tintRegion(data, width, height, region, hex, flipY) {
  const { r: tr, g: tg, b: tb } = parseHex(hex)
  const box = regionPixelBox(region, width, height, flipY)
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * width + x) * 4
      const r = data[i] / 255
      const g = data[i + 1] / 255
      const b = data[i + 2] / 255
      // Keep fur grain: replace chrominance, preserve luminance (biased bright for board readability).
      const lum = Math.min(1, Math.max(0, 0.299 * r + 0.587 * g + 0.114 * b))
      const lift = 0.38 + lum * 1.05
      data[i] = Math.min(255, Math.round(tr * lift * 255))
      data[i + 1] = Math.min(255, Math.round(tg * lift * 255))
      data[i + 2] = Math.min(255, Math.round(tb * lift * 255))
    }
  }
}

function makeCoatTexture(base, coatId) {
  const def = horseCoatOf(coatId)
  if (!def.tint) return base

  const image = base.image
  if (!image) return base

  const width = image.width || image.videoWidth || 0
  const height = image.height || image.videoHeight || 0
  if (!(width > 0 && height > 0)) return base

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return base
  ctx.drawImage(image, 0, 0)
  const frame = ctx.getImageData(0, 0, width, height)
  const flipY = base.flipY !== false
  tintRegion(frame.data, width, height, HORSE_ATLAS.coat, def.tint.coat, flipY)
  tintRegion(frame.data, width, height, HORSE_ATLAS.coatDk, def.tint.coatDk, flipY)
  tintRegion(frame.data, width, height, HORSE_ATLAS.mane, def.tint.mane, flipY)
  if (def.tint.sock) tintRegion(frame.data, width, height, HORSE_ATLAS.sock, def.tint.sock, flipY)
  ctx.putImageData(frame, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.flipY = flipY
  tex.anisotropy = base.anisotropy || 4
  tex.needsUpdate = true
  return tex
}

function textureForCoat(coatId) {
  const id = normalizeHorseCoatId(coatId)
  if (coatTex.has(id)) return coatTex.get(id)
  if (!baseTex) return null
  const next = makeCoatTexture(baseTex, id)
  coatTex.set(id, next)
  return next
}

function flushPending(coatId, tex) {
  const set = pendingByCoat.get(coatId)
  if (!set) return
  for (const mat of set) paintMapped(mat, tex)
  set.clear()
  pendingByCoat.delete(coatId)
}

function queuePending(mat, coatId) {
  let set = pendingByCoat.get(coatId)
  if (!set) {
    set = new Set()
    pendingByCoat.set(coatId, set)
  }
  set.add(mat)
}

function finishBaseLoad(tex) {
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.flipY = true
  tex.anisotropy = 4
  tex.needsUpdate = true
  baseTex = tex
  loading = false
  for (const coatId of [...pendingByCoat.keys()]) {
    const map = textureForCoat(coatId)
    if (map) flushPending(coatId, map)
  }
}

/** Bind a coat atlas to a material (async load, flat colour until ready). */
export function bindHorseTexture(mat, coatId = 'bay') {
  if (!mat) return
  const id = normalizeHorseCoatId(coatId)
  mat.userData = { ...(mat.userData || {}), horseCoat: id }

  const ready = textureForCoat(id)
  if (ready) {
    paintMapped(mat, ready)
    return
  }

  paintFlat(mat, id)
  if (typeof window === 'undefined') return
  queuePending(mat, id)
  if (loading) return
  if (baseTex) {
    const map = textureForCoat(id)
    if (map) flushPending(id, map)
    return
  }
  loading = true
  getLoader().load(
    HORSE_TEXTURE_URL,
    (tex) => finishBaseLoad(tex),
    undefined,
    () => {
      loading = false
      pendingByCoat.clear()
    },
  )
}

/** Dev helper: drop cached maps so a new atlas file can reload. */
export function clearHorseTextureCache() {
  for (const tex of coatTex.values()) {
    if (tex && tex !== baseTex) tex.dispose?.()
  }
  coatTex.clear()
  baseTex = null
  loading = false
  pendingByCoat.clear()
}
