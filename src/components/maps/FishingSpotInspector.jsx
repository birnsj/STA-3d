import { DEFAULT_FISH_IDS } from '../../exploration/fishingAuthored.js'
import { getItems } from '../../rules/equipment.js'
import { PropertySection } from './PropertySections.jsx'

const FISH_ITEMS = () =>
  getItems().filter((item) => item.tags?.includes('fish') || DEFAULT_FISH_IDS.includes(item.id))

// Properties for a map-authored Fishing Spot (ripple hotspot).
export default function FishingSpotInspector({
  spot,
  moving = false,
  onChange,
  onMove,
  onDelete,
}) {
  if (!spot) return null
  const fishItems = FISH_ITEMS()
  const pool = new Set(spot.catchPool ?? DEFAULT_FISH_IDS)
  const togglePool = (itemId) => {
    const next = new Set(pool)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    onChange({ catchPool: [...next] })
  }
  return (
    <div className="me-inspector">
      <PropertySection id="fishing-spot" title={`Fishing Spot · ${spot.id}`}>
        <p className="me-text">
          Ripple on water. Click it in play to open Fish. Position ({spot.position.x}, {spot.position.y}).
        </p>
        <label className="me-check">
          <input type="checkbox" checked={spot.fishable !== false} onChange={(event) => onChange({ fishable: event.target.checked })} />
          Fishable
        </label>
        <label className="me-field">
          Difficulty (0–5)
          <input
            className="me-name"
            type="number"
            min={0}
            max={5}
            step={1}
            value={spot.difficulty ?? 2}
            onChange={(event) => onChange({ difficulty: Number(event.target.value) })}
          />
        </label>
        <label className="me-field">
          Size
          <input
            className="me-name"
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={spot.size ?? 1}
            onChange={(event) => onChange({ size: Number(event.target.value) })}
          />
          <span className="me-text">{Number(spot.size ?? 1).toFixed(2)}</span>
        </label>
        <label className="me-field">
          Respawn (seconds)
          <input
            className="me-name"
            type="number"
            min={5}
            max={600}
            step={1}
            value={spot.respawnSeconds ?? 45}
            onChange={(event) => onChange({ respawnSeconds: Number(event.target.value) })}
          />
        </label>
        <fieldset className="me-fieldset">
          <legend>Catch pool</legend>
          {fishItems.length === 0 && <p className="me-text">No fish items in the catalogue yet.</p>}
          {fishItems.map((item) => (
            <label key={item.id} className="me-check">
              <input type="checkbox" checked={pool.has(item.id)} onChange={() => togglePool(item.id)} />
              {item.name}
            </label>
          ))}
        </fieldset>
        <div className="me-row">
          {onMove && (
            <button type="button" className={`me-button${moving ? ' is-on' : ''}`} aria-pressed={moving} onClick={onMove}>
              {moving ? 'Click map to move…' : 'Move on Map'}
            </button>
          )}
          <button type="button" className="me-button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </PropertySection>
    </div>
  )
}
