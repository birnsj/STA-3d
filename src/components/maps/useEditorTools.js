import { useEffect, useMemo, useRef, useState } from 'react'
import { ambientMarkerKinds, isAmbientMarkerKind } from '../../data/adaptation/exploration/ambientCreatures.js'
import { MAX_AWAY_TEAM } from '../../exploration/awayTeam.js'
import { challengeDefinitionsFor } from '../../exploration/challengeObjects.js'
import { listAuthoredCharacters } from '../../character/authoredCharacters.js'

const CHARACTER_SPAWN_KINDS = ['playerStarts', 'enemySpawns', 'horseSpawns', ...ambientMarkerKinds()]
const isCharacterSpawnKind = (kind) => CHARACTER_SPAWN_KINDS.includes(kind)
import {
  addPatrolWaypoint,
  areaAt,
  dependentsAt,
  destructibleAt,
  duplicateDestructible,
  duplicateGroundItem,
  eraseHazardTile,
  eraseMarkers,
  eraseStructure,
  fishingSpotAt,
  groundItemAt,
  groundItemAtBoard,
  hasMarkers,
  hazardRegionAt,
  moveDestructible,
  moveFishingSpot,
  moveGroundItem,
  moveMarkers,
  npcAt,
  paintBrush,
  paintFloor,
  paintHazardTile,
  placeDestructible,
  placeFishingSpot,
  placeGroundItem,
  placeNpc,
  placeTemplatePiece,
  removeDestructible,
  removeFishingSpot,
  removeGroundItem,
  removePatrolWaypoint,
  selectionCandidates,
  setAreaLabel,
  swapTilesWithObjects,
  templatePieceAt,
  templatePieceAtBoard,
  templatePieceTargetAt,
  templateTipKey,
  toggleMarker,
  turnFacing,
  updateDestructible,
  updatePatrolWaypoint,
  updateNpc,
  moveTemplatePiece,
  removeTemplatePiece,
  updateTemplatePiece,
} from '../../maps/mapEdits.js'
import {
  canEditLayer,
  LAYER_LABELS,
  layerOfTemplatePiece,
  layerOfTile,
  selectionPriority,
} from '../../maps/layers.js'
import { cellKey, getTile, isEmptyTile, isRotated, NULL_TILE, PALETTE_GROUPS } from '../../maps/mapFormat.js'
import {
  autoPaintFloorCell,
  defaultAutoPaintRulesetId,
  getAutoPaintRuleset,
  noteAutoPaintWallCleared,
  rebuildAutoPaintWalls,
} from '../../maps/autoPaint/index.js'
import { getTemplatePiece, templatePieceGroups } from '../../maps/templatePieces.js'
import { getItemById } from '../../rules/equipment.js'
import { DESTRUCTIBLE_TYPES } from '../../world/environment.js'
import { toggleCover, updateMapObject } from '../../world/objectAuthoring.js'

// Checked palette tiles for Place Tiles (Unreal foliage-style multi-brush). Palette order, then leftovers.
function orderedPaintTileIds(selectedIds) {
  const wanted = selectedIds instanceof Set ? selectedIds : new Set(selectedIds)
  if (!wanted.size) return []
  const ordered = []
  const seen = new Set()
  for (const group of PALETTE_GROUPS) {
    for (const id of group.tiles ?? []) {
      if (!wanted.has(id) || seen.has(id)) continue
      ordered.push(id)
      seen.add(id)
    }
  }
  for (const id of wanted) {
    if (seen.has(id)) continue
    ordered.push(id)
    seen.add(id)
  }
  return ordered
}

// Same multi-brush ordering for Template Pieces (catalogue group order).
function orderedPaintTemplateIds(selectedIds) {
  const wanted = selectedIds instanceof Set ? selectedIds : new Set(selectedIds)
  if (!wanted.size) return []
  const ordered = []
  const seen = new Set()
  for (const group of templatePieceGroups()) {
    for (const piece of group.pieces ?? []) {
      if (!wanted.has(piece.id) || seen.has(piece.id)) continue
      ordered.push(piece.id)
      seen.add(piece.id)
    }
  }
  for (const id of wanted) {
    if (seen.has(id)) continue
    ordered.push(id)
    seen.add(id)
  }
  return ordered
}

function markerLayersAt(map, position) {
  const layers = new Set()
  if (
    (map.npcs ?? []).some((npc) => npc.position.x === position.x && npc.position.y === position.y) ||
    CHARACTER_SPAWN_KINDS.flatMap((kind) => map.markers?.[kind] ?? []).some(
      (marker) => marker.x === position.x && marker.y === position.y,
    )
  ) {
    layers.add('characters')
  }
  if (
    (map.areas ?? []).some((area) => area.position.x === position.x && area.position.y === position.y) ||
    (map.objectives ?? []).some((objective) => objective.position?.x === position.x && objective.position?.y === position.y)
  ) {
    layers.add('markers')
  }
  return [...layers]
}

function cellAssemblyLayers(map, position, objectDefinitions) {
  const layers = new Set([layerOfTile(map.tiles[position.y][position.x])])
  const key = cellKey(position)
  if (map.floorUnder?.[key] != null) layers.add('ground')
  if (map.stackOver?.[key]?.length) layers.add('furniture')
  if (objectDefinitions.some((definition) => definition.position[0] === position.x && definition.position[1] === position.y)) {
    layers.add('furniture')
  }
  if (
    (map.groundItemPlacements ?? []).some((entry) => {
      const tile = entry.on?.tile
      return Array.isArray(tile) && tile[0] === position.x && tile[1] === position.y
    })
  ) {
    layers.add('furniture')
  }
  return [...layers]
}

// The map editor's tools: which tool is held, the board's click / drag / right-click behaviour for each, and what is
// selected for its inspector (an NPC, a player start or enemy spawn, a challenge object). It edits through edit(map) and
// never touches files or popups.
// map, edit(map), setStatus(text), askText(details): from the editor. boardKey: changes whenever a different map is put
// in front of the user, which clears the selection. suspended: a popup or full-screen editor is open, so the keys stand
// aside. onObjectivePlaced(index): an objective sent here by the Objective Editor was placed (or cancelled), so it reopens.
// itemGridSize: world-pixel snap for ground items (matches the toolbar guide grid; default 2 = play 32×32).
// layers: editor layer state from useEditorLayers (visibility / lock / active for selection priority).
// beginStroke / endStroke: undo coalescing.
export default function useEditorTools({
  map,
  edit,
  setStatus,
  askText,
  boardKey,
  suspended,
  onObjectivePlaced,
  itemGridSize = 2,
  layers = null,
  beginStroke = null,
  endStroke = null,
}) {
  const [tool, setTool] = useState('tile:bulkhead')
  // Place Tiles multi-brush: checked thumbs cycle while painting (Unreal foliage-style).
  // Starts empty — selecting a tile checks it in (see selectTool). An empty set paints the selected tool only.
  const [paintTileIds, setPaintTileIds] = useState(() => new Set())
  const paintCycleRef = useRef(0)
  const [paintTemplateIds, setPaintTemplateIds] = useState(() => new Set())
  const paintTemplateCycleRef = useRef(0)
  const lastTemplateTipRef = useRef(null)
  const [autoPaintRulesetId, setAutoPaintRulesetId] = useState(defaultAutoPaintRulesetId)
  // Character Library "Use for placement": next Place NPC uses this id (otherwise the first catalogue entry).
  const [pendingCharacterId, setPendingCharacterId] = useState(null)
  // Place Tiles: the board only paints the chosen tile while this is on; off, the pointer is just a cursor.
  const [placing, setPlacing] = useState(false)
  // Move: click to pick up, click to place. moveFrom: what is being carried (null = idle move cursor).
  // Move and Place Tiles are never on together.
  const [moving, setMoving] = useState(false)
  const [moveFrom, setMoveFrom] = useState(null)
  // The tile brush paints rotated tiles (the R key toggles it; picking a tile copies its rotation).
  const [rotated, setRotated] = useState(false)
  // The objective (index) whose position the next map click sets, or null. placingFromEditor: the Objective Editor sent
  // the user to the board, so it reopens once the tile is clicked (or Escape cancels).
  const [placingObjective, setPlacingObjective] = useState(null)
  const [placingFromEditor, setPlacingFromEditor] = useState(false)
  // The NPC tool: the NPC shown in the inspector, and whether the next board click moves it.
  const [selectedNpcId, setSelectedNpcId] = useState(null)
  const [movingNpc, setMovingNpc] = useState(false)
  // Patrol authoring for the selected NPC: Edit Patrol mode, selected waypoint index, Move Waypoint mode.
  const [editingPatrol, setEditingPatrol] = useState(false)
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState(null)
  const [movingWaypoint, setMovingWaypoint] = useState(false)
  // The player start or enemy spawn shown in its inspector ({ kind, x, y }), or null. Looked up by tile, so moving or
  // deleting it closes the inspector.
  const [selectedMarker, setSelectedMarker] = useState(null)
  // The challenge object shown in its inspector (an id), and whether the next board click moves it.
  const [selectedObjectId, setSelectedObjectId] = useState(null)
  const [placingObject, setPlacingObject] = useState(false)
  const [editingObjectCovers, setEditingObjectCovers] = useState(false)
  // Destructible objects and hazard regions (tools 'destructible:{type}', 'hazard:{type}', 'hazardErase'): the one in its
  // inspector, whether the next click moves the destructible, and the intensity the hazard brush paints.
  const [selectedDestructibleId, setSelectedDestructibleId] = useState(null)
  const [movingDestructible, setMovingDestructible] = useState(false)
  const [linkingDestructible, setLinkingDestructible] = useState(false)
  const [selectedHazardId, setSelectedHazardId] = useState(null)
  const [hazardIntensity, setHazardIntensity] = useState(2)
  // Inventory ground placements (tools 'inventory:{itemId}'): selected instance and Move mode.
  const [selectedGroundItemId, setSelectedGroundItemId] = useState(null)
  const [movingGroundItem, setMovingGroundItem] = useState(false)
  // Template Piece overlays (tools 'template:{pieceId}'): selected instance and Move mode. Layer from catalogue.
  const [selectedTemplatePieceId, setSelectedTemplatePieceId] = useState(null)
  const [movingTemplatePiece, setMovingTemplatePiece] = useState(false)
  const [selectedFishingSpotId, setSelectedFishingSpotId] = useState(null)
  const [movingFishingSpot, setMovingFishingSpot] = useState(false)
  // Brush rotation for the next place (R steps 90° while a template tool is held).
  const [templateRotation, setTemplateRotation] = useState(0)

  // A different map clears everything selected or half-done on the old one.
  const [seenBoardKey, setSeenBoardKey] = useState(boardKey)
  if (seenBoardKey !== boardKey) {
    setSeenBoardKey(boardKey)
    setSelectedDestructibleId(null)
    setMovingDestructible(false)
    setLinkingDestructible(false)
    setSelectedHazardId(null)
    setSelectedNpcId(null)
    setSelectedMarker(null)
    setPlacingObjective(null)
    setPlacingFromEditor(false)
    setSelectedObjectId(null)
    setPlacingObject(false)
    setEditingObjectCovers(false)
    setMovingNpc(false)
    setEditingPatrol(false)
    setSelectedWaypointIndex(null)
    setMovingWaypoint(false)
    setMoveFrom(null)
    setSelectedGroundItemId(null)
    setMovingGroundItem(false)
    setSelectedTemplatePieceId(null)
    setMovingTemplatePiece(false)
    setSelectedFishingSpotId(null)
    setMovingFishingSpot(false)
    setPendingCharacterId(null)
  }

  const selectedNpc = (map.npcs ?? []).find((npc) => npc.id === selectedNpcId) ?? null
  const markerInspected = useMemo(() => {
    if (!selectedMarker) return null
    const list = map.markers[selectedMarker.kind] ?? []
    const index = list.findIndex((marker) => marker.x === selectedMarker.x && marker.y === selectedMarker.y)
    if (index < 0) return null
    const prefix =
      selectedMarker.kind === 'playerStarts'
        ? 'P'
        : selectedMarker.kind === 'enemySpawns'
          ? 'E'
          : selectedMarker.kind === 'horseSpawns'
            ? 'H'
            : isAmbientMarkerKind(selectedMarker.kind)
              ? 'A'
              : 'M'
    return { ...list[index], kind: selectedMarker.kind, label: `${prefix}${index + 1}` }
  }, [map, selectedMarker])
  const objectDefinitions = useMemo(() => challengeDefinitionsFor(map), [map])
  const selectedObject = objectDefinitions.find((definition) => definition.id === selectedObjectId) ?? null
  const selectedDestructible = (map.destructibles ?? []).find((object) => object.id === selectedDestructibleId) ?? null
  const selectedHazard = (map.hazards ?? []).find((region) => region.id === selectedHazardId) ?? null
  const selectedGroundItem = (map.groundItemPlacements ?? []).find((entry) => entry.id === selectedGroundItemId) ?? null
  const selectedTemplatePiece = (map.templatePiecePlacements ?? []).find((entry) => entry.id === selectedTemplatePieceId) ?? null
  const selectedFishingSpot = (map.fishingSpots ?? []).find((entry) => entry.id === selectedFishingSpotId) ?? null
  const clearLayerSelection = (layerId) => {
    if (layerId === 'furniture') {
      setSelectedObjectId(null)
      setPlacingObject(false)
      setEditingObjectCovers(false)
      setSelectedDestructibleId(null)
      setMovingDestructible(false)
      setLinkingDestructible(false)
      setSelectedHazardId(null)
      setSelectedGroundItemId(null)
      setMovingGroundItem(false)
    }
    if (layerId === 'walls') {
      setSelectedTemplatePieceId(null)
      setMovingTemplatePiece(false)
    }
    if (layerId === 'characters') {
      setSelectedNpcId(null)
      setSelectedMarker(null)
      setMovingNpc(false)
      setEditingPatrol(false)
      setSelectedWaypointIndex(null)
      setMovingWaypoint(false)
    }
    if (layerId === 'markers') {
      setPlacingObjective(null)
      setPlacingFromEditor(false)
      setSelectedFishingSpotId(null)
      setMovingFishingSpot(false)
    }
    setMoveFrom(null)
  }
  // Tiles a destructible can't take: where challenge objects stand.
  const objectTiles = useMemo(() => objectDefinitions.map(({ position: [x, y] }) => ({ x, y })), [objectDefinitions])
  const duplicateSelected = () => {
    if (!selectedDestructible) return
    if (!canEditLayer(layers, 'furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
    const copy = duplicateDestructible(map, selectedDestructible.id, objectTiles)
    if (!copy) return setStatus('No free floor tile near it for the copy.')
    edit(copy.map)
    setSelectedDestructibleId(copy.object.id)
    setStatus(`Duplicated ${selectedDestructible.id} as ${copy.object.id} at (${copy.object.position.x}, ${copy.object.position.y}).`)
  }
  const duplicateSelectedGroundItem = () => {
    if (!selectedGroundItem) return
    if (!canEditLayer(layers, 'furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
    const copy = duplicateGroundItem(map, selectedGroundItem.id, itemGridSize)
    if (!copy) return setStatus('No free cell near it for the copy.')
    edit(copy.map)
    setSelectedGroundItemId(copy.object.id)
    setStatus(`Duplicated ${selectedGroundItem.id} as ${copy.object.id}.`)
  }

  /** Flip tile paint axis, or yaw Template Piece brush / selection +90° (R, Space, middle-click). */
  const rotateBrushAxis = () => {
    if (placing && tool?.startsWith('tile:')) {
      setRotated((value) => !value)
      return
    }
    if (selectedTemplatePiece) {
      const rotateLayer = layerOfTemplatePiece(selectedTemplatePiece.pieceId)
      if (!canEditLayer(layers, rotateLayer)) {
        setStatus(`${LAYER_LABELS[rotateLayer] ?? rotateLayer} layer is locked or hidden.`)
        return
      }
      const next = (((selectedTemplatePiece.rotation ?? 0) + 90) % 360 + 360) % 360
      edit(updateTemplatePiece(map, selectedTemplatePiece.id, { rotation: next }))
      setStatus(`Rotated ${selectedTemplatePiece.id} to ${next}°.`)
      return
    }
    if (tool?.startsWith('template:')) {
      setTemplateRotation((value) => (value + 90) % 360)
    }
  }

  // Escape puts the brush down (no tool selected, Place Tiles off), unless a popup is open (its own Escape cancels it)
  // or a text box has focus. R / Space rotate the tile brush axis (Space also via useCamera → onRotateAxis).
  useEffect(() => {
    if (suspended) return undefined
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, select')) return
      if ((event.key === 'd' || event.key === 'D') && (event.ctrlKey || event.metaKey)) {
        if (selectedGroundItem) {
          event.preventDefault()
          duplicateSelectedGroundItem()
          return
        }
        if (!selectedDestructible) return
        event.preventDefault()
        return duplicateSelected()
      }
      if ((event.key === 'r' || event.key === 'R') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        rotateBrushAxis()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && editingPatrol && selectedNpc && selectedWaypointIndex != null) {
        event.preventDefault()
        if (!canEditLayer(layers, 'characters')) return setStatus('NPCs / Characters layer is locked or hidden.')
        edit(removePatrolWaypoint(map, selectedNpc.id, selectedWaypointIndex))
        setSelectedWaypointIndex(null)
        setMovingWaypoint(false)
        setStatus('Removed patrol waypoint.')
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedTemplatePiece) {
        event.preventDefault()
        const deleteLayer = layerOfTemplatePiece(selectedTemplatePiece.pieceId)
        if (!canEditLayer(layers, deleteLayer)) {
          return setStatus(`${LAYER_LABELS[deleteLayer] ?? deleteLayer} layer is locked or hidden.`)
        }
        edit(removeTemplatePiece(map, selectedTemplatePiece.id))
        setSelectedTemplatePieceId(null)
        setMovingTemplatePiece(false)
        setStatus(`Removed ${selectedTemplatePiece.id}.`)
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedGroundItem) {
        event.preventDefault()
        if (!canEditLayer(layers, 'furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
        edit(removeGroundItem(map, selectedGroundItem.id))
        setSelectedGroundItemId(null)
        setMovingGroundItem(false)
        setStatus(`Removed ${selectedGroundItem.id}.`)
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedFishingSpot) {
        event.preventDefault()
        if (!canEditLayer(layers, 'markers')) return setStatus('Markers / Triggers layer is locked or hidden.')
        edit(removeFishingSpot(map, selectedFishingSpot.id))
        setSelectedFishingSpotId(null)
        setMovingFishingSpot(false)
        setStatus(`Removed ${selectedFishingSpot.id}.`)
        return
      }
      if (event.key !== 'Escape') return
      if (movingWaypoint) return setMovingWaypoint(false)
      if (editingPatrol) {
        setEditingPatrol(false)
        setSelectedWaypointIndex(null)
        return
      }
      if (linkingDestructible) return setLinkingDestructible(false)
      if (movingDestructible) return setMovingDestructible(false)
      if (movingGroundItem) return setMovingGroundItem(false)
      if (movingTemplatePiece) return setMovingTemplatePiece(false)
      if (movingFishingSpot) return setMovingFishingSpot(false)
      if (placingObject) return setPlacingObject(false)
      if (editingObjectCovers) return setEditingObjectCovers(false)
      if (placingObjective !== null) {
        if (placingFromEditor) onObjectivePlaced(placingObjective)
        setPlacingObjective(null)
        setPlacingFromEditor(false)
        return
      }
      // Move: Esc puts a carried object back without placing, then turns the tool off.
      if (moveFrom) {
        setMoveFrom(null)
        setStatus('Move cancelled.')
        return
      }
      setTool(null)
      setPlacing(false)
      setMoving(false)
      setMoveFrom(null)
      setMovingNpc(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Patrol edit: click a waypoint of the selected NPC to select it, or an empty floor tile to append one; Move Waypoint
  // relocates the selected point.
  const onPatrolEdit = (position) => {
    if (!selectedNpc) return false
    if (!canEditLayer(layers, 'characters')) {
      setStatus('NPCs / Characters layer is locked or hidden.')
      return true
    }
    const patrol = selectedNpc.patrol ?? []
    if (movingWaypoint && selectedWaypointIndex != null) {
      const moved = updatePatrolWaypoint(map, selectedNpc.id, selectedWaypointIndex, { at: position })
      if (moved === map) setStatus('Patrol waypoints stand on free floor tiles.')
      else {
        edit(moved)
        setStatus(`Moved W${selectedWaypointIndex + 1} to (${position.x}, ${position.y}).`)
      }
      setMovingWaypoint(false)
      return true
    }
    const hit = patrol.findIndex((point) => point.at.x === position.x && point.at.y === position.y)
    if (hit >= 0) {
      setSelectedWaypointIndex(hit)
      setStatus(`Selected W${hit + 1}.`)
      return true
    }
    if (editingPatrol) {
      const next = addPatrolWaypoint(map, selectedNpc.id, position)
      if (!next) {
        setStatus('Patrol waypoints stand on free floor tiles.')
        return true
      }
      edit(next)
      const count = next.npcs.find((npc) => npc.id === selectedNpc.id)?.patrol?.length ?? 0
      setSelectedWaypointIndex(count > 0 ? count - 1 : null)
      setStatus(`Added W${count} at (${position.x}, ${position.y}).`)
      return true
    }
    return false
  }

  // The NPC tool: click an NPC to select it, an empty floor tile to place a new one (or, while moving, to move the
  // selected one there).
  const onNpcTool = (position) => {
    if (onPatrolEdit(position)) return
    if (movingNpc && selectedNpc) {
      const moved = updateNpc(map, selectedNpc.id, { position })
      if (moved === map) setStatus('NPCs stand on free floor tiles.')
      edit(moved)
      setMovingNpc(false)
      setSelectedMarker(null)
      return
    }
    const existing = npcAt(map, position)
    setSelectedMarker(null)
    if (existing) {
      setSelectedNpcId(existing.id)
      setSelectedWaypointIndex(null)
      setMovingWaypoint(false)
      return
    }
    if (editingPatrol) return
    const characterId = pendingCharacterId || listAuthoredCharacters()[0]?.id || null
    const placed = placeNpc(map, position, characterId)
    if (!placed) return setStatus('NPCs stand on free floor tiles.')
    edit(placed.map)
    setSelectedNpcId(placed.npc.id)
    setPendingCharacterId(null)
    setEditingPatrol(false)
    setSelectedWaypointIndex(null)
  }

  const layerAllowsTool = (layerId) => canEditLayer(layers, layerId)


  const clearSelectionModes = () => {
    setPlacingObject(false)
    setEditingObjectCovers(false)
    setMovingNpc(false)
    setMovingDestructible(false)
    setLinkingDestructible(false)
    setMovingGroundItem(false)
    setMovingTemplatePiece(false)
    setMovingFishingSpot(false)
  }

  const clearBoardSelection = () => {
    setSelectedDestructibleId(null)
    setMovingDestructible(false)
    setLinkingDestructible(false)
    setSelectedHazardId(null)
    setSelectedNpcId(null)
    setSelectedMarker(null)
    setSelectedObjectId(null)
    setPlacingObject(false)
    setEditingObjectCovers(false)
    setMovingNpc(false)
    setEditingPatrol(false)
    setSelectedWaypointIndex(null)
    setMovingWaypoint(false)
    setSelectedGroundItemId(null)
    setMovingGroundItem(false)
    setSelectedTemplatePieceId(null)
    setMovingTemplatePiece(false)
    setSelectedFishingSpotId(null)
    setMovingFishingSpot(false)
  }

  const applyCandidate = (candidate, position) => {
    setSelectedNpcId(candidate?.kind === 'npc' ? candidate.npc.id : null)
    setSelectedMarker(
      isCharacterSpawnKind(candidate?.kind) ? { kind: candidate.kind, x: position.x, y: position.y } : null,
    )
    setSelectedObjectId(candidate?.kind === 'object' ? candidate.object.id : null)
    setSelectedDestructibleId(candidate?.kind === 'destructible' ? candidate.destructible.id : null)
    setSelectedHazardId(candidate?.kind === 'hazard' ? candidate.hazard.id : null)
    setSelectedGroundItemId(candidate?.kind === 'groundItem' ? candidate.groundItem.id : null)
    setSelectedTemplatePieceId(candidate?.kind === 'templatePiece' ? candidate.templatePiece.id : null)
    setSelectedFishingSpotId(candidate?.kind === 'fishingSpot' ? candidate.fishingSpot.id : null)
    if (candidate?.kind !== 'npc') {
      setEditingPatrol(false)
      setSelectedWaypointIndex(null)
      setMovingWaypoint(false)
    }
  }

  // A click with no marker tool held (Place Tiles and Move off): select what stands on the tile for editing.
  // Layer-aware: hidden/locked layers are skipped; active layer is preferred; repeat clicks cycle candidates.
  const selectAt = (position, boardPoint = null) => {
    if (editingPatrol || movingWaypoint) {
      if (onPatrolEdit(position)) return
    }
    clearSelectionModes()
    const all = selectionCandidates(map, objectDefinitions, position, { cellPx: itemGridSize, boardPoint })
    const editable = all.filter((candidate) => {
      if (!candidate.layer) return true
      return canEditLayer(layers, candidate.layer)
    })
    if (!editable.length) {
      applyCandidate(null, position)
      return
    }
    // Spawns / NPCs share a cell with the floor tile (and often furniture). First click always takes the spawn/NPC;
    // further clicks cycle (Move already prefers markers the same way).
    const characterCandidates = editable.filter(
      (candidate) => candidate.kind === 'npc' || isCharacterSpawnKind(candidate.kind),
    )
    const isCharacterSelected = characterCandidates.some((candidate) => {
      if (candidate.kind === 'npc') return candidate.npc.id === selectedNpcId
      return selectedMarker?.kind === candidate.kind && selectedMarker.x === position.x && selectedMarker.y === position.y
    })
    if (characterCandidates.length && !isCharacterSelected) {
      applyCandidate(characterCandidates[0], position)
      return
    }
    const drawnItem = editable.find((candidate) => candidate.kind === 'groundItem' || candidate.kind === 'templatePiece')
    if (boardPoint && drawnItem && !characterCandidates.length) {
      applyCandidate(drawnItem, position)
      return
    }
    const priority = selectionPriority(layers?.active)
    const ranked = [...editable].sort((a, b) => {
      const aChar = a.kind === 'npc' || isCharacterSpawnKind(a.kind)
      const bChar = b.kind === 'npc' || isCharacterSpawnKind(b.kind)
      if (aChar !== bChar) return aChar ? -1 : 1
      const ai = priority.indexOf(a.layer)
      const bi = priority.indexOf(b.layer)
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    })
    // Cycle when the click is on the same tile as the current selection.
    const currentIndex = ranked.findIndex((candidate) => {
      if (candidate.kind === 'npc') return candidate.npc.id === selectedNpcId
      if (candidate.kind === 'object') return candidate.object.id === selectedObjectId
      if (candidate.kind === 'destructible') return candidate.destructible.id === selectedDestructibleId
      if (candidate.kind === 'hazard') return candidate.hazard.id === selectedHazardId
      if (candidate.kind === 'groundItem') return candidate.groundItem.id === selectedGroundItemId
      if (candidate.kind === 'templatePiece') return candidate.templatePiece.id === selectedTemplatePieceId
      if (candidate.kind === 'fishingSpot') return candidate.fishingSpot.id === selectedFishingSpotId
      if (isCharacterSpawnKind(candidate.kind)) {
        return selectedMarker?.kind === candidate.kind && selectedMarker.x === position.x && selectedMarker.y === position.y
      }
      return false
    })
    const next = ranked[(currentIndex + 1) % ranked.length]
    applyCandidate(next, position)
  }

  // The destructible tools: click a destructible to select it, a free floor tile to place one of the held type.
  const onDestructibleTool = (position, type) => {
    const existing = destructibleAt(map, position)
    if (existing) return setSelectedDestructibleId(existing.id)
    const placed = placeDestructible(map, position, type, objectTiles)
    if (!placed) return setStatus('Destructible objects stand on free floor tiles (not under a challenge object).')
    edit(placed.map)
    setSelectedDestructibleId(placed.object.id)
    setSelectedHazardId(null)
    setStatus(`Placed ${DESTRUCTIBLE_TYPES[type].name} (${placed.object.id}). Ctrl+D duplicates it.`)
  }

  // Inventory tools: a click places where the pointer is, including on top of an item. A successful place leaves the
  // brush selected and does not outline the new item. A click that cannot place selects the item under the pointer
  // so a full spot can still be inspected.
  const onInventoryTool = (position, itemId, boardPoint = null) => {
    const placed = placeGroundItem(map, position, itemId, itemGridSize)
    if (!placed) {
      const existing = boardPoint
        ? groundItemAtBoard(map, boardPoint)
        : groundItemAt(map, position, { cellPx: itemGridSize })
      if (existing) {
        setSelectedGroundItemId(existing.id)
        setSelectedTemplatePieceId(null)
        setSelectedDestructibleId(null)
        setSelectedHazardId(null)
        setSelectedNpcId(null)
        setSelectedMarker(null)
        setSelectedObjectId(null)
        return
      }
      return setStatus(`Inventory objects need a free floor cell (${itemGridSize}px grid).`)
    }
    edit(placed.map)
    setSelectedGroundItemId(null)
    setSelectedTemplatePieceId(null)
    setSelectedDestructibleId(null)
    setSelectedHazardId(null)
    const def = getItemById(itemId)
    setStatus(`Placed ${def?.name ?? itemId} (${placed.object.id}).`)
  }

  // Template Piece tools: snap to the guide grid. Paste overwrites the same tip or the sprite under the pointer only.
  // Returns true when a placement landed (used by the multi-brush cycle).
  const onTemplateTool = (position, pieceId, boardPoint = null) => {
    const target = boardPoint ? templatePieceTargetAt(boardPoint, itemGridSize) : position
    const hit = boardPoint ? templatePieceAtBoard(map, boardPoint) : null
    const placed = placeTemplatePiece(map, target, pieceId, itemGridSize, {
      rotation: templateRotation,
      replaceIds: hit ? [hit.id] : null,
    })
    if (!placed) {
      setStatus(`Template pieces need a cell on the map (${itemGridSize}px grid).`)
      return false
    }
    edit(placed.map)
    setSelectedTemplatePieceId(null)
    setSelectedGroundItemId(null)
    setSelectedDestructibleId(null)
    setSelectedHazardId(null)
    const def = getTemplatePiece(pieceId)
    setStatus(`Placed ${def?.label ?? pieceId} (${placed.object.id}).`)
    return true
  }

  // boardPoint: the pointer in board px (EditorBoard), for picking items drawn on raised surfaces.
  const onPaint = (position, { first, boardPoint = null }) => {
    if (first) beginStroke?.()
    if ((editingPatrol || movingWaypoint) && selectedNpc && first) {
      if (onPatrolEdit(position)) return
    }
    // Auto-Paint: paint floor footprint and rebuild 32px template walls around it.
    if (tool === 'autoPaint') {
      if (!placing) {
        if (first) selectAt(position, boardPoint)
        return
      }
      if (!layerAllowsTool('ground') || !layerAllowsTool('walls')) {
        return setStatus('Ground and Walls layers must be visible and unlocked for Auto-Paint.')
      }
      const result = autoPaintFloorCell(map, position, autoPaintRulesetId)
      if (result.error) setStatus(result.error)
      else if (result.map !== map) {
        edit(result.map)
        if (first) setStatus(`Auto-Paint: ${getAutoPaintRuleset(autoPaintRulesetId)?.label ?? autoPaintRulesetId}`)
      }
      return
    }
    // Picking linked tiles: each click adds or removes one (a force-field generator's field).
    if (linkingDestructible && selectedDestructible) {
      if (!first) return
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const linked = selectedDestructible.linkedTiles ?? []
      const has = linked.some((tile) => tile.x === position.x && tile.y === position.y)
      const linkedTiles = has ? linked.filter((tile) => tile.x !== position.x || tile.y !== position.y) : [...linked, position]
      edit(updateDestructible(map, selectedDestructible.id, { linkedTiles: linkedTiles.length ? linkedTiles : null }))
      setStatus(`${has ? 'Unlinked' : 'Linked'} (${position.x}, ${position.y}) ${has ? 'from' : 'to'} ${selectedDestructible.id}.`)
      return
    }
    if (movingDestructible && selectedDestructible) {
      if (!first) return
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const moved = moveDestructible(map, selectedDestructible.id, position, objectTiles)
      if (moved === map) setStatus('Destructible objects stand on free floor tiles (not under a challenge object).')
      edit(moved)
      setMovingDestructible(false)
      return
    }
    if (movingGroundItem && selectedGroundItem) {
      if (!first) return
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const moved = moveGroundItem(map, selectedGroundItem.id, position, itemGridSize, boardPoint)
      if (moved === map) setStatus(`Inventory objects need a free floor cell (${itemGridSize}px grid).`)
      else edit(moved)
      setMovingGroundItem(false)
      return
    }
    if (movingFishingSpot && selectedFishingSpot) {
      if (!first) return
      if (!layerAllowsTool('markers')) return setStatus('Markers / Triggers layer is locked or hidden.')
      const moved = moveFishingSpot(map, selectedFishingSpot.id, position)
      if (moved.map === map) setStatus('That tile already has a Fishing Spot.')
      else {
        edit(moved.map)
        if (moved.warn) setStatus(`Moved ${selectedFishingSpot.id}. Warning: ${moved.warn}`)
      }
      setMovingFishingSpot(false)
      return
    }
    if (movingTemplatePiece && selectedTemplatePiece) {
      if (!first) return
      const moveLayer = layerOfTemplatePiece(selectedTemplatePiece.pieceId)
      if (!layerAllowsTool(moveLayer)) {
        return setStatus(`${LAYER_LABELS[moveLayer] ?? moveLayer} layer is locked or hidden.`)
      }
      const target = boardPoint ? templatePieceTargetAt(boardPoint, itemGridSize) : position
      const moved = moveTemplatePiece(map, selectedTemplatePiece.id, target, itemGridSize)
      if (moved === map) setStatus(`Template pieces need a cell on the map (${itemGridSize}px grid).`)
      else edit(moved)
      setMovingTemplatePiece(false)
      return
    }
    // Move must win over an active Template / Inventory / tile brush — those tools stay selected in the
    // palette while Move is on, and previously stole the click so P/E/C markers could not be picked up.
    if (moving) {
      if (!first) return
      // Click-to-place when already carrying; click-to-pick otherwise (not drag-drop).
      if (moveFrom) {
        placeMoved(position, boardPoint)
        return
      }
      // Markers before sprite hits: Template Pieces often cover the floor cell a P/E/H/N marker sits on.
      if (hasMarkers(map, position)) {
        const markerLayers = markerLayersAt(map, position)
        const blocked = markerLayers.find((layerId) => !layerAllowsTool(layerId))
        if (blocked) {
          return setStatus(
            `${blocked === 'characters' ? 'NPCs / Characters' : 'Markers / Triggers'} layer is locked or hidden.`,
          )
        }
        selectAt(position, boardPoint)
        setMoveFrom({
          x: position.x,
          y: position.y,
          markers: true,
          challengeObject: null,
          destructible: null,
          groundItem: null,
          templatePiece: null,
        })
        setStatus('Carrying markers. Click to place · Esc cancels.')
        return
      }
      // Challenge C markers (furniture layer) before Template Pieces that cover the same cell.
      const hitChallenge = objectDefinitions.find(
        (definition) => definition.position[0] === position.x && definition.position[1] === position.y,
      )
      if (hitChallenge) {
        if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
        selectAt(position, boardPoint)
        setMoveFrom({
          x: position.x,
          y: position.y,
          markers: false,
          challengeObject: hitChallenge.id,
          destructible: null,
          groundItem: null,
          templatePiece: null,
        })
        setStatus(`Carrying ${hitChallenge.name ?? hitChallenge.id}. Click to place · Esc cancels.`)
        return
      }
      const hitTemplate = boardPoint ? templatePieceAtBoard(map, boardPoint) : templatePieceAt(map, position, { cellPx: itemGridSize })
      if (hitTemplate) {
        const moveLayer = layerOfTemplatePiece(hitTemplate.pieceId)
        if (!layerAllowsTool(moveLayer)) return setStatus(`${LAYER_LABELS[moveLayer] ?? moveLayer} layer is locked or hidden.`)
        selectAt(position, boardPoint)
        setMoveFrom({
          x: position.x,
          y: position.y,
          templatePiece: hitTemplate.id,
          markers: false,
          challengeObject: null,
          destructible: null,
          groundItem: null,
        })
        setStatus(`Carrying ${hitTemplate.id}. Click to place · Esc cancels.`)
        return
      }
      const hitItem = boardPoint ? groundItemAtBoard(map, boardPoint) : groundItemAt(map, position, { cellPx: itemGridSize })
      if (hitItem) {
        if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
        selectAt(position, boardPoint)
        setMoveFrom({
          x: position.x,
          y: position.y,
          groundItem: hitItem.id,
          markers: false,
          challengeObject: null,
          destructible: null,
          templatePiece: null,
        })
        setStatus(`Carrying ${hitItem.id}. Click to place · Esc cancels.`)
        return
      }
      const dest = destructibleAt(map, position)
      if (dest) {
        if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
        selectAt(position, boardPoint)
        setMoveFrom({
          ...position,
          markers: false,
          challengeObject: null,
          destructible: dest.id,
          groundItem: null,
          templatePiece: null,
        })
        setStatus(`Carrying ${dest.id}. Click to place · Esc cancels.`)
        return
      }
      const tileId = map.tiles[position.y]?.[position.x]
      if (tileId == null || isEmptyTile(tileId)) {
        selectAt(position, boardPoint)
        return
      }
      const assembly = cellAssemblyLayers(map, position, objectDefinitions)
      const priority = selectionPriority(layers?.active)
      const pick =
        priority.find((layerId) => assembly.includes(layerId) && layerAllowsTool(layerId)) ??
        assembly.find((layerId) => layerAllowsTool(layerId)) ??
        assembly[0] ??
        layerOfTile(tileId)
      if (pick && !layerAllowsTool(pick)) return setStatus(`${LAYER_LABELS[pick] ?? pick} layer is locked or hidden.`)
      selectAt(position, boardPoint)
      setMoveFrom({
        ...position,
        markers: false,
        challengeObject: null,
        destructible: null,
        groundItem: null,
        templatePiece: null,
      })
      setStatus(`Carrying ${getTile(tileId)?.label ?? tileId}. Click to place · Esc cancels.`)
      return
    }
    if (tool?.startsWith('inventory:')) {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      if (first) {
        onInventoryTool(position, tool.slice('inventory:'.length), boardPoint)
      }
      return
    }
    if (tool?.startsWith('template:')) {
      const preferredId = tool.slice('template:'.length)
      const ordered = orderedPaintTemplateIds(paintTemplateIds)
      const cycleIds = ordered.length ? ordered : preferredId ? [preferredId] : []
      if (!cycleIds.length) return
      if (first) {
        const preferredAt = cycleIds.indexOf(preferredId)
        paintTemplateCycleRef.current = preferredAt >= 0 ? preferredAt : 0
        lastTemplateTipRef.current = null
      }
      const pieceId = cycleIds[paintTemplateCycleRef.current % cycleIds.length]
      const brushLayer = layerOfTemplatePiece(pieceId)
      if (!layerAllowsTool(brushLayer)) {
        return setStatus(`${LAYER_LABELS[brushLayer] ?? brushLayer} layer is locked or hidden.`)
      }
      const target = boardPoint ? templatePieceTargetAt(boardPoint, itemGridSize) : position
      const tipKey = templateTipKey(target, itemGridSize)
      // One place per guide-grid tip while dragging (same tip would otherwise spam-replace and advance the cycle).
      if (!first && tipKey === lastTemplateTipRef.current) return
      if (!onTemplateTool(position, pieceId, boardPoint)) return
      lastTemplateTipRef.current = tipKey
      if (cycleIds.length > 1) {
        paintTemplateCycleRef.current = (paintTemplateCycleRef.current + 1) % cycleIds.length
        const nextId = cycleIds[paintTemplateCycleRef.current]
        if (nextId && `template:${nextId}` !== tool) setTool(`template:${nextId}`)
      }
      return
    }
    if (tool?.startsWith('destructible:')) {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      if (first) onDestructibleTool(position, tool.slice('destructible:'.length))
      return
    }
    // The hazard brushes paint (or erase) every tile dragged over. Visibility/lock follows Furniture.
    if (tool === 'fishingSpot') {
      if (!first) return
      if (!layerAllowsTool('markers')) return setStatus('Markers / Triggers layer is locked or hidden.')
      const existing = fishingSpotAt(map, position)
      if (existing) {
        clearBoardSelection()
        setSelectedFishingSpotId(existing.id)
        return
      }
      const placed = placeFishingSpot(map, position)
      if (!placed) return setStatus('A Fishing Spot is already on that tile.')
      edit(placed.map)
      clearBoardSelection()
      setSelectedFishingSpotId(placed.spot.id)
      setStatus(
        placed.warn
          ? `Placed ${placed.spot.id}. Warning: ${placed.warn}`
          : `Placed Fishing Spot (${placed.spot.id}).`,
      )
      return
    }
    if (tool?.startsWith('hazard:')) {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const painted = paintHazardTile(map, position, tool.slice('hazard:'.length), hazardIntensity)
      if (painted !== map) edit(painted)
      setSelectedHazardId(hazardRegionAt(painted, position)?.id ?? null)
      setSelectedDestructibleId(null)
      return
    }
    if (tool === 'hazardErase') {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const erased = eraseHazardTile(map, position)
      if (erased !== map) edit(erased)
      return
    }
    if (placingObject && selectedObject) {
      if (!first) return
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      if (isEmptyTile(map.tiles[position.y][position.x])) return setStatus('Challenge objects must be placed on a map tile.')
      edit({ ...map, objectPlacements: { ...(map.objectPlacements ?? {}), [selectedObject.id]: position } })
      setPlacingObject(false)
      setStatus(`Moved ${selectedObject.name} to (${position.x}, ${position.y}).`)
      return
    }
    if (editingObjectCovers && selectedObject) {
      if (!first) return
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const [ox, oy] = selectedObject.position
      if (position.x === ox && position.y === oy) {
        setStatus('The object tile itself cannot be a cover.')
        return
      }
      edit(updateMapObject(map, selectedObject.id, (object) => toggleCover(object, [position.x, position.y])))
      return
    }
    if (placingObjective !== null) {
      if (!first) return
      if (!layerAllowsTool('markers')) return setStatus('Markers / Triggers layer is locked or hidden.')
      if (isEmptyTile(map.tiles[position.y][position.x])) return setStatus('Objective markers must be placed on a map tile.')
      edit({ ...map, objectives: map.objectives.map((objective, index) => (index === placingObjective ? { ...objective, position } : objective)) })
      if (placingFromEditor) onObjectivePlaced(placingObjective)
      setPlacingObjective(null)
      setPlacingFromEditor(false)
      return
    }
    if (tool === 'eraseFloor') {
      if (!layerAllowsTool('ground')) return setStatus('Ground / Floors layer is locked or hidden.')
      const result = paintFloor(map, position, NULL_TILE, objectDefinitions)
      if (result.error) setStatus(result.error)
      else if (result.map !== map) edit(result.map)
      return
    }
    if (tool === 'eraseStructure') {
      const tileLayer = layerOfTile(map.tiles[position.y][position.x])
      const eraseLayer = tileLayer === 'furniture' ? 'furniture' : 'walls'
      if (!layerAllowsTool(eraseLayer)) {
        return setStatus('That layer is locked or hidden.')
      }
      const result = eraseStructure(map, position)
      if (result.error) setStatus(result.error)
      else if (result.map !== map) {
        // Suppress Auto-Paint rebuild on this cell when the erased wall was Auto-Paint-owned.
        edit(noteAutoPaintWallCleared(result.map, position))
      }
      return
    }
    if (!tool || tool.startsWith('tile:')) {
      if (tool && placing) {
        const preferredId = tool.slice('tile:'.length)
        const ordered = orderedPaintTileIds(paintTileIds)
        const cycleIds = ordered.length ? ordered : preferredId ? [preferredId] : []
        if (!cycleIds.length) return
        if (first) {
          const preferredAt = cycleIds.indexOf(preferredId)
          paintCycleRef.current = preferredAt >= 0 ? preferredAt : 0
        }
        const tileId = cycleIds[paintCycleRef.current % cycleIds.length]
        const tileLayer = layerOfTile(tileId)
        if (!layerAllowsTool(tileLayer)) return setStatus(`${tileLayer} layer is locked or hidden.`)
        let didPaint = false
        // Ground-layer tiles use paintFloor so walls keep their floorUnder memory.
        if (tileLayer === 'ground') {
          const result = paintFloor(map, position, tileId, objectDefinitions)
          if (result.error) setStatus(result.error)
          else if (result.map !== map) {
            edit(result.map)
            didPaint = true
          }
        } else {
          const painted = paintBrush(map, position, tileId, rotated, objectDefinitions)
          if (painted === map) {
            const currentId = map.tiles[position.y][position.x]
            if (layerOfTile(currentId) === tileLayer && tileLayer !== 'ground' && currentId !== tileId) {
              setStatus(`Cannot overwrite ${tileLayer} with another ${tileLayer} tile — erase first.`)
            } else if (getTile(tileId).solid && dependentsAt(map, position, objectDefinitions).some((entry) => entry.kind !== 'prop' && entry.kind !== 'object')) {
              setStatus('Move or remove the occupants before painting a solid tile.')
            }
          } else {
            edit(painted)
            didPaint = true
          }
        }
        // Advance the multi-brush so the next cell (and ghost) flips to the next checked tile.
        if (didPaint && cycleIds.length > 1) {
          paintCycleRef.current = (paintCycleRef.current + 1) % cycleIds.length
          const nextId = cycleIds[paintCycleRef.current]
          if (nextId && `tile:${nextId}` !== tool) setTool(`tile:${nextId}`)
        }
      } else if (first) selectAt(position, boardPoint)
      return
    }
    // Marker tools act on the pressed tile only, not on every tile dragged over.
    if (!first) return
    if (tool === 'npcs') {
      if (!layerAllowsTool('characters')) return setStatus('NPCs / Characters layer is locked or hidden.')
      onNpcTool(position)
    } else if (tool === 'erase') {
      const characters = layerAllowsTool('characters')
      const markers = layerAllowsTool('markers')
      if (!characters && !markers) {
        return setStatus('Characters and Markers layers are locked or hidden.')
      }
      edit(eraseMarkers(map, position, { characters, markers }))
    } else if (tool === 'area') {
      if (!layerAllowsTool('markers')) return setStatus('Markers / Triggers layer is locked or hidden.')
      const current = areaAt(map, position)?.name ?? ''
      askText({
        title: current ? 'Edit Area Label' : 'New Area Label',
        initialValue: current,
        placeholder: 'e.g. Tool Shed',
        removeLabel: current ? 'Remove' : null,
      }).then((name) => name !== null && edit(setAreaLabel(map, position, name)))
    } else if (isCharacterSpawnKind(tool)) {
      if (!layerAllowsTool('characters')) return setStatus('NPCs / Characters layer is locked or hidden.')
      const standingKind = CHARACTER_SPAWN_KINDS.find((kind) =>
        (map.markers[kind] ?? []).some((marker) => marker.x === position.x && marker.y === position.y),
      )
      if (standingKind) {
        // Click any existing spawn to edit it (even if another spawn brush is held). Erase / Delete removes it.
        setSelectedNpcId(null)
        setSelectedObjectId(null)
        setSelectedDestructibleId(null)
        setSelectedHazardId(null)
        setSelectedGroundItemId(null)
        setSelectedTemplatePieceId(null)
        setSelectedMarker({ kind: standingKind, x: position.x, y: position.y })
        setStatus('Editing marker — Properties tab (facing, roam). Erase Marker or Delete removes it.')
        return
      }
      const list = map.markers[tool] ?? []
      if (tool === 'playerStarts' && list.length >= MAX_AWAY_TEAM) {
        setStatus(`A map holds ${MAX_AWAY_TEAM} player starts.`)
        return
      }
      edit(toggleMarker(map, tool, position))
      setSelectedNpcId(null)
      setSelectedObjectId(null)
      setSelectedDestructibleId(null)
      setSelectedHazardId(null)
      setSelectedGroundItemId(null)
      setSelectedTemplatePieceId(null)
      setSelectedMarker({ kind: tool, x: position.x, y: position.y })
      setStatus('Placed marker — Properties tab (facing, roam).')
    } else {
      edit(toggleMarker(map, tool, position))
    }
  }

  /** Place whatever Move is carrying at position; clears the carry on success or same-cell put-back. */
  const placeMoved = (position, boardPoint = null) => {
    const from = moveFrom
    if (!from || !position) return
    if (from.templatePiece) {
      const piece = (map.templatePiecePlacements ?? []).find((entry) => entry.id === from.templatePiece)
      const moveLayer = layerOfTemplatePiece(piece?.pieceId)
      if (!layerAllowsTool(moveLayer)) return setStatus(`${LAYER_LABELS[moveLayer] ?? moveLayer} layer is locked or hidden.`)
      const target = boardPoint ? templatePieceTargetAt(boardPoint, itemGridSize) : position
      if (piece && target.x === piece.position.x && target.y === piece.position.y) {
        setMoveFrom(null)
        setStatus('Put back.')
        return
      }
      const moved = moveTemplatePiece(map, from.templatePiece, target, itemGridSize)
      if (moved === map) return setStatus(`Template pieces need a cell on the map (${itemGridSize}px grid).`)
      setMoveFrom(null)
      edit(moved)
      setStatus(`Moved ${from.templatePiece}.`)
      return
    }
    if (from.groundItem) {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const item = (map.groundItemPlacements ?? []).find((entry) => entry.id === from.groundItem)
      const moved = moveGroundItem(map, from.groundItem, position, itemGridSize, boardPoint)
      if (moved === map) {
        if (item && position.x === from.x && position.y === from.y) {
          setMoveFrom(null)
          setStatus('Put back.')
          return
        }
        return setStatus(`Inventory objects need a free floor cell (${itemGridSize}px grid).`)
      }
      setMoveFrom(null)
      edit(moved)
      setStatus(`Moved ${from.groundItem}.`)
      return
    }
    if (from.challengeObject) {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const dest = { x: Math.round(position.x), y: Math.round(position.y) }
      if (dest.x === from.x && dest.y === from.y) {
        setMoveFrom(null)
        setStatus('Put back.')
        return
      }
      if (isEmptyTile(map.tiles[dest.y]?.[dest.x])) {
        return setStatus('Challenge objects must be placed on a map tile.')
      }
      const occupied = objectDefinitions.find(
        (definition) =>
          definition.id !== from.challengeObject &&
          definition.position[0] === dest.x &&
          definition.position[1] === dest.y,
      )
      if (occupied) return setStatus('That tile already has a challenge object.')
      const definition = objectDefinitions.find((entry) => entry.id === from.challengeObject)
      setMoveFrom(null)
      edit({ ...map, objectPlacements: { ...(map.objectPlacements ?? {}), [from.challengeObject]: dest } })
      setStatus(`Moved ${definition?.name ?? from.challengeObject} to (${dest.x}, ${dest.y}).`)
      return
    }
    const destCell = { x: Math.round(position.x), y: Math.round(position.y) }
    // Same tile: put back without swapping.
    if (destCell.x === from.x && destCell.y === from.y) {
      setMoveFrom(null)
      setStatus('Put back.')
      return
    }
    if (from.destructible) {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const moved = moveDestructible(map, from.destructible, destCell, objectTiles)
      if (moved === map) return setStatus('Destructible objects stand on free floor tiles (not under a challenge object).')
      setMoveFrom(null)
      edit(moved)
      setStatus(`Moved ${from.destructible} to (${destCell.x}, ${destCell.y}).`)
      return
    }
    if (from.markers) {
      const blockedLayer = markerLayersAt(map, from).find((layerId) => !layerAllowsTool(layerId))
      if (blockedLayer) {
        return setStatus(
          `${blockedLayer === 'characters' ? 'NPCs / Characters' : 'Markers / Triggers'} layer is locked or hidden.`,
        )
      }
      const moved = moveMarkers(map, from, destCell)
      if (moved.error) return setStatus(moved.error)
      setMoveFrom(null)
      edit(moved.map)
      setStatus(`Moved markers from (${from.x}, ${from.y}) to (${destCell.x}, ${destCell.y}).`)
      return
    }
    const blockedLayer = [...cellAssemblyLayers(map, from, objectDefinitions), ...cellAssemblyLayers(map, destCell, objectDefinitions)].find(
      (layerId) => !layerAllowsTool(layerId),
    )
    if (blockedLayer) return setStatus('A layer in that tile assembly is locked or hidden.')
    const [fromTile, toTile] = [map.tiles[from.y][from.x], map.tiles[destCell.y][destCell.x]]
    const swapped = swapTilesWithObjects(map, from, destCell, objectDefinitions)
    if (swapped.error) return setStatus(swapped.error)
    setMoveFrom(null)
    edit(swapped.map)
    setStatus(
      `Swapped ${getTile(fromTile).label} (${from.x}, ${from.y}) with ${getTile(toTile).label} (${destCell.x}, ${destCell.y})${swapped.carried.length ? ', with its challenge object' : ''}.`,
    )
  }

  // Move places on click (placeMoved), not on pointer-up.
  const onPaintEnd = () => {
    endStroke?.()
    lastTemplateTipRef.current = null
  }

  /**
   * Right-click delete under the pointer (paint / move / template / inventory brushes).
   * Same hit order as Move pick: Template Piece → inventory item → destructible → markers.
   * @returns {boolean} true when something was removed or a locked-layer message was shown.
   */
  const deleteObjectUnderPointer = (position, boardPoint = null) => {
    const hitTemplate = boardPoint
      ? templatePieceAtBoard(map, boardPoint)
      : position
        ? templatePieceAt(map, position, { cellPx: itemGridSize })
        : null
    if (hitTemplate) {
      const eraseLayer = layerOfTemplatePiece(hitTemplate.pieceId)
      if (!layerAllowsTool(eraseLayer)) {
        setStatus(`${LAYER_LABELS[eraseLayer] ?? eraseLayer} layer is locked or hidden.`)
        return true
      }
      edit(removeTemplatePiece(map, hitTemplate.id))
      if (selectedTemplatePieceId === hitTemplate.id) {
        setSelectedTemplatePieceId(null)
        setMovingTemplatePiece(false)
      }
      if (moveFrom?.templatePiece === hitTemplate.id) setMoveFrom(null)
      setStatus(`Removed ${hitTemplate.id}.`)
      return true
    }
    const hitItem = boardPoint
      ? groundItemAtBoard(map, boardPoint)
      : position
        ? groundItemAt(map, position, { cellPx: itemGridSize })
        : null
    if (hitItem) {
      if (!layerAllowsTool('furniture')) {
        setStatus('Furniture / Scenery layer is locked or hidden.')
        return true
      }
      edit(removeGroundItem(map, hitItem.id))
      if (selectedGroundItemId === hitItem.id) {
        setSelectedGroundItemId(null)
        setMovingGroundItem(false)
      }
      if (moveFrom?.groundItem === hitItem.id) setMoveFrom(null)
      setStatus(`Removed ${hitItem.id}.`)
      return true
    }
    if (!position) return false
    const dest = destructibleAt(map, position)
    if (dest) {
      if (!layerAllowsTool('furniture')) {
        setStatus('Furniture / Scenery layer is locked or hidden.')
        return true
      }
      edit(removeDestructible(map, dest.id))
      if (selectedDestructibleId === dest.id) {
        setSelectedDestructibleId(null)
        setMovingDestructible(false)
      }
      if (moveFrom?.destructible === dest.id) setMoveFrom(null)
      setStatus(`Removed ${dest.id}.`)
      return true
    }
    if (hasMarkers(map, position)) {
      const markerLayers = markerLayersAt(map, position)
      const blocked = markerLayers.find((layerId) => !layerAllowsTool(layerId))
      if (blocked) {
        setStatus(
          `${blocked === 'characters' ? 'NPCs / Characters' : 'Markers / Triggers'} layer is locked or hidden.`,
        )
        return true
      }
      edit(eraseMarkers(map, position, { characters: true, markers: true }))
      if (moveFrom?.markers && moveFrom.x === position.x && moveFrom.y === position.y) setMoveFrom(null)
      if (selectedMarker && selectedMarker.x === position.x && selectedMarker.y === position.y) {
        setSelectedMarker(null)
      }
      setStatus('Removed markers.')
      return true
    }
    return false
  }

  // Right click: paint / move / template / inventory delete the object under the pointer.
  // Move while carrying: cancel the carry. Place Tiles with no object under the pointer: sample the tile brush.
  // Otherwise an NPC / start / spawn turns 45°.
  const onRightClick = (position, boardPoint = null) => {
    if (moving && moveFrom) {
      setMoveFrom(null)
      setStatus('Move cancelled.')
      return
    }
    if (tool?.startsWith('template:') || tool?.startsWith('inventory:') || placing || moving) {
      if (deleteObjectUnderPointer(position, boardPoint)) return
      if (tool?.startsWith('template:') || tool?.startsWith('inventory:') || moving) return
    }
    if (!position) return
    if (!placing) {
      const turned = turnFacing(map, position)
      if (turned !== map) edit(turned)
      return
    }
    const tileId = map.tiles[position.y][position.x]
    clearBoardSelection()
    setPaintTileIds((prev) => {
      if (prev.has(tileId)) return prev
      const next = new Set(prev)
      next.add(tileId)
      return next
    })
    const ordered = orderedPaintTileIds(new Set([...paintTileIds, tileId]))
    const at = ordered.indexOf(tileId)
    paintCycleRef.current = at >= 0 ? at : 0
    setTool(`tile:${tileId}`)
    setRotated(isRotated(map, position))
    setStatus(`Brush: ${getTile(tileId).label}.`)
  }
  const onPlacingToggle = (on) => {
    setPlacing(on)
    if (on) setMoving(false)
    setMoveFrom(null)
  }
  const onMovingToggle = (on) => {
    setMoving(on)
    if (on) {
      setPlacing(false)
      setStatus('Move: click to pick up, click to place. Right-click deletes. Esc cancels.')
    }
    setMoveFrom(null)
  }

  const enableAutoPaintTool = (rulesetId = autoPaintRulesetId) => {
    clearBoardSelection()
    setTool('autoPaint')
    setPlacing(true)
    setMoving(false)
    setMoveFrom(null)
    setStatus(`Auto-Paint: ${getAutoPaintRuleset(rulesetId)?.label ?? rulesetId}. Paint floors; walls rebuild automatically.`)
  }

  const rebuildAutoPaint = (rulesetId = autoPaintRulesetId) => {
    if (!layerAllowsTool('ground') || !layerAllowsTool('walls')) {
      return setStatus('Ground and Walls layers must be visible and unlocked for Auto-Paint.')
    }
    beginStroke?.()
    const result = rebuildAutoPaintWalls(map, rulesetId)
    endStroke?.()
    if (result.error) return setStatus(result.error)
    if (result.map !== map) {
      edit(result.map)
      setStatus('Auto-Paint walls rebuilt.')
    } else setStatus('Auto-Paint: nothing to rebuild.')
  }

  // Assets thumbnail pick: clear board selection so Properties shows the catalogue asset.
  // Clicking a tile makes it the paint brush (replaces the cycle). Check more thumbs to multi-brush.
  // Does not flip Assets tabs — those stay where the designer left them.
  const selectTool = (next) => {
    clearBoardSelection()
    setTool(next)
    if (next === 'autoPaint') {
      setPlacing(true)
      setMoving(false)
      setMoveFrom(null)
      setStatus(`Auto-Paint: ${getAutoPaintRuleset(autoPaintRulesetId)?.label ?? autoPaintRulesetId}`)
      return
    }
    if (next?.startsWith('tile:')) {
      const id = next.slice('tile:'.length)
      setPaintTileIds(new Set([id]))
      paintCycleRef.current = 0
    } else if (next?.startsWith('template:')) {
      const id = next.slice('template:'.length)
      const ordered = orderedPaintTemplateIds(paintTemplateIds)
      const at = ordered.indexOf(id)
      if (at >= 0) paintTemplateCycleRef.current = at
    }
  }

  const togglePaintTile = (tileId, checked) => {
    if (!tileId) return
    setPaintTileIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(tileId)
      else next.delete(tileId)
      return next
    })
    if (checked) {
      const ordered = orderedPaintTileIds(new Set([...paintTileIds, tileId]))
      const at = ordered.indexOf(tileId)
      if (at >= 0) paintCycleRef.current = at
    }
  }

  const togglePaintTemplate = (pieceId, checked) => {
    if (!pieceId) return
    setPaintTemplateIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(pieceId)
      else next.delete(pieceId)
      return next
    })
    if (checked) {
      const ordered = orderedPaintTemplateIds(new Set([...paintTemplateIds, pieceId]))
      const at = ordered.indexOf(pieceId)
      if (at >= 0) paintTemplateCycleRef.current = at
    }
  }

  return {
    tool,
    setTool,
    selectTool,
    paintTileIds,
    togglePaintTile,
    paintTemplateIds,
    togglePaintTemplate,
    autoPaintRulesetId,
    setAutoPaintRulesetId,
    enableAutoPaintTool,
    rebuildAutoPaint,
    clearBoardSelection,
    clearLayerSelection,
    placing,
    moving,
    moveFrom,
    rotated,
    pendingCharacterId,
    setPendingCharacterId,
    placingObjective,
    // The Objective Editor's Place on Map: wait for a tile click, then reopen the editor.
    placeObjectiveFromEditor: (index) => {
      setPlacingObjective(index)
      setPlacingFromEditor(true)
    },
    objectDefinitions,
    selection: {
      npc: selectedNpc,
      object: selectedObject,
      marker: markerInspected,
      destructible: selectedDestructible,
      hazard: selectedHazard,
      groundItem: selectedGroundItem,
      templatePiece: selectedTemplatePiece,
      fishingSpot: selectedFishingSpot,
    },
    selectedNpcId,
    selectedObjectId,
    // What the board highlights for the start / spawn inspector (null once it has moved or been deleted).
    selectedMarker: markerInspected && selectedMarker,
    movingNpc,
    toggleNpcMove: () => {
      setTool('npcs')
      setEditingPatrol(false)
      setMovingWaypoint(false)
      setMovingNpc((value) => !value)
    },
    editingPatrol,
    movingWaypoint,
    selectedWaypointIndex,
    togglePatrolEdit: () => {
      setTool('npcs')
      setMovingNpc(false)
      setMovingWaypoint(false)
      setEditingPatrol((value) => {
        if (value) setSelectedWaypointIndex(null)
        return !value
      })
    },
    toggleMoveWaypoint: () => {
      if (selectedWaypointIndex == null) return
      setMovingNpc(false)
      setMovingWaypoint((value) => !value)
    },
    selectWaypoint: (index) => {
      setSelectedWaypointIndex(index)
      setMovingWaypoint(false)
    },
    clearWaypoint: () => {
      setSelectedWaypointIndex(null)
      setMovingWaypoint(false)
    },
    selectedDestructibleId: selectedDestructible?.id ?? null,
    selectedHazardId: selectedHazard?.id ?? null,
    selectedGroundItemId: selectedGroundItem?.id ?? null,
    selectedTemplatePieceId: selectedTemplatePiece?.id ?? null,
    selectedFishingSpotId: selectedFishingSpot?.id ?? null,
    templateRotation,
    movingDestructible,
    toggleDestructibleMove: () => {
      setLinkingDestructible(false)
      setMovingDestructible((value) => !value)
    },
    linkingDestructible,
    toggleDestructibleLink: () => {
      setMovingDestructible(false)
      setLinkingDestructible((value) => !value)
    },
    movingGroundItem,
    toggleGroundItemMove: () => setMovingGroundItem((value) => !value),
    movingTemplatePiece,
    toggleTemplatePieceMove: () => setMovingTemplatePiece((value) => !value),
    movingFishingSpot,
    toggleFishingSpotMove: () => setMovingFishingSpot((value) => !value),
    clearFishingSpot: () => {
      setSelectedFishingSpotId(null)
      setMovingFishingSpot(false)
    },
    duplicateDestructible: duplicateSelected,
    duplicateGroundItem: duplicateSelectedGroundItem,
    clearDestructible: () => {
      setSelectedDestructibleId(null)
      setMovingDestructible(false)
      setLinkingDestructible(false)
    },
    clearGroundItem: () => {
      setSelectedGroundItemId(null)
      setMovingGroundItem(false)
    },
    clearTemplatePiece: () => {
      setSelectedTemplatePieceId(null)
      setMovingTemplatePiece(false)
    },
    clearHazard: () => setSelectedHazardId(null),
    hazardIntensity,
    setHazardIntensity,
    clearNpc: () => {
      setSelectedNpcId(null)
      setMovingNpc(false)
      setEditingPatrol(false)
      setSelectedWaypointIndex(null)
      setMovingWaypoint(false)
    },
    placingObject,
    toggleObjectPlace: () => {
      setEditingObjectCovers(false)
      setPlacingObject((value) => !value)
    },
    editingObjectCovers,
    toggleObjectCovers: () => {
      setPlacingObject(false)
      setEditingObjectCovers((value) => !value)
    },
    clearMarker: () => setSelectedMarker(null),
    onPaint,
    onPaintEnd,
    onRightClick,
    onRotateAxis: rotateBrushAxis,
    onPlacingToggle,
    onMovingToggle,
  }
}
