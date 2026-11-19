const fs = require('node:fs')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const {
  DEFAULT_TIMEOUT_MS,
  resolveOpenArtBin,
  listModels,
  modelCosts,
  modelCostFor,
  generateImage,
} = require('./openArtCli.cjs')
const {
  decodeBase64Png,
  ensureMinReferenceWidth,
  fitResultToTemplateSprite,
  readPngInfoFromFile,
  writeMinimalRgbaPng,
} = require('./openArtPng.cjs')
const { buildTileRestylePrompt } = require('./openArtPrompt.cjs')

// One-at-a-time OpenArt generation jobs for the Vite DEV server. Mock mode (OPENART_MOCK=1) never calls the CLI.

function isMock() {
  return process.env.OPENART_MOCK === '1' || process.env.OPENART_MOCK === 'true'
}

function newId() {
  return randomBytes(8).toString('hex')
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function publicUrlForTemp(fileName) {
  return `/__openart/files/${encodeURIComponent(fileName)}`
}

function createOpenArtJobs({ rootDir, publicRoot }) {
  const tempRoot = ensureDir(path.join(rootDir, '.tmp-openart'))
  let current = null
  let modelsCache = null
  let modelsCachedAt = 0
  const MODELS_TTL_MS = 60_000

  const snapshot = () => {
    if (!current) {
      return { busy: false, job: null }
    }
    const job = { ...current }
    delete job._private
    return { busy: job.status === 'queued' || job.status === 'running', job }
  }

  const mockModels = () => [
    {
      id: 'mock-img2img',
      displayName: 'Mock Image2Image',
      modes: { image: [{ mode: 'text2image' }, { mode: 'image2image' }] },
    },
    {
      id: 'mock-t2i',
      displayName: 'Mock Text2Image',
      modes: { image: [{ mode: 'text2image' }] },
    },
  ]

  const mockCosts = () => ({
    currency: 'credits',
    items: [
      {
        model: 'mock-img2img',
        displayName: 'Mock Image2Image',
        media: 'image',
        mode: 'image2image',
        config: { imageCount: 1 },
        unitCredits: 1,
        quantity: 1,
        totalCredits: 1,
      },
      {
        model: 'mock-img2img',
        displayName: 'Mock Image2Image',
        media: 'image',
        mode: 'text2image',
        config: { imageCount: 1 },
        unitCredits: 1,
        quantity: 1,
        totalCredits: 1,
      },
      {
        model: 'mock-t2i',
        displayName: 'Mock Text2Image',
        media: 'image',
        mode: 'text2image',
        config: { imageCount: 1 },
        unitCredits: 1,
        quantity: 1,
        totalCredits: 1,
      },
    ],
  })

  async function getModels(force = false) {
    if (!force && modelsCache && Date.now() - modelsCachedAt < MODELS_TTL_MS) return modelsCache
    if (isMock()) {
      modelsCache = { models: mockModels(), costs: mockCosts(), mock: true, bin: 'mock' }
      modelsCachedAt = Date.now()
      return modelsCache
    }
    const bin = resolveOpenArtBin()
    const [models, costs] = await Promise.all([listModels({ bin }), modelCosts({ bin })])
    const list = Array.isArray(models) ? models : models.items || models.data || []
    modelsCache = { models: list, costs, mock: false, bin }
    modelsCachedAt = Date.now()
    return modelsCache
  }

  async function quoteCost(model, mode) {
    if (isMock()) {
      const hit = mockCosts().items.find((item) => item.model === model && item.mode === mode)
      return hit || { model, mode, totalCredits: null, unitCredits: null }
    }
    const result = await modelCostFor(model, mode, { bin: resolveOpenArtBin() })
    const items = result.items || []
    return items[0] || { model, mode, totalCredits: null }
  }

  function resolveUnderPublic(relPath) {
    const parts = String(relPath).replace(/^\/+/, '').split(/[/\\]+/).filter(Boolean)
    if (!parts.length || parts.some((part) => part === '.' || part === '..')) {
      throw new Error('Invalid reference image path')
    }
    const absolute = path.resolve(publicRoot, ...parts)
    const root = path.resolve(publicRoot)
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
    if (absolute !== root && !absolute.startsWith(prefix)) throw new Error('Reference path left the public folder')
    if (!fs.existsSync(absolute)) throw new Error(`Reference image not found: ${relPath}`)
    return absolute
  }

  function resolveReferencePath(referenceImagePath) {
    if (!referenceImagePath) return null
    if (typeof referenceImagePath !== 'string') throw new Error('referenceImagePath must be a string')
    // Catalogue URLs (`/art/...`) must not use path.isAbsolute — on Windows a leading slash is absolute.
    if (referenceImagePath.startsWith('/art/') || referenceImagePath.startsWith('art/')) {
      return resolveUnderPublic(referenceImagePath)
    }
    if (path.isAbsolute(referenceImagePath)) {
      if (!fs.existsSync(referenceImagePath)) throw new Error(`Reference image not found: ${referenceImagePath}`)
      return referenceImagePath
    }
    return resolveUnderPublic(referenceImagePath)
  }

  function newestPng(dir) {
    if (!fs.existsSync(dir)) return null
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.png'))
      .map((name) => {
        const full = path.join(dir, name)
        return { full, name, mtime: fs.statSync(full).mtimeMs }
      })
      .sort((a, b) => b.mtime - a.mtime)
    return files[0] || null
  }

  async function runMockGenerate(job) {
    const outName = `${job.id}.png`
    const outFile = path.join(job.outputDir, outName)
    // Intentionally wrong size so fitResultToTemplateSprite is exercised in tests.
    const w = 96
    const h = 128
    const rgba = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4
        const inside = x > 12 && x < w - 12 && y > 12 && y < h - 12
        rgba[i] = 120
        rgba[i + 1] = 40
        rgba[i + 2] = 40
        rgba[i + 3] = inside ? 255 : 0
      }
    }
    writeMinimalRgbaPng(outFile, w, h, rgba)
    return outFile
  }

  function normalizeResultToTemplate(job, resultFile) {
    if (!job.referencePath || !fs.existsSync(job.referencePath)) {
      job.sizeFit = null
      return resultFile
    }
    const dest = path.join(job.outputDir, `${job.id}-fitted.png`)
    const fit = fitResultToTemplateSprite(resultFile, job.referencePath, dest)
    // Keep a stable preview name for URLs.
    const stable = path.join(job.outputDir, `${job.id}.png`)
    if (dest !== stable) fs.copyFileSync(dest, stable)
    job.sizeFit = {
      from: fit.from,
      to: fit.to,
      scaled: fit.scaled,
      offset: fit.offset,
      appliedMask: fit.appliedMask,
      note: `Stretched ${fit.from.width}×${fit.from.height} → ${fit.to.width}×${fit.to.height} and forced the original sprite transparency.`,
    }
    return stable
  }

  function prepareReferenceForCli(job) {
    if (!job.referencePath) return null
    // Kling/OpenArt require reference width ≥ 300px. Upscale into the job temp folder only —
    // never rewrite catalogue art under public/art.
    const dest = path.join(job.outputDir, 'reference-upscaled.png')
    const upscaled = ensureMinReferenceWidth(job.referencePath, dest)
    if (!upscaled) {
      job.cliReferencePath = job.referencePath
      job.referenceUpscale = null
      return job.referencePath
    }
    job.cliReferencePath = upscaled.path
    job.referenceUpscale = {
      from: upscaled.from,
      to: upscaled.to,
      scale: upscaled.scale,
      note: `Reference temporarily upscaled ${upscaled.from.width}×${upscaled.from.height} → ${upscaled.to.width}×${upscaled.to.height} (×${upscaled.scale}) so OpenArt accepts it (min width 300px). Source asset unchanged.`,
    }
    return upscaled.path
  }

  async function execute(job) {
    job.status = 'running'
    job.startedAt = Date.now()
    try {
      // Brief yield so a second startJob can observe the busy lock (esp. in mock mode).
      await new Promise((resolve) => setImmediate(resolve))
      if (job.status === 'discarded') return
      const cliReferencePath = prepareReferenceForCli(job)
      if (job.dryRun) {
        if (isMock()) {
          job.dryRunBody = {
            body: {
              model: job.model,
              media: 'image',
              mode: job.referencePath ? 'image2image' : 'text2image',
              params: {
                prompt: job.prompt,
                ...(cliReferencePath
                  ? { visualReferences: [{ label: path.basename(cliReferencePath), type: 'image' }] }
                  : {}),
              },
            },
            endpoint: 'POST /api/cli/v1/generate',
            mock: true,
            referenceUpscale: job.referenceUpscale,
          }
        } else {
          job.dryRunBody = await generateImage({
            prompt: job.prompt,
            model: job.model,
            imagePath: cliReferencePath,
            dryRun: true,
          })
        }
        job.status = 'completed'
        job.finishedAt = Date.now()
        return
      }

      let resultFile
      if (isMock()) {
        resultFile = await runMockGenerate(job)
      } else {
        await generateImage({
          prompt: job.prompt,
          model: job.model,
          imagePath: cliReferencePath,
          outputDir: job.outputDir,
          dryRun: false,
          timeoutMs: job.timeoutMs,
        })
        const found = newestPng(job.outputDir)
        if (!found) throw new Error('OpenArt finished but no PNG was written to the output folder')
        // Normalize name for stable preview URLs (ignore the temporary reference-upscaled.png).
        const candidates = fs
          .readdirSync(job.outputDir)
          .filter(
            (name) =>
              name.toLowerCase().endsWith('.png') &&
              name !== 'reference-upscaled.png' &&
              !name.endsWith('-fitted.png'),
          )
          .map((name) => {
            const full = path.join(job.outputDir, name)
            return { full, name, mtime: fs.statSync(full).mtimeMs }
          })
          .sort((a, b) => b.mtime - a.mtime)
        const pick = candidates[0] || found
        const stable = path.join(job.outputDir, `${job.id}-raw.png`)
        if (pick.full !== stable) fs.copyFileSync(pick.full, stable)
        resultFile = stable
      }
      resultFile = normalizeResultToTemplate(job, resultFile)
      const info = readPngInfoFromFile(resultFile)
      job.resultFile = resultFile
      job.resultFileName = path.basename(resultFile)
      job.resultUrl = publicUrlForTemp(path.relative(tempRoot, resultFile).replace(/\\/g, '/'))
      job.resultInfo = info
      job.status = 'completed'
      job.finishedAt = Date.now()
    } catch (error) {
      job.status = 'failed'
      job.error = String(error.message ?? error)
      job.finishedAt = Date.now()
    }
  }

  async function startJob(body) {
    if (current && (current.status === 'queued' || current.status === 'running')) {
      const error = new Error('An OpenArt generation is already running. Wait for it to finish or discard it.')
      error.statusCode = 409
      throw error
    }
    const intent = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
    const model = typeof body?.model === 'string' ? body.model.trim() : ''
    if (!intent) throw new Error('Change text is required')
    if (!model) throw new Error('model is required')
    const dryRun = Boolean(body?.dryRun)
    const referenceImagePath = body?.referenceImagePath || null
    const referencePng = typeof body?.referencePng === 'string' && body.referencePng.trim() ? body.referencePng.trim() : null
    let referencePath = null
    const id = newId()
    const outputDir = ensureDir(path.join(tempRoot, id))
    if (referencePng) {
      // Composed sprite sheet from the editor — write into the job temp folder only.
      const uploaded = path.join(outputDir, 'reference-sheet.png')
      fs.writeFileSync(uploaded, decodeBase64Png(referencePng))
      referencePath = uploaded
    } else if (referenceImagePath) {
      referencePath = resolveReferencePath(referenceImagePath)
    }
    const tileLabel = typeof body?.tileLabel === 'string' ? body.tileLabel.trim() : null
    const mode = referencePath ? 'image2image' : 'text2image'
    // Designer types a short intent; we always expand it into a geometry-preserving OpenArt prompt.
    const prompt = buildTileRestylePrompt({
      intent,
      tileLabel,
      hasReference: Boolean(referencePath),
    })
    let cost = null
    try {
      cost = await quoteCost(model, mode)
    } catch {
      cost = null
    }
    current = {
      id,
      status: 'queued',
      intent,
      tileLabel,
      prompt,
      model,
      mode,
      dryRun,
      referenceImagePath: referenceImagePath || null,
      referencePng: Boolean(referencePng),
      referencePath,
      cliReferencePath: null,
      referenceUpscale: null,
      sizeFit: null,
      outputDir,
      timeoutMs: Number(body?.timeoutMs) > 0 ? Number(body.timeoutMs) : DEFAULT_TIMEOUT_MS,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      error: null,
      resultFile: null,
      resultFileName: null,
      resultUrl: null,
      resultInfo: null,
      dryRunBody: null,
      cost,
      mock: isMock(),
    }
    // Fire and forget; clients poll GET /__openart/status
    void execute(current)
    return snapshot()
  }

  function discard() {
    if (!current) return snapshot()
    if (current.status === 'running' || current.status === 'queued') {
      // Soft discard: mark failed; the in-flight process may still finish writing temp files.
      current.status = 'discarded'
      current.error = 'Discarded'
      current.finishedAt = Date.now()
    }
    if (current.outputDir && fs.existsSync(current.outputDir)) {
      try {
        fs.rmSync(current.outputDir, { recursive: true, force: true })
      } catch {
        // Temp cleanup is best-effort.
      }
    }
    current = null
    return snapshot()
  }

  function resolveTempFile(urlPath) {
    // urlPath is the part after /__openart/files/
    const rel = decodeURIComponent(String(urlPath || ''))
    if (!rel || rel.includes('\0') || path.isAbsolute(rel)) return null
    const parts = rel.split(/[/\\]+/).filter(Boolean)
    if (!parts.length || parts.some((part) => part === '.' || part === '..')) return null
    const absolute = path.resolve(tempRoot, ...parts)
    const root = path.resolve(tempRoot)
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
    if (absolute !== root && !absolute.startsWith(prefix)) return null
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null
    return absolute
  }

  function readResultBase64(jobId) {
    if (!current || current.id !== jobId || !current.resultFile) return null
    return fs.readFileSync(current.resultFile).toString('base64')
  }

  return {
    tempRoot,
    isMock,
    snapshot,
    getModels,
    quoteCost,
    startJob,
    discard,
    resolveTempFile,
    readResultBase64,
  }
}

module.exports = { createOpenArtJobs, isMock }
