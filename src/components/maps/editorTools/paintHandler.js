import { MAX_AWAY_TEAM } from '../../../exploration/awayTeam.js'
import {
  areaAt,
  dependentsAt,
  eraseHazardTile,
  eraseMarkers,
  eraseStructure,
  fishingSpotAt,
  hazardRegionAt,
  moveDestructible,
  moveFishingSpot,
  moveGroundItem,
  moveTemplatePiece,
  paintBrush,
  paintFloor,
  paintHazardTile,
  placeFishingSpot,
  setAreaLabel,
  templatePieceTargetAt,
  templateTipKey,
  toggleMarker,
  updateDestructible,
} from '../../../maps/mapEdits.js'
import { LAYER_LABELS, layerOfTemplatePiece, layerOfTile } from '../../../maps/layers.js'
import { NULL_TILE, getTile, isEmptyTile } from '../../../maps/mapFormat.js'
import { autoPaintFloorCell, getAutoPaintRuleset, noteAutoPaintWallCleared } from '../../../maps/autoPaint/index.js'
import { toggleCover, updateMapObject } from '../../../world/objectAuthoring.js'
import {
  CHARACTER_SPAWN_KINDS,
  isCharacterSpawnKind,
  orderedPaintTileIds,
  orderedPaintTemplateIds,
} from './toolHelpers.js'

// What a press / drag on the board does for the held tool.
// ctx: the editor tools' shared state, setters and earlier handlers (see useEditorTools.js).
export function createPaintHandler(ctx) {
  const {
    askText, autoPaintRulesetId, beginStroke, clearBoardSelection, edit, editingObjectCovers,
    editingPatrol, hazardIntensity, itemGridSize, lastTemplateTipRef, layerAllowsTool,
    linkingDestructible, map, moveFrom, moving, movingDestructible, movingFishingSpot,
    movingGroundItem, movingTemplatePiece, movingWaypoint, objectDefinitions, objectTiles,
    onDestructibleTool, onInventoryTool, onNpcTool, onObjectivePlaced, onPatrolEdit, onTemplateTool, pickForMove,
    paintCycleRef, paintTemplateCycleRef, paintTemplateIds, paintTileIds, placeMoved, placing,
    placingFromEditor, placingObject, placingObjective, rotated, selectAt, selectedDestructible,
    selectedFishingSpot, selectedGroundItem, selectedNpc, selectedObject, selectedTemplatePiece,
    setMovingDestructible, setMovingFishingSpot, setMovingGroundItem,
    setMovingTemplatePiece, setPlacingFromEditor, setPlacingObject, setPlacingObjective,
    setSelectedDestructibleId, setSelectedFishingSpotId, setSelectedGroundItemId, setSelectedHazardId,
    setSelectedMarker, setSelectedNpcId, setSelectedObjectId, setSelectedTemplatePieceId, setStatus,
    setTool, tool,
  } = ctx

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
      pickForMove(position, boardPoint)
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

  return { onPaint }
}
