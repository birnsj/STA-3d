// Canonical coat ids / labels / PNG paths / fallback colours for animal spawns.
// Editor Texture picks and spike3d loaders share this module so ids cannot drift.
// Runtime texture loading / atlases stay in spike3d/*Texture.js.

function coat(kind, id, label, fallback) {
  return Object.freeze({
    id,
    label,
    fallback,
    file: `${kind}-${id}.png`,
    url: `/art/models/creatures/${kind}-${id}.png`,
  })
}

export const HORSE_COATS = Object.freeze({
  white: coat('horse', 'white', 'White', 0xf4f1ea),
  bay: coat('horse', 'bay', 'Bay', 0xc49262),
  chestnut: coat('horse', 'chestnut', 'Chestnut', 0xe09060),
  palomino: coat('horse', 'palomino', 'Palomino', 0xf0d898),
  grey: coat('horse', 'grey', 'Grey', 0xe8e4dc),
  black: coat('horse', 'black', 'Black', 0x5a5450),
})

export const CAT_COATS = Object.freeze({
  orange: coat('cat', 'orange', 'Orange', 0xc48a3a),
  tabby: coat('cat', 'tabby', 'Tabby', 0xaa825a),
  grey: coat('cat', 'grey', 'Grey', 0xa0a0a5),
  black: coat('cat', 'black', 'Black', 0x373432),
  white: coat('cat', 'white', 'White', 0xf0eee8),
  calico: coat('cat', 'calico', 'Calico', 0xd29650),
})

export const CHICKEN_COATS = Object.freeze({
  yellow: coat('chicken', 'yellow', 'Yellow', 0xf0c832),
  white: coat('chicken', 'white', 'White', 0xf2eee6),
})

export const HORSE_COAT_CYCLE = Object.freeze(['white', 'bay', 'chestnut', 'palomino', 'grey', 'black'])
export const CAT_COAT_CYCLE = Object.freeze(['orange', 'tabby', 'grey', 'black', 'white', 'calico'])
export const CHICKEN_COAT_CYCLE = Object.freeze(['yellow', 'white'])

export function normalizeHorseCoatId(coatId) {
  if (coatId && HORSE_COATS[coatId]) return coatId
  return 'bay'
}

export function normalizeCatCoatId(coatId) {
  if (coatId && CAT_COATS[coatId]) return coatId
  return 'orange'
}

export function normalizeChickenCoatId(coatId) {
  if (coatId && CHICKEN_COATS[coatId]) return coatId
  return 'yellow'
}

export function horseCoatOf(coatId) {
  return HORSE_COATS[normalizeHorseCoatId(coatId)]
}

export function catCoatOf(coatId) {
  return CAT_COATS[normalizeCatCoatId(coatId)]
}

export function chickenCoatOf(coatId) {
  return CHICKEN_COATS[normalizeChickenCoatId(coatId)]
}

export function horseCoatLabel(coatId) {
  return horseCoatOf(coatId).label
}

export function catCoatLabel(coatId) {
  return catCoatOf(coatId).label
}

export function chickenCoatLabel(coatId) {
  return chickenCoatOf(coatId).label
}

export function horseCoatForSpawnIndex(index) {
  const i = Math.max(0, Math.floor(Number(index) || 0))
  return HORSE_COAT_CYCLE[i % HORSE_COAT_CYCLE.length]
}

export function catCoatForSpawnIndex(index) {
  const i = Math.max(0, Math.floor(Number(index) || 0))
  return CAT_COAT_CYCLE[i % CAT_COAT_CYCLE.length]
}

export function chickenCoatForSpawnIndex(index) {
  const i = Math.max(0, Math.floor(Number(index) || 0))
  return CHICKEN_COAT_CYCLE[i % CHICKEN_COAT_CYCLE.length]
}
