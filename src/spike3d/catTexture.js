/**
 * Separate albedo PNG atlas per cat coat (same 2×3 UV layout as CatModel).
 *
 * Atlas layout (u half / v thirds), matching cat-{coat}.png:
 *   top:    fur | furDk
 *   middle: belly | ear
 *   bottom: nose | pad
 */

import * as THREE from 'three'
import { applyAtlasUvs } from './horseTexture.js'

const CAT_TEX_VERSION = 3

export function catTextureUrl(coatId) {
  return `/art/models/creatures/cat-${normalizeCatCoatId(coatId)}.png?v=${CAT_TEX_VERSION}`
}

export const CAT_FALLBACK_COLOUR = 0xc48a3a

export const CAT_COATS = Object.freeze({
  orange: Object.freeze({ id: 'orange', label: 'Orange', fallback: 0xc48a3a }),
  tabby: Object.freeze({ id: 'tabby', label: 'Tabby', fallback: 0xaa825a }),
  grey: Object.freeze({ id: 'grey', label: 'Grey', fallback: 0xa0a0a5 }),
  black: Object.freeze({ id: 'black', label: 'Black', fallback: 0x373432 }),
  white: Object.freeze({ id: 'white', label: 'White', fallback: 0xf0eee8 }),
  calico: Object.freeze({ id: 'calico', label: 'Calico', fallback: 0xd29650 }),
})

export const CAT_COAT_CYCLE = Object.freeze(['orange', 'tabby', 'grey', 'black', 'white', 'calico'])

export function normalizeCatCoatId(coatId) {
  if (coatId && CAT_COATS[coatId]) return coatId
  return 'orange'
}

export function catCoatOf(coatId) {
  return CAT_COATS[normalizeCatCoatId(coatId)]
}

export function catCoatLabel(coatId) {
  return catCoatOf(coatId).label
}

export function catCoatForSpawnIndex(index) {
  const i = Math.max(0, Math.floor(Number(index) || 0))
  return CAT_COAT_CYCLE[i % CAT_COAT_CYCLE.length]
}

const U0 = 0
const U1 = 0.5
const U2 = 1
const V0 = 0
const V1 = 1 / 3
const V2 = 2 / 3
const V3 = 1

export const CAT_ATLAS = Object.freeze({
  fur: { u0: U0, v0: V2, u1: U1, v1: V3 },
  furDk: { u0: U1, v0: V2, u1: U2, v1: V3 },
  belly: { u0: U0, v0: V1, u1: U1, v1: V2 },
  ear: { u0: U1, v0: V1, u1: U2, v1: V2 },
  nose: { u0: U0, v0: V0, u1: U1, v1: V1 },
  pad: { u0: U1, v0: V0, u1: U2, v1: V1 },
})

export { applyAtlasUvs }

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
  mat.color.setHex(catCoatOf(coatId).fallback)
  mat.needsUpdate = true
}

function paintMapped(mat, map) {
  if (!mat) return
  mat.map = map
  mat.color.setHex(0xfffaf2)
  mat.roughness = 0.7
  mat.needsUpdate = true
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

export function bindCatTexture(mat, coatId = 'orange') {
  if (!mat) return
  const id = normalizeCatCoatId(coatId)
  mat.userData = { ...(mat.userData || {}), catCoat: id }

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
    catTextureUrl(id),
    (tex) => finishCoatLoad(id, tex),
    undefined,
    () => {
      loadingCoats.delete(id)
      pendingByCoat.delete(id)
    },
  )
}

export function clearCatTextureCache() {
  for (const tex of coatTex.values()) tex.dispose?.()
  coatTex.clear()
  loadingCoats.clear()
  pendingByCoat.clear()
}
