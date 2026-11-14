import { useEffect, useMemo, useState } from 'react'
import { getTile } from '../../maps/mapFormat.js'
import { LAYER_IDS, LAYER_LABELS, layerOfTile, layerOfTemplatePiece } from '../../maps/layers.js'
import { getTemplatePiece } from '../../maps/templatePieces.js'
import { tileThumbTitle, templatePieceThumbTitle } from './assetThumbTitle.js'
import { loadThumbScale, saveThumbScale, THUMB_SCALES, thumbColsForScale } from './editorThumbScale.js'
import { setGeAssetDrag } from './geAssetDrag.js'
import TemplatePieceThumbnail from './TemplatePieceThumbnail.jsx'
import TileThumbnail from './TileThumbnail.jsx'

function itemLayer(item) {
  if (item.layer && LAYER_IDS.includes(item.layer)) return item.layer
  if (item.kind === 'tile') return layerOfTile(item.id)
  if (item.kind === 'piece') return layerOfTemplatePiece(item.id)
  return 'ground'
}

function matchesQuery(item, q) {
  if (!q) return true
  return (
    item.label.toLowerCase().includes(q) ||
    item.id.toLowerCase().includes(q) ||
    String(item.groupLabel ?? '')
      .toLowerCase()
      .includes(q) ||
    String(item.section ?? '')
      .toLowerCase()
      .includes(q)
  )
}

/**
 * Left-rail source palette (same chrome as Map Editor Assets).
 * Tabs are authoring **layers** (Ground, Walls, …). Items with groupId/groupLabel/section
 * render under the same category → tileset collapses as Dev Edit Assets.
 * Thumbnail S/M/L/XL matches Dev Edit Assets (shared localStorage key).
 * items: [{ kind: 'tile'|'piece', id, label, href?, layer?, groupId?, groupLabel?, section? }]
 */
const LAYER_TAB_SHORT = {
  ground: 'Ground',
  walls: 'Walls',
  furniture: 'Furniture',
  characters: 'Characters',
  markers: 'Markers',
}

export default function GeSourcePalette({ title = 'Palette', hint = null, items = [] }) {
  // Always show every authoring layer tab (same set as Dev Edit Layers), even when empty.
  const [tab, setTab] = useState('ground')
  const [query, setQuery] = useState('')
  const [thumbScale, setThumbScale] = useState(loadThumbScale)
  const [open, setOpen] = useState(() => new Set())
  const q = query.trim().toLowerCase()
  const thumbCols = thumbColsForScale(thumbScale)

  useEffect(() => {
    saveThumbScale(thumbScale)
  }, [thumbScale])

  const activeTab = LAYER_IDS.includes(tab) ? tab : 'ground'

  const counts = useMemo(() => {
    const next = Object.fromEntries(LAYER_IDS.map((id) => [id, 0]))
    for (const item of items) {
      const layer = itemLayer(item)
      if (next[layer] != null) next[layer] += 1
    }
    return next
  }, [items])

  const visible = useMemo(() => {
    return items.filter((item) => {
      if (itemLayer(item) !== activeTab) return false
      return matchesQuery(item, q)
    })
  }, [items, activeTab, q])

  // Same category → tileset order as Dev Edit Assets when items carry group metadata.
  const grouped = useMemo(() => {
    const order = []
    const byKey = new Map()
    for (const item of visible) {
      const groupId = item.groupId || '_ungrouped'
      const groupLabel = item.groupLabel || 'Assets'
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

  const toggle = (id) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setOpen(new Set(grouped.map((group) => group.id)))
  const collapseAll = () => setOpen(new Set())
  const showCollapse = open.size > 0

  const renderThumb = (item) => {
    const tile = item.kind === 'tile' ? getTile(item.id) : null
    const piece = item.kind === 'piece' ? getTemplatePiece(item.id) || item : null
    const dimTitle =
      item.kind === 'tile' && tile
        ? tileThumbTitle(tile, { extra: 'Drag onto a slot' })
        : templatePieceThumbTitle(piece, { extra: 'Drag onto a slot' })
    return (
      <div key={`${item.kind}:${item.id}`} className="ed-asset-cell">
        <button
          type="button"
          className="ed-thumb-btn ge-source-thumb"
          title={dimTitle}
          draggable
          onDragStart={(event) => setGeAssetDrag(event, item.kind, item.id)}
        >
          {item.kind === 'tile' && tile ? (
            <TileThumbnail tile={tile} className="me-thumb-preview" animate={false} />
          ) : (
            <TemplatePieceThumbnail piece={piece} className="me-thumb-preview" animate={false} />
          )}
        </button>
        <span className="ed-thumb-label">{item.label}</span>
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
      <div className="ed-asset-tabs ge-layer-tabs" role="tablist">
        {LAYER_IDS.map((layerId) => (
          <button
            key={layerId}
            type="button"
            role="tab"
            className={`ed-tab${activeTab === layerId ? ' is-active' : ''}`}
            aria-selected={activeTab === layerId}
            title={`${LAYER_LABELS[layerId] ?? layerId}${counts[layerId] ? ` (${counts[layerId]})` : ' (empty)'}`}
            onClick={() => setTab(layerId)}
          >
            {LAYER_TAB_SHORT[layerId] ?? layerId}
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
          onChange={(event) => setQuery(event.target.value)}
        />
        {useGroups && (
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
        {useGroups ? (
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
        )}
        {!visible.length && (
          <p className="ce-text ge-picker-empty">
            No {LAYER_LABELS[activeTab] ?? activeTab} assets in this catalogue.
          </p>
        )}
      </div>
    </aside>
  )
}
