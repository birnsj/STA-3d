// Soft directional cast shadows shared by map floor lighting (canvasTiles.js) and character figures (figures.js).
// Direction follows board Sun azimuth (World Generation / Map Properties). Presentation only.
import { project, TILE_H, TILE_W } from './iso.js'
import { getTile } from './mapFormat.js'

// Tile-space offset of a cast shadow's centre from the caster's floor point (default = legacy fixed light).
// Longer throw so Sun orbit reads clearly past rocks / walls (~2× the old 0.38/0.28).
export const CAST_TILE = { dx: 0.78, dy: 0.58 }

// World-pixel offset of that cast (project is linear through the origin).
export const CAST_WORLD = project(CAST_TILE)

// Character foot-shadow nudge in figure body space (same direction as CAST_WORLD; figures sit on the floor diamond).
export const FIGURE_CAST = {
  x: CAST_WORLD.x * 0.55,
  y: CAST_WORLD.y * 0.55,
  scaleX: 1.35,
  scaleY: 0.85,
  skewX: 0.28,
}

const CAST_LEN = Math.hypot(CAST_TILE.dx, CAST_TILE.dy) || 1

/** Tile-space cast offset for a Sun azimuth (shadows fall opposite the key). */
export function castTileForAzimuth(azimuthDeg) {
  const az = ((((Number(azimuthDeg) % 360) + 360) % 360) * Math.PI) / 180
  return { dx: -Math.sin(az) * CAST_LEN, dy: -Math.cos(az) * CAST_LEN }
}

export function castWorldForAzimuth(azimuthDeg) {
  return project(castTileForAzimuth(azimuthDeg))
}

/** Foot-shadow place/skew for figures.js from live Sun orbit. */
export function figureCastForAzimuth(azimuthDeg) {
  const w = castWorldForAzimuth(azimuthDeg)
  const az = ((((Number(azimuthDeg) % 360) + 360) % 360) * Math.PI) / 180
  return {
    x: w.x * 0.55,
    y: w.y * 0.55,
    scaleX: 1.35,
    scaleY: 0.85,
    // Mild skew so the blob leans with the cast; sign matches screen-space X of the light.
    skewX: Math.sin(az) * 0.32,
  }
}

/**
 * Soft floor blob for one solid (tile or free height).
 * Furniture (rocks, trees) throws farther than walls so the shade clears the sprite.
 * `big` = 2×2 boulder/tree: larger blob from the footprint centre.
 */
export function castShadowAt(position, { height = 0, wall = false, big = false } = {}, castWorld = CAST_WORLD) {
  if (!(height > 0)) return null
  const heightScale = Math.min(1, height / 96)
  // Extra throw on top of CAST_TILE so tall walls and short rocks both reach past their art.
  const throwScale = wall ? 1.35 + 0.55 * heightScale : 2.1 + (1 - heightScale) * 0.9
  const sizeBoost = big ? 1.75 : 1
  const base = project(position)
  return {
    x: base.x + castWorld.x * throwScale,
    y: base.y + castWorld.y * throwScale,
    rx: TILE_W * (0.48 + 0.28 * heightScale) * sizeBoost,
    ry: TILE_H * (0.48 + 0.28 * heightScale) * sizeBoost,
    // Strong enough to read on busy floor art when Sun orbit / colour changes.
    alpha: (wall ? 0.14 : 0.2) + 0.14 * heightScale,
  }
}

// Soft floor blob for one solid block. heightScale 0..1 from tile.height.
export function blockCastShadow(position, tileId, castWorld = CAST_WORLD, { big = false } = {}) {
  const tile = getTile(tileId)
  const height = (big && tile.big?.height) || tile.height || 0
  return castShadowAt(position, { height, wall: Boolean(tile.wall), big }, castWorld)
}
