/**
 * Single albedo PNG for the procedural horse (UV atlas).
 * Flat bay colour until the map loads (same pattern as uniformTextures).
 *
 * Atlas layout is a fixed 2×3 grid (u half / v thirds), matching horse.png:
 *   top:    coat | coatDk
 *   middle: mane | saddle
 *   bottom: sock | hoof
 */

import * as THREE from 'three'

export const HORSE_TEXTURE_URL = '/art/models/creatures/horse.png?v=2'

/** Fallback coat while the atlas loads (matches prior flat horse). */
export const HORSE_FALLBACK_COLOUR = 0x6b4a2e

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
let cached = null
/** @type {Set<THREE.Material>} */
const pending = new Set()
let loading = false
let loader = null

function getLoader() {
  if (!loader) loader = new THREE.TextureLoader()
  return loader
}

function paintFlat(mat) {
  if (!mat) return
  mat.map = null
  mat.color.setHex(HORSE_FALLBACK_COLOUR)
  mat.needsUpdate = true
}

function paintMapped(mat, map) {
  if (!mat) return
  mat.map = map
  // Slight warm tint so coat reads under dim/rain lighting without washing out albedo.
  mat.color.setHex(0xfff6ea)
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

/** Bind the shared horse atlas to a material (async load, flat colour until ready). */
export function bindHorseTexture(mat) {
  if (!mat) return
  if (cached) {
    paintMapped(mat, cached)
    return
  }
  paintFlat(mat)
  if (typeof window === 'undefined') return
  pending.add(mat)
  if (loading) return
  loading = true
  getLoader().load(
    HORSE_TEXTURE_URL,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      tex.flipY = true
      tex.anisotropy = 4
      tex.needsUpdate = true
      cached = tex
      loading = false
      for (const m of pending) paintMapped(m, tex)
      pending.clear()
    },
    undefined,
    () => {
      loading = false
      pending.clear()
    },
  )
}

/** Dev helper: drop the cached map so a new atlas file can reload. */
export function clearHorseTextureCache() {
  cached = null
  loading = false
  pending.clear()
}
