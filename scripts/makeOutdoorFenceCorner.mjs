// Bake fenceCorner as a single post (like Template 32 wall corners) + Outdoor Template 32 piece.
// Usage: node scripts/makeOutdoorFenceCorner.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'
import { imageHeightFor, OUT_H, OUT_W, outFile, renderTile, rgb } from './v2/engine.mjs'
import { objectScene } from './v2/kit.mjs'
import { fenceCorner } from './v2/objects.mjs'
import { ground } from './v2/grounds.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cataloguePath = path.join(root, 'src', 'data', 'adaptation', 'maps', 'templatePieces.json')
const hex = rgb

const baseGround = ground({
  base: hex('#4e4c32'),
  seed: 11,
  rough: 0.8,
  blades: { colour: hex('#4a5a2a'), tip: hex('#6a7a3a'), cover: 0.35, height: 0.8 },
})
const model = fenceCorner(baseGround)
const imageHeight = imageHeightFor(model.top)
const drawn = renderTile(objectScene(model), imageHeight, { subsamples: 2 })
const { width = OUT_W, height = OUT_H, bytes = drawn } = drawn.bytes ? drawn : { bytes: drawn }
const png = encodePng(width, height, bytes)

const tilePath = outFile('fenceCorner.png')
fs.mkdirSync(path.dirname(tilePath), { recursive: true })
fs.writeFileSync(tilePath, png)
console.log(`wrote tile ${tilePath}`)

const templatesDir = path.join(root, 'public', 'art', 'sprites', 'environment', 'templates')
fs.mkdirSync(templatesDir, { recursive: true })
// One post art for all yaws (symmetric); keep r90/180/270 as copies so catalogue orients stay valid.
for (const name of [
  'tplOutdoorFenceCorner.png',
  'tplOutdoorFenceCorner_r90.png',
  'tplOutdoorFenceCorner_r180.png',
  'tplOutdoorFenceCorner_r270.png',
]) {
  fs.writeFileSync(path.join(templatesDir, name), png)
  console.log(`wrote ${name}`)
}

const size0 = { width: 64, height: imageHeight }
const anchorX = 32
const orients = {}
for (const yaw of [90, 180, 270]) {
  orients[String(yaw)] = {
    href: `/art/sprites/environment/templates/tplOutdoorFenceCorner_r${yaw}.png`,
    size: size0,
    anchorX,
  }
}

const piece = {
  id: 'tplOutdoorFenceCorner',
  label: 'Fence Corner',
  layer: 'furniture',
  href: '/art/sprites/environment/templates/tplOutdoorFenceCorner.png',
  size: size0,
  anchorX,
  orients,
  tags: ['outdoor', 'prop', 'furniture', 'corner', 'fence'],
  footprint: { width: 64, depth: 64 },
  height: 12,
  cover: true,
  fade: false,
  solid: true,
}

const prior = fs.existsSync(cataloguePath) ? JSON.parse(fs.readFileSync(cataloguePath, 'utf8')) : { pieces: [] }
const kept = (prior.pieces ?? []).filter((entry) => entry.id !== 'tplOutdoorFenceCorner')
const notes = [...(prior.notes ?? [])]
const note =
  'Outdoor Template 32 fence corner (tplOutdoorFenceCorner): single post the straight fence runs meet at (like wall corners). Art via scripts/makeOutdoorFenceCorner.mjs.'
const nextNotes = notes.filter((line) => !String(line).includes('tplOutdoorFenceCorner'))
nextNotes.push(note)
fs.writeFileSync(cataloguePath, `${JSON.stringify({ notes: nextNotes, pieces: [...kept, piece] }, null, 2)}\n`)
console.log('catalogue updated')
