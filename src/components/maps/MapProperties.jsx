import { useEffect, useState } from 'react'
import missionLogData from '../../data/adaptation/exploration/missionLog.json'
import { MAX_AWAY_TEAM } from '../../exploration/awayTeam.js'
import { authoredDefinitionsFor } from '../../exploration/challengeObjects.js'
import { DEFAULT_AMBIENT_COLOUR, FULL_LIGHT, getTile, isRotated, mapFileId } from '../../maps/mapFormat.js'
import { getAutoPaintRuleset, listAutoPaintRulesets, mapTypeForEnvironment } from '../../maps/autoPaint/index.js'
import { BIOME_WORLDS, BIOMES, MAP_SIZES, randomMapName, sizeFor, sizeIdOf, usesBiome } from '../../maps/mapGenerators.js'
import { isIndoors, weatherFor, weatherOptions } from '../../maps/mapWeather.js'
import { randomEpisodeName } from '../../rules/locationNames.js'
import {
  getBoardSunSettings,
  setBoardSunSettings,
  subscribeBoardSunSettings,
} from '../../spike3d/boardSunSettings.js'
import BoardSunOrbitDial from './BoardSunOrbitDial.jsx'
import EditorColourField, { SUN_COLOUR_PRESETS } from './EditorColourField.jsx'
import EditorControlsHelp from './EditorControlsHelp.jsx'
import EpisodeCardPicker from './EpisodeCardPicker.jsx'
import MusicSettings from './MusicSettings.jsx'
import { PropertySection } from './PropertySections.jsx'
import EditorSelect from './EditorSelect.jsx'

// Map-level properties for the right Properties panel when nothing is selected (or Map tab is forced).
// Map-level fields shown in the editor's right Properties panel.

function ScaleSlider({ label, title, min, max = '200', value, onChange }) {
  return (
    <label className="me-scale" title={title}>
      <span className="me-scale-label">{label}</span>
      <input type="range" min={min} max={max} step="10" value={value} aria-label={label} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="me-ambient-value">{value}%</span>
    </label>
  )
}

export default function MapProperties({
  map,
  edit,
  fileId,
  hoverTile,
  placing,
  rotated,
  warnings,
  status,
  showWeather,
  cardTools,
  revealEpisodeCard = 0,
  placingObjective,
  canSave,
  onGenerateMap,
  generateBusy = false,
  rulesetId = null,
  onRulesetId,
  onOpenObjective,
  onMapType,
  onBiome,
  onWeather,
  onShowWeather,
  onAmbient,
  onAmbientColour,
  onSize,
  roomScale,
  onRoomScale,
  buildingScale,
  onBuildingScale,
  roomsInBuilding = 100,
  onRoomsInBuilding,
  doorsInBuilding = 100,
  onDoorsInBuilding,
  includeBuildings = true,
  onIncludeBuildings,
  includeRoads = true,
  onIncludeRoads,
  /** When true (World Generation Ruleset Map panel), ruleset is chosen in the left editor. */
  worldGeneration = false,
}) {
  const objectives = map.objectives ?? []
  const objectCount = authoredDefinitionsFor(map).length
  const biomeless = !usesBiome(map)
  const weatherList = weatherOptions(map)
  const sizeId = sizeIdOf(map)
  const rulesets = listAutoPaintRulesets()
  const activeRulesetId = rulesetId || rulesets[0]?.id || ''
  const [sun, setSun] = useState(() => getBoardSunSettings())
  useEffect(() => subscribeBoardSunSettings(setSun), [])

  const onRulesetChange = (id) => {
    if (!id) return
    onRulesetId?.(id)
    const ruleset = getAutoPaintRuleset(id)
    const nextType = mapTypeForEnvironment(ruleset?.environment)
    if (nextType !== map.mapType) onMapType?.(nextType)
    if (ruleset?.biomeId && ruleset.biomeId !== map.biome) onBiome?.(ruleset.biomeId)
  }

  return (
    <div className="ed-map-props">
      <PropertySection
        id="map"
        title="Map"
        tip="Ruleset, biome, weather, size, ambient light, and sun orbit. Generate Map uses the ruleset plus size, light, and weather from here."
      >
        {!worldGeneration && rulesets.length > 0 && (
          <label className="me-field">
            Ruleset
            <EditorSelect
              className="me-select me-wide"
              value={activeRulesetId}
              aria-label="World Generation ruleset"
              title="Which World Generation Ruleset Generate Map and Auto-Paint use"
              onChange={(event) => onRulesetChange(event.target.value)}
            >
              {rulesets.map((ruleset) => (
                <option key={ruleset.id} value={ruleset.id}>
                  {ruleset.label || ruleset.id}
                </option>
              ))}
            </EditorSelect>
          </label>
        )}
        <label className="me-field">
          Biome
          <EditorSelect
            className="me-select me-wide"
            value={map.biome}
            disabled={biomeless}
            title={biomeless ? 'Starship / station / indoor rulesets have no biome' : 'Biome'}
            onChange={(event) => onBiome(event.target.value)}
          >
            {BIOME_WORLDS.map((world) => (
              <optgroup key={world.id} label={world.label}>
                {BIOMES.filter((biome) => biome.world === world.id).map((biome) => (
                  <option key={biome.id} value={biome.id}>
                    {biome.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </EditorSelect>
        </label>
        <label className="me-field">
          Weather
          <EditorSelect
            className="me-select me-wide"
            value={map.weather}
            disabled={weatherList.length === 1}
            title={weatherList.length === 1 ? 'No weather here' : isIndoors(map) ? 'Atmosphere (indoor weather)' : 'Weather'}
            onChange={(event) => onWeather(event.target.value)}
          >
            {weatherList.map((weather) => (
              <option key={weather.id} value={weather.id}>
                {weather.label}
              </option>
            ))}
          </EditorSelect>
        </label>
        <label className="me-check" title="Show the weather effect over the map">
          <input type="checkbox" checked={showWeather} onChange={(event) => onShowWeather(event.target.checked)} /> Weather FX
        </label>
        <label className="me-field">
          Size preset
          <EditorSelect className="me-select me-wide" value={sizeId} aria-label="Map size" onChange={(event) => onSize(event.target.value)}>
            {MAP_SIZES.map((size) => {
              const { width, height } = sizeFor(map.mapType, size.id)
              return (
                <option key={size.id} value={size.id}>
                  {size.label} ({width}x{height})
                </option>
              )
            })}
            {sizeId === 'custom' && (
              <option value="custom" disabled>
                Custom
              </option>
            )}
          </EditorSelect>
        </label>
        <label className="me-ambient" title="Ambient light: how dark the map is. Glowing tiles stay lit in the dark.">
          Light
          <input type="range" min="0" max={FULL_LIGHT} step="5" value={map.ambient ?? FULL_LIGHT} aria-label="Ambient light" onChange={(event) => onAmbient(Number(event.target.value))} />
          <span className="me-ambient-value">{map.ambient ?? FULL_LIGHT}%</span>
        </label>
        <EditorColourField
          label="Colour"
          title="Ambient light colour: the tint of the room when light is low."
          ariaLabel="Ambient light colour"
          value={map.ambientColour || DEFAULT_AMBIENT_COLOUR}
          onChange={(colour) => onAmbientColour?.(colour)}
        />
        <label
          className="me-ambient"
          title="Orbit the 3D key light (Play). Same control as World Generation → Sun."
        >
          Sun
          <input
            type="range"
            min="0"
            max="359"
            step="1"
            value={sun.azimuthDeg}
            aria-label="Sun orbit"
            onChange={(event) => {
              const azimuthDeg = Number(event.target.value)
              setSun((prev) => ({ ...prev, azimuthDeg }))
              setBoardSunSettings({ azimuthDeg })
            }}
          />
          <span className="me-ambient-value">{sun.azimuthDeg}°</span>
        </label>
        <BoardSunOrbitDial
          azimuthDeg={sun.azimuthDeg}
          colour={sun.colour}
          shadowStrength={sun.shadowStrength}
          onAzimuth={(azimuthDeg) => {
            setSun((prev) => ({ ...prev, azimuthDeg }))
            setBoardSunSettings({ azimuthDeg })
          }}
        />
        <EditorColourField
          label="Sun colour"
          title="Sun key colour: tints 3D figure lighting in Play."
          ariaLabel="Sun colour"
          value={sun.colour}
          presets={SUN_COLOUR_PRESETS}
          onChange={(colour) => {
            setSun((prev) => ({ ...prev, colour }))
            setBoardSunSettings({ colour })
          }}
        />
        <label
          className="me-ambient"
          title="Cast shadow strength in Play. 100% is the previous full strength."
        >
          Shadow
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round((sun.shadowStrength ?? 1) * 100)}
            aria-label="Shadow strength"
            onChange={(event) => {
              const shadowStrength = Number(event.target.value) / 100
              setSun((prev) => ({ ...prev, shadowStrength }))
              setBoardSunSettings({ shadowStrength })
            }}
          />
          <span className="me-ambient-value">{Math.round((sun.shadowStrength ?? 1) * 100)}%</span>
        </label>
      </PropertySection>

      <PropertySection
        id="name-episode-card"
        title="Name, episode & card"
        tip="Map file name, Load Episode title, and optional episode card art."
        defaultOpen={false}
        forceOpen={revealEpisodeCard > 0}
        key={`name-episode-card-${revealEpisodeCard}`}
      >
        <label className="me-field">
          Map name
          <input
            className="me-name me-wide"
            value={map.name}
            placeholder="Map name"
            aria-label="Map name"
            title="The map's name is also its file name"
            onChange={(event) => edit({ ...map, name: event.target.value })}
          />
        </label>
        <button type="button" className="me-button me-generate" onClick={() => edit({ ...map, name: randomMapName(map) })}>
          Generate Name
        </button>
        <label className="me-field">
          Episode name
          <input
            className="me-name me-episode me-wide"
            value={map.episodeName}
            placeholder="Shown in Load Episode"
            aria-label="Episode name"
            onChange={(event) => edit({ ...map, episodeName: event.target.value })}
          />
        </label>
        <button
          type="button"
          className="me-button me-generate"
          onClick={() => edit({ ...map, episodeName: randomEpisodeName(map.episodeName, Math.random, map.name) })}
        >
          Generate Episode Name
        </button>
        <EpisodeCardPicker
          cardId={map.card}
          weatherFx={showWeather ? weatherFor(map.weather).fx : null}
          canGenerate={cardTools.canGenerate}
          busy={cardTools.busy}
          onCard={(card) => edit({ ...map, card })}
          onGenerate={cardTools.onGenerate}
        />
      </PropertySection>

      <PropertySection
        id="generate"
        title="Generate"
        tip="World Generation builds a new layout from the Map ruleset above (room size, light, weather). Nothing is saved until you press Save. Edit ruleset contents via Tools → World Generation Ruleset. Legacy Map Generator is under Tools."
        defaultOpen
      >
        <ScaleSlider
          label="Room size"
          title="Deck: how large rooms are in the grid. Outdoor settlement: how large rooms are inside buildings."
          min="70"
          value={roomScale}
          onChange={onRoomScale}
        />
        <ScaleSlider
          label="Building size"
          title="Outdoor settlement: how large building footprints are. Deck Generate Map does not place buildings."
          min="100"
          value={buildingScale}
          onChange={onBuildingScale}
        />
        <ScaleSlider
          label="Rooms"
          title="Outdoor settlement: fraction of rooms inside each building. 0% = open floor, 100% = as many as Room size allows. Press Generate Map after changing."
          min="0"
          max="100"
          value={roomsInBuilding}
          onChange={onRoomsInBuilding}
        />
        <ScaleSlider
          label="Doors"
          title="Outdoor settlement: fraction of interior doorways. 0% = entrance only, 100% = a door on every interior wall. Needs Rooms above 0%. Press Generate Map after changing."
          min="0"
          max="100"
          value={doorsInBuilding}
          onChange={onDoorsInBuilding}
        />
        <label className="me-check" title="Outdoor settlement: place buildings when Generate Map runs. Deck layouts ignore this.">
          <input
            type="checkbox"
            checked={includeBuildings}
            onChange={(event) => onIncludeBuildings?.(event.target.checked)}
          />{' '}
          Buildings
        </label>
        <label className="me-check" title="Outdoor settlement: paint the main road and door stubs when Generate Map runs. Deck layouts ignore this.">
          <input
            type="checkbox"
            checked={includeRoads}
            onChange={(event) => onIncludeRoads?.(event.target.checked)}
          />{' '}
          Roads
        </label>
        <button
          type="button"
          className="me-button me-generate"
          disabled={generateBusy || typeof onGenerateMap !== 'function'}
          title="Build a new map with World Generation (new seed each press). Nothing is saved until you press Save."
          onClick={onGenerateMap}
        >
          Generate Map
        </button>
      </PropertySection>

      <PropertySection
        id="captains-log"
        title="Captain's Log"
        tip="Mission intro / outro wording and starting stardate shown in play."
        defaultOpen={false}
      >
        <label className="me-field">
          Starting stardate
          <input
            className="me-name me-wide"
            type="number"
            step="0.1"
            value={map.stardate ?? ''}
            placeholder={`Default ${missionLogData.defaultStardate}`}
            onChange={(event) => edit({ ...map, stardate: event.target.value === '' ? null : Number(event.target.value) })}
          />
        </label>
        <label className="me-field">
          Briefing (intro)
          <textarea className="me-name me-wide" rows={5} value={map.briefing ?? ''} onChange={(event) => edit({ ...map, briefing: event.target.value })} />
        </label>
        <label className="me-field">
          Outro
          <textarea className="me-name me-wide" rows={4} value={map.outro ?? ''} onChange={(event) => edit({ ...map, outro: event.target.value })} />
        </label>
        <label className="me-field">
          Outro (abandoned)
          <textarea className="me-name me-wide" rows={3} value={map.outroAbandoned ?? ''} onChange={(event) => edit({ ...map, outroAbandoned: event.target.value })} />
        </label>
        <label className="me-field">
          Outro (failed)
          <textarea className="me-name me-wide" rows={3} value={map.outroFailed ?? ''} onChange={(event) => edit({ ...map, outroFailed: event.target.value })} />
        </label>
        <p className="me-text is-muted">Story wording: Mission → Story Wording.</p>
      </PropertySection>

      <PropertySection id="music" title="Music" tip="Exploration and combat music cues for this map." defaultOpen={false}>
        <MusicSettings map={map} edit={edit} />
      </PropertySection>

      <PropertySection
        id="objectives"
        tip="Mission objectives and object counts. Open Objective / Object editors from Tools."
        title="Objectives"
      >
        {objectives.length ? (
          <ul className="me-objective-list">
            {objectives.map((objective, index) => (
              <li key={index}>
                <button type="button" className="me-link" onClick={() => onOpenObjective(index)}>
                  O{index + 1} · {objective.title || objective.id}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="me-text">None yet — Mission → Objective Editor.</p>
        )}
        {placingObjective !== null && <p className="me-text">Click a tile to mark the objective (Escape cancels).</p>}
        <p className="me-text">
          Objects: {objectCount ? `${objectCount}` : 'none'}
          {map.objects ? ' (map-owned).' : objectCount ? ' (challenges.json until edited).' : '.'} Editors are under Mission.
        </p>
      </PropertySection>

      <PropertySection id="status" title="Status" tip="Save path and the tile under the pointer." defaultOpen={false}>
        <p className="me-text">{fileId ? `maps/${fileId}.json` : 'Not saved yet'}</p>
        {fileId && mapFileId(map.name) && mapFileId(map.name) !== fileId && <p className="me-text">Renamed to maps/{mapFileId(map.name)}.json on Save.</p>}
        <p className="me-text">
          Tile:{' '}
          {hoverTile
            ? (() => {
                const tileId = map.tiles[hoverTile.y]?.[hoverTile.x]
                const label = tileId != null ? getTile(tileId)?.label ?? String(tileId) : 'out of bounds'
                return `${hoverTile.x}, ${hoverTile.y}: ${label}${isRotated(map, hoverTile) ? ' (rotated)' : ''}`
              })()
            : '—'}
        </p>
        <p className="me-text">Brush: {placing ? (rotated ? 'rotated' : 'not rotated') : 'off'}</p>
        <p className="me-text">
          Player starts: {map.markers.playerStarts.length} / {MAX_AWAY_TEAM}
        </p>
        <p className="me-text">Horse spawns: {(map.markers.horseSpawns ?? []).length}</p>
      </PropertySection>

      <PropertySection
        id="warnings"
        title="Warnings"
        tip="Validation issues that should be fixed before play (missing starts, bad links, …)."
        defaultOpen={warnings.length > 0}
      >
        {warnings.length ? (
          <ul className="me-warnings">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="me-text">None</p>
        )}
        <EditorControlsHelp />
        {!canSave && <p className="me-text is-warning">Saving only works from the dev server.</p>}
        {status && <p className="me-status">{status}</p>}
      </PropertySection>
    </div>
  )
}
