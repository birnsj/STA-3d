// Closed rectangular Template 32 walls for outdoor settlement buildings.
// Outer-edge strips on all four sides; only the door cells are open (jamb · doorway · jamb).
import { normalizeTemplateRotation } from '../mapFormat.js'
import { snapTemplatePiecePosition, TEMPLATE_PIECE_CELL_PX } from '../mapEdits.js'
import { getTemplatePiece } from '../templatePieces.js'
import { AUTO_PAINT_DOORWAY_PIECE } from './doorways.js'
import { primaryId } from './weightedChoice.js'

const TIP_PX = TEMPLATE_PIECE_CELL_PX

function tipKey(position) {
  return `${position.x},${position.y}`
}

function freePieceId(pieceId, used) {
  let n = 1
  let id = `${pieceId}-${n}`
  while (used.has(id)) {
    n += 1
    id = `${pieceId}-${n}`
  }
  used.add(id)
  return id
}

function addPiece(list, usedIds, tips, tip, pieceId, rotation) {
  if (!pieceId || !getTemplatePiece(pieceId)) return { list, placed: false }
  const snapped = snapTemplatePiecePosition(tip, TIP_PX)
  const key = tipKey(snapped)
  if (tips.has(key)) return { list, placed: false }
  tips.add(key)
  list.push({
    id: freePieceId(pieceId, usedIds),
    pieceId,
    position: snapped,
    rotation: normalizeTemplateRotation(rotation),
    scale: 1,
    order: list.length,
    autoPaint: true,
  })
  return { list, placed: true }
}

/** Cover tip-units [from, to) along an edge with long/short/stub wall pieces. */
function fillEdge(list, usedIds, tips, { origin, alongX, from, to, rotation, kit }) {
  const longId = primaryId(kit.straightLong)
  const shortId = primaryId(kit.straight)
  const stubId = primaryId(kit.corner) || shortId
  let i = from
  while (i < to) {
    const left = to - i
    let span = 1
    let pieceId = stubId
    if (left >= 4 && longId) {
      span = 4
      pieceId = longId
    } else if (left >= 2 && shortId) {
      span = 2
      pieceId = shortId
    }
    const tip = alongX
      ? { x: origin.x + (i + span) * 0.5, y: origin.y }
      : { x: origin.x, y: origin.y + (i + span) * 0.5 }
    const result = addPiece(list, usedIds, tips, tip, pieceId, rotation)
    list = result.list
    // If tip blocked, try a stub step so we still advance and close gaps.
    if (!result.placed && stubId) {
      const stubTip = alongX
        ? { x: origin.x + (i + 1) * 0.5, y: origin.y }
        : { x: origin.x, y: origin.y + (i + 1) * 0.5 }
      const stub = addPiece(list, usedIds, tips, stubTip, stubId, rotation)
      list = stub.list
      i += 1
      continue
    }
    i += span
  }
  return list
}

/**
 * Place a closed wall/fence ring with a single opening (from building.doorKeys).
 * Door keys are `${x},${y}` cells already painted as floor / grass.
 * `openGaps`: leave the opening empty — jamb posts only, no doorway piece.
 * `doorwayPiece`: override (e.g. field fence gate); default starship doorway.
 */
export function placeSettlementBuildingWalls(
  map,
  building,
  kit,
  { doorKeys = [], openGaps = false, doorwayPiece = null } = {},
) {
  const rect = building?.rect
  if (!rect || !kit) return map
  const doorSet = new Set(doorKeys)
  const usedIds = new Set((map.templatePiecePlacements ?? []).map((entry) => entry.id))
  const tips = new Set(
    (map.templatePiecePlacements ?? []).map((entry) => tipKey(snapTemplatePiecePosition(entry.position, TIP_PX))),
  )
  let list = [...(map.templatePiecePlacements ?? [])]

  const { x0, x1, y0, y1 } = rect
  const corner = primaryId(kit.corner)
  const shortId = primaryId(kit.straight)
  const doorwayId =
    doorwayPiece && getTemplatePiece(doorwayPiece)
      ? doorwayPiece
      : getTemplatePiece(AUTO_PAINT_DOORWAY_PIECE)
        ? AUTO_PAINT_DOORWAY_PIECE
        : null
  const doorway = !openGaps ? doorwayId : null

  // Four outer corner posts.
  list = addPiece(list, usedIds, tips, { x: x0, y: y0 }, corner, 270).list
  list = addPiece(list, usedIds, tips, { x: x1 + 1, y: y0 }, corner, 0).list
  list = addPiece(list, usedIds, tips, { x: x0, y: y1 + 1 }, corner, 180).list
  list = addPiece(list, usedIds, tips, { x: x1 + 1, y: y1 + 1 }, corner, 90).list

  // Tip-unit index helpers: each underlay cell along an edge = 2 tip-units.
  // Mid-edge cells are x0+1 … x1-1 (or y0+1 … y1-1); tip-units run 0 … 2*count.
  const midX0 = x0 + 1
  const midX1 = x1 - 1
  const midY0 = y0 + 1
  const midY1 = y1 - 1
  const horizUnits = Math.max(0, (midX1 - midX0 + 1) * 2)
  const vertUnits = Math.max(0, (midY1 - midY0 + 1) * 2)

  const doorUnitsOnEdge = (alongX, edgeCoord) => {
    const units = new Set()
    if (midX0 > midX1 && alongX) return units
    if (midY0 > midY1 && !alongX) return units
    for (const raw of doorSet) {
      const [cx, cy] = String(raw).split(',').map(Number)
      if (alongX) {
        if (cy !== edgeCoord || cx < midX0 || cx > midX1) continue
        const base = (cx - midX0) * 2
        units.add(base)
        units.add(base + 1)
      } else {
        if (cx !== edgeCoord || cy < midY0 || cy > midY1) continue
        const base = (cy - midY0) * 2
        units.add(base)
        units.add(base + 1)
      }
    }
    return units
  }

  const placeDoorAndWalls = (alongX, edgeCoord, origin, rotation, totalUnits) => {
    const doorUnits = doorUnitsOnEdge(alongX, edgeCoord)
    const ordered = [...doorUnits].sort((a, b) => a - b)

    // Opening strip + jambs (doorway piece for buildings; openGaps = jamb posts only).
    // A 64-wide gate that fills the opening carries its own end posts — no separate jambs.
    if (ordered.length && (doorway || (openGaps && corner))) {
      const first = ordered[0]
      const last = ordered[ordered.length - 1]
      const tipSpan = last - first + 1
      const doorDef = doorway ? getTemplatePiece(doorway) : null
      const runTips = doorway ? Math.max(1, Math.round((doorDef?.footprint?.width ?? 32) / TIP_PX)) : 0
      const wideGate = Boolean(doorway && runTips >= 2 && tipSpan >= 2 && runTips >= tipSpan)
      if (corner && !wideGate) {
        const jambBefore = alongX
          ? { x: origin.x + first * 0.5, y: origin.y }
          : { x: origin.x, y: origin.y + first * 0.5 }
        const jambAfter = alongX
          ? { x: origin.x + (last + 1) * 0.5, y: origin.y }
          : { x: origin.x, y: origin.y + (last + 1) * 0.5 }
        list = addPiece(list, usedIds, tips, jambBefore, corner, rotation).list
        list = addPiece(list, usedIds, tips, jambAfter, corner, rotation).list
      }
      if (doorway) {
        if (wideGate) {
          const tip = alongX
            ? { x: origin.x + (first + tipSpan) * 0.5, y: origin.y }
            : { x: origin.x, y: origin.y + (first + tipSpan) * 0.5 }
          list = addPiece(list, usedIds, tips, tip, doorway, rotation).list
        } else {
          for (let u = first; u <= last; u++) {
            const tip = alongX
              ? { x: origin.x + (u + 1) * 0.5, y: origin.y }
              : { x: origin.x, y: origin.y + (u + 1) * 0.5 }
            list = addPiece(list, usedIds, tips, tip, doorway, rotation).list
          }
        }
      }
    }

    // Wall segments on either side of the door (and full edge if no door).
    const segments = []
    let cursor = 0
    while (cursor < totalUnits) {
      if (doorUnits.has(cursor)) {
        cursor += 1
        continue
      }
      let end = cursor
      while (end < totalUnits && !doorUnits.has(end)) end += 1
      segments.push([cursor, end])
      cursor = end
    }
    for (const [from, to] of segments) {
      list = fillEdge(list, usedIds, tips, {
        origin,
        alongX,
        from,
        to,
        rotation,
        kit,
      })
    }
  }

  // North (outer tip line y = y0), South (y = y1+1), West (x = x0), East (x = x1+1).
  placeDoorAndWalls(true, y0, { x: midX0, y: y0 }, 180, horizUnits)
  placeDoorAndWalls(true, y1, { x: midX0, y: y1 + 1 }, 0, horizUnits)
  placeDoorAndWalls(false, x0, { x: x0, y: midY0 }, 270, vertUnits)
  placeDoorAndWalls(false, x1, { x: x1 + 1, y: midY0 }, 90, vertUnits)

  // Stub fills on the outer edges of corner underlay cells so the ring meets the posts.
  if (corner) {
    list = addPiece(list, usedIds, tips, { x: x0 + 0.5, y: y0 }, corner, 180).list
    list = addPiece(list, usedIds, tips, { x: x1 + 0.5, y: y0 }, corner, 180).list
    list = addPiece(list, usedIds, tips, { x: x0 + 0.5, y: y1 + 1 }, corner, 0).list
    list = addPiece(list, usedIds, tips, { x: x1 + 0.5, y: y1 + 1 }, corner, 0).list
    list = addPiece(list, usedIds, tips, { x: x0, y: y0 + 0.5 }, corner, 270).list
    list = addPiece(list, usedIds, tips, { x: x0, y: y1 + 0.5 }, corner, 270).list
    list = addPiece(list, usedIds, tips, { x: x1 + 1, y: y0 + 0.5 }, corner, 90).list
    list = addPiece(list, usedIds, tips, { x: x1 + 1, y: y1 + 0.5 }, corner, 90).list
  }

  return { ...map, templatePiecePlacements: list }
}
