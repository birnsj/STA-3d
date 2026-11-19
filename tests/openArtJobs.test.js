import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createOpenArtJobs } = require('../tools/openArtJobs.cjs')
const { createTileFromArt, applyTileChange } = require('../tools/tileStore.cjs')
const {
  ensureMinReferenceWidth,
  fitResultToTemplateSprite,
  decodePngRgba,
  writeMinimalRgbaPng,
  readPngInfoFromFile,
} = require('../tools/openArtPng.cjs')
const { buildTileRestylePrompt } = require('../tools/openArtPrompt.cjs')

let root
const at = (...parts) => path.join(root, ...parts)

function seedTilesJson() {
  const file = at('tiles.json')
  const data = {
    notes: ['test'],
    imageSize: { width: 64, height: 96 },
    paletteGroups: [{ id: 'tosBridge', section: 'Locations', label: 'Bridge (TOS)', tiles: ['tosWall'] }],
    tiles: [
      {
        id: 'tosWall',
        layer: 'walls',
        symbol: 'A',
        label: 'Bridge Station Wall',
        image: '/art/sprites/environment/tosBridge/tosWall.png',
        solid: true,
        blocksSight: true,
        cover: false,
        fade: true,
        wall: true,
        height: 64,
        imageHeight: 100,
        role: null,
        joinImages: '/art/sprites/environment/tosBridge/tosRail-{joins}.png',
      },
    ],
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  return file
}

function seedPublicArt() {
  const dir = at('public', 'art', 'sprites', 'environment', 'tosBridge')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'tosWall.png')
  const w = 32
  const h = 48
  const rgba = Buffer.alloc(w * h * 4, 0)
  for (let y = 4; y < h - 4; y += 1) {
    for (let x = 4; x < w - 4; x += 1) {
      const i = (y * w + x) * 4
      rgba[i] = 180
      rgba[i + 1] = 180
      rgba[i + 2] = 190
      rgba[i + 3] = 255
    }
  }
  writeMinimalRgbaPng(file, w, h, rgba)
  return file
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'openart-jobs-'))
  process.env.OPENART_MOCK = '1'
})
afterEach(() => {
  delete process.env.OPENART_MOCK
  fs.rmSync(root, { recursive: true, force: true })
})

describe('openArtJobs mock generation', () => {
  it('lists mock models and runs a dry-run without writing a PNG', async () => {
    const publicRoot = at('public')
    fs.mkdirSync(publicRoot, { recursive: true })
    const jobs = createOpenArtJobs({ rootDir: root, publicRoot })
    const catalog = await jobs.getModels()
    assert.equal(catalog.mock, true)
    assert.ok(catalog.models.some((model) => model.id === 'mock-img2img'))

    const started = await jobs.startJob({
      prompt: 'Klingon wall',
      model: 'mock-img2img',
      dryRun: true,
    })
    assert.ok(['queued', 'running', 'completed'].includes(started.job.status))
    for (let i = 0; i < 40; i += 1) {
      const snap = jobs.snapshot()
      if (snap.job?.status === 'completed' || snap.job?.status === 'failed') break
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    const done = jobs.snapshot()
    assert.equal(done.job.status, 'completed')
    assert.ok(done.job.dryRunBody)
    assert.equal(done.job.resultFile, null)
  })

  it('generates one mocked image2image result from a reference and enforces single-flight', async () => {
    const publicRoot = at('public')
    const ref = seedPublicArt()
    const jobs = createOpenArtJobs({ rootDir: root, publicRoot })
    const first = await jobs.startJob({
      prompt: 'Klingon restyle',
      model: 'mock-img2img',
      referenceImagePath: '/art/sprites/environment/tosBridge/tosWall.png',
    })
    assert.equal(first.job.mode, 'image2image')
    assert.ok(first.busy || ['queued', 'running', 'completed'].includes(first.job.status))
    if (first.busy || first.job.status === 'queued' || first.job.status === 'running') {
      await assert.rejects(
        () =>
          jobs.startJob({
            prompt: 'second',
            model: 'mock-img2img',
          }),
        /already running/i,
      )
    }
    for (let i = 0; i < 40; i += 1) {
      const snap = jobs.snapshot()
      if (snap.job?.status === 'completed' || snap.job?.status === 'failed') break
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    const done = jobs.snapshot()
    assert.equal(done.job.status, 'completed')
    assert.ok(done.job.resultFile)
    assert.ok(fs.existsSync(done.job.resultFile))
    const info = readPngInfoFromFile(done.job.resultFile)
    const srcInfo = readPngInfoFromFile(ref)
    assert.equal(info.width, srcInfo.width)
    assert.equal(info.height, srcInfo.height)
    assert.equal(info.hasAlpha, true)
    assert.ok(done.job.sizeFit)
    assert.equal(done.job.sizeFit.to.width, srcInfo.width)
    assert.equal(done.job.sizeFit.to.height, srcInfo.height)
    assert.equal(done.job.sizeFit.appliedMask, true)
    const png = jobs.readResultBase64(done.job.id)
    assert.ok(png && png.length > 20)
  })
})

describe('fitResultToTemplateSprite', () => {
  it('stretches to the template canvas and forces the original alpha silhouette', () => {
    const template = at('template.png')
    const generated = at('generated.png')
    const fitted = at('fitted.png')

    const tw = 40
    const th = 60
    const templateRgba = Buffer.alloc(tw * th * 4, 0)
    for (let y = 10; y < 50; y += 1) {
      for (let x = 10; x < 30; x += 1) {
        const i = (y * tw + x) * 4
        templateRgba[i] = 200
        templateRgba[i + 1] = 200
        templateRgba[i + 2] = 200
        templateRgba[i + 3] = 255
      }
    }
    writeMinimalRgbaPng(template, tw, th, templateRgba)

    // Wide opaque landscape — the failure mode OpenArt often returns.
    const gw = 80
    const gh = 40
    const genRgba = Buffer.alloc(gw * gh * 4, 0)
    for (let y = 0; y < gh; y += 1) {
      for (let x = 0; x < gw; x += 1) {
        const i = (y * gw + x) * 4
        genRgba[i] = 10
        genRgba[i + 1] = 220
        genRgba[i + 2] = 10
        genRgba[i + 3] = 255
      }
    }
    writeMinimalRgbaPng(generated, gw, gh, genRgba)

    const result = fitResultToTemplateSprite(generated, template, fitted)
    assert.equal(result.to.width, tw)
    assert.equal(result.to.height, th)
    assert.equal(result.scaled.width, tw)
    assert.equal(result.scaled.height, th)
    assert.equal(result.appliedMask, true)
    const out = decodePngRgba(fs.readFileSync(fitted))
    assert.equal(out.width, tw)
    assert.equal(out.height, th)
    // Outside the template silhouette must stay fully clear.
    assert.equal(out.rgba[3], 0)
    assert.equal(out.rgba[0], 0)
    // Inside the template opaque rect should be filled (stretch) with template alpha.
    const mid = 30 * tw + 20
    const mi = mid * 4
    assert.equal(out.rgba[mi + 1], 220)
    assert.equal(out.rgba[mi + 3], 255)
    // Alpha channel must match the template exactly.
    for (let i = 3; i < out.rgba.length; i += 4) {
      assert.equal(out.rgba[i], templateRgba[i])
    }
  })
})

describe('buildTileRestylePrompt', () => {
  it('wraps a short intent with silhouette rules when a template is used', () => {
    const prompt = buildTileRestylePrompt({ intent: 'Klingon', tileLabel: 'Building Wall', hasReference: true })
    assert.match(prompt, /User request: Klingon/)
    assert.match(prompt, /Building Wall/)
    assert.match(prompt, /identical outer silhouette/)
    assert.match(prompt, /Do NOT flatten/)
  })

  it('rejects an empty change', () => {
    assert.throws(() => buildTileRestylePrompt({ intent: '  ' }), /required/i)
  })
})

describe('ensureMinReferenceWidth', () => {
  it('nearest-neighbour upscales references narrower than 300px into a temp file', () => {
    const src = at('narrow.png')
    const dest = at('wide.png')
    const w = 256
    const h = 400
    const rgba = Buffer.alloc(w * h * 4, 0)
    for (let y = 10; y < h - 10; y += 1) {
      for (let x = 10; x < w - 10; x += 1) {
        const i = (y * w + x) * 4
        rgba[i] = 10
        rgba[i + 1] = 200
        rgba[i + 2] = 10
        rgba[i + 3] = 255
      }
    }
    writeMinimalRgbaPng(src, w, h, rgba)
    const result = ensureMinReferenceWidth(src, dest)
    assert.ok(result)
    assert.equal(result.from.width, 256)
    assert.ok(result.to.width >= 300)
    assert.equal(result.scale, 2)
    assert.ok(fs.existsSync(dest))
    const info = readPngInfoFromFile(dest)
    assert.equal(info.width, 512)
    assert.equal(info.height, 800)
    assert.equal(info.hasAlpha, true)
    assert.equal(ensureMinReferenceWidth(dest, at('noop.png')), null)
  })
})

describe('createTileFromArt', () => {
  it('imports a new tile copying safe metadata, fitting size/alpha, and warning about joinImages', () => {
    const tilesFile = seedTilesJson()
    const publicRoot = at('public')
    const sourceArt = seedPublicArt()
    // Different size than source (64×96 vs 32×48) and fully opaque — Accept must fit.
    const w = 64
    const h = 96
    const rgba = Buffer.alloc(w * h * 4, 0)
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4
        rgba[i] = 90
        rgba[i + 1] = 40
        rgba[i + 2] = 40
        rgba[i + 3] = 255
      }
    }
    const tempPng = at('gen.png')
    writeMinimalRgbaPng(tempPng, w, h, rgba)
    const png = fs.readFileSync(tempPng).toString('base64')

    const result = createTileFromArt(
      tilesFile,
      { label: 'Bridge Station Wall (AI)', png, sourceId: 'tosWall' },
      { publicRoot },
    )
    assert.notEqual(result.id, 'tosWall')
    assert.equal(result.tile.layer, 'walls')
    assert.equal(result.tile.solid, true)
    assert.equal(result.tile.blocksSight, true)
    assert.equal(result.tile.fade, true)
    assert.equal(result.tile.wall, true)
    assert.equal(result.tile.imageHeight, 100)
    assert.equal(result.tile.joinImages, undefined)
    assert.ok(result.warnings.some((warning) => /join-image/i.test(warning)))
    const written = path.join(publicRoot, result.image.replace(/^\//, ''))
    assert.ok(fs.existsSync(written))
    const srcInfo = readPngInfoFromFile(sourceArt)
    const outInfo = readPngInfoFromFile(written)
    assert.equal(outInfo.width, srcInfo.width)
    assert.equal(outInfo.height, srcInfo.height)
    assert.equal(outInfo.hasAlpha, true)
    const src = decodePngRgba(fs.readFileSync(sourceArt))
    const out = decodePngRgba(fs.readFileSync(written))
    for (let i = 3; i < out.rgba.length; i += 4) {
      assert.equal(out.rgba[i], src.rgba[i])
    }

    const viaApply = applyTileChange(
      tilesFile,
      { op: 'createTileFromArt', label: 'Another AI Wall', png, sourceId: 'tosWall' },
      { publicRoot },
    )
    assert.ok(viaApply.id)
    assert.notEqual(viaApply.id, result.id)
  })
})
