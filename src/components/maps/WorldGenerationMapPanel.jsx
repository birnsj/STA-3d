import MapProperties from './MapProperties.jsx'
import { PropertySectionsProvider, PropertySectionsToolbar } from './PropertySections.jsx'

/**
 * Right-rail Map settings for Tools → World Generation Ruleset.
 * Same Map Properties controls as Dev Edit (location, size, light, weather, scales, name…).
 * Edits the open map document so Generate Map picks them up.
 */
export default function WorldGenerationMapPanel({
  map,
  edit,
  showWeather = true,
  onShowWeather,
  onMapType,
  onBiome,
  onWeather,
  onAmbient,
  onAmbientColour,
  onSize,
  roomScale = 100,
  onRoomScale,
  buildingScale = 100,
  onBuildingScale,
  onGenerateMap,
  generateHazards = false,
  onGenerateHazards,
  cardTools = { canGenerate: false, busy: false, onGenerate: () => {} },
}) {
  if (!map) {
    return (
      <aside className="ed-properties me-side wg-map-panel">
        <div className="ed-panel-head">Properties</div>
        <p className="me-text" style={{ padding: '8px' }}>
          No open map. Back to Map, then open World Generation again.
        </p>
      </aside>
    )
  }

  return (
    <aside className="ed-properties me-side wg-map-panel">
      <div className="ed-panel-head">Properties</div>
      <PropertySectionsProvider>
        <PropertySectionsToolbar />
        <div className="ed-properties-body">
          <MapProperties
            map={map}
            edit={edit}
            showWeather={showWeather}
            onShowWeather={onShowWeather}
            onMapType={onMapType}
            onBiome={onBiome}
            onWeather={onWeather}
            onAmbient={onAmbient}
            onAmbientColour={onAmbientColour}
            onSize={onSize}
            roomScale={roomScale}
            onRoomScale={onRoomScale}
            buildingScale={buildingScale}
            onBuildingScale={onBuildingScale}
            onGenerateMap={onGenerateMap}
            generateHazards={generateHazards}
            onGenerateHazards={onGenerateHazards}
            cardTools={cardTools}
            warnings={[]}
            status=""
            revealEpisodeCard={0}
            placingObjective={false}
            canSave={false}
            hoverTile={null}
            placing={false}
            rotated={false}
            fileId={null}
            onOpenObjective={() => {}}
          />
        </div>
      </PropertySectionsProvider>
    </aside>
  )
}
