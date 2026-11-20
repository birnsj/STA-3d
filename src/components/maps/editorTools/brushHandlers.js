import { getAutoPaintRuleset, rebuildAutoPaintWalls } from '../../../maps/autoPaint/index.js'
import { orderedPaintTileIds, orderedPaintTemplateIds } from './toolHelpers.js'

// Brush and tool selection, Auto-Paint, and the multi-brush checklists.
// ctx: the editor tools' shared state, setters and earlier handlers (see useEditorTools.js).
export function createBrushHandlers(ctx) {
  const {
    autoPaintRulesetId, beginStroke, clearBoardSelection, edit, endStroke, layerAllowsTool, map,
    paintCycleRef, paintTemplateCycleRef, paintTemplateIds, paintTileIds, setMoveFrom, setMoving,
    setPaintTemplateIds, setPaintTileIds, setPlacing, setStatus, setTool,
  } = ctx

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

  return { enableAutoPaintTool, rebuildAutoPaint, selectTool, togglePaintTile, togglePaintTemplate }
}
