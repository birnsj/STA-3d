// Leaf constants for mount/ride — safe to import from actors (no exploration cycles).

/** Ride speed multiplier vs walk/run (Map Properties pace still applies). */
export const RIDE_SPEED_MULT = 1.15

/**
 * Mounted collision (tiles). Foot radius is 0.28 — the horse needs a bit more than that
 * so the barrel doesn't phase walls, but a fat circle + long nose cone snags every prop.
 */
export const RIDE_BODY_RADIUS = 0.4
/** How far ahead of the feet must stay clear for neck / muzzle. */
export const RIDE_NOSE_REACH = 0.5

/** Formation slot scale while the group lead is mounted (horses need more room than foot). */
export const RIDE_FORMATION_SPACING_MULT = 1.85
