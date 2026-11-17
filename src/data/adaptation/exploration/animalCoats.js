// Coat texture PNGs for authored animal spawns (editor Properties). Runtime loaders stay in spike3d/*.

function horseTexture(id, label) {
  return Object.freeze({
    id,
    label,
    file: `horse-${id}.png`,
    url: `/art/models/creatures/horse-${id}.png`,
  })
}

function catTexture(id, label) {
  return Object.freeze({
    id,
    label,
    file: `cat-${id}.png`,
    url: `/art/models/creatures/cat-${id}.png`,
  })
}

function chickenTexture(id, label) {
  return Object.freeze({
    id,
    label,
    file: `chicken-${id}.png`,
    url: `/art/models/creatures/chicken-${id}.png`,
  })
}

export const HORSE_COATS = Object.freeze({
  white: horseTexture('white', 'White'),
  bay: horseTexture('bay', 'Bay'),
  chestnut: horseTexture('chestnut', 'Chestnut'),
  palomino: horseTexture('palomino', 'Palomino'),
  grey: horseTexture('grey', 'Grey'),
  black: horseTexture('black', 'Black'),
})

export const CAT_COATS = Object.freeze({
  orange: catTexture('orange', 'Orange'),
  tabby: catTexture('tabby', 'Tabby'),
  grey: catTexture('grey', 'Grey'),
  black: catTexture('black', 'Black'),
  white: catTexture('white', 'White'),
  calico: catTexture('calico', 'Calico'),
})

export const CHICKEN_COATS = Object.freeze({
  yellow: chickenTexture('yellow', 'Yellow'),
  white: chickenTexture('white', 'White'),
})

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
