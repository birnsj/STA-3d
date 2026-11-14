// Outdoor wall face materials for Template Pieces (32-thick overlays).
// Same builtWall looks as outdoor location tiles in makeTilesV2World — do not import that script.
import { rgb } from './engine.mjs'
import { builtWall } from './walls.mjs'

const hex = rgb

// Face id → builtWall maker (matches makeTilesV2World outdoor walls).
const OUTDOOR_WALL_MAKERS = {
  prefab: builtWall({
    kind: 'panels',
    colour: hex('#9ca1a6'),
    trim: hex('#c0c4c8'),
    dark: hex('#5c6166'),
    stripe: { at: 0.78, width: 1.2, colour: hex('#3a6aa0') },
    seed: 63,
  }),
  barn: builtWall({
    kind: 'boards',
    vertical: true,
    colour: hex('#8a3a2a'),
    dark: hex('#3a1a12'),
    trim: hex('#e0d8c8'),
    boardWidth: 4,
    seed: 75,
  }),
  city: builtWall({
    kind: 'blocks',
    colour: hex('#a8977a'),
    mortar: hex('#6a5e4a'),
    course: 6,
    blockLength: 11,
    seed: 64,
  }),
  timber: builtWall({
    kind: 'boards',
    colour: hex('#6e5234'),
    dark: hex('#2e2214'),
    trim: hex('#8a6a44'),
    boardWidth: 4.6,
    seed: 66,
  }),
  stone: builtWall({
    kind: 'blocks',
    colour: hex('#8a8478'),
    mortar: hex('#3a3730'),
    course: 5,
    blockLength: 8,
    seed: 89,
  }),
  ruin: builtWall({
    kind: 'blocks',
    colour: hex('#7a7468'),
    mortar: hex('#3a3730'),
    course: 5,
    blockLength: 9,
    seed: 91,
  }),
}

export const OUTDOOR_WALL_FACES = Object.keys(OUTDOOR_WALL_MAKERS)

export function isOutdoorWallFace(face) {
  return Boolean(face && OUTDOOR_WALL_MAKERS[face])
}

/** Material for a 32-thick outdoor wall prism (height in design units). */
export function outdoorWallMaterial(drawnHeight, face) {
  const make = OUTDOOR_WALL_MAKERS[face]
  if (!make) return null
  return make(Math.max(8, drawnHeight))
}
