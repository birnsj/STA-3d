import { canEditLayer } from '../../../maps/layers.js'
import useEditorToolState from './useEditorToolState.js'
import useToolKeys from './useToolKeys.js'
import { createQuickActions } from './quickActions.js'
import { createNpcHandlers } from './npcHandlers.js'
import { createSelectionHandlers } from './selectionHandlers.js'
import { createPlaceHandlers } from './placeHandlers.js'
import { createMoveHandlers } from './moveHandlers.js'
import { createBrushHandlers } from './brushHandlers.js'
import { createPaintHandler } from './paintHandler.js'
import { createPointerHandlers } from './pointerHandlers.js'

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
  const state = useEditorToolState({ map, boardKey })
  const layerAllowsTool = (layerId) => canEditLayer(layers, layerId)
  // One shared context: state and setters first, then each handler group adds its handlers for the ones after it.
  const ctx = { ...state, map, edit, setStatus, askText, suspended, onObjectivePlaced, itemGridSize, layers, beginStroke, endStroke, layerAllowsTool }
  Object.assign(ctx, createQuickActions(ctx))
  Object.assign(ctx, createNpcHandlers(ctx))
  Object.assign(ctx, createSelectionHandlers(ctx))
  Object.assign(ctx, createPlaceHandlers(ctx))
  Object.assign(ctx, createMoveHandlers(ctx))
  Object.assign(ctx, createBrushHandlers(ctx))
  Object.assign(ctx, createPaintHandler(ctx))
  Object.assign(ctx, createPointerHandlers(ctx))
  useToolKeys(ctx)

  const {
    autoPaintRulesetId, clearBoardSelection, clearLayerSelection, duplicateSelected,
    duplicateSelectedGroundItem, editingObjectCovers, editingPatrol, enableAutoPaintTool,
    hazardIntensity, linkingDestructible, markerInspected, moveFrom, moving, movingDestructible,
    movingFishingSpot, movingGroundItem, movingNpc, movingTemplatePiece, movingWaypoint,
    objectDefinitions, onMovingToggle, onPaint, onPaintEnd, onPlacingToggle, onRightClick,
    paintTemplateIds, paintTileIds, pendingCharacterId, placing, placingObject, placingObjective,
    rebuildAutoPaint, rotateBrushAxis, rotated, selectTool, selectedDestructible, selectedFishingSpot,
    selectedGroundItem, selectedHazard, selectedMarker, selectedNpc, selectedNpcId, selectedObject,
    selectedObjectId, selectedTemplatePiece, selectedWaypointIndex, setAutoPaintRulesetId,
    setEditingObjectCovers, setEditingPatrol, setHazardIntensity, setLinkingDestructible,
    setMovingDestructible, setMovingFishingSpot, setMovingGroundItem, setMovingNpc,
    setMovingTemplatePiece, setMovingWaypoint, setPendingCharacterId, setPlacingFromEditor,
    setPlacingObject, setPlacingObjective, setSelectedDestructibleId, setSelectedFishingSpotId,
    setSelectedGroundItemId, setSelectedHazardId, setSelectedMarker, setSelectedNpcId,
    setSelectedTemplatePieceId, setSelectedWaypointIndex, setTool, templateRotation,
    togglePaintTemplate, togglePaintTile, tool,
  } = ctx

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
