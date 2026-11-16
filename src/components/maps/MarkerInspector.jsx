import { ambientCreatureByMarkerKind } from '../../data/adaptation/exploration/ambientCreatures.js'
import { resolveAuthoredRoam } from '../../exploration/roam.js'
import { FACINGS, snapFacing } from '../../maps/facing.js'
import { Field } from './NpcInspector.jsx'
import { PropertySection } from './PropertySections.jsx'
import EditorSelect from './EditorSelect.jsx'
import RoamFields from './RoamFields.jsx'

// Inspector for player start, enemy spawn, horse spawn, or ambient creature spawn.
// marker: { kind, label, x, y, facing?, roam? }.
export default function MarkerInspector({ marker, defaultFacing, onFacing, onRoam, onDelete }) {
  const creature = ambientCreatureByMarkerKind(marker.kind)
  const kindName =
    marker.kind === 'playerStarts'
      ? 'Player Start'
      : marker.kind === 'enemySpawns'
        ? 'Enemy Spawn'
        : marker.kind === 'horseSpawns'
          ? 'Horse Spawn'
          : creature?.label ?? 'Spawn'
  const defaultLabel = FACINGS.find((entry) => entry.degrees === snapFacing(defaultFacing))?.label
  const showRoam = marker.kind === 'horseSpawns' || Boolean(creature)
  const profileId = marker.kind === 'horseSpawns' ? 'horse' : creature?.profileId ?? 'human'
  const authoredRoam = resolveAuthoredRoam(
    marker.roam ?? (marker.kind === 'horseSpawns' ? { mode: 'idle' } : creature?.defaultRoam),
  )

  return (
    <div className="me-inspector">
      <PropertySection id="marker" title={`${kindName} ${marker.label} · ${marker.x}, ${marker.y}`} forceOpen>
        <Field label="Facing">
          <EditorSelect
            className="me-select me-wide"
            value={marker.facing == null ? '' : snapFacing(marker.facing)}
            onChange={(event) => onFacing(event.target.value === '' ? null : Number(event.target.value))}
          >
            <option value="">Default: toward the middle ({defaultLabel})</option>
            {FACINGS.map((entry) => (
              <option key={entry.degrees} value={entry.degrees}>
                {entry.degrees}° {entry.label}
              </option>
            ))}
          </EditorSelect>
        </Field>
        <p className="me-text">Right click on the map also turns it. Move (toolbar) drags it to another tile.</p>
        <div className="me-inspector-actions">
          <button type="button" className="me-button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </PropertySection>
      {showRoam && onRoam && (
        <RoamFields
          roam={authoredRoam}
          profileId={profileId}
          showWaypointHint
          onChange={(roam) => onRoam(roam)}
        />
      )}
    </div>
  )
}
