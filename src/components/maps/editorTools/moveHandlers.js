import {
  destructibleAt,
  eraseMarkers,
  groundItemAt,
  groundItemAtBoard,
  hasMarkers,
  markerAtBoard,
  moveDestructible,
  moveGroundItem,
  moveMarkers,
  moveTemplatePiece,
  removeDestructible,
  removeGroundItem,
  removeTemplatePiece,
  swapTilesWithObjects,
  templatePieceAt,
  templatePieceAtBoard,
  templatePieceTargetAt,
} from '../../../maps/mapEdits.js'
import { LAYER_LABELS, layerOfTemplatePiece, layerOfTile, selectionPriority } from '../../../maps/layers.js'
import { getTile, isEmptyTile } from '../../../maps/mapFormat.js'
import { markerLayersAt, cellAssemblyLayers } from './toolHelpers.js'

// Move: put down what is carried, and right-click delete under the pointer.
// ctx: the editor tools' shared state, setters and earlier handlers (see useEditorTools.js).
export function createMoveHandlers(ctx) {
  const {
    edit, itemGridSize, layerAllowsTool, layers, map, moveFrom, objectDefinitions, objectTiles,
    selectedDestructibleId, selectedGroundItemId, selectedMarker, selectAt, selectedTemplatePieceId, setMoveFrom,
    setMovingDestructible, setMovingGroundItem, setMovingTemplatePiece, setSelectedDestructibleId,
    setSelectedGroundItemId, setSelectedMarker, setSelectedTemplatePieceId, setStatus,
  } = ctx

  // Drop the carry only — Move stays on so the yellow free cursor returns for the next pick.
  const finishCarry = () => {
    setMoveFrom(null)
  }

  /** Place whatever Move is carrying at position; clears the carry on success or same-cell put-back. */
  const placeMoved = (position, boardPoint = null) => {
    const from = ctx.moveFromRef?.current ?? moveFrom
    if (!from || !position) return
    if (from.templatePiece) {
      const piece = (map.templatePiecePlacements ?? []).find((entry) => entry.id === from.templatePiece)
      const moveLayer = layerOfTemplatePiece(piece?.pieceId)
      if (!layerAllowsTool(moveLayer)) return setStatus(`${LAYER_LABELS[moveLayer] ?? moveLayer} layer is locked or hidden.`)
      const target = boardPoint ? templatePieceTargetAt(boardPoint, itemGridSize) : position
      if (piece && target.x === piece.position.x && target.y === piece.position.y) {
        finishCarry()
        setStatus('Put back.')
        return
      }
      const moved = moveTemplatePiece(map, from.templatePiece, target, itemGridSize)
      if (moved === map) return setStatus(`Template pieces need a cell on the map (${itemGridSize}px grid).`)
      finishCarry()
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
          finishCarry()
          setStatus('Put back.')
          return
        }
        return setStatus(`Inventory objects need a free floor cell (${itemGridSize}px grid).`)
      }
      finishCarry()
      edit(moved)
      setStatus(`Moved ${from.groundItem}.`)
      return
    }
    if (from.challengeObject) {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const dest = { x: Math.round(position.x), y: Math.round(position.y) }
      if (dest.x === from.x && dest.y === from.y) {
        finishCarry()
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
      finishCarry()
      edit({ ...map, objectPlacements: { ...(map.objectPlacements ?? {}), [from.challengeObject]: dest } })
      setStatus(`Moved ${definition?.name ?? from.challengeObject} to (${dest.x}, ${dest.y}).`)
      return
    }
    const destCell = { x: Math.round(position.x), y: Math.round(position.y) }
    // Same tile: put back without swapping.
    if (destCell.x === from.x && destCell.y === from.y) {
      finishCarry()
      setStatus('Put back.')
      return
    }
    if (from.destructible) {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const moved = moveDestructible(map, from.destructible, destCell, objectTiles)
      if (moved === map) return setStatus('Destructible objects stand on free floor tiles (not under a challenge object).')
      finishCarry()
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
      finishCarry()
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
    finishCarry()
    edit(swapped.map)
    setStatus(
      `Swapped ${getTile(fromTile).label} (${from.x}, ${from.y}) with ${getTile(toTile).label} (${destCell.x}, ${destCell.y})${swapped.carried.length ? ', with its challenge object' : ''}.`,
    )
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

  // Pick up whatever Move finds under the pointer (markers, then challenge objects, Template Pieces, items,
  // destructibles, finally the tile assembly) and start carrying it.
  const pickForMove = (position, boardPoint = null) => {
    // Marker glyphs under the free cursor (P/E/H/N/C) before tall Template Piece art that covers the same pixels.
    const markerPos = boardPoint ? markerAtBoard(map, boardPoint) : null
    const markerCell = markerPos ?? (hasMarkers(map, position) ? position : null)
    if (markerCell) {
      const hitChallenge = objectDefinitions.find(
        (definition) => definition.position[0] === markerCell.x && definition.position[1] === markerCell.y,
      )
      if (hitChallenge) {
        if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
        selectAt(markerCell, boardPoint)
        setMoveFrom({
          x: markerCell.x,
          y: markerCell.y,
          markers: false,
          challengeObject: hitChallenge.id,
          destructible: null,
          groundItem: null,
          templatePiece: null,
        })
        setStatus(`Carrying ${hitChallenge.name ?? hitChallenge.id}. Click to place · Esc cancels.`)
        return
      }
      if (hasMarkers(map, markerCell)) {
        const markerLayers = markerLayersAt(map, markerCell)
        const blocked = markerLayers.find((layerId) => !layerAllowsTool(layerId))
        if (blocked) {
          return setStatus(
            `${blocked === 'characters' ? 'NPCs / Characters' : 'Markers / Triggers'} layer is locked or hidden.`,
          )
        }
        selectAt(markerCell, boardPoint)
        setMoveFrom({
          x: markerCell.x,
          y: markerCell.y,
          markers: true,
          challengeObject: null,
          destructible: null,
          groundItem: null,
          templatePiece: null,
        })
        setStatus('Carrying markers. Click to place · Esc cancels.')
        return
      }
    }
    // Challenge C on the floor cell when the glyph hit missed.
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
    const hitTemplateSprite = boardPoint ? templatePieceAtBoard(map, boardPoint) : null
    const hitTemplate =
      (hitTemplateSprite
        ? (map.templatePiecePlacements ?? []).find((entry) => entry.id === hitTemplateSprite.id)
        : null) ?? templatePieceAt(map, position, { cellPx: itemGridSize })
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
    const hitItem = (boardPoint ? groundItemAtBoard(map, boardPoint) : null) ?? groundItemAt(map, position, { cellPx: itemGridSize })
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

  return { pickForMove, placeMoved, deleteObjectUnderPointer }
}
