import { useMemo, useState } from 'react'
import { autoPaintRoleThumbTitle } from '../components/maps/assetThumbTitle.js'
import EditorBoard from '../components/maps/EditorBoard.jsx'
import { DEFAULT_EDITOR_GRID_SIZE, EDITOR_GRID_SIZES } from '../components/maps/editorGrid.js'
import EditorGridOptions from '../components/maps/EditorGridOptions.jsx'
import EditorSelect from '../components/maps/EditorSelect.jsx'
import EditorSubScreen from '../components/maps/EditorSubScreen.jsx'
import { subEditorFileMenus } from '../components/maps/editorSubMenus.js'
import AssetProperties from '../components/maps/AssetProperties.jsx'
import GeSourcePalette from '../components/maps/GeSourcePalette.jsx'
import {
  PropertySection,
  PropertySectionsProvider,
  PropertySectionsToolbar,
} from '../components/maps/PropertySections.jsx'
import TileSpritePicker from '../components/maps/TileSpritePicker.jsx'
import WorldGenerationAdjacencyEditor from '../components/maps/WorldGenerationAdjacencyEditor.jsx'
import WorldGenerationFlowchart from '../components/maps/WorldGenerationFlowchart.jsx'
import WorldGenerationHelpDialog from '../components/maps/WorldGenerationHelpDialog.jsx'
import WorldGenerationMapPanel from '../components/maps/WorldGenerationMapPanel.jsx'
import {
  AUTO_PAINT_ENVIRONMENTS,
  getAutoPaintRuleset,
  listAutoPaintRulesets,
  mapTypeForEnvironment,
  resolveAutoPaintRuleset,
  weightedIds,
} from '../maps/autoPaint/rulesets.js'
import { pieceIdForAutoPaintTile, resolveAutoPaintTileId } from '../maps/autoPaint/templatePalette.js'
import { normalizeWeightedEntries } from '../maps/autoPaint/weightedChoice.js'
import { getTemplatePiece } from '../maps/templatePieces.js'
import {
  canEditAutoPaintRulesets,
  putAutoPaintRulesetLocal,
  reloadAutoPaintRulesetsFromDisk,
  saveAutoPaintRuleset,
} from '../maps/autoPaintFiles.js'
import { layerOfTile } from '../maps/layers.js'
import { getTile, PALETTE_GROUPS, TILES, tileCatalogueEpochOf } from '../maps/mapFormat.js'
import {
  editorTemplatePaletteItems,
  templatePieceCatalogueEpochOf,
} from '../maps/templatePieces.js'
import { WORLD_GENERATION_HELP_TOPICS } from '../data/adaptation/maps/worldGenerationWorkflow.js'

// Tools → World Generation Ruleset. Palette = Dev Edit Assets (Template Pieces + every tileset). Wall roles place tiles.
// Help + flowchart copy/settings: edit worldGenerationWorkflow.js (not Legacy).

/** Palette item → AssetProperties tool string (same as Dev Edit Assets). */
function toolFromPaletteItem(item) {
  if (!item) return null
  if (item.kind === 'tile') return `tile:${item.id}`
  if (item.kind === 'piece') return `template:${item.id}`
  if (item.kind === 'destructible') return `destructible:${item.id}`
  if (item.kind === 'hazard') return `hazard:${item.id}`
  if (item.kind === 'inventory') return `inventory:${item.id}`
  return null
}

/** tool string → GeSourcePalette selectedKey (`tile:id` / `piece:id` / …). */
function selectedKeyFromTool(tool) {
  if (!tool) return null
  if (tool.startsWith('tile:')) return tool
  if (tool.startsWith('template:')) return `piece:${tool.slice('template:'.length)}`
  if (tool.startsWith('destructible:')) return tool
  if (tool.startsWith('hazard:')) return tool
  if (tool.startsWith('inventory:')) return tool
  return null
}

const FLOOR_FIELD = {
  key: 'defaultTile',
  label: 'Default floor tile',
  tip: 'Floor pieces that define walkable cells. Several allowed with mix %. Drag from the Palette.',
  filter: (tile) => !tile.wall && !tile.solid && !tile.empty,
}

const UNDER_WALL_FLOOR_FIELD = {
  key: 'underWall',
  label: 'Under-wall floor (32×32)',
  tip: 'Floor 32 tip fill on underlay tip slots with no ground diamond (e.g. exterior east/south wall halves past floorUnder). Empty = no tip fill.',
  filter: (tile) => !tile.wall && !tile.solid && !tile.empty,
}

const WALL_FIELD = {
  filter: (tile) => Boolean(tile.wall),
}

const DOOR_TILE_FIELD = {
  key: 'underlayTile',
  label: 'Doorway tile',
  tip: 'Art lining openings (often Doorway 32). Several allowed with mix %.',
  filter: (tile) => !tile.empty,
}

const WALL_TILE_FIELDS = [
  {
    key: 'straight',
    label: 'Straight (64-long)',
    required: true,
    tip: 'Required short straight runs (usually 64 tip). Used when a stretch is not long enough for Long.',
  },
  {
    key: 'straightLong',
    label: 'Straight long (128)',
    required: false,
    tip: 'Optional long straight runs (usually 128 tip). Empty = packing uses Straight only.',
  },
  {
    key: 'corner',
    label: 'Corner (32×32)',
    required: true,
    tip: 'Required 32×32 posts: end caps, junction corners, and stubs.',
  },
  {
    key: 'hull',
    label: 'Hull straight (optional)',
    required: false,
    tip: 'Optional outer-hull straight. Empty = rim uses Straight / Corner.',
  },
  {
    key: 'hullLong',
    label: 'Hull long (optional)',
    required: false,
    tip: 'Optional long outer-hull straight.',
  },
  {
    key: 'hullCorner',
    label: 'Hull corner (optional)',
    required: false,
    tip: 'Optional outer-hull corner post.',
  },
  {
    key: 'doorFrame',
    label: 'Door frame (optional)',
    required: false,
    tip: 'Optional frame around openings. Empty = openings stay underlay / doorway lining only.',
  },
]

/** Same tile list as Dev Edit Assets (all palette groups + Other). Null/empty authoring cells stay out. */
function allEditorPaletteTiles() {
  const grouped = new Set(PALETTE_GROUPS.flatMap((group) => group.tiles))
  const byId = new Map()
  for (const group of PALETTE_GROUPS) {
    for (const id of group.tiles ?? []) {
      const tile = getTile(id)
      if (tile && !tile.empty) byId.set(tile.id, tile)
    }
  }
  for (const tile of TILES) {
    if (grouped.has(tile.id) || tile.role === 'destructible' || tile.empty) continue
    byId.set(tile.id, tile)
  }
  return [...byId.values()]
}

/**
 * GeSourcePalette items for every Dev Edit tileset, with the same category → tileset
 * labels as Assets → Tiles (PALETTE_GROUPS.section / .label).
 */
function editorPaletteTileItems() {
  const out = []
  const seen = new Set()
  for (const group of PALETTE_GROUPS) {
    for (const id of group.tiles ?? []) {
      const tile = getTile(id)
      if (!tile || tile.empty || seen.has(tile.id)) continue
      seen.add(tile.id)
      out.push({
        kind: 'tile',
        id: tile.id,
        label: tile.label,
        layer: layerOfTile(tile),
        groupId: group.id,
        groupLabel: group.label,
        section: group.section || null,
      })
    }
  }
  for (const tile of TILES) {
    if (seen.has(tile.id) || tile.role === 'destructible' || tile.empty) continue
    seen.add(tile.id)
    out.push({
      kind: 'tile',
      id: tile.id,
      label: tile.label,
      layer: layerOfTile(tile),
      groupId: 'other',
      groupLabel: 'Other',
      section: null,
    })
  }
  return out
}

function cloneRuleset(ruleset) {
  return resolveAutoPaintRuleset(structuredClone(ruleset))
}

function rulesetEqual(a, b) {
  return JSON.stringify(resolveAutoPaintRuleset(a)) === JSON.stringify(resolveAutoPaintRuleset(b))
}

function withSelectedTiles(options, value) {
  const list = [...options]
  const ids = new Set(list.map((tile) => tile.id))
  const add = (id) => {
    if (!id || ids.has(id)) return
    // Keep Template Piece ids as display rows when the catalogue has no tile counterpart yet.
    if (getTemplatePiece(id)) {
      ids.add(id)
      list.push({ id, label: getTemplatePiece(id).label, __piece: getTemplatePiece(id) })
      return
    }
    const resolved = resolveAutoPaintTileId(id) || id
    const tile = getTile(resolved)
    if (!tile) return
    ids.add(tile.id)
    list.push(tile)
  }
  for (const id of weightedIds(value)) add(id)
  return list.sort((a, b) => a.label.localeCompare(b.label))
}

function mapWeightedRoleIds(entries) {
  return normalizeWeightedEntries(entries, { allowEmpty: true }).map((entry) => {
    if (getTemplatePiece(entry.id)) return entry
    return { id: resolveAutoPaintTileId(entry.id) || entry.id, weight: entry.weight }
  })
}

export default function AutoPaintRulesetEditorScreen({
  map = null,
  boardKey = 0,
  showGrid = true,
  onShowGrid,
  gridSize = DEFAULT_EDITOR_GRID_SIZE,
  onGridSize,
  showBounds = true,
  onShowBounds,
  showCentre = false,
  onShowCentre,
  enemiesActive = true,
  onEnemiesActive,
  askConfirm = null,
  showWeather = true,
  onShowWeather,
  edit,
  onMapType,
  onBiome,
  onWeather,
  onAmbient,
  onAmbientColour,
  onSize,
  roomScale = 100,
  onRoomScale,
  buildingScale = 100,
  onBuildingScale,
  roomsInBuilding = 100,
  onRoomsInBuilding,
  doorsInBuilding = 100,
  onDoorsInBuilding,
  cardTools = { canGenerate: false, busy: false, onGenerate: () => {} },
  onBack,
  onPlay,
  onGenerateMap,
  onStatus,
  showTooltips: showTooltipsProp = true,
  onShowTooltips = null,
}) {
  const [epoch, setEpoch] = useState(0)
  const [helpTopicId, setHelpTopicId] = useState(null)
  const [flowNodeId, setFlowNodeId] = useState('floors')
  const rulesets = listAutoPaintRulesets()
  void epoch
  const [selectedId, setSelectedId] = useState(rulesets[0]?.id ?? 'template-32')
  const initial = cloneRuleset(getAutoPaintRuleset(selectedId) ?? rulesets[0])
  const [draft, setDraft] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  // Default on: full Dev Edit Assets catalogue (Template Pieces + every tileset).
  const [showAll, setShowAll] = useState(true)
  // Selected palette thumb → left rail (above Palette) shows AssetProperties.
  const [paletteTool, setPaletteTool] = useState(null)
  // 'rules' | 'map' — center pane; left palette stays.
  const [viewMode, setViewMode] = useState('rules')
  const [showGridOptions, setShowGridOptions] = useState(false)
  const [localTooltips, setLocalTooltips] = useState(true)
  const showTooltips = typeof onShowTooltips === 'function' ? showTooltipsProp : localTooltips
  const setShowTooltips = typeof onShowTooltips === 'function' ? onShowTooltips : setLocalTooltips

  const dirty = !rulesetEqual(draft, saved)
  const canSave = canEditAutoPaintRulesets
  const showingMap = viewMode === 'map' && map

  const confirmDiscard = async (message) => {
    if (!dirty) return true
    if (typeof askConfirm === 'function') {
      return askConfirm({
        title: 'Unsaved Changes',
        message,
        confirmLabel: 'Discard',
      })
    }
    return window.confirm(message)
  }

  const openRuleset = async (id) => {
    if (dirty && id !== selectedId) {
      const leave = await confirmDiscard('Discard unsaved World Generation Ruleset changes?')
      if (!leave) return
    }
    const next = cloneRuleset(getAutoPaintRuleset(id) ?? rulesets[0])
    setSelectedId(id)
    setDraft(next)
    setSaved(next)
    setStatus('')
  }

  const patch = (partial) => setDraft((current) => resolveAutoPaintRuleset({ ...current, ...partial }))
  const patchWalls = (partial) =>
    setDraft((current) => resolveAutoPaintRuleset({ ...current, walls: { ...current.walls, ...partial } }))
  const patchFloors = (partial) =>
    setDraft((current) => resolveAutoPaintRuleset({ ...current, floors: { ...current.floors, ...partial } }))
  const patchDoors = (partial) =>
    setDraft((current) => resolveAutoPaintRuleset({ ...current, doors: { ...current.doors, ...partial } }))
  const patchPipeline = (partial) =>
    setDraft((current) =>
      resolveAutoPaintRuleset({ ...current, pipeline: { ...current.pipeline, ...partial } }),
    )
  const patchAdjacency = (adjacency) =>
    setDraft((current) => resolveAutoPaintRuleset({ ...current, adjacency }))

  const revert = () => {
    setDraft(cloneRuleset(saved))
    setStatus('Reverted unsaved changes.')
  }

  const discardAndBack = async () => {
    const leave = await confirmDiscard('Discard unsaved World Generation Ruleset changes?')
    if (!leave) return
    onBack?.()
  }

  const onSave = async () => {
    if (!canSave) {
      const message = 'World Generation Rulesets save only in the Vite / Electron dev app.'
      setStatus(message)
      onStatus?.(message)
      return
    }
    setBusy(true)
    try {
      const result = await saveAutoPaintRuleset(draft)
      const next = cloneRuleset(result)
      setEpoch((value) => value + 1)
      setSelectedId(next.id)
      setDraft(next)
      setSaved(next)
      const message = `Saved World Generation Ruleset “${next.label}”.`
      setStatus(message)
      onStatus?.(message)
    } catch (error) {
      const message = String(error.message ?? error)
      setStatus(message)
      onStatus?.(message)
    } finally {
      setBusy(false)
    }
  }

  // Apply the on-screen draft in memory, generate into the open map, and switch to Map view.
  const generateMap = async () => {
    if (typeof onGenerateMap !== 'function') return
    if (dirty) {
      try {
        putAutoPaintRulesetLocal(draft)
        setSaved(cloneRuleset(draft))
      } catch (error) {
        const message = String(error.message ?? error)
        setStatus(message)
        onStatus?.(message)
        return
      }
    }
    setBusy(true)
    try {
      const ok = await onGenerateMap(selectedId)
      if (!ok) return
      setViewMode('map')
      const label = draft.label || selectedId
      const message = `Generate Map (${label}). Still in World Generation Ruleset — Back to Map when done.`
      setStatus(message)
      onStatus?.(message)
    } finally {
      setBusy(false)
    }
  }

  // Same live catalogues as Dev Edit Assets (templatePieces.json + tile palette groups).
  const catalogueEpoch = templatePieceCatalogueEpochOf() + tileCatalogueEpochOf()
  // The catalogues are module state that changes outside React; catalogueEpoch is the signal to rebuild.
  const templateItems = useMemo(() => {
    void catalogueEpoch
    return editorTemplatePaletteItems({ includeDimension: showAll })
  }, [showAll, catalogueEpoch])

  // Role options: tiles Template Pieces resolve to, plus (Show all) every Dev Edit tileset.
  const roleTiles = useMemo(() => {
    void catalogueEpoch
    const byId = new Map()
    for (const item of templateItems) {
      const tileId = resolveAutoPaintTileId(item.id)
      const tile = tileId ? getTile(tileId) : null
      if (tile) byId.set(tile.id, tile)
    }
    // Always allow the Template 32 placement tiles and doorway/floor.
    for (const id of ['wall32', 'wall32Corner', 'floor', 'doorway', 'grating']) {
      const tile = getTile(id)
      if (tile) byId.set(tile.id, tile)
    }
    if (showAll) {
      for (const tile of allEditorPaletteTiles()) byId.set(tile.id, tile)
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [templateItems, showAll, catalogueEpoch])

  const emptyHint = showAll
    ? 'No matching assets.'
    : 'Drop a Template Piece from the palette (same catalogue as Dev Edit Palette).'

  const tileOptions = (field, value) => withSelectedTiles(roleTiles.filter(field.filter), value)

  const paletteItems = useMemo(() => {
    void catalogueEpoch
    if (!showAll) return templateItems
    // Show all: Template Pieces + every Dev Edit Assets tileset (Starship, Other, …).
    const tiles = editorPaletteTileItems()
    const seen = new Set(templateItems.map((item) => `${item.kind}:${item.id}`))
    const out = [...templateItems]
    for (const item of tiles) {
      const key = `${item.kind}:${item.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
    return out
  }, [templateItems, showAll, catalogueEpoch])

  // Keep Template Piece ids so Generate Map uses the exact piece from the slot (not a collapsed wall32).
  const resolveDropToRole = (asset) => {
    if (!asset) return null
    if (asset.kind === 'piece' && getTemplatePiece(asset.id)) return asset.id
    if (asset.kind === 'tile' || asset.kind === 'piece') return resolveAutoPaintTileId(asset.id)
    return null
  }

  const onWeightedRoleChange = (patchFn, { allowEmpty = false } = {}) => (entries) => {
    const next = mapWeightedRoleIds(entries)
    if (!next.length) {
      patchFn(allowEmpty ? null : next)
      return
    }
    patchFn(next)
  }

  const roleIdAllowed = (id) => Boolean(getTile(id) || getTemplatePiece(id) || resolveAutoPaintTileId(id))

  // Prefer Template Piece footprint (corner 32×32) over tile sprite size (often 64×128).
  const roleThumbTitle = (tile) => {
    const piece = tile?.__piece || getTemplatePiece(tile?.id) || getTemplatePiece(pieceIdForAutoPaintTile(tile?.id))
    const displayTile = tile?.__piece ? null : tile
    return autoPaintRoleThumbTitle(displayTile || getTile(resolveAutoPaintTileId(tile?.id)), piece, {
      extra: 'right-click to remove',
    })
  }

  const loadFromDisk = async () => {
    const leave = await confirmDiscard(
      'Discard unsaved World Generation Ruleset changes and reload from disk?',
    )
    if (!leave) return
    setBusy(true)
    try {
      await reloadAutoPaintRulesetsFromDisk()
      setEpoch((value) => value + 1)
      const next = cloneRuleset(getAutoPaintRuleset(selectedId) ?? listAutoPaintRulesets()[0])
      setSelectedId(next.id)
      setDraft(next)
      setSaved(next)
      const message = `Loaded World Generation Rulesets from disk (“${next.label}”).`
      setStatus(message)
      onStatus?.(message)
    } catch (error) {
      const message = String(error.message ?? error)
      setStatus(message)
      onStatus?.(message)
    } finally {
      setBusy(false)
    }
  }

  const playMap = () => {
    if (!map || typeof onPlay !== 'function') {
      const message = 'Run Generate Map first'
      setStatus(message)
      onStatus?.(message)
      return
    }
    const message = onPlay()
    if (message) {
      setStatus(message)
      onStatus?.(message)
    }
  }

  const onMenuAction = (id) => {
    if (id === 'save') return onSave()
    if (id === 'load') return loadFromDisk()
    if (id === 'revert') return revert()
    if (id === 'generateMap') return generateMap()
    if (id === 'play') return playMap()
    if (id === 'back') return discardAndBack()
    if (id === 'tooltips') return setShowTooltips((value) => !value)
    if (id === 'viewRules') return setViewMode('rules')
    if (id === 'viewMap') {
      if (map) setViewMode('map')
      return undefined
    }
    if (id.startsWith('help:')) {
      setHelpTopicId(id.slice('help:'.length))
      return undefined
    }
    return undefined
  }

  const menus = [
    ...subEditorFileMenus({
      load: true,
      save: true,
      revert: true,
      loadLabel: 'Load from Disk',
      saveLabel: 'Save Ruleset',
      extraFileItems: [
        { id: 'generateMap', label: 'Generate Map' },
        { id: 'play', label: 'Play' },
      ],
    }),
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'viewRules', label: 'Rules pane' },
        { id: 'viewMap', label: 'Map board' },
        { sep: true },
        { id: 'tooltips', label: 'Tooltips' },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: WORLD_GENERATION_HELP_TOPICS.map((topic) => ({
        id: `help:${topic.id}`,
        label: topic.label,
      })),
    },
  ]

  return (
    <EditorSubScreen
      title="World Generation Ruleset"
      className="ap-ruleset-editor"
      menus={menus}
      onMenuAction={onMenuAction}
      menuChecks={{
        viewRules: viewMode === 'rules',
        viewMap: viewMode === 'map',
        tooltips: showTooltips,
      }}
      showTooltips={showTooltips}
      toolbar={
        <>
          <button
            type="button"
            className="me-button"
            title={dirty ? 'Return to Dev Edit without saving ruleset changes' : 'Return to Dev Edit'}
            onClick={discardAndBack}
          >
            {dirty ? 'Back (discard)' : 'Back to Map'}
          </button>
          <button
            type="button"
            className={`me-button${viewMode === 'rules' ? ' is-on' : ''}`}
            aria-pressed={viewMode === 'rules'}
            title="Edit floors, walls, doors, flowchart, and adjacency"
            onClick={() => setViewMode('rules')}
          >
            Rules
          </button>
          <button
            type="button"
            className={`me-button${viewMode === 'map' ? ' is-on' : ''}`}
            aria-pressed={viewMode === 'map'}
            disabled={!map}
            title={map ? 'Show the open map board' : 'Run Generate Map first'}
            onClick={() => setViewMode('map')}
          >
            Map
          </button>
          <button
            type="button"
            className="me-button"
            disabled={!canSave || !dirty || busy}
            title={canSave ? 'Write this ruleset to autoPaintRulesets.json' : 'Dev server required to save'}
            onClick={onSave}
          >
            Save
          </button>
          <button
            type="button"
            className="me-button"
            disabled={!dirty || busy}
            title="Discard unsaved edits and restore the last saved ruleset"
            onClick={revert}
          >
            Revert
          </button>
          <button
            type="button"
            className="me-button"
            disabled={busy || typeof onGenerateMap !== 'function'}
            title="Generate a map from the current ruleset (new seed each press) and show it in Map view."
            onClick={generateMap}
          >
            Generate Map
          </button>
          <button
            type="button"
            className={`me-button${showAll ? ' is-on' : ''}`}
            onClick={() => setShowAll((value) => !value)}
            title={
              showAll
                ? 'Template Pieces only (Dev Edit catalogue).'
                : 'Show every Dev Edit Palette tileset plus Template Pieces.'
            }
          >
            {showAll ? 'Template Pieces only' : 'Show all'}
          </button>
          <button
            type="button"
            className={`me-button${showGrid ? ' is-on' : ''}`}
            aria-pressed={showGrid}
            title="Show the guide grid overlay"
            onClick={() => onShowGrid?.(!showGrid)}
          >
            Grid
          </button>
          <EditorSelect
            className="me-select ed-grid-select"
            value={gridSize}
            aria-label="Grid size"
            title="Grid spacing in world pixels"
            disabled={!showGrid}
            onChange={(event) => onGridSize?.(Number(event.target.value))}
          >
            {EDITOR_GRID_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </EditorSelect>
          <button
            type="button"
            className="me-button ed-icon-btn"
            title="Grid options"
            aria-label="Grid options"
            onClick={() => setShowGridOptions(true)}
          >
            <svg className="ed-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6.2 1.2h3.6l.3 1.6a4.8 4.8 0 0 1 1.2.7l1.5-.6 1.8 3.1-1.2 1.1c.1.4.1.7.1 1.1s0 .7-.1 1.1l1.2 1.1-1.8 3.1-1.5-.6a4.8 4.8 0 0 1-1.2.7l-.3 1.6H6.2l-.3-1.6a4.8 4.8 0 0 1-1.2-.7l-1.5.6L1.4 10l1.2-1.1A4.5 4.5 0 0 1 2.5 8c0-.4 0-.7.1-1.1L1.4 5.8l1.8-3.1 1.5.6a4.8 4.8 0 0 1 1.2-.7l.3-1.6ZM8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5Z"
              />
            </svg>
          </button>
          <label className="me-check" title="Off: enemies never notice the away team or start a fight.">
            <input
              type="checkbox"
              checked={enemiesActive}
              onChange={(event) => onEnemiesActive?.(event.target.checked)}
            />{' '}
            Enemies
          </label>
          <button
            type="button"
            className="me-button is-primary"
            disabled={!map || typeof onPlay !== 'function'}
            title={
              map
                ? 'Play this map in game mode. The map does not need saving first. Exit returns here.'
                : 'Run Generate Map first'
            }
            onClick={playMap}
          >
            Play
          </button>
          <span className="me-text">
            {status ||
              (showingMap
                ? `${map?.name || 'Untitled map'} · Grid ${gridSize}px`
                : showAll
                  ? `${templateItems.length} Template Pieces + ${paletteItems.length - templateItems.length} tiles from Dev Edit Palette.`
                  : `${templateItems.length} Template Pieces from templatePieces.json (same as Dev Edit Palette).`)}
            {!canSave && !showingMap && ' Dev server required to save.'}
          </span>
        </>
      }
    >
      <div className="ge-left-rail">
        {paletteTool ? (
          <aside className="ed-properties me-side ge-source-props">
            <div className="ed-panel-head">
              <span>Sprite</span>
              <button
                type="button"
                className="me-button"
                title="Back to ruleset settings"
                onClick={() => setPaletteTool(null)}
              >
                Ruleset
              </button>
            </div>
            <PropertySectionsProvider key={paletteTool}>
              <PropertySectionsToolbar />
              <div className="ed-properties-body">
                <AssetProperties
                  tool={paletteTool}
                  onStatus={(message) => {
                    setStatus(message)
                    onStatus?.(message)
                  }}
                  animateTiles
                  ambient={map?.ambient}
                  ambientColour={map?.ambientColour}
                  onAmbient={onAmbient}
                  onAmbientColour={onAmbientColour}
                />
              </div>
            </PropertySectionsProvider>
          </aside>
        ) : (
          <>
            <div className="ge-generator-pick">
              <span className="ce-field-label">Ruleset</span>
              <EditorSelect
                className="me-select me-wide"
                value={selectedId}
                aria-label="Ruleset"
                title="Which World Generation Ruleset to edit (Generate Map and Auto-Paint use the active one)"
                onChange={(event) => openRuleset(event.target.value)}
              >
                {rulesets.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.id === selectedId && dirty ? `${entry.label} (unsaved)` : entry.label}
                  </option>
                ))}
              </EditorSelect>
            </div>
            <label className="me-field" title="Display name for this ruleset in lists and the toolbar">
              <span className="ce-field-label">Label</span>
              <input
                className="me-name"
                value={draft.label}
                onChange={(event) => patch({ label: event.target.value })}
              />
            </label>
            <label
              className="me-field"
              title="Where this kit is meant to be used (starship, colony, outdoors, …). Also sets map type so Biome / Weather match."
            >
              <span className="ce-field-label">Environment</span>
              <EditorSelect
                className="me-select me-wide"
                value={draft.environment}
                aria-label="Environment"
                title="Where this kit is meant to be used. Outdoor Settlement / Natural Terrain enable Biome."
                onChange={(event) => {
                  const environment = event.target.value
                  // Pair Environment with the matching kit when present (starship ↔ Template 32, outdoor ↔ Outdoor Template 32).
                  const preferredId =
                    environment === 'outdoorSettlement' || environment === 'naturalTerrain'
                      ? 'outdoor-template-32'
                      : environment === 'starshipStation'
                        ? 'template-32'
                        : null
                  const preferred = preferredId ? getAutoPaintRuleset(preferredId) : null
                  if (preferred && preferredId !== selectedId) {
                    setSelectedId(preferredId)
                    const next = cloneRuleset({ ...preferred, environment })
                    setDraft(next)
                    setSaved(cloneRuleset(preferred))
                  } else {
                    patch({ environment })
                  }
                  const nextType = mapTypeForEnvironment(environment)
                  if (map && nextType !== map.mapType) onMapType?.(nextType)
                }}
              >
                {AUTO_PAINT_ENVIRONMENTS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </EditorSelect>
            </label>
          </>
        )}
        <GeSourcePalette
          title="Palette"
          hint={
            showAll
              ? 'Same tabs as Dev Edit Assets (All…Items). All shows every sprite; layer tabs filter; Environment and Items match Dev Edit. Click a thumb to edit its sprite above; drag tiles/pieces onto a slot.'
              : 'Same tabs as Dev Edit Assets. All shows every Template Piece; layer tabs filter; Environment and Items always available. Click a thumb to edit its sprite above; drag onto a slot. Use Show all for every tileset category.'
          }
          items={paletteItems}
          selectedKey={selectedKeyFromTool(paletteTool)}
          onSelect={(item) => setPaletteTool(toolFromPaletteItem(item))}
        />
      </div>

      <div className="ap-ruleset-center">
      {showingMap ? (
        <div className="me-board-area ap-ruleset-board-area">
          <div className="ed-viewport-title">{map.name || 'Untitled map'}</div>
          <EditorBoard
            key={boardKey}
            map={map}
            showGrid={showGrid}
            gridSize={gridSize}
            showBounds={showBounds}
            showCentre={showCentre}
          />
        </div>
      ) : (
        <div className="oe-detail oe-wide">
          <div className="ce-inspector">
            <p className="ce-heading" title="Display name of the ruleset you are editing">
              {draft.label}
            </p>
            <p
              className="ge-lead"
              title="Pack pieces sets tip lengths; Corners shows the visual assembly. Role slots and Adjacency are below. Help menu has the full guide."
            >
              Flowchart: Pack pieces = lengths; Corners = visual assembly of wall thumbs. Role slots and Adjacency
              (Palette drag pairs) are below. Help menu covers every step.
            </p>
            <PropertySectionsProvider>
              <PropertySectionsToolbar />
              <PropertySection
                id="wg-flowchart"
                title="Flowchart"
                tip="Pipeline steps from floors to packed walls. Click a step for its diagram and settings."
                defaultOpen
              >
                <WorldGenerationFlowchart
                  draft={draft}
                  selectedNodeId={flowNodeId}
                  onSelectNode={setFlowNodeId}
                  onPipelineChange={patchPipeline}
                  onFloorsChange={patchFloors}
                  onDoorsChange={patchDoors}
                  onWallsChange={patchWalls}
                  onOpenHelpTopic={setHelpTopicId}
                  resolveDropId={resolveDropToRole}
                  acceptId={roleIdAllowed}
                  titleForTile={roleThumbTitle}
                />
              </PropertySection>

              <PropertySection
                id="wg-floors"
                title="1. Floors"
                tip="Required. These pieces define walkable floor cells that wall generation grows around."
                defaultOpen
              >
                <p className="ge-block-hint">
                  Drag floor pieces or tiles from the Palette into the slot. Multiple allowed — mix % on each thumb.
                  Right-click to remove.
                </p>
                <TileSpritePicker
                  label={FLOOR_FIELD.label}
                  labelTip={FLOOR_FIELD.tip}
                  options={tileOptions(FLOOR_FIELD, draft.floors.defaultTile)}
                  value={draft.floors.defaultTile}
                  multi
                  weighted
                  emptyText={emptyHint}
                  resolveDropId={resolveDropToRole}
                  acceptId={roleIdAllowed}
                  titleForTile={roleThumbTitle}
                  onChange={onWeightedRoleChange((entries) => patchFloors({ defaultTile: entries }))}
                />
                <TileSpritePicker
                  label={UNDER_WALL_FLOOR_FIELD.label}
                  labelTip={UNDER_WALL_FLOOR_FIELD.tip}
                  options={tileOptions(UNDER_WALL_FLOOR_FIELD, draft.floors.underWall)}
                  value={draft.floors.underWall ?? []}
                  multi
                  weighted
                  emptyText={emptyHint}
                  resolveDropId={resolveDropToRole}
                  acceptId={roleIdAllowed}
                  titleForTile={roleThumbTitle}
                  onChange={onWeightedRoleChange((entries) => patchFloors({ underWall: entries }), {
                    allowEmpty: true,
                  })}
                />
              </PropertySection>

              <PropertySection
                id="wg-walls"
                title="2. Walls / Structure"
                tip="Straight + Corner are required. Optional Long / Hull / Door frame; empty optional roles fall back to Straight / Corner."
                defaultOpen
              >
                <p className="ge-block-hint">
                  Drop Template Pieces or tiles into each role (multiple allowed). Mix % is relative among pieces in
                  that role. Empty optional roles = rim uses straight/corner. Right-click to
                  remove.
                </p>
                {WALL_TILE_FIELDS.map((field) => (
                  <TileSpritePicker
                    key={field.key}
                    label={field.label}
                    labelTip={field.tip}
                    options={tileOptions(WALL_FIELD, draft.walls[field.key] ?? [])}
                    value={draft.walls[field.key] ?? []}
                    multi
                    weighted
                    emptyText={emptyHint}
                    resolveDropId={resolveDropToRole}
                    acceptId={roleIdAllowed}
                    titleForTile={roleThumbTitle}
                    onChange={onWeightedRoleChange((entries) => patchWalls({ [field.key]: entries }), {
                      allowEmpty: !field.required,
                    })}
                  />
                ))}
              </PropertySection>

              <PropertySection
                id="wg-doors"
                title="3. Doors / Openings"
                tip="Doorway lining art for openings. Generate also places Doorway tips along the gap (see Doorways flowchart step)."
                defaultOpen
              >
                <p className="ge-block-hint">Doorway tile(s) for openings — multiple allowed with mix %.</p>
                <TileSpritePicker
                  label={DOOR_TILE_FIELD.label}
                  labelTip={DOOR_TILE_FIELD.tip}
                  options={tileOptions(DOOR_TILE_FIELD, draft.doors.underlayTile)}
                  value={draft.doors.underlayTile}
                  multi
                  weighted
                  emptyText={emptyHint}
                  resolveDropId={resolveDropToRole}
                  acceptId={roleIdAllowed}
                  titleForTile={roleThumbTitle}
                  onChange={onWeightedRoleChange((entries) => patchDoors({ underlayTile: entries }))}
                />
              </PropertySection>

              <PropertySection
                id="wg-adjacency"
                title="Adjacency rules"
                tip="Whitelist of which wall/floor pieces may sit next to each other. Empty list = allow all; once you add pairs, only those pairs are allowed."
                defaultOpen
              >
                <WorldGenerationAdjacencyEditor
                  draft={draft}
                  onAdjacencyChange={patchAdjacency}
                  resolveDropId={resolveDropToRole}
                  acceptId={roleIdAllowed}
                  titleForTile={roleThumbTitle}
                />
              </PropertySection>
            </PropertySectionsProvider>
          </div>
        </div>
      )}
      </div>
      <WorldGenerationMapPanel
        map={map}
        edit={edit}
        showWeather={showWeather}
        onShowWeather={onShowWeather}
        onMapType={onMapType}
        onBiome={onBiome}
        onWeather={onWeather}
        onAmbient={onAmbient}
        onAmbientColour={onAmbientColour}
        onSize={onSize}
        roomScale={roomScale}
        onRoomScale={onRoomScale}
        buildingScale={buildingScale}
        onBuildingScale={onBuildingScale}
        roomsInBuilding={roomsInBuilding}
        onRoomsInBuilding={onRoomsInBuilding}
        doorsInBuilding={doorsInBuilding}
        onDoorsInBuilding={onDoorsInBuilding}
        onGenerateMap={generateMap}
        generateBusy={busy}
        cardTools={cardTools}
      />
      <EditorGridOptions
        show={showGridOptions}
        onClose={() => setShowGridOptions(false)}
        showGrid={showGrid}
        onShowGrid={onShowGrid}
        gridSize={gridSize}
        onGridSize={onGridSize}
        showBounds={showBounds}
        onShowBounds={onShowBounds}
        showCentre={showCentre}
        onShowCentre={onShowCentre}
      />
      {helpTopicId ? (
        <WorldGenerationHelpDialog
          topicId={helpTopicId}
          onSelectTopic={setHelpTopicId}
          onClose={() => setHelpTopicId(null)}
        />
      ) : null}
    </EditorSubScreen>
  )
}
