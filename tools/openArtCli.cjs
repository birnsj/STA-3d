const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

// Thin wrapper around the installed OpenArt CLI. Always spawn with an argv array (never a shell string).

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

function defaultBinCandidates() {
  const candidates = []
  if (process.env.OPENART_BIN) candidates.push(process.env.OPENART_BIN)
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA
    if (local) candidates.push(path.join(local, 'Programs', 'openart', 'bin', 'openart.exe'))
  } else {
    candidates.push('/usr/local/bin/openart', path.join(os.homedir(), '.local', 'bin', 'openart'))
  }
  candidates.push('openart')
  return candidates
}

function resolveOpenArtBin() {
  for (const candidate of defaultBinCandidates()) {
    if (!candidate) continue
    if (candidate === 'openart') return candidate
    if (fs.existsSync(candidate)) return candidate
  }
  return 'openart'
}

function runOpenArt(args, { timeoutMs = DEFAULT_TIMEOUT_MS, bin = resolveOpenArtBin() } = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    return Promise.reject(new Error('OpenArt CLI args must be a string array'))
  }
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(`OpenArt CLI timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        const detail = (stderr || stdout || `exit ${code}`).trim()
        reject(new Error(detail || `OpenArt CLI exited with code ${code}`))
        return
      }
      resolve({ stdout, stderr, code })
    })
  })
}

function parseJsonStdout(stdout) {
  const text = String(stdout ?? '').trim()
  if (!text) throw new Error('OpenArt CLI returned no JSON')
  const start = Math.min(...['{', '['].map((ch) => {
    const at = text.indexOf(ch)
    return at < 0 ? Infinity : at
  }))
  if (!Number.isFinite(start)) throw new Error('OpenArt CLI stdout was not JSON')
  return JSON.parse(text.slice(start))
}

async function openArtJson(args, options) {
  const { stdout } = await runOpenArt([...args, '--json'], options)
  return parseJsonStdout(stdout)
}

function listModels(options) {
  return openArtJson(['model', 'list'], options)
}

function modelCosts(options) {
  return openArtJson(['model', 'cost'], options)
}

function modelCostFor(model, mode, options) {
  const args = ['model', 'cost']
  if (model) args.push('--model', model)
  if (mode) args.push('--mode', mode)
  return openArtJson(args, options)
}

// text2image / image2image. Only documented CLI flags: --model, --image, -o, --dry-run, --async, --yes.
async function generateImage({ prompt, model, imagePath = null, outputDir = null, dryRun = false, timeoutMs }, options = {}) {
  if (!prompt || typeof prompt !== 'string') throw new Error('prompt is required')
  if (!model || typeof model !== 'string') throw new Error('model is required')
  const args = ['generate', 'image', prompt, '--model', model, '--yes']
  if (imagePath) args.push('--image', imagePath)
  if (dryRun) args.push('--dry-run')
  if (!dryRun) {
    if (!outputDir) throw new Error('outputDir is required unless dryRun')
    args.push('-o', outputDir)
  }
  const result = await openArtJson(args, { ...options, timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS })
  return result
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  resolveOpenArtBin,
  runOpenArt,
  parseJsonStdout,
  openArtJson,
  listModels,
  modelCosts,
  modelCostFor,
  generateImage,
}
