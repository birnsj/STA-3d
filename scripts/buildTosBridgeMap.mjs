// Assemble maps/TosBridge.json from Bridge Template pieces (TOS faces) + base interactive objects.
// Run after: node scripts/makeBridgeTemplatePieces.mjs
// Usage: node --import ./tools/jsonLoader.mjs scripts/buildTosBridgeMap.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBlankMap, serializeMap } from '../src/maps/mapFormat.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outPath = path.join(root, 'maps', 'TosBridge.json')

const W = 20
const H = 18
const WALL = 'templateWall'
const FLOOR = 'floor'

let map = createBlankMap({ name: 'TOS Bridge', width: W, height: H })
map.mapType = 'templateDeck'
map.biome = 'temperate'
map.weather = 'clear'
map.ambient = 88
map.ambientColour = '#0a1018'
map.episodeName = 'TOS Bridge'
map.briefing = 'Constitution-class main bridge. Station ring, command well, viewscreen forward, turbolift aft.'

const inside = (x, y) => {
  const cx = (W - 1) / 2
  const cy = (H - 1) / 2
  const dx = Math.abs(x - cx) / (W / 2 - 1.2)
  const dy = Math.abs(y - cy) / (H / 2 - 1.2)
  return dx * dx + dy * dy <= 1
}

const tiles = map.tiles.map((row) => row.slice())
const floorUnder = {}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!inside(x, y)) {
      tiles[y][x] = 'null'
      continue
    }
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)
    if (edge) {
      tiles[y][x] = WALL
      floorUnder[`${x},${y}`] = FLOOR
    } else {
      tiles[y][x] = FLOOR
    }
  }
}
map = { ...map, tiles, floorUnder }

const placements = []
let order = 0
const place = (pieceId, x, y, rotation = 0) => {
  placements.push({
    id: `${pieceId}-${++order}`,
    pieceId,
    position: { x, y },
    rotation,
    order,
  })
}

for (const [x, y] of [
  [7, 6],
  [9, 6],
  [11, 6],
  [13, 6],
  [7, 8],
  [9, 8],
  [11, 8],
  [13, 8],
  [7, 10],
  [9, 10],
  [11, 10],
  [13, 10],
  [7, 12],
  [9, 12],
  [11, 12],
  [13, 12],
]) {
  place('tplBridgeFloor', x, y)
}
place('tplBridgeWell', 9, 9)
place('tplBridgeWell', 11, 9)
place('tplBridgeWell', 9, 11)
place('tplBridgeWell', 11, 11)

place('tplBridgeIndoorWall32Concave', 5.5, 4.5, 0)
place('tplBridgeIndoorWall32Concave', 15.5, 4.5, 90)
place('tplBridgeIndoorWall32Concave', 15.5, 14.5, 180)
place('tplBridgeIndoorWall32Concave', 5.5, 14.5, 270)

place('tplBridgeIndoorWall32Long', 9.5, 3.5, 0)
place('tplBridgeViewscreenWall32Long', 13.5, 3.5, 0)
place('tplBridgeViewscreenWall32', 7.5, 3.5, 0)

place('tplBridgeIndoorWall32Long', 16.5, 8.5, 90)
place('tplBridgeIndoorWall32Long', 16.5, 12.5, 90)
place('tplBridgeIndoorWall32Long', 13.5, 15.5, 180)
place('tplBridgeTurboliftWall32', 9.5, 15.5, 180)
place('tplBridgeIndoorWall32Long', 4.5, 12.5, 270)
place('tplBridgeIndoorWall32Long', 4.5, 8.5, 270)

place('tplBridgeIndoorWall32Corner', 11.5, 3.5, 0)
place('tplBridgeIndoorWall32Door', 11.5, 15.5, 180)
place('tplBridgeTurboliftDoor', 11.5, 15.5, 180)

place('tplBridgeOutdoorWall32Long', 10.5, 2.5, 0)
place('tplBridgeOutdoorWall32Concave', 4.5, 3.5, 0)
place('tplBridgeOutdoorWall32Concave', 16.5, 3.5, 90)

place('tplBridgeViewscreen', 10.5, 4.1, 0)
place('tplBridgeCaptainsChair', 10.3, 9.8, 0)
place('tplBridgeHelmConsole', 10.3, 7.4, 0)
place('tplBridgeRail', 10.3, 8.6, 0)
place('tplBridgeTacticalConsole', 7.6, 7.6, 315)
place('tplBridgeScienceConsole', 14.0, 8.4, 90)
place('tplBridgeCommsConsole', 5.8, 10.4, 270)
place('tplBridgeEngineeringConsole', 14.0, 11.6, 90)
place('tplBridgeCrewChair', 8.6, 8.5, 0)
place('tplBridgeCrewChair', 12.0, 8.5, 0)
place('tplBridgeCrewChair', 7.2, 11.2, 270)
place('tplBridgeCrewChair', 13.4, 11.2, 90)

map.templatePiecePlacements = placements
map.autoPaint = {
  rulesetId: 'bridge-template',
  defaultEnvironment: 'starshipStation',
  regions: [
    {
      id: 'region-1',
      environment: null,
      floorKeys: [],
      generatedUnderlayKeys: [],
      generatedDoorKeys: [],
      generatedWallKeys: [],
      generatedPieceIds: [],
      manualUnderlayKeys: [],
      manualWallKeys: [],
      manualPieceIds: placements.map((entry) => entry.id),
      suppressedTipKeys: [],
      suppressedWallKeys: [],
    },
  ],
}
map.markers = {
  ...map.markers,
  playerStarts: [
    { x: 10, y: 12 },
    { x: 9, y: 12 },
    { x: 11, y: 12 },
    { x: 10, y: 13 },
  ],
  enemySpawns: [],
}
map.areas = [
  { name: 'Main Bridge', position: { x: 10, y: 9 } },
  { name: 'Viewscreen', position: { x: 10, y: 4 } },
  { name: 'Turbolift', position: { x: 11, y: 15 } },
]

const idle = (label, description) => ({
  idle: { label, description },
})

const baseConsole = (id, name, x, y, description) => ({
  id,
  name,
  type: 'console',
  position: [x, y],
  state: 'idle',
  states: idle('Idle', description),
  actions: [],
})

map.objects = [
  baseConsole('captainsChair', "Captain's Chair", 10, 9, 'The command chair at the heart of the bridge.'),
  baseConsole('mainViewscreen', 'Main Viewscreen', 10, 4, 'The primary optical viewer at the forward bulkhead.'),
  baseConsole('helmConsole', 'Helm Console', 10, 7, 'Flight control station ahead of the captain.'),
  baseConsole('tacticalConsole', 'Tactical Console', 8, 7, 'Weapons and defensive systems station.'),
  baseConsole('scienceConsole', 'Science Console', 14, 8, 'Sensors and science analysis station.'),
  baseConsole('commsConsole', 'Communications Console', 6, 10, 'Ship-to-ship and subspace communications.'),
  baseConsole('engineeringConsole', 'Engineering Console', 14, 11, 'Damage control and engineering readouts.'),
  {
    id: 'crewChairPort',
    name: 'Crew Chair',
    type: 'furniture',
    position: [9, 8],
    state: 'idle',
    states: idle('Idle', 'A bridge duty chair.'),
    actions: [],
  },
  {
    id: 'crewChairStarboard',
    name: 'Crew Chair',
    type: 'furniture',
    position: [12, 8],
    state: 'idle',
    states: idle('Idle', 'A bridge duty chair.'),
    actions: [],
  },
  {
    id: 'turboliftDoor',
    name: 'Turbolift Door',
    type: 'door',
    position: [11, 15],
    state: 'idle',
    states: {
      idle: { label: 'Closed', description: 'The turbolift doors are sealed.' },
      open: { label: 'Open', description: 'The turbolift car is available.' },
    },
    actions: [],
    covers: [[11, 15]],
  },
]

const disk = serializeMap(map)
fs.writeFileSync(outPath, `${JSON.stringify(disk, null, 2)}\n`)
console.log(`Wrote ${outPath} (${disk.templatePiecePlacements?.length ?? 0} pieces, ${disk.objects?.length ?? 0} objects)`)
