import { getRoamProfile, roamSpeedMultiplier, ROAM_MODES } from '../../exploration/roam.js'
import EditorSelect from './EditorSelect.jsx'
import { Field } from './NpcInspector.jsx'
import { PropertySection } from './PropertySections.jsx'

const MODE_LABELS = {
  idle: 'Idle (stand)',
  radiusWander: 'Wander in radius',
  waypointPatrol: 'Waypoint patrol',
}

/**
 * Shared roam authoring for NPCs, horse spawns, and ambient creatures.
 * @param {{
 *   roam: { mode?: string, radius?: number, speed?: number } | null | undefined,
 *   profileId: string,
 *   title?: string,
 *   showWaypointHint?: boolean,
 *   waypointSlot?: import('react').ReactNode,
 *   onChange: (roam: object) => void,
 * }} props
 */
export default function RoamFields({
  roam,
  profileId,
  title = 'Roam',
  showWaypointHint = false,
  waypointSlot = null,
  onChange,
}) {
  const profile = getRoamProfile(profileId)
  const mode = ROAM_MODES.includes(roam?.mode) ? roam.mode : 'idle'
  const radius = Number.isFinite(roam?.radius) ? roam.radius : 3
  const speedMult = roamSpeedMultiplier(roam?.speed)
  const baseSpeed = profile.walkSpeed ?? 1.8
  const effectiveSpeed = (baseSpeed * speedMult).toFixed(1)

  const patch = (changes) => {
    const next = {
      mode,
      ...(mode === 'radiusWander' ? { radius } : {}),
      ...(speedMult !== 1 ? { speed: speedMult } : {}),
      ...roam,
      ...changes,
    }
    if (next.mode !== 'radiusWander') delete next.radius
    if (next.speed == null || next.speed === 1) delete next.speed
    onChange(next)
  }

  return (
    <PropertySection id="roam" title={title} defaultOpen={mode !== 'idle'}>
      <Field label="Mode">
        <EditorSelect className="me-select me-wide" value={mode} onChange={(event) => patch({ mode: event.target.value })}>
          {ROAM_MODES.map((id) => (
            <option key={id} value={id}>
              {MODE_LABELS[id] ?? id}
            </option>
          ))}
        </EditorSelect>
      </Field>
      {mode === 'radiusWander' && (
        <Field label={`Radius (${radius} tiles)`}>
          <input
            type="range"
            className="me-range"
            min={1}
            max={12}
            step={0.5}
            value={radius}
            onChange={(event) => patch({ radius: Number(event.target.value) })}
          />
        </Field>
      )}
      {(mode === 'radiusWander' || mode === 'waypointPatrol') && (
        <Field label={`Speed ×${speedMult.toFixed(1)} (${effectiveSpeed} tiles/s)`}>
          <input
            type="range"
            className="me-range"
            min={0.4}
            max={2}
            step={0.1}
            value={speedMult}
            onChange={(event) => patch({ speed: Number(event.target.value) })}
          />
          <p className="me-text">
            Profile default {baseSpeed} tiles/s ({profileId}).
          </p>
        </Field>
      )}
      {mode === 'waypointPatrol' && showWaypointHint && !waypointSlot && (
        <p className="me-text">Add waypoints below. Wait animations use this species’ idle clips.</p>
      )}
      {mode === 'waypointPatrol' && waypointSlot}
      {mode === 'idle' && <p className="me-text">Stands at its home facing. Change mode to wander or patrol.</p>}
      {mode === 'radiusWander' && (
        <p className="me-text">Picks clear tiles within the radius automatically (species pacing from profile).</p>
      )}
    </PropertySection>
  )
}
