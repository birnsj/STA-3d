import { useMemo, useState } from 'react'
import {
  addWallFloorPair,
  addWallWallPair,
  removeWallFloorPair,
  removeWallWallPair,
} from '../../maps/autoPaint/adjacency.js'
import { weightedIds } from '../../maps/autoPaint/weightedChoice.js'
import { getTile } from '../../maps/mapFormat.js'
import { getTemplatePiece } from '../../maps/templatePieces.js'
import { tileThumbTitle, templatePieceThumbTitle } from './assetThumbTitle.js'
import { GE_ASSET_DRAG_TYPE, readGeAssetDrag } from './geAssetDrag.js'
import { contextMenuPlacement, GeThumbDeleteConfirm, GeThumbDeleteMenu } from './GeThumbContextMenu.jsx'
import TemplatePieceThumbnail from './TemplatePieceThumbnail.jsx'
import TileThumbnail from './TileThumbnail.jsx'

function roleIds(role) {
  return weightedIds(role ?? [])
}

function resolveAssigned(id) {
  if (!id) return null
  const piece = getTemplatePiece(id)
  if (piece) return { id: piece.id, label: piece.label, __piece: piece }
  const tile = getTile(id)
  if (tile) return tile
  return { id, label: id }
}

function AdjacencyDropSlot({
  id,
  emptyText,
  disabled = false,
  readOnly = false,
  acceptKind = 'any',
  wallIds,
  floorIds,
  resolveDropId,
  acceptId,
  titleForTile,
  onSet,
  onClear,
}) {
  const [dropOver, setDropOver] = useState(false)
  const [menu, setMenu] = useState(null)
  const [pending, setPending] = useState(null)
  const assigned = resolveAssigned(id)
  const canDrop = !disabled && !readOnly

  const idAllowed = (candidate) => {
    if (!candidate) return false
    if (typeof acceptId === 'function' && !acceptId(candidate)) return false
    if (acceptKind === 'wall') return wallIds.has(candidate)
    if (acceptKind === 'floor') return floorIds.has(candidate)
    return wallIds.has(candidate) || floorIds.has(candidate)
  }

  const onDragOver = (event) => {
    if (!canDrop) return
    const types = event.dataTransfer?.types
    if (!types || ![...types].includes(GE_ASSET_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDropOver(true)
  }

  const onDragLeave = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return
    setDropOver(false)
  }

  const onDrop = (event) => {
    setDropOver(false)
    if (!canDrop) return
    event.preventDefault()
    const asset = readGeAssetDrag(event)
    if (!asset) return
    let nextId = null
    if (typeof resolveDropId === 'function') nextId = resolveDropId(asset)
    else if (asset.kind === 'tile' || asset.kind === 'piece') nextId = asset.id
    if (!idAllowed(nextId)) return
    onSet?.(nextId)
  }

  const onContextMenu = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (disabled || !assigned || !onClear) return
    const placement = contextMenuPlacement(event)
    if (!placement) return
    setPending(null)
    setMenu({ ...placement, id: assigned.id, label: assigned.label })
  }

  const title = assigned
    ? typeof titleForTile === 'function'
      ? titleForTile(assigned)
      : assigned.__piece
        ? templatePieceThumbTitle(assigned.__piece, {
            extra: onClear ? `${assigned.id} · right-click to remove` : assigned.id,
          })
        : tileThumbTitle(assigned, {
            extra: onClear ? `${assigned.id} · right-click to remove` : assigned.id,
          })
    : emptyText

  return (
    <div
      className={`ge-adj-slot${dropOver ? ' is-drop-target' : ''}${disabled ? ' is-disabled' : ''}${readOnly ? ' is-readonly' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {assigned ? (
        <button
          type="button"
          className="ed-thumb-btn ge-thumb is-selected"
          disabled={disabled}
          title={title}
          onContextMenu={onContextMenu}
        >
          {assigned.__piece || getTemplatePiece(assigned.id) ? (
            <TemplatePieceThumbnail
              piece={assigned.__piece || getTemplatePiece(assigned.id)}
              className="me-thumb-preview"
            />
          ) : (
            <TileThumbnail tile={assigned} className="me-thumb-preview" animate={false} />
          )}
          <span className="ed-thumb-label">{assigned.label}</span>
        </button>
      ) : (
        <p className="ce-text ge-picker-empty">{emptyText}</p>
      )}
      {menu && (
        <GeThumbDeleteMenu
          x={menu.x}
          y={menu.y}
          host={menu.host}
          onClose={() => setMenu(null)}
          onDelete={() => {
            setPending({ id: menu.id, label: menu.label })
            setMenu(null)
          }}
        />
      )}
      {pending && (
        <GeThumbDeleteConfirm
          label={pending.label}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            onClear?.()
            setPending(null)
          }}
        />
      )}
    </div>
  )
}

function AdjacencyPairRow({
  leftId,
  rightId,
  connector,
  leftKind,
  rightKind,
  wallIds,
  floorIds,
  resolveDropId,
  acceptId,
  titleForTile,
  onLeft,
  onRight,
  onRemove,
  draft = false,
}) {
  return (
    <div className={`ge-adj-pair${draft ? ' is-draft' : ''}`}>
      <AdjacencyDropSlot
        id={leftId}
        emptyText="Drop wall…"
        acceptKind={leftKind}
        readOnly={!draft}
        wallIds={wallIds}
        floorIds={floorIds}
        resolveDropId={resolveDropId}
        acceptId={acceptId}
        titleForTile={titleForTile}
        onSet={onLeft}
        onClear={draft ? () => onLeft(null) : onRemove}
      />
      <span className="ge-adj-connector" aria-hidden="true">
        {connector}
      </span>
      <AdjacencyDropSlot
        id={rightId}
        emptyText={rightKind === 'floor' ? 'Drop floor…' : 'Drop wall…'}
        acceptKind={rightKind}
        readOnly={!draft}
        wallIds={wallIds}
        floorIds={floorIds}
        resolveDropId={resolveDropId}
        acceptId={acceptId}
        titleForTile={titleForTile}
        onSet={onRight}
        onClear={draft ? () => onRight(null) : onRemove}
      />
      {!draft && (
        <button type="button" className="me-button ge-adj-remove" onClick={onRemove} title="Remove pair">
          Remove
        </button>
      )}
    </div>
  )
}

/** Graphic wall–wall / wall–floor neighbor rules — drag from Palette onto thumbnails. */
export default function WorldGenerationAdjacencyEditor({
  draft,
  onAdjacencyChange,
  resolveDropId = null,
  acceptId = null,
  titleForTile = null,
}) {
  const wallIds = useMemo(() => {
    const walls = draft.walls ?? {}
    return new Set([
      ...roleIds(walls.straight),
      ...roleIds(walls.straightLong),
      ...roleIds(walls.corner),
      ...roleIds(walls.hull),
      ...roleIds(walls.hullLong),
      ...roleIds(walls.hullCorner),
      ...roleIds(walls.doorFrame),
      ...roleIds(walls.fittings),
    ])
  }, [draft.walls])

  const floorIds = useMemo(() => {
    return new Set([...roleIds(draft.floors?.defaultTile), ...(draft.floors?.variants ?? [])])
  }, [draft.floors])

  const adjacency = draft.adjacency ?? { wallWall: [], wallFloor: [] }
  const [draftWW, setDraftWW] = useState({ a: null, b: null })
  const [draftWF, setDraftWF] = useState({ wall: null, floor: null })

  const setDraftWallWall = (side, id) => {
    const next = { ...draftWW, [side]: id }
    if (next.a && next.b) {
      onAdjacencyChange?.({
        ...adjacency,
        wallWall: addWallWallPair(adjacency.wallWall, next.a, next.b),
      })
      setDraftWW({ a: null, b: null })
      return
    }
    setDraftWW(next)
  }

  const setDraftWallFloor = (side, id) => {
    const next = { ...draftWF, [side]: id }
    if (next.wall && next.floor) {
      onAdjacencyChange?.({
        ...adjacency,
        wallFloor: addWallFloorPair(adjacency.wallFloor, next.wall, next.floor),
      })
      setDraftWF({ wall: null, floor: null })
      return
    }
    setDraftWF(next)
  }

  const shared = { wallIds, floorIds, resolveDropId, acceptId, titleForTile }

  return (
    <section className="ge-block ge-adjacency">
      <h3 className="ge-block-title">Adjacency rules</h3>
      <p className="ge-block-hint">
        Drag pieces from the Palette onto the two sides of a pair to say they may sit next to each other. Empty list =
        allow all. Once you add pairs, only those pairs are allowed. Pieces should already be in Floors / Walls slots
        above.
      </p>

      <div className="ge-adjacency-section">
        <h4 className="ge-adjacency-heading">Wall ↔ wall</h4>
        <AdjacencyPairRow
          draft
          leftId={draftWW.a}
          rightId={draftWW.b}
          connector="next to"
          leftKind="wall"
          rightKind="wall"
          {...shared}
          onLeft={(id) => setDraftWallWall('a', id)}
          onRight={(id) => setDraftWallWall('b', id)}
        />
        {adjacency.wallWall.length === 0 ? (
          <p className="ge-block-hint">No wall–wall pairs yet (all wall neighbors allowed).</p>
        ) : (
          <div className="ge-adj-list">
            {adjacency.wallWall.map((pair) => (
              <AdjacencyPairRow
                key={`${pair.a}|${pair.b}`}
                leftId={pair.a}
                rightId={pair.b}
                connector="next to"
                leftKind="wall"
                rightKind="wall"
                {...shared}
                onLeft={() => {}}
                onRight={() => {}}
                onRemove={() =>
                  onAdjacencyChange?.({
                    ...adjacency,
                    wallWall: removeWallWallPair(adjacency.wallWall, pair.a, pair.b),
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="ge-adjacency-section">
        <h4 className="ge-adjacency-heading">Wall ↔ floor</h4>
        <AdjacencyPairRow
          draft
          leftId={draftWF.wall}
          rightId={draftWF.floor}
          connector="next to floor"
          leftKind="wall"
          rightKind="floor"
          {...shared}
          onLeft={(id) => setDraftWallFloor('wall', id)}
          onRight={(id) => setDraftWallFloor('floor', id)}
        />
        {adjacency.wallFloor.length === 0 ? (
          <p className="ge-block-hint">No wall–floor pairs yet (all wall–floor neighbors allowed).</p>
        ) : (
          <div className="ge-adj-list">
            {adjacency.wallFloor.map((pair) => (
              <AdjacencyPairRow
                key={`${pair.wall}|${pair.floor}`}
                leftId={pair.wall}
                rightId={pair.floor}
                connector="next to floor"
                leftKind="wall"
                rightKind="floor"
                {...shared}
                onLeft={() => {}}
                onRight={() => {}}
                onRemove={() =>
                  onAdjacencyChange?.({
                    ...adjacency,
                    wallFloor: removeWallFloorPair(adjacency.wallFloor, pair.wall, pair.floor),
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
