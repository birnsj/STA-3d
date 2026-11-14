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

function MarkerSlot({ label, text, active = true, toggleKey = null, onToggle = null, toggleHint = null }) {
  const onClick = () => {
    if (!toggleKey || !onToggle) return
    onToggle(toggleKey)
  }
  const hints = [label, toggleKey ? (active ? 'On — click to turn off' : 'Off — click to turn on') : null, toggleHint]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className={`ge-pack-slot ge-pack-marker${active ? '' : ' is-off'}${toggleKey ? ' is-toggle' : ''}`} title={hints}>
      <span className="ge-pack-slot-label">{label}</span>
      {toggleKey ? (
        <button type="button" className={`ge-pack-marker-face${active ? '' : ' is-off'}`} onClick={onClick}>
          {text}
        </button>
      ) : (
        <span className="ge-pack-marker-face">{text}</span>
      )}
      {!active && toggleKey ? <span className="ge-pack-off-badge">Off</span> : null}
    </div>
  )
}

/**
 * Visual diagram for one flowchart step (Corners-style thumbs). nodeId selects the schematic.
 * Drop from Palette onto role slots; click corner/fill/end-cap/Null parts to toggle when wired.
 */
export default function WorldGenerationPackingAssembly({
  nodeId = 'endCaps',
  draft,
  onFloorsChange = null,
  onDoorsChange = null,
  onWallsChange,
  onPipelineChange,
  resolveDropId = null,
  acceptId = null,
  titleForTile = null,
}) {
  const floors = draft.floors ?? {}
  const walls = draft.walls ?? {}
  const doors = draft.doors ?? {}
  const pipeline = draft.pipeline ?? {}
  const floorId = primaryId(floors.defaultTile)
  const longId = primaryId(walls.straightLong) || primaryId(walls.straight)
  const shortId = primaryId(walls.straight)
  const cornerId = primaryId(walls.corner)
  const doorId = primaryId(doors.underlayTile)
  const placeJunctionCorners = pipeline.placeJunctionCorners !== false
  const junctionArmFills = pipeline.junctionArmFills !== false
  const trimRunAtJunction = pipeline.trimRunAtJunction !== false
  const cornerEndCaps = pipeline.cornerEndCaps !== false
  const claimExteriorNull = pipeline.claimExteriorNull !== false

  const onRoleChange = (key, entries) => {
    if (key === 'defaultTile') {
      onFloorsChange?.({ defaultTile: entries })
      return
    }
    if (key === 'underlayTile') {
      onDoorsChange?.({ underlayTile: entries })
      return
    }
    onWallsChange?.({ [key]: entries })
  }
  const shared = { resolveDropId, acceptId, titleForTile, onRoleChange }
  const toggle = (key) => onPipelineChange?.({ [key]: !(pipeline[key] !== false) })

  const floorSlot = (label = 'Floor') => (
    <AssemblySlot
      {...shared}
      id={floorId}
      label={label}
      emptyText="Drop floor…"
      roleKey="defaultTile"
      wallsRole={floors.defaultTile}
      allowClear={false}
    />
  )
  const shortSlot = (label, extra = {}) => (
    <AssemblySlot
      {...shared}
      id={shortId}
      label={label}
      emptyText="Drop short…"
      roleKey="straight"
      wallsRole={walls.straight}
      allowClear={false}
      {...extra}
    />
  )
  const cornerSlot = (label, extra = {}) => (
    <AssemblySlot
      {...shared}
      id={cornerId}
      label={label}
      emptyText="Drop corner…"
      roleKey="corner"
      wallsRole={walls.corner}
      allowClear={false}
      {...extra}
    />
  )
  const longSlot = () => (
    <AssemblySlot
      {...shared}
      id={longId}
      label="Long"
      emptyText="Drop long…"
      roleKey="straightLong"
      wallsRole={walls.straightLong}
      allowClear
    />
  )
  const doorSlot = (label = 'Doorway') => (
    <AssemblySlot
      {...shared}
      id={doorId}
      label={label}
      emptyText="Drop doorway…"
      roleKey="underlayTile"
      wallsRole={doors.underlayTile}
      allowClear={false}
    />
  )

  if (nodeId === 'floors') {
    return (
      <div className="ge-pack-assembly">
        <p className="ge-block-hint">
          Floor role pieces define which cells count as floor. Drop from the Palette onto a cell to set Floors.
        </p>
        <div className="ge-pack-diagram">
          <h4 className="ge-pack-diagram-title">Floor footprint</h4>
          <div className="ge-pack-grid3">
            <span className="ge-pack-grid-empty" aria-hidden="true" />
            {floorSlot('N')}
            <span className="ge-pack-grid-empty" aria-hidden="true" />
            {floorSlot('W')}
            {floorSlot('Center')}
            {floorSlot('E')}
            <span className="ge-pack-grid-empty" aria-hidden="true" />
            {floorSlot('S')}
            <span className="ge-pack-grid-empty" aria-hidden="true" />
          </div>
        </div>
      </div>
    )
  }

  if (nodeId === 'exterior') {
    return (
      <div className="ge-pack-assembly">
        <p className="ge-block-hint">
          Empty (Null) cells next to any floor become wall candidates. Click a Null marker to toggle claiming them.
        </p>
        <div className="ge-pack-diagram">
          <h4 className="ge-pack-diagram-title">Find edges</h4>
          <div className="ge-pack-grid3">
            <MarkerSlot label="Null" text="→ wall" active={claimExteriorNull} toggleKey="claimExteriorNull" onToggle={toggle} />
            <MarkerSlot label="Null" text="→ wall" active={claimExteriorNull} toggleKey="claimExteriorNull" onToggle={toggle} />
            <MarkerSlot label="Null" text="→ wall" active={claimExteriorNull} toggleKey="claimExteriorNull" onToggle={toggle} />
            <MarkerSlot label="Null" text="→ wall" active={claimExteriorNull} toggleKey="claimExteriorNull" onToggle={toggle} />
            {floorSlot('Floor')}
            <MarkerSlot label="Null" text="→ wall" active={claimExteriorNull} toggleKey="claimExteriorNull" onToggle={toggle} />
            <MarkerSlot label="Null" text="→ wall" active={claimExteriorNull} toggleKey="claimExteriorNull" onToggle={toggle} />
            <MarkerSlot label="Null" text="→ wall" active={claimExteriorNull} toggleKey="claimExteriorNull" onToggle={toggle} />
            <MarkerSlot label="Null" text="→ wall" active={claimExteriorNull} toggleKey="claimExteriorNull" onToggle={toggle} />
          </div>
        </div>
      </div>
    )
  }

  if (nodeId === 'underlay') {
    return (
      <div className="ge-pack-assembly">
        <p className="ge-block-hint">
          Edge cells become invisible wall underlay; the neighboring floor is stored as floorUnder so deck shows through.
        </p>
        <div className="ge-pack-diagram">
          <h4 className="ge-pack-diagram-title">Underlay + floorUnder</h4>
          <div className="ge-pack-row">
            {floorSlot('Room floor')}
            <Connector text="→" />
            <MarkerSlot label="Underlay" text="templateWall" />
            <Connector text="+" />
            {floorSlot('floorUnder')}
          </div>
        </div>
      </div>
    )
  }

  if (nodeId === 'packing') {
    return (
      <div className="ge-pack-assembly">
        <p className="ge-block-hint">
          On each underlay run, packing prefers long, then short, then stub (corner length). Drop onto a slot to set Walls
          roles; tip lengths are in the settings below.
        </p>
        <div className="ge-pack-diagram">
          <h4 className="ge-pack-diagram-title">Pack on a run</h4>
          <div className="ge-pack-row">
            {cornerSlot('Stub', { active: cornerEndCaps, toggleKey: 'cornerEndCaps', onToggle: toggle })}
            <Connector text="·" />
            {longSlot()}
            <Connector text="·" />
            {shortSlot('Short')}
            <Connector text="·" />
            {cornerSlot('Stub', { active: cornerEndCaps, toggleKey: 'cornerEndCaps', onToggle: toggle })}
          </div>
        </div>
      </div>
    )
  }

  if (nodeId === 'doorways') {
    return (
      <div className="ge-pack-assembly">
        <p className="ge-block-hint">
          Opening = 2 underlay cells; line 96px with 3× Doorway 32. Leftover tip stays empty — Corner end caps sit on the
          wall jambs, not inside the opening. Opening size is in the settings below.
        </p>
        <div className="ge-pack-diagram">
          <h4 className="ge-pack-diagram-title">Opening (96px = 3×32)</h4>
          <div className="ge-pack-row">
            {cornerSlot('Jamb', { active: cornerEndCaps, toggleKey: 'cornerEndCaps', onToggle: toggle })}
            <Connector text="|" />
            {doorSlot('Door 32')}
            <Connector text="·" />
            {doorSlot('Door 32')}
            <Connector text="·" />
            {doorSlot('Door 32')}
            <Connector text="|" />
            {cornerSlot('Jamb', { active: cornerEndCaps, toggleKey: 'cornerEndCaps', onToggle: toggle })}
          </div>
        </div>
      </div>
    )
  }

  // endCaps (Corners) — full visual packing assembly
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
          {cornerSlot('End cap', { active: cornerEndCaps, toggleKey: 'cornerEndCaps', onToggle: toggle })}
          <Connector text="·" />
          {longSlot()}
          <Connector text="·" />
          {shortSlot('Short')}
          <Connector text="·" />
          {cornerSlot('End cap', { active: cornerEndCaps, toggleKey: 'cornerEndCaps', onToggle: toggle })}
        </div>
      </div>

      <div className="ge-pack-diagram">
        <h4 className="ge-pack-diagram-title">L junction</h4>
        <p className="ge-block-hint">
          SE corner post, then half-cell fills on the −X / −Y arms so the edge stays continuous.
        </p>
        <div className="ge-pack-l">
          <div className="ge-pack-l-cell ge-pack-l-north">{shortSlot('−Y arm')}</div>
          <div className="ge-pack-l-cell ge-pack-l-fill-y">
            {shortSlot('−Y fill', {
              active: junctionArmFills,
              toggleKey: 'junctionArmFills',
              onToggle: toggle,
              toggleHint: 'Half-cell fill north of the SE post',
            })}
          </div>
          <div className="ge-pack-l-cell ge-pack-l-west">{shortSlot('−X arm')}</div>
          <div className="ge-pack-l-cell ge-pack-l-fill-x">
            {shortSlot('−X fill', {
              active: junctionArmFills,
              toggleKey: 'junctionArmFills',
              onToggle: toggle,
              toggleHint: 'Half-cell fill west of the SE post',
            })}
          </div>
          <div className="ge-pack-l-cell ge-pack-l-corner">
            {cornerSlot('SE post', {
              active: placeJunctionCorners,
              toggleKey: 'placeJunctionCorners',
              onToggle: toggle,
              toggleHint: 'Corner post at the junction tip',
            })}
          </div>
        </div>
        <label className="ge-section-check ge-pack-trim">
          <input type="checkbox" checked={trimRunAtJunction} onChange={() => toggle('trimRunAtJunction')} />
          Trim straight-run tip where a junction fill already covers
        </label>
      </div>

      <div className="ge-pack-diagram">
        <h4 className="ge-pack-diagram-title">Free end / doorway jamb</h4>
        <p className="ge-block-hint">A short run ending in a corner cap (same finish as door jambs).</p>
        <div className="ge-pack-row">
          {shortSlot('Short')}
          <Connector text="→" />
          {cornerSlot('End cap', { active: cornerEndCaps, toggleKey: 'cornerEndCaps', onToggle: toggle })}
        </div>
      </div>
    </div>
  )
}
