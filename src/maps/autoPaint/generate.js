// Generate New Map: World Generation deck room grid + 128/64/32 Template wall packing.
import { createNullMap, cellKey, FLOOR_TILE } from '../mapFormat.js'
import { WORLD_DOOR_MARK, WORLD_WALL_UNDERLAY } from './constants.js'
import { makeWorldDeckGenerator } from './deckLayout.js'
import {
  AUTO_PAINT_DOOR_CELLS,
  collectDoorCells,
  paintDoorCellsAsFloor,
  shrinkDoorwaysToMaxCells,
} from './doorways.js'
import { snapAutoPaintGenerateSize } from './generateSize.js'
import { placePackedWallPieces } from './placeWallRuns.js'
import { getAutoPaintRuleset } from './rulesets.js'
import { pieceKitFromRuleset, resolveAutoPaintTileId } from './templatePalette.js'
import { collectFloorKeys, floorIdsForRuleset } from './topology.js'
import { normalizeWeightedEntries, pickWeighted, primaryId } from './weightedChoice.js'

function resolveWeightedTiles(role) {
  const mapped = normalizeWeightedEntries(role, { allowEmpty: true })
    .map((entry) => ({
      id: resolveAutoPaintTileId(entry.id) || entry.id,
      weight: entry.weight,
    }))
    .filter((entry) => entry.id)
  return normalizeWeightedEntries(mapped, { allowEmpty: true })
}

/**
 * Deck layout (floors, doorways, markers) + floor under every underlay wall cell,
 * then World Generation 128/64/32 tip packing.
 */
export function generateAutoPaintMap(source, rulesetId, random = Math.random) {
  const ruleset = getAutoPaintRuleset(rulesetId)
  if (!ruleset) return { map: source, error: 'No World Generation ruleset.' }
  // Roles may store Template Piece ids / weighted lists; deck underlay needs catalogue tiles.
  const floors = resolveWeightedTiles(ruleset.floors?.defaultTile)
  const floorId = primaryId(floors) || FLOOR_TILE
  // Temporary mark while cutting/shrinking openings — never left on the map (no full-cell doorway tile).
  const doorMark = WORLD_DOOR_MARK
  if (!floorId) return { map: source, error: 'World Generation ruleset has no default floor tile.' }

  const snapped = snapAutoPaintGenerateSize(source.mapType, source.width, source.height)
  const width = snapped.width
  const height = snapped.height
  if (width < 6 || height < 6) {
    return { map: source, error: 'Map is too small for Generate New Map (need at least 6×6).' }
  }

  const kit = pieceKitFromRuleset(ruleset)
  const generateDeck = makeWorldDeckGenerator({
    floor: floorId,
    wall: WORLD_WALL_UNDERLAY,
    door: doorMark,
    furnishRooms: () => {},
  })
  const layout = generateDeck(
    { ...source, width, height, tiles: createNullMap({ width, height }).tiles },
    random,
    [],
  )

  const floorIdSet = new Set(floors.map((entry) => entry.id))
  const tiles = layout.tiles.map((row) =>
    row.map((id) => {
      if (id === floorId || floorIdSet.has(id)) return pickWeighted(floors, random) || floorId
      return id
    }),
  )

  const floorUnder = { ...(layout.floorUnder ?? {}) }
  // Deck cuts two-tile doors; keep both cells (128 underlay) and line 96px with Doorway 32.
  shrinkDoorwaysToMaxCells(
    tiles,
    width,
    height,
    doorMark,
    WORLD_WALL_UNDERLAY,
    AUTO_PAINT_DOOR_CELLS,
    (x, y) => {
      floorUnder[cellKey({ x, y })] = pickWeighted(floors, random) || floorId
    },
  )
  const doorKeys = paintDoorCellsAsFloor(
    tiles,
    collectDoorCells(tiles, width, height, doorMark),
    () => pickWeighted(floors, random) || floorId,
  )

  const underlayKeys = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x] !== WORLD_WALL_UNDERLAY) continue
      const key = cellKey({ x, y })
      underlayKeys.push(key)
      if (floorUnder[key] == null) floorUnder[key] = pickWeighted(floors, random) || floorId
    }
  }

  let map = {
    ...createNullMap({ name: source.name || 'Untitled Map', width, height }),
    id: source.id,
    name: source.name,
    episodeName: source.episodeName ?? '',
    card: source.card ?? null,
    mapType: source.mapType,
    biome: source.biome,
    weather: source.weather,
    ambient: source.ambient,
    ambientColour: source.ambientColour,
    tiles,
    floorUnder,
    areas: layout.areas ?? [],
    markers: layout.markers ?? { playerStarts: [], enemySpawns: [] },
    templatePiecePlacements: [],
    briefing: source.briefing ?? '',
    outro: source.outro ?? '',
    outroAbandoned: source.outroAbandoned ?? '',
    outroFailed: source.outroFailed ?? '',
    stardate: source.stardate ?? null,
    music: source.music,
  }

  map = placePackedWallPieces(map, kit, { doorKeys, random })

  const placements = map.templatePiecePlacements ?? []
  const floorKeys = collectFloorKeys(map, floorIdsForRuleset(ruleset))
  map = {
    ...map,
    autoPaint: {
      rulesetId: ruleset.id,
      defaultEnvironment: ruleset.environment,
      regions: [
        {
          id: 'region-1',
          environment: null,
          floorKeys,
          generatedUnderlayKeys: underlayKeys,
          generatedDoorKeys: doorKeys,
          generatedWallKeys: [],
          generatedPieceIds: placements.filter((entry) => entry.autoPaint).map((entry) => entry.id),
          manualUnderlayKeys: [],
          manualWallKeys: [],
          manualPieceIds: [],
          suppressedTipKeys: [],
          suppressedWallKeys: [],
        },
      ],
    },
  }
  if (snapped.snapped) {
    return {
      map,
      status: `Generate New Map snapped size to ${width}×${height} (${snapped.sizeId}) for Template 32 runs.`,
    }
  }
  return { map }
}
