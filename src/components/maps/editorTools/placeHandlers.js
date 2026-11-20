import {
  destructibleAt,
  groundItemAt,
  groundItemAtBoard,
  placeDestructible,
  placeGroundItem,
  placeTemplatePiece,
  templatePieceAtBoard,
  templatePieceTargetAt,
} from '../../../maps/mapEdits.js'
import { getTemplatePiece } from '../../../maps/templatePieces.js'
import { getItemById } from '../../../rules/equipment.js'
import { DESTRUCTIBLE_TYPES } from '../../../world/environment.js'

// Destructible, inventory and Template Piece placement.
// ctx: the editor tools' shared state, setters and earlier handlers (see useEditorTools.js).
export function createPlaceHandlers(ctx) {
  const {
    edit, itemGridSize, map, objectTiles, setSelectedDestructibleId, setSelectedGroundItemId,
    setSelectedHazardId, setSelectedMarker, setSelectedNpcId, setSelectedObjectId,
    setSelectedTemplatePieceId, setStatus, templateRotation,
  } = ctx

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

  return { onDestructibleTool, onInventoryTool, onTemplateTool }
}
