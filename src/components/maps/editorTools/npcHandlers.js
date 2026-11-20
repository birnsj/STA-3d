import { listAuthoredCharacters } from '../../../character/authoredCharacters.js'
import { addPatrolWaypoint, npcAt, placeNpc, updateNpc, updatePatrolWaypoint } from '../../../maps/mapEdits.js'
import { canEditLayer } from '../../../maps/layers.js'

// The NPC tool and patrol-route authoring.
// ctx: the editor tools' shared state, setters and earlier handlers (see useEditorTools.js).
export function createNpcHandlers(ctx) {
  const {
    edit, editingPatrol, layers, map, movingNpc, movingWaypoint, pendingCharacterId, selectedNpc,
    selectedWaypointIndex, setEditingPatrol, setMovingNpc, setMovingWaypoint, setPendingCharacterId,
    setSelectedMarker, setSelectedNpcId, setSelectedWaypointIndex, setStatus,
  } = ctx

  // Patrol edit: click a waypoint of the selected NPC to select it, or an empty floor tile to append one; Move Waypoint
  // relocates the selected point.
  const onPatrolEdit = (position) => {
    if (!selectedNpc) return false
    if (!canEditLayer(layers, 'characters')) {
      setStatus('NPCs / Characters layer is locked or hidden.')
      return true
    }
    const patrol = selectedNpc.patrol ?? []
    if (movingWaypoint && selectedWaypointIndex != null) {
      const moved = updatePatrolWaypoint(map, selectedNpc.id, selectedWaypointIndex, { at: position })
      if (moved === map) setStatus('Patrol waypoints stand on free floor tiles.')
      else {
        edit(moved)
        setStatus(`Moved W${selectedWaypointIndex + 1} to (${position.x}, ${position.y}).`)
      }
      setMovingWaypoint(false)
      return true
    }
    const hit = patrol.findIndex((point) => point.at.x === position.x && point.at.y === position.y)
    if (hit >= 0) {
      setSelectedWaypointIndex(hit)
      setStatus(`Selected W${hit + 1}.`)
      return true
    }
    if (editingPatrol) {
      const next = addPatrolWaypoint(map, selectedNpc.id, position)
      if (!next) {
        setStatus('Patrol waypoints stand on free floor tiles.')
        return true
      }
      edit(next)
      const count = next.npcs.find((npc) => npc.id === selectedNpc.id)?.patrol?.length ?? 0
      setSelectedWaypointIndex(count > 0 ? count - 1 : null)
      setStatus(`Added W${count} at (${position.x}, ${position.y}).`)
      return true
    }
    return false
  }

  // The NPC tool: click an NPC to select it, an empty floor tile to place a new one (or, while moving, to move the
  // selected one there).
  const onNpcTool = (position) => {
    if (onPatrolEdit(position)) return
    if (movingNpc && selectedNpc) {
      const moved = updateNpc(map, selectedNpc.id, { position })
      if (moved === map) setStatus('NPCs stand on free floor tiles.')
      edit(moved)
      setMovingNpc(false)
      setSelectedMarker(null)
      return
    }
    const existing = npcAt(map, position)
    setSelectedMarker(null)
    if (existing) {
      setSelectedNpcId(existing.id)
      setSelectedWaypointIndex(null)
      setMovingWaypoint(false)
      return
    }
    if (editingPatrol) return
    const characterId = pendingCharacterId || listAuthoredCharacters()[0]?.id || null
    const placed = placeNpc(map, position, characterId)
    if (!placed) return setStatus('NPCs stand on free floor tiles.')
    edit(placed.map)
    setSelectedNpcId(placed.npc.id)
    setPendingCharacterId(null)
    setEditingPatrol(false)
    setSelectedWaypointIndex(null)
  }

  return { onPatrolEdit, onNpcTool }
}
