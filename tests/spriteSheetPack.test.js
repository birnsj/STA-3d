import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  footprintTilesFromDesign,
  packSheetStamps,
  sheetIsoOrigin,
  sheetPreset,
  stampsFootprintsOverlap,
} from '../src/maps/spriteSheetLayout.js'
import { tileImageBox } from '../src/maps/iso.js'

function stamp(id, x, y, size = { width: 49, height: 117 }, footprint = { width: 1, depth: 1 }, extra = {}) {
  return { id, x, y, size, footprint, image: `/art/${id}.png`, label: id, ...extra }
}

function sheetRect(entry, presetId = '1k') {
  const preset = sheetPreset(presetId)
  const origin = sheetIsoOrigin(preset)
  const box = tileImageBox({ x: entry.x, y: entry.y }, entry.size)
  return {
    x: origin.originX + box.x,
    y: origin.originY + box.y,
    width: entry.size.width,
    height: entry.size.height,
  }
}

function overlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

describe('packSheetStamps', () => {
  it('packs overlapping stamps onto free iso cells without image overlap', () => {
    const input = [stamp('a', 0, 0), stamp('b', 0, 0), stamp('c', 0, 0)]
    const { stamps, packed, unfit } = packSheetStamps(input, '1k')
    assert.equal(packed, 3)
    assert.equal(unfit, 0)
    assert.equal(stamps.length, 3)
    const rects = stamps.map((entry) => sheetRect(entry))
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        assert.equal(overlap(rects[i], rects[j]), false, `${stamps[i].id} overlaps ${stamps[j].id}`)
      }
    }
  })

  it('keeps stamp ids and order', () => {
    const input = [stamp('first', 2, 2), stamp('second', 2, 2)]
    const { stamps } = packSheetStamps(input, '1k')
    assert.deepEqual(
      stamps.map((entry) => entry.id),
      ['first', 'second'],
    )
  })

  it('packs tip-anchored wall stamps without changing their design size', () => {
    const wall = stamp('wall', 0, 0, { width: 49, height: 117 }, { width: 1, depth: 0.5 }, {
      plant: 'tip',
      anchorX: 33,
    })
    const { stamps, packed } = packSheetStamps([wall, { ...wall, id: 'wall2' }], '1k')
    assert.equal(packed, 2)
    for (const entry of stamps) {
      assert.deepEqual(entry.size, { width: 49, height: 117 })
      assert.equal(entry.plant, 'tip')
    }
  })

  it('keeps design-px footprints as tile units (64×32 → 1×0.5)', () => {
    assert.deepEqual(footprintTilesFromDesign({ width: 64, depth: 32 }), { width: 1, depth: 0.5 })
    assert.deepEqual(footprintTilesFromDesign({ width: 32, depth: 32 }), { width: 0.5, depth: 0.5 })
    assert.deepEqual(footprintTilesFromDesign({ width: 128, depth: 32 }), { width: 2, depth: 0.5 })
  })

  it('overlaps tip footprints by sprite AABB, not rounded cells', () => {
    const wall = stamp('a', 5, 5, { width: 49, height: 117 }, { width: 1, depth: 0.5 }, { plant: 'tip' })
    const beside = stamp('b', 5, 5, { width: 49, height: 117 }, { width: 1, depth: 0.5 }, { plant: 'tip' })
    const clear = stamp('c', 7, 5, { width: 49, height: 117 }, { width: 1, depth: 0.5 }, { plant: 'tip' })
    assert.equal(stampsFootprintsOverlap(wall, beside), true)
    assert.equal(stampsFootprintsOverlap(wall, clear), false)
  })

  it('packs tip walls onto the half-tile (32px) grid', () => {
    const wall = stamp('a', 0, 0, { width: 49, height: 117 }, { width: 1, depth: 0.5 }, {
      plant: 'tip',
      anchorX: 33,
    })
    const { stamps, packed } = packSheetStamps([wall, { ...wall, id: 'b' }, { ...wall, id: 'c' }], '1k')
    assert.equal(packed, 3)
    for (const entry of stamps) {
      assert.equal(entry.x * 2, Math.round(entry.x * 2), `tip x ${entry.x} should be on 0.5 grid`)
      assert.equal(entry.y * 2, Math.round(entry.y * 2), `tip y ${entry.y} should be on 0.5 grid`)
    }
  })

  it('honours an adjustable pixel gap between packed image rects', () => {
    const input = [stamp('a', 0, 0), stamp('b', 0, 0), stamp('c', 0, 0)]
    const tight = packSheetStamps(input, '1k', { gap: 0 })
    const loose = packSheetStamps(input, '1k', { gap: 32 })
    assert.equal(tight.packed, 3)
    assert.equal(loose.packed, 3)
    assert.equal(loose.gap, 32)
    const looseRects = loose.stamps.map((entry) => sheetRect(entry))
    for (let i = 0; i < looseRects.length; i += 1) {
      for (let j = i + 1; j < looseRects.length; j += 1) {
        const a = looseRects[i]
        const b = looseRects[j]
        const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)))
        const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)))
        // Separated on at least one axis by the requested gap (or farther).
        const separated = a.x + a.width + 32 <= b.x || b.x + b.width + 32 <= a.x
          || a.y + a.height + 32 <= b.y || b.y + b.height + 32 <= a.y
        assert.equal(separated, true, `${loose.stamps[i].id}/${loose.stamps[j].id} closer than 32px (dx=${dx}, dy=${dy})`)
      }
    }
  })
})
