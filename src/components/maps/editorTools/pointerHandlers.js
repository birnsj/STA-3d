import { turnFacing } from '../../../maps/mapEdits.js'
import { getTile, isRotated } from '../../../maps/mapFormat.js'
import { orderedPaintTileIds } from './toolHelpers.js'

// Pointer-up, right-click and the Place Tiles / Move toggles.
// ctx: the editor tools' shared state, setters and earlier handlers (see useEditorTools.js).
export function createPointerHandlers(ctx) {
  const {
    clearBoardSelection, deleteObjectUnderPointer, edit, endStroke, lastTemplateTipRef, map, moveFrom,
    moving, paintCycleRef, paintTileIds, placing, setMoveFrom, setMoving, setPaintTileIds, setPlacing,
    setRotated, setStatus, setTool, tool,
  } = ctx

  // Move places on click (placeMoved), not on pointer-up.
  const onPaintEnd = () => {
    endStroke?.()
    lastTemplateTipRef.current = null
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

  return { onPaintEnd, onRightClick, onPlacingToggle, onMovingToggle }
}
