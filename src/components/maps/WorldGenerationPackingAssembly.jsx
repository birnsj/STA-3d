import { useState } from 'react'
import { normalizeWeightedEntries, primaryId, removeWeightedEntry } from '../../maps/autoPaint/weightedChoice.js'
import { getTile } from '../../maps/mapFormat.js'
import { getTemplatePiece } from '../../maps/templatePieces.js'
import { tileThumbTitle, templatePieceThumbTitle } from './assetThumbTitle.js'
import { GE_ASSET_DRAG_TYPE, readGeAssetDrag } from './geAssetDrag.js'
import { contextMenuPlacement, GeThumbDeleteConfirm, GeThumbDeleteMenu } from './GeThumbContextMenu.jsx'
import TemplatePieceThumbnail from './TemplatePieceThumbnail.jsx'
import TileThumbnail from './TileThumbnail.jsx'

function resolveAssigned(id) {
  if (!id) return null
  const piece = getTemplatePiece(id)
  if (piece) return { id: piece.id, label: piece.label, __piece: piece }
  const tile = getTile(id)
  if (tile) return tile
  return { id, label: id }
}

function setRolePrimary(entries, id) {
  if (!id) return normalizeWeightedEntries(entries, { allowEmpty: true })
  const rest = normalizeWeightedEntries(entries, { allowEmpty: true })
    .map((entry) => entry.id)
    .filter((entryId) => entryId !== id)
  return normalizeWeightedEntries([id, ...rest], { allowEmpty: true })
}

/** Drop / show one role thumb; optional pipeline toggle dims the part when off. */
function AssemblySlot({
  id,
  emptyText,
  label,
  roleKey = null,
  allowClear = true,
  active = true,
  toggleKey = null,
  toggleHint = null,
  resolveDropId,
  acceptId,
  titleForTile,
  onRoleChange,
  onToggle,
  wallsRole = null,
}) {
  const [dropOver, setDropOver] = useState(false)
  const [menu, setMenu] = useState(null)
  const [pending, setPending] = useState(null)
  const assigned = resolveAssigned(id)
  const canDrop = Boolean(roleKey && onRoleChange)

  const idAllowed = (candidate) => {
    if (!candidate) return false
    if (typeof acceptId === 'function') return acceptId(candidate)
    return true
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
    onRoleChange?.(roleKey, setRolePrimary(wallsRole, nextId))
  }

  const onContextMenu = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!allowClear || !assigned || !roleKey || !onRoleChange) return
    const placement = contextMenuPlacement(event)
    if (!placement) return
    setPending(null)
    setMenu({ ...placement, id: assigned.id, label: assigned.label })
  }

  const onThumbClick = (event) => {
    if (!toggleKey || !onToggle) return
    event.preventDefault()
    onToggle(toggleKey)
  }

  const title = assigned
    ? typeof titleForTile === 'function'
      ? titleForTile(assigned)
      : assigned.__piece
        ? templatePieceThumbTitle(assigned.__piece, { extra: assigned.id })
        : tileThumbTitle(assigned, { extra: assigned.id })
    : emptyText

  const hints = [
    label,
    toggleKey ? (active ? 'On — click to turn off' : 'Off — click to turn on') : null,
    toggleHint,
    canDrop ? 'Drop from Palette to set piece' : null,
    allowClear && assigned && roleKey ? 'Right-click to remove' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={`ge-pack-slot${dropOver ? ' is-drop-target' : ''}${active ? '' : ' is-off'}${toggleKey ? ' is-toggle' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      title={hints}
    >
      <span className="ge-pack-slot-label">{label}</span>
      {assigned ? (
        <button
          type="button"
          className={`ed-thumb-btn ge-thumb is-selected${active ? '' : ' is-off'}`}
          title={title}
          onClick={onThumbClick}
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
      {!active && toggleKey ? <span className="ge-pack-off-badge">Off</span> : null}
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
            onRoleChange?.(roleKey, removeWeightedEntry(wallsRole, pending.id))
            setPending(null)
          }}
        />
      )}
    </div>
  )
}

function Connector({ text }) {
  return (
    <span className="ge-pack-connector" aria-hidden="true">
      {text}
    </span>
  )
}

/**
 * Visual how-walls-fit-together editor: schematics with role thumbs + pipeline toggles.
 * Drop from Palette onto slots; click corner/fill/end-cap parts to toggle placement.
 */
export default function WorldGenerationPackingAssembly({
  draft,
  onWallsChange,
  onPipelineChange,
  resolveDropId = null,
  acceptId = null,
  titleForTile = null,
}) {
  const walls = draft.walls ?? {}
  const pipeline = draft.pipeline ?? {}
  const longId = primaryId(walls.straightLong) || primaryId(walls.straight)
  const shortId = primaryId(walls.straight)
  const cornerId = primaryId(walls.corner)
  const placeJunctionCorners = pipeline.placeJunctionCorners !== false
  const junctionArmFills = pipeline.junctionArmFills !== false
  const trimRunAtJunction = pipeline.trimRunAtJunction !== false
  const cornerEndCaps = pipeline.cornerEndCaps !== false

  const shared = { resolveDropId, acceptId, titleForTile, onRoleChange: (key, entries) => onWallsChange?.({ [key]: entries }) }
  const toggle = (key) => onPipelineChange?.({ [key]: !(pipeline[key] !== false) })

  return (
    <div className="ge-pack-assembly">
      <p className="ge-block-hint">
        These diagrams use your Walls pieces. Drop from the Palette onto a slot to set that role. Click a corner, fill,
        or end-cap part to turn that packing step on or off (dims when off).
      </p>

      <div className="ge-pack-diagram">
        <h4 className="ge-pack-diagram-title">Straight run</h4>
        <p className="ge-block-hint">Free ends get corner caps; middle packs long then short.</p>
        <div className="ge-pack-row">
          <AssemblySlot
            {...shared}
            id={cornerId}
            label="End cap"
            emptyText="Drop corner…"
            roleKey="corner"
            wallsRole={walls.corner}
            allowClear={false}
            active={cornerEndCaps}
            toggleKey="cornerEndCaps"
            onToggle={toggle}
          />
          <Connector text="·" />
          <AssemblySlot
            {...shared}
            id={longId}
            label="Long"
            emptyText="Drop long…"
            roleKey="straightLong"
            wallsRole={walls.straightLong}
            allowClear
          />
          <Connector text="·" />
          <AssemblySlot
            {...shared}
            id={shortId}
            label="Short"
            emptyText="Drop short…"
            roleKey="straight"
            wallsRole={walls.straight}
            allowClear={false}
          />
          <Connector text="·" />
          <AssemblySlot
            {...shared}
            id={cornerId}
            label="End cap"
            emptyText="Drop corner…"
            roleKey="corner"
            wallsRole={walls.corner}
            allowClear={false}
            active={cornerEndCaps}
            toggleKey="cornerEndCaps"
            onToggle={toggle}
          />
        </div>
      </div>

      <div className="ge-pack-diagram">
        <h4 className="ge-pack-diagram-title">L junction</h4>
        <p className="ge-block-hint">
          SE corner post, then half-cell fills on the −X / −Y arms so the edge stays continuous.
        </p>
        <div className="ge-pack-l">
          <div className="ge-pack-l-cell ge-pack-l-north">
            <AssemblySlot
              {...shared}
              id={shortId}
              label="−Y arm"
              emptyText="Drop short…"
              roleKey="straight"
              wallsRole={walls.straight}
              allowClear={false}
            />
          </div>
          <div className="ge-pack-l-cell ge-pack-l-fill-y">
            <AssemblySlot
              {...shared}
              id={shortId}
              label="−Y fill"
              emptyText="Drop short…"
              roleKey="straight"
              wallsRole={walls.straight}
              allowClear={false}
              active={junctionArmFills}
              toggleKey="junctionArmFills"
              onToggle={toggle}
              toggleHint="Half-cell fill north of the SE post"
            />
          </div>
          <div className="ge-pack-l-cell ge-pack-l-west">
            <AssemblySlot
              {...shared}
              id={shortId}
              label="−X arm"
              emptyText="Drop short…"
              roleKey="straight"
              wallsRole={walls.straight}
              allowClear={false}
            />
          </div>
          <div className="ge-pack-l-cell ge-pack-l-fill-x">
            <AssemblySlot
              {...shared}
              id={shortId}
              label="−X fill"
              emptyText="Drop short…"
              roleKey="straight"
              wallsRole={walls.straight}
              allowClear={false}
              active={junctionArmFills}
              toggleKey="junctionArmFills"
              onToggle={toggle}
              toggleHint="Half-cell fill west of the SE post"
            />
          </div>
          <div className="ge-pack-l-cell ge-pack-l-corner">
            <AssemblySlot
              {...shared}
              id={cornerId}
              label="SE post"
              emptyText="Drop corner…"
              roleKey="corner"
              wallsRole={walls.corner}
              allowClear={false}
              active={placeJunctionCorners}
              toggleKey="placeJunctionCorners"
              onToggle={toggle}
              toggleHint="Corner post at the junction tip"
            />
          </div>
        </div>
        <label className="ge-section-check ge-pack-trim">
          <input
            type="checkbox"
            checked={trimRunAtJunction}
            onChange={() => toggle('trimRunAtJunction')}
          />
          Trim straight-run tip where a junction fill already covers
        </label>
      </div>

      <div className="ge-pack-diagram">
        <h4 className="ge-pack-diagram-title">Free end / doorway jamb</h4>
        <p className="ge-block-hint">A short run ending in a corner cap (same finish as door jambs).</p>
        <div className="ge-pack-row">
          <AssemblySlot
            {...shared}
            id={shortId}
            label="Short"
            emptyText="Drop short…"
            roleKey="straight"
            wallsRole={walls.straight}
            allowClear={false}
          />
          <Connector text="→" />
          <AssemblySlot
            {...shared}
            id={cornerId}
            label="End cap"
            emptyText="Drop corner…"
            roleKey="corner"
            wallsRole={walls.corner}
            allowClear={false}
            active={cornerEndCaps}
            toggleKey="cornerEndCaps"
            onToggle={toggle}
          />
        </div>
      </div>
    </div>
  )
}
