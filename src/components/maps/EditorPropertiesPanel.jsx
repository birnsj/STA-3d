import AssetProperties from './AssetProperties.jsx'
import EditorInspectors from './EditorInspectors.jsx'
import { hasAssetSelection, hasBoardSelection } from './editorSelection.js'
import MapProperties from './MapProperties.jsx'
import { PropertySectionsProvider, PropertySectionsToolbar } from './PropertySections.jsx'

// Right Properties panel: Properties = board entity or Assets thumbnail; Map = episode / location props.
// Authoring layers live on Assets (same strip as World Generation), not here.

export default function EditorPropertiesPanel({
  map,
  edit,
  tool,
  conversations,
  selection,
  showMapTab,
  onShowMapTab,
  mapProps,
  inspectors,
  onStatus,
  onTool,
  hazardIntensity,
  onHazardIntensity,
  animateTiles = true,
  layers = null,
}) {
  const boardSelected = hasBoardSelection(selection)
  const assetSelected = hasAssetSelection(tool)
  // Tile / Template Piece brush can keep catalogue props only when nothing on the board is selected
  // (selectTool clears board picks). A selected spawn/NPC/etc. always wins so marker properties show.
  const showAssetProps = !boardSelected && assetSelected
  const canShowSelection = boardSelected || assetSelected
  const showMap = !canShowSelection || showMapTab
  // Remount sections when the tab or selection changes so collapse state resets cleanly.
  const sectionsKey = showMap
    ? 'map'
    : boardSelected
      ? `board:${selection?.npc?.id ?? ''}:${selection?.object?.id ?? ''}:${selection?.destructible?.id ?? ''}:${selection?.hazard?.id ?? ''}:${selection?.groundItem?.id ?? ''}:${selection?.templatePiece?.id ?? ''}:${selection?.fishingSpot?.id ?? ''}:${selection?.marker?.kind ?? ''}:${selection?.marker?.x ?? ''},${selection?.marker?.y ?? ''}`
      : `asset:${tool ?? ''}`

  return (
    <aside className="ed-properties me-side">
      <div className="ed-panel-head">Properties</div>
      <div className="ed-properties-tabs" role="tablist">
        <button type="button" role="tab" className={`ed-tab${showMap ? ' is-active' : ''}`} aria-selected={showMap} onClick={() => onShowMapTab(true)}>
          Map
        </button>
        <button
          type="button"
          role="tab"
          className={`ed-tab${!showMap ? ' is-active' : ''}`}
          aria-selected={!showMap}
          disabled={!canShowSelection}
          onClick={() => onShowMapTab(false)}
        >
          Properties
        </button>
      </div>
      <PropertySectionsProvider key={sectionsKey}>
        <PropertySectionsToolbar />
        <div className="ed-properties-body">
          {showMap ? (
            <MapProperties {...mapProps} map={map} edit={edit} />
          ) : boardSelected ? (
            <EditorInspectors
              map={map}
              edit={edit}
              tool={tool}
              conversations={conversations}
              selection={selection}
              layers={layers}
              {...inspectors}
              onStatus={onStatus}
              animateTiles={animateTiles}
            />
          ) : showAssetProps ? (
            <AssetProperties
              tool={tool}
              onStatus={onStatus}
              onTool={onTool}
              hazardIntensity={hazardIntensity}
              onHazardIntensity={onHazardIntensity}
              animateTiles={animateTiles}
            />
          ) : (
            <p className="me-text">Select a thumbnail in the Palette, or click something on the map.</p>
          )}
        </div>
      </PropertySectionsProvider>
    </aside>
  )
}
