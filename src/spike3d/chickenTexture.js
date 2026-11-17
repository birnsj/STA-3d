/**
 * Separate albedo PNG atlas per chicken coat (same 2×3 UV layout as CatModel).
 *
 * Atlas layout (u half / v thirds), matching chicken-{coat}.png:
 *   top:    feathers | feathersDk
 *   middle: comb | beak
 *   bottom: leg | wattle
 */

import * as THREE from 'three'
import {
  CHICKEN_COATS,
  CHICKEN_COAT_CYCLE,
  chickenCoatForSpawnIndex,
  chickenCoatLabel,
  chickenCoatOf,
  normalizeChickenCoatId,
} from '../data/adaptation/exploration/animalCoats.js'
import { applyAtlasUvs } from './horseTexture.js'

export {
  CHICKEN_COATS,
  CHICKEN_COAT_CYCLE,
  chickenCoatForSpawnIndex,
  chickenCoatLabel,
  chickenCoatOf,
  normalizeChickenCoatId,
}

const CHICKEN_TEX_VERSION = 1

export function chickenTextureUrl(coatId) {
  return `/art/models/creatures/chicken-${normalizeChickenCoatId(coatId)}.png?v=${CHICKEN_TEX_VERSION}`
}

export const CHICKEN_FALLBACK_COLOUR = CHICKEN_COATS.yellow.fallback

const U0 = 0
const U1 = 0.5
const U2 = 1
const V0 = 0
const V1 = 1 / 3
const V2 = 2 / 3
const V3 = 1

export const CHICKEN_ATLAS = Object.freeze({
  feathers: { u0: U0, v0: V2, u1: U1, v1: V3 },
  feathersDk: { u0: U1, v0: V2, u1: U2, v1: V3 },
  comb: { u0: U0, v0: V1, u1: U1, v1: V2 },
  beak: { u0: U1, v0: V1, u1: U2, v1: V2 },
  leg: { u0: U0, v0: V0, u1: U1, v1: V1 },
  wattle: { u0: U1, v0: V0, u1: U2, v1: V1 },
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
  mat.color.setHex(chickenCoatOf(coatId).fallback)
  mat.needsUpdate = true
}

function paintMapped(mat, map) {
  if (!mat) return
  mat.map = map
  mat.color.setHex(0xfffaf2)
  mat.roughness = 0.72
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

export function bindChickenTexture(mat, coatId = 'yellow') {
  if (!mat) return
  const id = normalizeChickenCoatId(coatId)
  mat.userData = { ...(mat.userData || {}), chickenCoat: id }

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
    chickenTextureUrl(id),
    (tex) => finishCoatLoad(id, tex),
    undefined,
    () => {
      loadingCoats.delete(id)
      pendingByCoat.delete(id)
    },
  )
}

export function clearChickenTextureCache() {
  for (const tex of coatTex.values()) tex.dispose?.()
  coatTex.clear()
  loadingCoats.clear()
  pendingByCoat.clear()
}
