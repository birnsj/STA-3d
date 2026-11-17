import { ambientCreatureByMarkerKind } from '../../data/adaptation/exploration/ambientCreatures.js'
import { ANIMAL_DISPOSITIONS, normalizeAnimalDisposition } from '../../exploration/dispositions.js'
import { resolveAuthoredRoam } from '../../exploration/roam.js'
import { FACINGS, snapFacing } from '../../maps/facing.js'
import {
  CAT_COATS,
  CHICKEN_COATS,
  HORSE_COATS,
  normalizeCatCoatId,
  normalizeChickenCoatId,
  normalizeHorseCoatId,
} from '../../data/adaptation/exploration/animalCoats.js'
import { Field } from './NpcInspector.jsx'
import { PropertySection } from './PropertySections.jsx'
import EditorSelect from './EditorSelect.jsx'
import RoamFields from './RoamFields.jsx'

/** Coat options for this marker kind (horse / cat / chicken); null when the animal has no texture variants yet. */
function coatsForMarker(kind, creature) {
  if (kind === 'horseSpawns') return Object.values(HORSE_COATS)
  if (creature?.actor === 'cat') return Object.values(CAT_COATS)
  if (creature?.actor === 'chicken') return Object.values(CHICKEN_COATS)
  return null
}

function normalizeCoatForMarker(kind, creature, coatId) {
  if (kind === 'horseSpawns') return normalizeHorseCoatId(coatId)
  if (creature?.actor === 'cat') return normalizeCatCoatId(coatId)
  if (creature?.actor === 'chicken') return normalizeChickenCoatId(coatId)
  return null
}

// Inspector for player start, enemy spawn, horse spawn, or ambient creature spawn.
// marker: { kind, label, x, y, facing?, roam?, disposition?, coat? }.
export default function MarkerInspector({
  marker,
  defaultFacing,
  onFacing,
  onRoam,
  onDisposition,
  onCoat,
  onDelete,
}) {
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
  const showAttitude = showRoam
  const coats = coatsForMarker(marker.kind, creature)
  const profileId = marker.kind === 'horseSpawns' ? 'horse' : creature?.profileId ?? 'human'
  const authoredRoam = resolveAuthoredRoam(
    marker.roam ?? (marker.kind === 'horseSpawns' ? { mode: 'idle' } : creature?.defaultRoam),
  )
  const disposition = normalizeAnimalDisposition(marker.disposition ?? 'neutral')
  const coatValue =
    coats && marker.coat ? normalizeCoatForMarker(marker.kind, creature, marker.coat) : ''

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
        {showAttitude && onDisposition && (
          <Field label="Disposition">
            <EditorSelect
              className="me-select me-wide"
              value={disposition}
              onChange={(event) => onDisposition(event.target.value)}
            >
              {ANIMAL_DISPOSITIONS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </EditorSelect>
          </Field>
        )}
        {coats && onCoat && (
          <Field label="Texture">
            <div className="me-texture-picks">
              <button
                type="button"
                className={`me-texture-pick${!coatValue ? ' is-selected' : ''}`}
                title="Auto (by spawn order)"
                onClick={() => onCoat(null)}
              >
                <span className="me-texture-pick-auto">Auto</span>
              </button>
              {coats.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`me-texture-pick${coatValue === entry.id ? ' is-selected' : ''}`}
                  title={entry.file}
                  onClick={() => onCoat(entry.id)}
                >
                  <img src={entry.url} alt={entry.file} className="me-texture-pick-img" />
                  <span className="me-texture-pick-name">{entry.file}</span>
                </button>
              ))}
            </div>
          </Field>
        )}
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
