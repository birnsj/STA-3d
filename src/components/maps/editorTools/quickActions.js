import { duplicateDestructible, duplicateGroundItem, updateTemplatePiece } from '../../../maps/mapEdits.js'
import { LAYER_LABELS, canEditLayer, layerOfTemplatePiece } from '../../../maps/layers.js'

// Duplicate and rotate shortcuts for the current selection / brush.
// ctx: the editor tools' shared state, setters and earlier handlers (see useEditorTools.js).
export function createQuickActions(ctx) {
  const {
    edit, itemGridSize, layers, map, objectTiles, placing, selectedDestructible, selectedGroundItem,
    selectedTemplatePiece, setRotated, setSelectedDestructibleId, setSelectedGroundItemId, setStatus,
    setTemplateRotation, tool,
  } = ctx

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

  return { duplicateSelected, duplicateSelectedGroundItem, rotateBrushAxis }
}
