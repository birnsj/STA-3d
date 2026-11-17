/**
 * Separate albedo PNG atlas per horse coat (same 2×3 UV layout as HorseModel).
 * Flat fallback colour until that coat's map loads.
 *
 * Atlas layout (u half / v thirds), matching horse-{coat}.png:
 *   top:    coat | coatDk
 *   middle: mane | saddle
 *   bottom: sock | hoof
 */

import * as THREE from 'three'

/** Bump when replacing coat PNG files so caches refresh. */
const HORSE_TEX_VERSION = 3

/** Fallback coat while the atlas loads (matches prior flat horse). */
export const HORSE_FALLBACK_COLOUR = 0xb89068

export const HORSE_COATS = Object.freeze({
  white: Object.freeze({ id: 'white', label: 'White', fallback: 0xf4f1ea }),
  bay: Object.freeze({ id: 'bay', label: 'Bay', fallback: 0xc49262 }),
  chestnut: Object.freeze({ id: 'chestnut', label: 'Chestnut', fallback: 0xe09060 }),
  palomino: Object.freeze({ id: 'palomino', label: 'Palomino', fallback: 0xf0d898 }),
  grey: Object.freeze({ id: 'grey', label: 'Grey', fallback: 0xe8e4dc }),
  black: Object.freeze({ id: 'black', label: 'Black', fallback: 0x5a5450 }),
})

/** Each spawn index gets a different coat; further horses wrap. */
export const HORSE_COAT_CYCLE = Object.freeze(['white', 'bay', 'chestnut', 'palomino', 'grey', 'black'])

export function normalizeHorseCoatId(coatId) {
  if (coatId && HORSE_COATS[coatId]) return coatId
  return 'bay'
}

export function horseTextureUrl(coatId) {
  return `/art/models/creatures/horse-${normalizeHorseCoatId(coatId)}.png?v=${HORSE_TEX_VERSION}`
}

/** @deprecated Prefer horseTextureUrl(coatId). Kept for older call sites. */
export const HORSE_TEXTURE_URL = horseTextureUrl('bay')

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

/** @type {Map<string, THREE.Texture>} */
const coatTex = new Map()
/** @type {Map<string, Set<THREE.Material>>} */
const pendingByCoat = new Map()
/** @type {Set<string>} */
const loadingCoats = new Set()
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

function finishCoatLoad(coatId, tex) {
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.flipY = true
  tex.anisotropy = 4
  tex.needsUpdate = true
  coatTex.set(coatId, tex)
  loadingCoats.delete(coatId)
  flushPending(coatId, tex)
}

/** Bind a coat atlas to a material (async load, flat colour until ready). */
export function bindHorseTexture(mat, coatId = 'bay') {
  if (!mat) return
  const id = normalizeHorseCoatId(coatId)
  mat.userData = { ...(mat.userData || {}), horseCoat: id }

  const ready = coatTex.get(id)
  if (ready) {
    paintMapped(mat, ready)
    return
  }

  paintFlat(mat, id)
  if (typeof window === 'undefined') return
  queuePending(mat, id)
  if (loadingCoats.has(id)) return
  loadingCoats.add(id)
  getLoader().load(
    horseTextureUrl(id),
    (tex) => finishCoatLoad(id, tex),
    undefined,
    () => {
      loadingCoats.delete(id)
      pendingByCoat.delete(id)
    },
  )
}

/** Dev helper: drop cached maps so a new atlas file can reload. */
export function clearHorseTextureCache() {
  for (const tex of coatTex.values()) tex.dispose?.()
  coatTex.clear()
  loadingCoats.clear()
  pendingByCoat.clear()
}
