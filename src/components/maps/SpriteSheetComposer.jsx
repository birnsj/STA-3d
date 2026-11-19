import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { getTile } from '../../maps/mapFormat.js'
import { fillIsoRect } from './isoFloorPattern.js'
import { diamond, footprintDiamond, project, propImageBox, TILE_H, TILE_W, tileImageBox, unproject } from '../../maps/iso.js'
import { snapTemplatePiecePosition, TEMPLATE_PIECE_CELL_PX } from '../../maps/mapEdits.js'
import { spriteUrl } from '../../maps/spriteFiles.js'
import { DEFAULT_EDITOR_GRID_SIZE, guideOrigin } from './editorGrid.js'
import { drawLoneTiles } from './canvasTiles.js'
import {
  DEFAULT_SHEET_SQUARE_GRID,
  sheetGridSize,
  sheetIsoOrigin,
  sheetPreset,
  sheetSquareGridPreset,
} from '../../maps/spriteSheetLayout.js'

// Same 1- or 2-cell layout TileThumbnail / the board uses for a palette tile (panel walls = pair along +x).
function boardTilePreview(tileId) {
  const tile = getTile(tileId)
  if (!tile) return null
  const positions = tile.panels ? [{ x: 0, y: 0 }, { x: 1, y: 0 }] : [{ x: 0, y: 0 }]
  const map = { width: positions.length, height: 1, tiles: [positions.map(() => tile.id)] }
  const hasWindow = tile.windows !== false
  const panels = new Map(
    tile.panels
      ? positions.map((position, half) => [`${position.x},${position.y}`, { axis: 'x', half, window: hasWindow }])
      : [],
  )
  return { tile, positions, layout: { map, panels, bigGroups: new Map() } }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) reject(new Error('not an image'))
      else resolve(image)
    }
    image.onerror = () => reject(new Error('load failed'))
    image.src = src
  })
}

let stampSeq = 0
function nextStampId() {
  stampSeq += 1
  return `stamp-${stampSeq}`
}

function stampDrawBox(stamp, boardRender = null) {
  // Board-rendered tiles (panel walls etc.): canvas is already in design pixels at local origin 0,0.
  if (boardRender && stamp.plant !== 'tip') {
    const at = project({ x: stamp.x, y: stamp.y })
    return {
      x: at.x + boardRender.area.x,
      y: at.y + boardRender.area.y,
      width: boardRender.canvas.width,
      height: boardRender.canvas.height,
    }
  }
  const size = stamp.size || { width: TILE_W, height: 96 }
  if (stamp.plant === 'tip') return propImageBox({ x: stamp.x, y: stamp.y }, size, stamp.anchorX)
  return tileImageBox({ x: stamp.x, y: stamp.y }, size)
}

function paintSquareGrid(ctx, originX, originY, width, height, cell) {
  const stepX = Math.max(1, Math.round(Number(cell?.width) || TILE_W))
  const stepY = Math.max(1, Math.round(Number(cell?.height) || TILE_H))
  let x0 = originX % stepX
  let y0 = originY % stepY
  if (x0 < 0) x0 += stepX
  if (y0 < 0) y0 += stepY
  ctx.save()
  ctx.strokeStyle = 'rgba(180, 210, 220, 0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = x0; x <= width; x += stepX) {
    ctx.moveTo(Math.round(x) + 0.5, 0)
    ctx.lineTo(Math.round(x) + 0.5, height)
  }
  for (let y = y0; y <= height; y += stepY) {
    ctx.moveTo(0, Math.round(y) + 0.5)
    ctx.lineTo(width, Math.round(y) + 0.5)
  }
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 160, 100, 0.45)'
  ctx.fillRect(originX - 1, originY - 1, 3, 3)
  ctx.restore()
}

// Same iso guide lines as the main editor (EditorGridView): constant-x / constant-y in tile space.
function paintIsoGuideGrid(ctx, originX, originY, width, height, cellPx) {
  const size = Number(cellPx) > 0 ? Number(cellPx) : TILE_W
  const step = size / TILE_W
  if (!(step > 0)) return
  const corners = [
    unproject({ x: -originX, y: -originY }),
    unproject({ x: width - originX, y: -originY }),
    unproject({ x: -originX, y: height - originY }),
    unproject({ x: width - originX, y: height - originY }),
  ]
  const xMin = Math.min(...corners.map((c) => c.x))
  const yMin = Math.min(...corners.map((c) => c.y))
  const xMax = Math.max(...corners.map((c) => c.x))
  const yMax = Math.max(...corners.map((c) => c.y))
  const origin = guideOrigin(step)
  const i0 = Math.ceil((xMin - origin) / step - 1e-9)
  const i1 = Math.floor((xMax - origin) / step + 1e-9)
  const j0 = Math.ceil((yMin - origin) / step - 1e-9)
  const j1 = Math.floor((yMax - origin) / step + 1e-9)
  ctx.save()
  ctx.strokeStyle = 'rgba(183, 221, 228, 0.45)'
  ctx.lineWidth = 1
  ctx.beginPath()
  const line = (ax, ay, bx, by) => {
    const a = project({ x: ax, y: ay })
    const b = project({ x: bx, y: by })
    ctx.moveTo(originX + a.x, originY + a.y)
    ctx.lineTo(originX + b.x, originY + b.y)
  }
  for (let i = i0; i <= i1; i += 1) {
    const x = origin + i * step
    line(x, yMin, x, yMax)
  }
  for (let j = j0; j <= j1; j += 1) {
    const y = origin + j * step
    line(xMin, y, xMax, y)
  }
  ctx.stroke()
  ctx.restore()
}

function paintFlatFloor(ctx, width, height) {
  ctx.fillStyle = '#0c181c'
  ctx.fillRect(0, 0, width, height)
  const check = 32
  for (let y = 0; y < height; y += check) {
    for (let x = 0; x < width; x += check) {
      if ((((x / check) | 0) + ((y / check) | 0)) % 2) {
        ctx.fillStyle = '#142428'
        ctx.fillRect(x, y, check, check)
      }
    }
  }
}

// Tip plant: south-tip footprint (Template Piece). Center plant: one diamond per occupied cell (panel walls = 2×1).
function paintFootprintMark(ctx, originX, originY, at, footprint, { ok = true, plant = 'tip' } = {}) {
  const width = footprint?.width > 0 ? footprint.width : 1
  const depth = footprint?.depth > 0 ? footprint.depth : width
  const polys =
    plant === 'center'
      ? Array.from({ length: Math.max(1, Math.round(depth)) }, (_, dy) =>
          Array.from({ length: Math.max(1, Math.round(width)) }, (_, dx) =>
            diamond({ x: at.x + dx, y: at.y + dy }),
          ),
        ).flat()
      : [footprintDiamond(at, footprint)]
  ctx.save()
  ctx.fillStyle = ok ? 'rgba(90, 180, 220, 0.22)' : 'rgba(220, 80, 80, 0.28)'
  ctx.strokeStyle = ok ? 'rgba(90, 200, 240, 0.95)' : 'rgba(240, 100, 100, 0.95)'
  ctx.lineWidth = 2
  for (const points of polys) {
    ctx.beginPath()
    points.forEach(([x, y], index) => {
      const px = originX + x
      const py = originY + y
      if (index === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

function paintStampSprite(ctx, origin, stamp, image, { alpha = 1, boardRender = null } = {}) {
  const box = stampDrawBox(stamp, boardRender)
  const drawX = origin.originX + box.x
  const drawY = origin.originY + box.y
  ctx.save()
  ctx.globalAlpha = alpha
  if (boardRender?.canvas) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(boardRender.canvas, drawX, drawY)
  } else if (image) {
    const size = stamp.size || { width: TILE_W, height: 96 }
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(image, drawX, drawY, size.width, size.height)
  } else {
    ctx.fillStyle = 'rgba(240, 80, 80, 0.35)'
    ctx.fillRect(drawX, drawY, box.width, box.height)
  }
  ctx.restore()
  return { drawX, drawY, size: { width: box.width, height: box.height } }
}

const SHEET_PREVIEW_MAX = 480

const SpriteSheetComposer = forwardRef(function SpriteSheetComposer(
  {
    presetId,
    stamps,
    onStampsChange,
    selectedStampId = null,
    onSelectStamp = null,
    // Live brush from SpriteSheetsScreen (already resolved at current R rotation).
    brush = null,
    onBrushRotate = null,
    onStampRotate = null,
    version = 0,
    onStatus = null,
    showIsoGrid = true,
    showGuideGrid = true,
    guideGridSize = DEFAULT_EDITOR_GRID_SIZE,
    showSquareGrid = true,
    squareGridId = DEFAULT_SHEET_SQUARE_GRID,
    showSelectionOutline = true,
    onSheetPreview = null,
  },
  ref,
) {
  const squareCell = sheetSquareGridPreset(squareGridId)
  const tipCellPx = Number(guideGridSize) > 0 ? Number(guideGridSize) : TEMPLATE_PIECE_CELL_PX
  const canvasRef = useRef(null)
  const imagesRef = useRef(new Map())
  // Board-composited tile art (panel pairs etc.) — same pixels as the main editor / palette thumb.
  const boardRendersRef = useRef(new Map())
  const [imageEpoch, setImageEpoch] = useState(0)
  const [hover, setHover] = useState(null)
  const [zoom, setZoom] = useState(1)
  const preset = sheetPreset(presetId)
  const origin = sheetIsoOrigin(preset)
  const grid = sheetGridSize(preset)

  function boardRenderOf(tileId) {
    if (!tileId) return null
    return boardRendersRef.current.get(tileId) ?? null
  }

  async function ensureBoardRender(tileId) {
    if (!tileId || boardRendersRef.current.has(tileId)) return boardRendersRef.current.get(tileId) ?? null
    const preview = boardTilePreview(tileId)
    if (!preview) return null
    const drawn = await drawLoneTiles(preview.layout, preview.positions, 1, null)
    const entry = { canvas: drawn.canvas, area: drawn.area }
    boardRendersRef.current.set(tileId, entry)
    return entry
  }

  useImperativeHandle(ref, () => ({
    async exportPngBase64() {
      const paths = [...new Set(stamps.map((stamp) => stamp.image).filter(Boolean))]
      for (const path of paths) {
        if (!imagesRef.current.has(path)) {
          imagesRef.current.set(path, await loadImage(spriteUrl(path, version)))
        }
      }
      const tileIds = [...new Set(stamps.map((stamp) => stamp.tileId).filter(Boolean))]
      await Promise.all(tileIds.map((id) => ensureBoardRender(id)))
      const canvas = document.createElement('canvas')
      canvas.width = preset.width
      canvas.height = preset.height
      const ctx = canvas.getContext('2d')
      paintSheet(ctx, { includeHover: false, includeGuides: false, selectedId: null })
      const dataUrl = canvas.toDataURL('image/png')
      return dataUrl.slice(dataUrl.indexOf(',') + 1)
    },
  }))

  useEffect(() => {
    let cancelled = false
    // Sprite cache bump: drop board composites so panel walls reload with new PNGs.
    if (boardRendersRef.current.version !== version) {
      boardRendersRef.current = new Map()
      boardRendersRef.current.version = version
    }
    const paths = new Set(stamps.map((stamp) => stamp.image).filter(Boolean))
    if (brush?.image) paths.add(String(brush.image).split('?')[0])
    const tileIds = new Set(stamps.map((stamp) => stamp.tileId).filter(Boolean))
    if (brush?.plant === 'center' && brush?.id) tileIds.add(brush.id)
    const missingPaths = [...paths].filter((path) => !imagesRef.current.has(path))
    const missingTiles = [...tileIds].filter((id) => !boardRendersRef.current.has(id))
    if (!missingPaths.length && !missingTiles.length) return undefined
    Promise.all([
      ...missingPaths.map((path) =>
        loadImage(spriteUrl(path, version))
          .then((image) => {
            if (!cancelled) imagesRef.current.set(path, image)
          })
          .catch(() => {
            if (!cancelled) onStatus?.(`Could not load ${path}`)
          }),
      ),
      ...missingTiles.map((id) =>
        ensureBoardRender(id).catch(() => {
          if (!cancelled) onStatus?.(`Could not render tile ${id}`)
        }),
      ),
    ]).then(() => {
      if (!cancelled) setImageEpoch((value) => value + 1)
    })
    return () => {
      cancelled = true
    }
  }, [stamps, brush?.image, brush?.id, brush?.plant, version, onStatus])

  function paintSheet(
    ctx,
    { includeHover = true, includeGuides = true, selectedId = selectedStampId } = {},
  ) {
    const w = preset.width
    const h = preset.height
    ctx.clearRect(0, 0, w, h)
    if (includeGuides && showIsoGrid) {
      fillIsoRect(ctx, origin.originX, origin.originY, TILE_W, TILE_H, 0, 0, w, h)
    } else {
      paintFlatFloor(ctx, w, h)
    }

    const ordered = [...stamps].sort((a, b) => a.x + a.y - (b.x + b.y))
    for (const stamp of ordered) {
      if (stamp.id === selectedId) {
        paintFootprintMark(ctx, origin.originX, origin.originY, stamp, stamp.footprint, {
          ok: true,
          plant: stamp.plant || 'center',
        })
      }
      const boardRender = stamp.plant !== 'tip' ? boardRenderOf(stamp.tileId) : null
      const image = imagesRef.current.get(stamp.image)
      const drawn = paintStampSprite(ctx, origin, stamp, image, { boardRender })
      if (showSelectionOutline && stamp.id === selectedId) {
        ctx.strokeStyle = 'rgba(255, 200, 80, 0.95)'
        ctx.lineWidth = 2
        ctx.strokeRect(drawn.drawX + 1, drawn.drawY + 1, drawn.size.width - 2, drawn.size.height - 2)
      }
    }

    if (includeGuides && showGuideGrid) {
      paintIsoGuideGrid(ctx, origin.originX, origin.originY, w, h, guideGridSize)
    }
    if (includeGuides && showSquareGrid) {
      paintSquareGrid(ctx, origin.originX, origin.originY, w, h, squareCell)
    }

    // Ghost: footprint + sprite, same as main editor Template Piece brush.
    if (includeHover && hover && brush?.image) {
      paintFootprintMark(ctx, origin.originX, origin.originY, hover, brush.footprint || { width: 1, depth: 1 }, {
        ok: true,
        plant: brush.plant || 'center',
      })
      const ghost = {
        ...brush,
        x: hover.x,
        y: hover.y,
        tileId: brush.plant === 'center' ? brush.id : brush.tileId,
      }
      const boardRender = ghost.plant !== 'tip' ? boardRenderOf(ghost.tileId || ghost.id) : null
      paintStampSprite(ctx, origin, ghost, imagesRef.current.get(brush.image), { alpha: 0.7, boardRender })
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = preset.width
    canvas.height = preset.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    paintSheet(ctx)
    void imageEpoch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stamps,
    hover,
    selectedStampId,
    zoom,
    preset,
    origin,
    brush,
    imageEpoch,
    showIsoGrid,
    showGuideGrid,
    guideGridSize,
    showSquareGrid,
    squareCell,
    showSelectionOutline,
  ])

  useEffect(() => {
    if (!onSheetPreview) return undefined
    if (!stamps.length) {
      onSheetPreview(null)
      return undefined
    }
    const thumb = document.createElement('canvas')
    const scale = Math.min(1, SHEET_PREVIEW_MAX / preset.width, SHEET_PREVIEW_MAX / preset.height)
    thumb.width = Math.max(1, Math.round(preset.width * scale))
    thumb.height = Math.max(1, Math.round(preset.height * scale))
    const tctx = thumb.getContext('2d')
    if (!tctx) {
      onSheetPreview(null)
      return undefined
    }
    tctx.setTransform(scale, 0, 0, scale, 0, 0)
    tctx.imageSmoothingEnabled = scale < 1
    paintSheet(tctx, { includeHover: false, includeGuides: true, selectedId: null })
    onSheetPreview(thumb.toDataURL('image/png'))
    void imageEpoch
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stamps,
    preset,
    origin,
    imageEpoch,
    showIsoGrid,
    showGuideGrid,
    guideGridSize,
    showSquareGrid,
    squareCell,
    onSheetPreview,
  ])

  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, select')) return
      if ((event.key === 'r' || event.key === 'R') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        if (selectedStampId) {
          const selected = stamps.find((stamp) => stamp.id === selectedStampId)
          if (selected?.pieceId && onStampRotate) {
            onStampRotate(selectedStampId)
            return
          }
        }
        if (brush?.pieceId && onBrushRotate) onBrushRotate()
        return
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (!selectedStampId) return
      event.preventDefault()
      onStampsChange?.(stamps.filter((stamp) => stamp.id !== selectedStampId))
      onSelectStamp?.(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedStampId, stamps, brush, onStampsChange, onSelectStamp, onBrushRotate, onStampRotate])

  function eventToWorld(event) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const sx = (event.clientX - rect.left) * scaleX - origin.originX
    const sy = (event.clientY - rect.top) * scaleY - origin.originY
    return unproject({ x: sx, y: sy })
  }

  function eventToSheet(event) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (event.clientX - rect.left) * scaleX - origin.originX,
      y: (event.clientY - rect.top) * scaleY - origin.originY,
    }
  }

  // Tip snap = main editor guide size. Center tiles = Math.round like EditorBoard. Display (square) grid is visual only.
  function eventToPlace(event) {
    const world = eventToWorld(event)
    if (!world) return null
    if (brush?.plant === 'tip') return snapTemplatePiecePosition(world, tipCellPx)
    return { x: Math.round(world.x), y: Math.round(world.y) }
  }

  // Prefer sprite pixels under the pointer (like main editor prop pick); tip footprint is fallback.
  function stampAtPointer(event) {
    const sheet = eventToSheet(event)
    if (sheet) {
      for (let i = stamps.length - 1; i >= 0; i -= 1) {
        const stamp = stamps[i]
        const boardRender = stamp.plant !== 'tip' ? boardRenderOf(stamp.tileId) : null
        const box = stampDrawBox(stamp, boardRender)
        if (
          sheet.x >= box.x &&
          sheet.x < box.x + box.width &&
          sheet.y >= box.y &&
          sheet.y < box.y + box.height
        ) {
          return stamp
        }
      }
    }
    const world = eventToWorld(event)
    if (!world) return null
    const tip = snapTemplatePiecePosition(world, tipCellPx)
    for (let i = stamps.length - 1; i >= 0; i -= 1) {
      const stamp = stamps[i]
      if (stamp.plant === 'tip' && stamp.x === tip.x && stamp.y === tip.y) return stamp
    }
    return null
  }

  const onPointerDown = (event) => {
    const place = eventToPlace(event)
    if (!place) return
    if (event.button === 2) {
      event.preventDefault()
      const hit = stampAtPointer(event)
      if (hit) {
        onStampsChange?.(stamps.filter((stamp) => stamp.id !== hit.id))
        onSelectStamp?.(null)
        onStatus?.(`Removed ${hit.label || hit.tileId || hit.id}.`)
      }
      return
    }
    if (event.button !== 0) return
    const hit = stampAtPointer(event)
    if (!brush?.image) {
      onSelectStamp?.(hit?.id ?? null)
      if (!hit) onStatus?.('Select a tile or Template Piece in the palette, then click the iso sheet to place it.')
      return
    }
    const imagePath = String(brush.image).split('?')[0]
    const next = {
      id: nextStampId(),
      tileId: brush.id,
      pieceId: brush.pieceId || null,
      label: brush.label,
      image: imagePath,
      x: place.x,
      y: place.y,
      footprint: brush.footprint || { width: 1, depth: 1 },
      size: brush.size,
      plant: brush.plant || 'center',
      rotation: brush.rotation || 0,
      ...(brush.plant === 'tip' && Number.isFinite(brush.anchorX) ? { anchorX: brush.anchorX } : {}),
    }
    // Same tip replaces (main editor Template Piece behaviour).
    const withoutTip =
      next.plant === 'tip'
        ? stamps.filter((stamp) => !(stamp.plant === 'tip' && stamp.x === next.x && stamp.y === next.y))
        : stamps
    onStampsChange?.([...withoutTip, next])
    onSelectStamp?.(next.id)
    onStatus?.(`Placed ${brush.label} at (${place.x}, ${place.y})${brush.rotation ? ` · ${brush.rotation}°` : ''}.`)
  }

  return (
    <div className="ss-composer">
      <div className="ss-composer-meta me-text">
        Sheet {preset.width}×{preset.height}px
        {showIsoGrid ? ` · floor ${TILE_W}×${TILE_H}` : ' · iso placement'}
        {showGuideGrid ? ` · guide ${guideGridSize}px` : ''}
        {showSquareGrid ? ` · display ${squareCell.label}` : ''}
        {stamps.length ? ` · ${stamps.length} stamp${stamps.length === 1 ? '' : 's'}` : ' · empty'}
        {brush ? ` · placing ${brush.label}${brush.plant === 'tip' ? ` · R ${brush.rotation || 0}°` : ''}` : ''}
        <span className="ss-composer-hint"> · ~{grid.cols}×{grid.rows} screen cells</span>
      </div>
      <div className="ss-composer-zoom">
        <button
          type="button"
          className="me-button"
          disabled={zoom <= 0.25}
          onClick={() => setZoom((value) => Math.max(0.25, value / 1.25))}
        >
          −
        </button>
        <span className="me-text">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="me-button"
          disabled={zoom >= 4}
          onClick={() => setZoom((value) => Math.min(4, value * 1.25))}
        >
          +
        </button>
      </div>
      <div className="ss-composer-scroll">
        <canvas
          ref={canvasRef}
          className="ss-composer-canvas"
          style={{ width: preset.width * zoom, height: preset.height * zoom }}
          onPointerMove={(event) => setHover(eventToPlace(event))}
          onPointerLeave={() => setHover(null)}
          onPointerDown={onPointerDown}
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>
    </div>
  )
})

export default SpriteSheetComposer
