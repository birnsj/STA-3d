const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')

// Small PNG inspect helpers for OpenArt import validation (no sharp/canvas dependency).

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function readPngInfo(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('Not a PNG picture')
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const bitDepth = buf[24]
  const colorType = buf[25]
  const hasAlpha = colorType === 4 || colorType === 6
  return { width, height, bitDepth, colorType, hasAlpha, bytes: buf.length }
}

function readPngInfoFromFile(file) {
  return readPngInfo(fs.readFileSync(file))
}

function decodeBase64Png(png) {
  const bytes = Buffer.from(String(png ?? ''), 'base64')
  readPngInfo(bytes)
  return bytes
}

function crcTable() {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

const CRC_TABLE = crcTable()

function crc32(data) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeB = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeB, data])))
  return Buffer.concat([len, typeB, data, crc])
}

function writeMinimalRgbaPng(file, width, height, rgba) {
  // Filter-none raw scanlines → zlib → IHDR/IDAT/IEND.
  const bpp = 4
  const stride = width * bpp
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const idat = zlib.deflateSync(raw, { level: 9 })
  fs.writeFileSync(
    file,
    Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]),
  )
}

function collectIdat(buf) {
  let o = 8
  const parts = []
  while (o < buf.length) {
    const len = buf.readUInt32BE(o)
    const type = buf.toString('ascii', o + 4, o + 8)
    if (type === 'IDAT') parts.push(buf.subarray(o + 8, o + 8 + len))
    o += 12 + len
    if (type === 'IEND') break
  }
  return zlib.inflateSync(Buffer.concat(parts))
}

// Decode common 8-bit PNG colour types to RGBA. Used to NN-upscale OpenArt references.
function decodePngRgba(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  const info = readPngInfo(buf)
  if (info.bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${info.bitDepth}`)
  const { width: w, height: h, colorType } = info
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0
  if (!bpp) throw new Error(`Unsupported PNG colour type ${colorType}`)
  const stride = w * bpp
  const inflated = collectIdat(buf)
  const row = Buffer.alloc(stride)
  const prev = Buffer.alloc(stride)
  const rgba = Buffer.alloc(w * h * 4)
  let src = 0
  const paeth = (a, b, c) => {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < h; y += 1) {
    const filter = inflated[src++]
    for (let i = 0; i < stride; i += 1) {
      const x = inflated[src++]
      const a = i >= bpp ? row[i - bpp] : 0
      const b = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      let v
      switch (filter) {
        case 0:
          v = x
          break
        case 1:
          v = (x + a) & 255
          break
        case 2:
          v = (x + b) & 255
          break
        case 3:
          v = (x + ((a + b) >> 1)) & 255
          break
        case 4:
          v = (x + paeth(a, b, c)) & 255
          break
        default:
          throw new Error(`Unsupported PNG filter ${filter}`)
      }
      row[i] = v
    }
    row.copy(prev)
    for (let x = 0; x < w; x += 1) {
      const di = (y * w + x) * 4
      if (colorType === 6) {
        rgba[di] = row[x * 4]
        rgba[di + 1] = row[x * 4 + 1]
        rgba[di + 2] = row[x * 4 + 2]
        rgba[di + 3] = row[x * 4 + 3]
      } else if (colorType === 2) {
        rgba[di] = row[x * 3]
        rgba[di + 1] = row[x * 3 + 1]
        rgba[di + 2] = row[x * 3 + 2]
        rgba[di + 3] = 255
      } else if (colorType === 4) {
        rgba[di] = row[x * 2]
        rgba[di + 1] = row[x * 2]
        rgba[di + 2] = row[x * 2]
        rgba[di + 3] = row[x * 2 + 1]
      } else {
        rgba[di] = row[x]
        rgba[di + 1] = row[x]
        rgba[di + 2] = row[x]
        rgba[di + 3] = 255
      }
    }
  }
  return { width: w, height: h, rgba, hasAlpha: info.hasAlpha }
}

function scaleRgbaNearest(src, srcW, srcH, scale) {
  const dstW = srcW * scale
  const dstH = srcH * scale
  return resizeRgbaNearest(src, srcW, srcH, dstW, dstH)
}

function resizeRgbaNearest(src, srcW, srcH, dstW, dstH) {
  if (dstW < 1 || dstH < 1) throw new Error('Destination size must be at least 1×1')
  const dst = Buffer.alloc(dstW * dstH * 4)
  for (let y = 0; y < dstH; y += 1) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH))
    for (let x = 0; x < dstW; x += 1) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW))
      const si = (sy * srcW + sx) * 4
      const di = (y * dstW + x) * 4
      dst[di] = src[si]
      dst[di + 1] = src[si + 1]
      dst[di + 2] = src[si + 2]
      dst[di + 3] = src[si + 3]
    }
  }
  return { width: dstW, height: dstH, rgba: dst }
}

// Fit a generated PNG onto an exact template canvas:
// stretch to the template's exact W×H, then replace alpha with the template silhouette
// (and clear RGB where transparent). OpenArt often returns huge opaque landscapes; contain-scale
// left a postage stamp inside the sprite — stretch fills the original footprint.
// Returns { path, from, to, scaled, offset, appliedMask }.
function fitResultToTemplateSprite(resultFile, templateFile, destFile) {
  const template = decodePngRgba(fs.readFileSync(templateFile))
  const result = decodePngRgba(fs.readFileSync(resultFile))
  const tw = template.width
  const th = template.height
  const scaled = resizeRgbaNearest(result.rgba, result.width, result.height, tw, th)
  const out = Buffer.alloc(tw * th * 4, 0)
  for (let i = 0; i < out.length; i += 4) {
    const alpha = template.rgba[i + 3]
    if (alpha === 0) {
      // Keep fully transparent pixels clear (no baked background colour).
      out[i] = 0
      out[i + 1] = 0
      out[i + 2] = 0
      out[i + 3] = 0
      continue
    }
    out[i] = scaled.rgba[i]
    out[i + 1] = scaled.rgba[i + 1]
    out[i + 2] = scaled.rgba[i + 2]
    out[i + 3] = alpha
  }
  writeMinimalRgbaPng(destFile, tw, th, out)
  return {
    path: destFile,
    from: { width: result.width, height: result.height },
    to: { width: tw, height: th },
    scaled: { width: tw, height: th },
    offset: { x: 0, y: 0 },
    appliedMask: true,
  }
}

// Same fit, operating on PNG buffers (Accept-time safety net).
function fitResultBytesToTemplateBytes(resultBytes, templateBytes) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openart-fit-'))
  try {
    const resultFile = path.join(tmpRoot, 'result.png')
    const templateFile = path.join(tmpRoot, 'template.png')
    const destFile = path.join(tmpRoot, 'fitted.png')
    fs.writeFileSync(resultFile, resultBytes)
    fs.writeFileSync(templateFile, templateBytes)
    fitResultToTemplateSprite(resultFile, templateFile, destFile)
    return fs.readFileSync(destFile)
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }
}

// Kling / OpenArt image2image rejects references narrower than this.
const OPENART_MIN_REF_WIDTH = 300

// If the source PNG is under the vendor minimum width, write a nearest-neighbour upscale into destFile.
// Returns null when no upscale was needed; otherwise { path, from, to, scale }.
function ensureMinReferenceWidth(sourceFile, destFile, minWidth = OPENART_MIN_REF_WIDTH) {
  const decoded = decodePngRgba(fs.readFileSync(sourceFile))
  if (decoded.width >= minWidth) return null
  const scale = Math.max(2, Math.ceil(minWidth / decoded.width))
  const scaled = scaleRgbaNearest(decoded.rgba, decoded.width, decoded.height, scale)
  writeMinimalRgbaPng(destFile, scaled.width, scaled.height, scaled.rgba)
  return {
    path: destFile,
    from: { width: decoded.width, height: decoded.height },
    to: { width: scaled.width, height: scaled.height },
    scale,
  }
}

module.exports = {
  PNG_SIG,
  OPENART_MIN_REF_WIDTH,
  readPngInfo,
  readPngInfoFromFile,
  decodeBase64Png,
  writeMinimalRgbaPng,
  decodePngRgba,
  scaleRgbaNearest,
  resizeRgbaNearest,
  ensureMinReferenceWidth,
  fitResultToTemplateSprite,
  fitResultBytesToTemplateBytes,
}
