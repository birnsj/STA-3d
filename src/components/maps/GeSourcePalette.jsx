import { useEffect, useMemo, useState } from 'react'
import { getTile } from '../../maps/mapFormat.js'
import { LAYER_IDS, LAYER_LABELS, layerOfTile, layerOfTemplatePiece } from '../../maps/layers.js'
import { getTemplatePiece } from '../../maps/templatePieces.js'
import { getCategoryName, getItems } from '../../rules/equipment.js'
import { DESTRUCTIBLE_TYPES, destructibleTileId, HAZARD_TYPES } from '../../world/environment.js'
import { tileThumbTitle, templatePieceThumbTitle } from './assetThumbTitle.js'
import { HAZARD_FRAMES, hazardStrip } from './environmentArt.js'
import { loadThumbScale, saveThumbScale, THUMB_SCALES, thumbColsForScale } from './editorThumbScale.js'
import { setGeAssetDrag } from './geAssetDrag.js'
import TemplatePieceThumbnail from './TemplatePieceThumbnail.jsx'
import TileThumbnail from './TileThumbnail.jsx'

const CATALOGUE_TABS = [
  { id: 'environment', label: 'Environment', title: 'Destructibles and hazards' },
  { id: 'items', label: 'Items', title: 'Inventory and ground-loot items' },
]

const CALIBRATION_ITEM_GROUPS = [
  { id: 'cal-footprints', label: 'Footprints', tag: 'footprint' },
  { id: 'cal-selection', label: 'Selection', tag: 'selection' },
]
const DIMENSION_ITEM_GROUPS = [
  { id: 'dim-footprints', label: 'Footprints', tag: 'footprint' },
  { id: 'dim-tiny', label: 'Tiny', tag: 'tiny' },
  { id: 'dim-selection', label: 'Selection', tag: 'selection' },
]

function itemLayer(item) {
  if (item.layer && LAYER_IDS.includes(item.layer)) return item.layer
  if (item.kind === 'tile') return layerOfTile(item.id)
  if (item.kind === 'piece') return layerOfTemplatePiece(item.id)
  return 'ground'
}

function matchesQuery(item, q) {
  if (!q) return true
  return (
    String(item.label ?? item.name ?? '')
      .toLowerCase()
      .includes(q) ||
    String(item.id ?? '')
      .toLowerCase()
      .includes(q) ||
    String(item.groupLabel ?? '')
      .toLowerCase()
      .includes(q) ||
    String(item.section ?? '')
      .toLowerCase()
      .includes(q) ||
    String(item.description ?? '')
      .toLowerCase()
      .includes(q)
  )
}

function textMatches(text, q) {
  if (!q) return true
  return String(text).toLowerCase().includes(q)
}

/**
 * Left-rail source palette (same chrome as Map Editor Assets).
 * Tabs match Dev Edit Assets: All (every sprite), then Ground…Markers, plus Environment and Items.
 * Thumbnail S/M/L/XL matches Dev Edit Assets (shared localStorage key).
 * Click selects (selectedKey / onSelect); drag still fills role slots for tiles/pieces.
 * items: [{ kind: 'tile'|'piece', id, label, href?, layer?, groupId?, groupLabel?, section? }]
 */
const ALL_TAB = 'all'

const LAYER_TAB_SHORT = {
  ground: 'Ground',
  walls: 'Walls',
  furniture: 'Furniture',
  characters: 'Characters',
  markers: 'Markers',
}

function itemKey(item) {
  return `${item.kind}:${item.id}`
}

function ToolGroup({ id, label, count, open, onToggle, children }) {
  const isOpen = open.has(id)
  return (
    <div className="me-group ed-palette-layer">
      <button type="button" className="me-group-tag" aria-expanded={isOpen} onClick={() => onToggle(id)}>
        <span className="me-group-arrow" aria-hidden="true">
          {isOpen ? '▾' : '▸'}
        </span>
        <span className="me-group-label">{label}</span>
        <span className="me-group-count">{count}</span>
      </button>
      {isOpen && children}
    </div>
  )
}

export default function GeSourcePalette({
  title = 'Palette',
  hint = null,
  items = [],
  selectedKey = null,
  onSelect = null,
}) {
  // All + authoring layers + Environment / Items (same strip as Dev Edit Assets).
  const [tab, setTab] = useState(ALL_TAB)
  const [catalogueTab, setCatalogueTab] = useState(null)
  const [query, setQuery] = useState('')
  const [thumbScale, setThumbScale] = useState(loadThumbScale)
  // Layer collapses stay separate from Environment / Items groups so Collapse all does not empty those tabs.
  const [open, setOpen] = useState(() => new Set())
  const [catalogueOpen, setCatalogueOpen] = useState(
    () => new Set(['env:destructibles', 'env:hazards', 'cal-footprints', 'cal-selection', 'dim-footprints', 'dim-tiny', 'dim-selection']),
  )
  const q = query.trim().toLowerCase()
  const thumbCols = thumbColsForScale(thumbScale)

  useEffect(() => {
    saveThumbScale(thumbScale)
  }, [thumbScale])

  const showAllSprites = !catalogueTab && tab === ALL_TAB
  const activeTab = showAllSprites ? ALL_TAB : LAYER_IDS.includes(tab) ? tab : 'ground'
  const body = catalogueTab ?? 'layers'

  const counts = useMemo(() => {
    const next = Object.fromEntries(LAYER_IDS.map((id) => [id, 0]))
    let all = 0
    for (const item of items) {
      all += 1
      const layer = itemLayer(item)
      if (next[layer] != null) next[layer] += 1
    }
    next[ALL_TAB] = all
    return next
  }, [items])

  const visible = useMemo(() => {
    if (body !== 'layers') return []
    return items.filter((item) => {
      if (!showAllSprites && itemLayer(item) !== activeTab) return false
      return matchesQuery(item, q)
    })
  }, [items, activeTab, showAllSprites, q, body])

  // Same category → tileset order as Dev Edit Assets when items carry group metadata.
  const grouped = useMemo(() => {
    const order = []
    const byKey = new Map()
    for (const item of visible) {
      const groupId = item.groupId || '_ungrouped'
      const groupLabel = item.groupLabel || 'Palette'
      const section = item.section || null
      const key = groupId
      let entry = byKey.get(key)
      if (!entry) {
        entry = { id: groupId, label: groupLabel, section, items: [] }
        byKey.set(key, entry)
        order.push(entry)
      }
      entry.items.push(item)
    }
    return order
  }, [visible])

  const useGroups = grouped.some((group) => group.id !== '_ungrouped') || grouped.length > 1

  const inventoryLists = useMemo(() => {
    const all = getItems()
    const calibration = all.filter((item) => item.category === 'calibration')
    const dimension = all.filter((item) => item.category === 'dimension')
    const rest = all.filter((item) => item.category !== 'calibration' && item.category !== 'dimension')
    return { calibration, dimension, rest }
  }, [])

  const toggle = (id) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCatalogue = (id) => {
    setCatalogueOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setOpen(new Set(grouped.map((group) => group.id)))
  const collapseAll = () => setOpen(new Set())
  const showCollapse = open.size > 0

  const selectLayer = (layerId) => {
    setCatalogueTab(null)
    setTab(layerId)
  }

  const selectAllSprites = () => {
    setCatalogueTab(null)
    setTab(ALL_TAB)
  }

  const selectCatalogue = (id) => {
    setCatalogueTab(id)
    // Ensure Environment / Items show content immediately (not empty collapsed headers).
    if (id === 'environment') {
      setCatalogueOpen((prev) => new Set([...prev, 'env:destructibles', 'env:hazards']))
    }
  }

  const emitSelect = (item) => {
    if (!onSelect) return
    const key = itemKey(item)
    onSelect(selectedKey === key ? null : item)
  }

  const renderThumb = (item) => {
    const key = itemKey(item)
    const selected = selectedKey === key
    const tile = item.kind === 'tile' ? getTile(item.id) : null
    const piece = item.kind === 'piece' ? getTemplatePiece(item.id) || item : null
    const selectHint = onSelect ? (selected ? 'Selected · click again to clear' : 'Click to edit sprite') : null
    const canDrag = item.kind === 'tile' || item.kind === 'piece'
    const dragHint = canDrag ? 'Drag onto a slot' : null
    const extra = [selectHint, dragHint].filter(Boolean).join(' · ')
    const dimTitle =
      item.kind === 'tile' && tile
        ? tileThumbTitle(tile, { extra })
        : item.kind === 'piece'
          ? templatePieceThumbTitle(piece, { extra })
          : [item.label, extra].filter(Boolean).join(' · ')
    return (
      <div key={key} className="ed-asset-cell">
        <button
          type="button"
          className={`ed-thumb-btn ge-source-thumb${selected ? ' is-selected' : ''}`}
          title={dimTitle}
          aria-pressed={onSelect ? selected : undefined}
          draggable={canDrag}
          onDragStart={canDrag ? (event) => setGeAssetDrag(event, item.kind, item.id) : undefined}
          onClick={() => emitSelect(item)}
        >
          {item.kind === 'tile' && tile ? (
            <TileThumbnail tile={tile} className="me-thumb-preview" animate={false} />
          ) : item.kind === 'piece' ? (
            <TemplatePieceThumbnail piece={piece} className="me-thumb-preview" animate={false} />
          ) : item.kind === 'destructible' ? (
            <TileThumbnail tile={getTile(destructibleTileId(item.id))} className="me-thumb-preview" animate={false} />
          ) : item.kind === 'hazard' ? (
            <span
              className="me-swatch is-hazard"
              style={{
                backgroundColor: item.colour || HAZARD_TYPES[item.id]?.colour,
                backgroundImage: `url(${hazardStrip(item.id)})`,
                backgroundSize: `${HAZARD_FRAMES * 100}% 100%`,
              }}
              aria-hidden="true"
            />
          ) : item.kind === 'inventory' && (item.worldImage || item.icon) ? (
            <img className="me-thumb-preview" src={item.worldImage || item.icon} alt="" draggable={false} />
          ) : (
            <span className="me-swatch is-area" aria-hidden="true" />
          )}
        </button>
        <span className="ed-thumb-label">{item.label}</span>
      </div>
    )
  }

  const renderInventoryGrid = (list) => {
    const filtered = list.filter(
      (entry) => textMatches(entry.name, q) || textMatches(entry.id, q) || textMatches(getCategoryName(entry.category), q),
    )
    if (!filtered.length) return null
    return (
      <div className="ed-asset-grid">
        {filtered.map((entry) =>
          renderThumb({
            kind: 'inventory',
            id: entry.id,
            label: entry.name,
            worldImage: entry.worldImage,
            icon: entry.icon,
          }),
        )}
      </div>
    )
  }

  return (
    <aside
      className="ed-assets me-palette ge-source-rail"
      style={{ '--ed-thumb-cols': thumbCols }}
      data-thumb-scale={thumbScale}
    >
      <div className="ed-panel-head">
        <span>{title}</span>
        <div className="ed-seg ed-thumb-scale" role="group" aria-label="Thumbnail size">
          {THUMB_SCALES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`me-button${thumbScale === entry.id ? ' is-on' : ''}`}
              aria-pressed={thumbScale === entry.id}
              title={entry.title}
              onClick={() => setThumbScale(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      <div className="ed-asset-tabs ge-layer-tabs" role="tablist" aria-label="Palette catalogues">
        <button
          type="button"
          role="tab"
          className={`ed-tab${showAllSprites ? ' is-active' : ''}`}
          aria-selected={showAllSprites}
          title={`All sprites${counts[ALL_TAB] ? ` (${counts[ALL_TAB]})` : ' (empty)'}`}
          onClick={selectAllSprites}
        >
          All
        </button>
        {LAYER_IDS.map((layerId) => (
          <button
            key={layerId}
            type="button"
            role="tab"
            className={`ed-tab${!catalogueTab && activeTab === layerId ? ' is-active' : ''}`}
            aria-selected={!catalogueTab && activeTab === layerId}
            title={`${LAYER_LABELS[layerId] ?? layerId}${counts[layerId] ? ` (${counts[layerId]})` : ' (empty)'}`}
            onClick={() => selectLayer(layerId)}
          >
            {LAYER_TAB_SHORT[layerId] ?? layerId}
          </button>
        ))}
        {CATALOGUE_TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            className={`ed-tab${catalogueTab === entry.id ? ' is-active' : ''}`}
            aria-selected={catalogueTab === entry.id}
            title={entry.title}
            onClick={() => selectCatalogue(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="ed-asset-tools">
        <input
          className="ed-asset-search me-name"
          type="search"
          value={query}
          placeholder="Search…"
          aria-label="Search palette"
          title="Filter palette thumbs by name or id"
          onChange={(event) => setQuery(event.target.value)}
        />
        {body === 'layers' && useGroups && (
          <button
            type="button"
            className="me-button ed-collapse-all"
            disabled={!grouped.length}
            title={showCollapse ? 'Collapse all groups' : 'Expand all groups'}
            onClick={() => (showCollapse ? collapseAll() : expandAll())}
          >
            {showCollapse ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
      {hint ? <p className="ge-source-hint">{hint}</p> : null}
      <div className="ed-asset-body">
        {body === 'layers' &&
          (useGroups ? (
            grouped.map((group, index) => {
              const isOpen = open.has(group.id) || Boolean(q)
              const startsSection = group.section && group.section !== grouped[index - 1]?.section
              return (
                <div key={group.id} className="me-group ed-palette-layer">
                  {startsSection && <p className="me-section">{group.section}</p>}
                  <button
                    type="button"
                    className="me-group-tag"
                    aria-expanded={isOpen}
                    onClick={() => toggle(group.id)}
                  >
                    <span className="me-group-arrow" aria-hidden="true">
                      {isOpen ? '▾' : '▸'}
                    </span>
                    <span className="me-group-label">{group.label}</span>
                    <span className="me-group-count">{group.items.length}</span>
                  </button>
                  {isOpen && <div className="ed-asset-grid">{group.items.map(renderThumb)}</div>}
                </div>
              )
            })
          ) : (
            <div className="ed-asset-grid" role="list">
              {visible.map(renderThumb)}
            </div>
          ))}

        {body === 'environment' && (
          <>
            <ToolGroup
              id="env:destructibles"
              label="Destructible Objects"
              count={Object.keys(DESTRUCTIBLE_TYPES).length}
              open={q ? new Set(['env:destructibles', 'env:hazards']) : catalogueOpen}
              onToggle={toggleCatalogue}
            >
              <div className="ed-asset-grid">
                {Object.entries(DESTRUCTIBLE_TYPES)
                  .filter(([, info]) => textMatches(info.name, q) || textMatches(info.description, q))
                  .map(([type, info]) =>
                    renderThumb({
                      kind: 'destructible',
                      id: type,
                      label: info.name,
                      description: info.description,
                    }),
                  )}
              </div>
            </ToolGroup>
            <ToolGroup
              id="env:hazards"
              label="Hazards"
              count={Object.keys(HAZARD_TYPES).length}
              open={q ? new Set(['env:destructibles', 'env:hazards']) : catalogueOpen}
              onToggle={toggleCatalogue}
            >
              <div className="ed-asset-grid">
                {Object.entries(HAZARD_TYPES)
                  .filter(([, info]) => textMatches(info.name, q))
                  .map(([type, info]) =>
                    renderThumb({
                      kind: 'hazard',
                      id: type,
                      label: info.name,
                      colour: info.colour,
                    }),
                  )}
              </div>
            </ToolGroup>
          </>
        )}

        {body === 'items' && (
          <>
            {CALIBRATION_ITEM_GROUPS.map((group, index) => {
              const list = inventoryLists.calibration.filter((entry) => entry.tags?.includes(group.tag))
              const grid = renderInventoryGrid(list)
              if (!grid) return null
              const earlier = CALIBRATION_ITEM_GROUPS.slice(0, index).some((other) =>
                inventoryLists.calibration.some((entry) => entry.tags?.includes(other.tag) && (textMatches(entry.name, q) || textMatches(entry.id, q))),
              )
              return (
                <div key={group.id}>
                  {!earlier && <p className="me-section">Calibration</p>}
                  <ToolGroup
                    id={group.id}
                    label={group.label}
                    count={list.length}
                    open={q ? new Set([group.id]) : catalogueOpen}
                    onToggle={toggleCatalogue}
                  >
                    {grid}
                  </ToolGroup>
                </div>
              )
            })}
            {DIMENSION_ITEM_GROUPS.map((group, index) => {
              const list = inventoryLists.dimension.filter((entry) => entry.tags?.includes(group.tag))
              const grid = renderInventoryGrid(list)
              if (!grid) return null
              const earlier = DIMENSION_ITEM_GROUPS.slice(0, index).some((other) =>
                inventoryLists.dimension.some((entry) => entry.tags?.includes(other.tag) && (textMatches(entry.name, q) || textMatches(entry.id, q))),
              )
              return (
                <div key={group.id}>
                  {!earlier && <p className="me-section">Dimension</p>}
                  <ToolGroup
                    id={group.id}
                    label={group.label}
                    count={list.length}
                    open={q ? new Set([group.id]) : catalogueOpen}
                    onToggle={toggleCatalogue}
                  >
                    {grid}
                  </ToolGroup>
                </div>
              )
            })}
            {renderInventoryGrid(inventoryLists.rest)}
          </>
        )}

        {body === 'layers' && !visible.length && (
          <p className="ce-text ge-picker-empty">
            No {showAllSprites ? 'sprites' : LAYER_LABELS[activeTab] ?? activeTab} in this catalogue.
          </p>
        )}
      </div>
    </aside>
  )
}
