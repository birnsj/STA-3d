// Generate Map: World Generation deck room grid + 128/64/32 Template wall packing.
// Outdoor Settlement / Natural Terrain use settlementLayout (multi-building + path edging).
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
import { getAutoPaintRuleset, mapTypeForEnvironment } from './rulesets.js'
import {
  generateSettlementLayout,
  OUTDOOR_FENCE_GATE,
  OUTDOOR_FENCE_KIT,
  OUTDOOR_WALL_FACE_PIECES,
  rulesetUsesSettlementLayout,
} from './settlementLayout.js'
import { placeSettlementBuildingWalls } from './settlementWalls.js'
import { pieceKitFromOutdoorFace, pieceKitFromRuleset, resolveAutoPaintTileId } from './templatePalette.js'
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

function finishAutoPaintMeta(map, ruleset, underlayKeys, doorKeys) {
  const placements = map.templatePiecePlacements ?? []
  const floorKeys = collectFloorKeys(map, floorIdsForRuleset(ruleset))
  return {
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
}

/**
 * Pack Outdoor Template 32 walls per building (each face has its own kit).
 * Other buildings' underlay is masked so tips do not collide across kits.
 */
function packSettlementBuildings(map, ruleset, layout, random) {
  const underWall = ruleset.floors?.underWall
  const dirtFallback =
    resolveAutoPaintTileId(ruleset.settlement?.dirt) || ruleset.settlement?.dirt || 'ground'
  let placements = []
  for (const building of layout.buildings ?? []) {
    const facePieces = OUTDOOR_WALL_FACE_PIECES[building.face]
    if (!facePieces || !building.rect) continue
    const kit = pieceKitFromOutdoorFace(facePieces, underWall)
    const keepUnder = new Set(building.underlayKeys ?? [])
    const tiles = map.tiles.map((row) => row.slice())
    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < tiles[0].length; x++) {
        if (tiles[y][x] !== WORLD_WALL_UNDERLAY) continue
        if (keepUnder.has(`${x},${y}`)) continue
        tiles[y][x] = map.floorUnder?.[`${x},${y}`] || dirtFallback
      }
    }
    const packed = placePackedWallPieces(
      { ...map, tiles, templatePiecePlacements: [] },
      kit,
      {
        doorKeys: new Set(building.doorKeys ?? []),
        random,
        pipeline: ruleset.pipeline ?? null,
        adjacency: ruleset.adjacency ?? null,
      },
    )
    placements = placements.concat(packed.templatePiecePlacements ?? [])
  }
  // Re-id so piece ids stay unique across buildings.
  const used = new Set()
  placements = placements.map((entry, index) => {
    let id = entry.id
    if (used.has(id)) {
      let n = 1
      id = `${entry.pieceId}-${n}`
      while (used.has(id)) {
        n += 1
        id = `${entry.pieceId}-${n}`
      }
    }
    used.add(id)
    return { ...entry, id, order: index }
  })
  return { ...map, templatePiecePlacements: placements }
}

function generateSettlementMap(source, ruleset, random, layoutScale, mapType, width, height) {
  const grass =
    resolveAutoPaintTileId(primaryId(ruleset.floors?.defaultTile)) ||
    primaryId(resolveWeightedTiles(ruleset.floors?.defaultTile)) ||
    'grass'
  const settlement = ruleset.settlement && typeof ruleset.settlement === 'object' ? ruleset.settlement : {}
  const dirt = resolveAutoPaintTileId(settlement.dirt) || settlement.dirt || 'ground'
  const path = resolveAutoPaintTileId(settlement.path) || settlement.path || 'path'
  const faces = Array.isArray(settlement.buildingFaces) ? settlement.buildingFaces : undefined
  const buildingScale = Number(layoutScale.buildings) > 0 ? Number(layoutScale.buildings) : 1
  const roomScale = Number(layoutScale.rooms) > 0 ? Number(layoutScale.rooms) : 1
  const roomsInBuilding =
    Number.isFinite(Number(layoutScale.roomsInBuilding))
      ? Math.max(0, Math.min(1, Number(layoutScale.roomsInBuilding)))
      : 1
  const doorsInBuilding =
    Number.isFinite(Number(layoutScale.doorsInBuilding))
      ? Math.max(0, Math.min(1, Number(layoutScale.doorsInBuilding)))
      : 1

  const layout = generateSettlementLayout(
    { width, height },
    random,
    {
      grass,
      dirt,
      path,
      interiorWood: resolveAutoPaintTileId(settlement.interiorWood) || settlement.interiorWood || 'plankFloor',
      interiorStone: resolveAutoPaintTileId(settlement.interiorStone) || settlement.interiorStone || 'templeFloor',
      faces,
      buildingScale,
      roomScale,
      roomsInBuilding,
      doorsInBuilding,
      biomeId: source.biome,
      featureScale: 0.75,
      fields: settlement.fields !== false,
      fence: settlement.fence || null,
      crop: settlement.crop || 'cropRows',
      tallCrop: settlement.tallCrop || 'tallCrop',
      maxFields: settlement.maxFields ?? 3,
    },
  )

  const doorKeys = [...(layout.doorKeys ?? [])]
  const underlayKeys = [...(layout.underlayKeys ?? [])]
  const floorUnder = { ...(layout.floorUnder ?? {}) }
  for (const key of underlayKeys) {
    if (floorUnder[key] == null) floorUnder[key] = dirt
  }

  const rotatedSet = new Set(layout.rotatedKeys ?? [])
  const rotated = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => rotatedSet.has(`${x},${y}`)),
  )

  let map = {
    ...createNullMap({ name: source.name || 'Untitled Map', width, height }),
    id: source.id,
    name: source.name,
    episodeName: source.episodeName ?? '',
    card: source.card ?? null,
    mapType,
    biome: source.biome,
    weather: source.weather,
    ambient: source.ambient,
    ambientColour: source.ambientColour,
    tiles: layout.tiles,
    rotated,
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

  map = packSettlementBuildings(map, ruleset, layout, random)

  // Field fence rings — same packing as buildings (64×32 + corner + 64 gate).
  for (const ring of layout.fenceRings ?? []) {
    map = placeSettlementBuildingWalls(map, { rect: ring.rect }, OUTDOOR_FENCE_KIT, {
      doorKeys: ring.doorKeys ?? [],
      doorwayPiece: OUTDOOR_FENCE_GATE,
    })
  }

  return { map: finishAutoPaintMeta(map, ruleset, underlayKeys, doorKeys) }
}

/**
 * Deck layout (floors, doorways, markers) + floor under every underlay wall cell,
 * then World Generation 128/64/32 tip packing.
 *
 * @param {object} [layoutScale] Map Properties scales: `{ rooms, buildings }` (1 = 100%).
 *   Deck: `rooms` = room span. Outdoor: `buildings` = footprint size, `rooms` = interior room span.
 */
export function generateAutoPaintMap(source, rulesetId, random = Math.random, layoutScale = {}) {
  const ruleset = getAutoPaintRuleset(rulesetId)
  if (!ruleset) return { map: source, error: 'No World Generation ruleset.' }
  // Roles may store Template Piece ids / weighted lists; deck underlay needs catalogue tiles.
  const floors = resolveWeightedTiles(ruleset.floors?.defaultTile)
  const floorId = primaryId(floors) || FLOOR_TILE
  // Temporary mark while cutting/shrinking openings — never left on the map (no full-cell doorway tile).
  const doorMark = WORLD_DOOR_MARK
  if (!floorId) return { map: source, error: 'World Generation ruleset has no default floor tile.' }

  // Ruleset Environment drives map type (biome / weather / size presets), same as the World Gen Environment control.
  const mapType = mapTypeForEnvironment(ruleset.environment) || source.mapType
  const snapped = snapAutoPaintGenerateSize(mapType, source.width, source.height)
  const width = snapped.width
  const height = snapped.height
  if (width < 6 || height < 6) {
    return { map: source, error: 'Map is too small for Generate Map (need at least 6×6).' }
  }

  if (rulesetUsesSettlementLayout(ruleset)) {
    try {
      const result = generateSettlementMap(source, ruleset, random, layoutScale, mapType, width, height)
      if (snapped.snapped) {
        return {
          ...result,
          status: `Generate Map snapped size to ${width}×${height} (${snapped.sizeId}) for Outdoor Template 32.`,
        }
      }
      return result
    } catch (error) {
      return {
        map: source,
        error: `Outdoor settlement Generate Map failed: ${error?.message ?? error}`,
      }
    }
  }

  const roomScale = Number(layoutScale.rooms) > 0 ? Number(layoutScale.rooms) : 1
  const kit = pieceKitFromRuleset(ruleset)
  const generateDeck = makeWorldDeckGenerator({
    floor: floorId,
    wall: WORLD_WALL_UNDERLAY,
    door: doorMark,
    furnishRooms: () => {},
    roomScale,
    preferOpenings: ruleset.pipeline?.preferOpenings !== false,
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
  // Deck cuts two-tile doors; keep both cells (128 underlay) and line 64px with Doorway 32.
  const doorCells = ruleset.pipeline?.doorCells ?? AUTO_PAINT_DOOR_CELLS
  shrinkDoorwaysToMaxCells(
    tiles,
    width,
    height,
    doorMark,
    WORLD_WALL_UNDERLAY,
    doorCells,
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
    mapType,
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

  map = placePackedWallPieces(map, kit, {
    doorKeys,
    random,
    pipeline: ruleset.pipeline,
    adjacency: ruleset.adjacency,
  })

  map = finishAutoPaintMeta(map, ruleset, underlayKeys, doorKeys)
  if (snapped.snapped) {
    return {
      map,
      status: `Generate Map snapped size to ${width}×${height} (${snapped.sizeId}) for Template 32 runs.`,
    }
  }
  return { map }
}
