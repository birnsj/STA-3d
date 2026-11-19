import { useEffect, useMemo, useRef, useState } from 'react'
import AssetProperties from '../components/maps/AssetProperties.jsx'
import { DEFAULT_EDITOR_GRID_SIZE, EDITOR_GRID_SIZES } from '../components/maps/editorGrid.js'
import EditorPalette from '../components/maps/EditorPalette.jsx'
import EditorSelect from '../components/maps/EditorSelect.jsx'
import EditorSubScreen from '../components/maps/EditorSubScreen.jsx'
import { SUB_EDITOR_BACK_LABEL, subEditorFileMenus } from '../components/maps/editorSubMenus.js'
import { hasAssetSelection, parseTool } from '../components/maps/editorSelection.js'
import OpenArtGenerationPanel from '../components/maps/OpenArtGenerationPanel.jsx'
import { PropertySectionsProvider, PropertySectionsToolbar } from '../components/maps/PropertySections.jsx'
import SpriteSheetComposer from '../components/maps/SpriteSheetComposer.jsx'
import useDialogs from '../components/maps/useDialogs.jsx'
import { getTile, imageSize } from '../maps/mapFormat.js'
import { bumpSpriteCache, spriteCacheVersion } from '../maps/spriteFiles.js'
import {
  DEFAULT_SHEET_PACK_GAP,
  DEFAULT_SHEET_PRESET,
  DEFAULT_SHEET_SQUARE_GRID,
  SHEET_PACK_GAP_PRESETS,
  SHEET_PRESETS,
  SHEET_SQUARE_GRID_PRESETS,
  footprintTilesFromDesign,
  packSheetStamps,
  sheetPackGapPreset,
  sheetPreset,
} from '../maps/spriteSheetLayout.js'
import {
  getTemplatePiece,
  templatePieceArt,
  templatePieceFootprint,
} from '../maps/templatePieces.js'
import '../components/maps/spriteSheets.css'

// Character layer sprites are omitted here — same Assets palette + tiles.json as the main map editor.
const OMIT_LAYERS = ['characters']

function cleanPath(path) {
  return String(path || '').split('?')[0]
}

function tipBrushFromPiece(piece, id, label, rotation) {
  const art = templatePieceArt(piece, rotation)
  if (!art?.href || !art.size) return null
  return {
    id,
    pieceId: piece.id,
    label,
    image: cleanPath(art.href),
    size: { width: art.size.width, height: art.size.height },
    anchorX: art.anchorX,
    plant: 'tip',
    rotation: ((rotation % 360) + 360) % 360,
    footprint: footprintTilesFromDesign(templatePieceFootprint(piece, rotation)),
  }
}

function brushFromAsset(asset, rotation = 0) {
  if (!asset) return null
  if (asset.kind === 'template') {
    const piece = getTemplatePiece(asset.id)
    if (!piece) return null
    return tipBrushFromPiece(piece, piece.id, piece.label || piece.id, rotation)
  }
  if (asset.kind !== 'tile') return null
  const tile = getTile(asset.id)
  if (!tile?.image) return null
  // Same as the main editor tile brush / palette thumb: catalogue size, centre plant.
  // Panel walls draw as a 2-cell pair (TileThumbnail) — footprint and size match that composite.
  const size = imageSize(tile)
  return {
    id: tile.id,
    pieceId: null,
    label: tile.label || tile.id,
    image: cleanPath(tile.image),
    size: tile.panels ? { width: size.width + 32, height: size.height + 16 } : size,
    plant: 'center',
    rotation: 0,
    footprint: tile.big ? { width: 2, depth: 2 } : tile.panels ? { width: 2, depth: 1 } : { width: 1, depth: 1 },
  }
}

function rotateStampRecord(stamp, nextRotation) {
  if (!stamp?.pieceId) return stamp
  const piece = getTemplatePiece(stamp.pieceId)
  if (!piece) return stamp
  const art = templatePieceArt(piece, nextRotation)
  if (!art?.href || !art.size) return stamp
  return {
    ...stamp,
    rotation: ((nextRotation % 360) + 360) % 360,
    image: cleanPath(art.href),
    size: { width: art.size.width, height: art.size.height },
    anchorX: art.anchorX,
    footprint: footprintTilesFromDesign(templatePieceFootprint(piece, nextRotation)),
  }
}

export default function SpriteSheetsScreen({ onBack, backLabel = SUB_EDITOR_BACK_LABEL }) {
  const { askConfirm, dialogs } = useDialogs()
  const [tool, setTool] = useState(null)
  const [brushRotation, setBrushRotation] = useState(0)
  const [status, setStatus] = useState('')
  const [version, setVersion] = useState(spriteCacheVersion)
  const [presetId, setPresetId] = useState(DEFAULT_SHEET_PRESET)
  const [stamps, setStamps] = useState([])
  const [selectedStampId, setSelectedStampId] = useState(null)
  const [showIsoGrid, setShowIsoGrid] = useState(true)
  const [showGuideGrid, setShowGuideGrid] = useState(true)
  const [guideGridSize, setGuideGridSize] = useState(DEFAULT_EDITOR_GRID_SIZE)
  const [showSquareGrid, setShowSquareGrid] = useState(true)
  const [squareGridId, setSquareGridId] = useState(DEFAULT_SHEET_SQUARE_GRID)
  const [showSelectionOutline, setShowSelectionOutline] = useState(true)
  const [packGapId, setPackGapId] = useState(DEFAULT_SHEET_PACK_GAP)
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState(null)
  const composerRef = useRef(null)
  const packGap = sheetPackGapPreset(packGapId)

  const asset = useMemo(() => parseTool(tool), [tool])
  useEffect(() => {
    setBrushRotation(0)
  }, [tool])
  const brush = useMemo(() => brushFromAsset(asset, brushRotation), [asset, brushRotation])
  const preset = sheetPreset(presetId)

  const openArtDisabledReason = !stamps.length
    ? 'Place at least one palette tile on the sheet before generating.'
    : null

  const clearSheet = () => {
    setStamps([])
    setSelectedStampId(null)
    setSheetPreviewUrl(null)
  }

  const onAutopack = () => {
    if (!stamps.length) return
    const result = packSheetStamps(stamps, presetId, { gap: packGap.gap })
    setStamps(result.stamps)
    if (result.unfit) {
      setStatus(
        `Autopack (${packGap.label} gap): ${result.packed} packed, ${result.unfit} could not fit — try 2K, a smaller gap, or remove some stamps.`,
      )
    } else {
      setStatus(
        `Autopack (${packGap.label} gap): packed ${result.packed} stamp${result.packed === 1 ? '' : 's'} on the iso grid.`,
      )
    }
  }

  const onPresetChange = async (nextId) => {
    if (nextId === presetId) return
    if (stamps.length) {
      const ok = await askConfirm({
        title: 'Clear Sheet',
        message: 'Switching 1K/2K clears the current sheet arrangement. Continue?',
        confirmLabel: 'Clear & Switch',
      })
      if (!ok) return
    }
    clearSheet()
    setPresetId(nextId)
  }

  return (
    <EditorSubScreen
      className="ss-screen"
      title="Sprite Sheets"
      menus={subEditorFileMenus({ load: false, save: false, backLabel })}
      onMenuAction={(id) => {
        if (id === 'back') onBack?.()
      }}
      toolbar={
        <>
          <button type="button" className="me-button" title={backLabel} onClick={() => onBack?.()}>
            {backLabel}
          </button>
          <div className="ed-seg" role="group" aria-label="Sheet size">
            {Object.values(SHEET_PRESETS).map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`me-button${presetId === entry.id ? ' is-on' : ''}`}
                aria-pressed={presetId === entry.id}
                title={`${entry.label} · ${entry.width}×${entry.height}`}
                onClick={() => onPresetChange(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="ed-seg" role="group" aria-label="Guides">
            <button
              type="button"
              className={`me-button${showIsoGrid ? ' is-on' : ''}`}
              aria-pressed={showIsoGrid}
              title="Show the isometric floor diamonds"
              onClick={() => setShowIsoGrid((value) => !value)}
            >
              Iso
            </button>
            <button
              type="button"
              className={`me-button${showGuideGrid ? ' is-on' : ''}`}
              aria-pressed={showGuideGrid}
              title="Show the iso guide grid (same as the main map editor)"
              onClick={() => setShowGuideGrid((value) => !value)}
            >
              Guide
            </button>
            <EditorSelect
              className="me-select ed-grid-select"
              value={guideGridSize}
              disabled={!showGuideGrid}
              aria-label="Guide grid size"
              title="Iso guide spacing in world pixels (tip placement snaps to this)"
              onChange={(event) => setGuideGridSize(Number(event.target.value))}
            >
              {EDITOR_GRID_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </EditorSelect>
            <button
              type="button"
              className={`me-button${showSquareGrid ? ' is-on' : ''}`}
              aria-pressed={showSquareGrid}
              title="Show the axis-aligned display grid (visual only)"
              onClick={() => setShowSquareGrid((value) => !value)}
            >
              Display grid
            </button>
            <EditorSelect
              className="me-select ed-grid-select"
              value={squareGridId}
              disabled={!showSquareGrid}
              aria-label="Display grid size"
              title="Axis-aligned display grid — visual only"
              onChange={(event) => setSquareGridId(event.target.value)}
            >
              {SHEET_SQUARE_GRID_PRESETS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </EditorSelect>
            <button
              type="button"
              className={`me-button${showSelectionOutline ? ' is-on' : ''}`}
              aria-pressed={showSelectionOutline}
              title="Show the yellow selection box on the selected stamp"
              onClick={() => setShowSelectionOutline((value) => !value)}
            >
              Selection
            </button>
          </div>
          <div className="ed-seg" role="group" aria-label="Sheet arrange">
            <button
              type="button"
              className="me-button"
              disabled={!stamps.length}
              title={`Pack stamps onto free iso cells (${packGap.label} between sprites and the sheet edge)`}
              onClick={onAutopack}
            >
              Autopack
            </button>
            <EditorSelect
              className="me-select ed-grid-select"
              value={packGapId}
              aria-label="Autopack gap"
              title="Pixel gap Autopack keeps between stamp images and the sheet edge"
              onChange={(event) => setPackGapId(event.target.value)}
            >
              {SHEET_PACK_GAP_PRESETS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  Gap {entry.label}
                </option>
              ))}
            </EditorSelect>
            <button
              type="button"
              className="me-button"
              disabled={!stamps.length}
              title="Remove every stamp from the sheet"
              onClick={clearSheet}
            >
              Clear
            </button>
          </div>
          <div className="ed-toolbar-end">
            <span className="me-text">
              {preset.width}×{preset.height}
              {stamps.length ? ` · ${stamps.length} stamp${stamps.length === 1 ? '' : 's'}` : ''}
            </span>
            {status ? <span className="me-text ss-status">{status}</span> : null}
          </div>
        </>
      }
    >
      <div className="ss-body">
        <aside className="ss-palette-pane">
          <EditorPalette tool={tool} onTool={setTool} onStatus={setStatus} omitLayers={OMIT_LAYERS} />
        </aside>

        <section className="ss-detail">
          <div className="ss-detail-head">
            <div>
              <p className="ss-detail-name">Generation sheet</p>
              <p className="me-text">
                Palette tile / Template Piece → click to place · R rotates · right-click / Delete to remove
              </p>
            </div>
          </div>
          <SpriteSheetComposer
            ref={composerRef}
            presetId={presetId}
            stamps={stamps}
            onStampsChange={setStamps}
            selectedStampId={selectedStampId}
            onSelectStamp={setSelectedStampId}
            brush={brush}
            onBrushRotate={() => {
              setBrushRotation((value) => (value + 90) % 360)
              setStatus('Brush rotated +90°.')
            }}
            onStampRotate={(stampId) => {
              setStamps((list) =>
                list.map((stamp) => {
                  if (stamp.id !== stampId || !stamp.pieceId) return stamp
                  const next = rotateStampRecord(stamp, (stamp.rotation || 0) + 90)
                  setStatus(`Rotated ${next.label || next.id} to ${next.rotation}°.`)
                  return next
                }),
              )
            }}
            version={version}
            onStatus={setStatus}
            showIsoGrid={showIsoGrid}
            showGuideGrid={showGuideGrid}
            guideGridSize={guideGridSize}
            showSquareGrid={showSquareGrid}
            squareGridId={squareGridId}
            showSelectionOutline={showSelectionOutline}
            onSheetPreview={setSheetPreviewUrl}
          />
        </section>

        <aside className="ss-ai-pane" aria-label="Properties">
          <div className="ss-ai-pane-head">Properties</div>
          <PropertySectionsProvider key={tool ? `asset:${tool}` : `sheet:${presetId}`}>
            <PropertySectionsToolbar />
            <div className="ss-ai-pane-body">
              {hasAssetSelection(tool) ? (
                <AssetProperties tool={tool} onStatus={setStatus} onTool={setTool} />
              ) : null}
              <OpenArtGenerationPanel
                key={`sheet-${presetId}`}
                templatePath={null}
                templateLabel={`Sprite sheet ${preset.label} (${preset.width}×${preset.height})`}
                sourceTile={null}
                referencePreviewUrl={sheetPreviewUrl}
                getReferencePng={async () => {
                  if (!composerRef.current?.exportPngBase64) {
                    throw new Error('Sheet composer is not ready')
                  }
                  return composerRef.current.exportPngBase64()
                }}
                disabledReason={openArtDisabledReason}
                onStatus={setStatus}
                onImported={async (result) => {
                  setVersion(result.cacheVersion ?? bumpSpriteCache())
                  setStatus(`Imported sheet ${result.path}`)
                }}
              />
            </div>
          </PropertySectionsProvider>
        </aside>
      </div>
      {dialogs}
    </EditorSubScreen>
  )
}
