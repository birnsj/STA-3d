// What the editor's Properties panel can show: an Assets catalogue tool, or something selected on the board.
// Lives outside the components so they can share it without breaking fast refresh.

// Help text for the marker tools (shown in Selection when one is the active tool).
import { AMBIENT_CREATURES } from '../../data/adaptation/exploration/ambientCreatures.js'

export const MARKER_HELP = {
  playerStarts: 'Click a floor tile to place a player start, or click an existing one to edit it in Properties.',
  enemySpawns: 'Click a floor tile to place an enemy spawn, or click an existing one to edit it in Properties.',
  horseSpawns:
    'Click a floor tile to place a horse spawn, or click an existing one to edit facing and roam. Play only mounts where these are placed. Roam defaults to Idle.',
  ...Object.fromEntries(
    AMBIENT_CREATURES.map((creature) => [
      creature.markerKind,
      `Click a floor tile to place a ${creature.label.toLowerCase()}, or click an existing one to edit it in Properties.`,
    ]),
  ),
  npcs: 'Click a floor tile to place an NPC, or click an NPC to edit it in Properties.',
  area: 'Click a floor tile to set or clear a room label.',
  erase: 'Click a tile to erase markers on it.',
  fishingSpot:
    'Click a water or shallows tile to place a Fishing Spot ripple, or click an existing one to edit it in Properties. Non-water tiles warn but still place.',
}

// The active tool as { kind, id }, or null when it is not an Assets selection.
export function parseTool(tool) {
  if (!tool) return null
  if (tool.startsWith('tile:')) return { kind: 'tile', id: tool.slice('tile:'.length) }
  if (tool.startsWith('destructible:')) return { kind: 'destructible', id: tool.slice('destructible:'.length) }
  if (tool.startsWith('inventory:')) return { kind: 'item', id: tool.slice('inventory:'.length) }
  if (tool.startsWith('template:')) return { kind: 'template', id: tool.slice('template:'.length) }
  if (tool.startsWith('hazard:')) return { kind: 'hazard', id: tool.slice('hazard:'.length) }
  if (tool === 'hazardErase') return { kind: 'hazardErase' }
  if (tool === 'fishingSpot') return { kind: 'fishingSpot' }
  if (MARKER_HELP[tool]) return { kind: 'marker', id: tool }
  return null
}

export const hasAssetSelection = (tool) => Boolean(parseTool(tool))

export function hasBoardSelection(selection) {
  return Boolean(
    selection?.npc ||
      selection?.object ||
      selection?.marker ||
      selection?.destructible ||
      selection?.hazard ||
      selection?.groundItem ||
      selection?.templatePiece ||
      selection?.fishingSpot,
  )
}
