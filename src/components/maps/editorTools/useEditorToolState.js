import { useMemo, useRef, useState } from 'react'
import { isAmbientMarkerKind } from '../../../data/adaptation/exploration/ambientCreatures.js'
import { challengeDefinitionsFor } from '../../../exploration/challengeObjects.js'
import { defaultAutoPaintRulesetId } from '../../../maps/autoPaint/index.js'

// Everything the editor tools remember between clicks: the held tool, what is selected for the inspectors, the
// Move / Place modes, and the helpers that clear them. Pure state; the click behaviour lives in the handler files.
export default function useEditorToolState({ map, boardKey }) {
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

  return {
    tool,
    setTool,
    paintTileIds,
    setPaintTileIds,
    paintCycleRef,
    paintTemplateIds,
    setPaintTemplateIds,
    paintTemplateCycleRef,
    lastTemplateTipRef,
    autoPaintRulesetId,
    setAutoPaintRulesetId,
    pendingCharacterId,
    setPendingCharacterId,
    placing,
    setPlacing,
    moving,
    setMoving,
    moveFrom,
    setMoveFrom,
    rotated,
    setRotated,
    placingObjective,
    setPlacingObjective,
    placingFromEditor,
    setPlacingFromEditor,
    selectedNpcId,
    setSelectedNpcId,
    movingNpc,
    setMovingNpc,
    editingPatrol,
    setEditingPatrol,
    selectedWaypointIndex,
    setSelectedWaypointIndex,
    movingWaypoint,
    setMovingWaypoint,
    selectedMarker,
    setSelectedMarker,
    selectedObjectId,
    setSelectedObjectId,
    placingObject,
    setPlacingObject,
    editingObjectCovers,
    setEditingObjectCovers,
    selectedDestructibleId,
    setSelectedDestructibleId,
    movingDestructible,
    setMovingDestructible,
    linkingDestructible,
    setLinkingDestructible,
    selectedHazardId,
    setSelectedHazardId,
    hazardIntensity,
    setHazardIntensity,
    selectedGroundItemId,
    setSelectedGroundItemId,
    movingGroundItem,
    setMovingGroundItem,
    selectedTemplatePieceId,
    setSelectedTemplatePieceId,
    movingTemplatePiece,
    setMovingTemplatePiece,
    selectedFishingSpotId,
    setSelectedFishingSpotId,
    movingFishingSpot,
    setMovingFishingSpot,
    templateRotation,
    setTemplateRotation,
    selectedNpc,
    markerInspected,
    objectDefinitions,
    selectedObject,
    selectedDestructible,
    selectedHazard,
    selectedGroundItem,
    selectedTemplatePiece,
    selectedFishingSpot,
    clearLayerSelection,
    objectTiles,
    clearSelectionModes,
    clearBoardSelection,
  }
}
