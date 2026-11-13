// World Generation room grid — copied from Legacy makeDeckGenerator (option A), then owned here.
// Generate New Map uses hazard:false and empty furnishRooms; helpers below cover that path only.
import { getTile } from '../mapFormat.js'
import { WORLD_DOOR_MARK } from './constants.js'

const MARKERS_PER_SIDE = 8
const MIN_ROOM = 4

const key = ({ x, y }) => `${x},${y}`
const randomInt = (random, min, max) => min + Math.floor(random() * (max - min + 1))

function shuffle(list, random) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const makeGrid = (width, height, tileAt) =>
  Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => tileAt(x, y)))

function roomCells(room) {
  const cells = []
  for (let y = room.y0; y <= room.y1; y++) for (let x = room.x0; x <= room.x1; x++) cells.push({ x, y })
  return cells
}

function splitAxis(start, length, random, baseSpan = 6) {
  const span = Math.max(MIN_ROOM, Math.round(baseSpan))
  const count = Math.max(1, Math.min(Math.round((length + 1) / (span + 1)), Math.floor((length + 1) / (MIN_ROOM + 1))))
  const floor = length - (count - 1)
  const sizes = Array.from({ length: count }, (_, i) => Math.floor(floor / count) + (i < floor % count ? 1 : 0))
  for (let i = 0; i < count - 1; i++) {
    const shift = randomInt(random, -2, 2)
    if (sizes[i] + shift >= MIN_ROOM && sizes[i + 1] - shift >= MIN_ROOM) {
      sizes[i] += shift
      sizes[i + 1] -= shift
    }
  }
  let next = start
  return sizes.map((size) => {
    const range = [next, next + size - 1]
    next += size + 1
    return range
  })
}

function doorwayOffsets(random, first, last) {
  if (last <= first) return [first]
  const start = randomInt(random, first, last - 1)
  return [start, start + 1]
}

function cutDoorway(tiles, keep, cells, step, tile) {
  cells.forEach(({ x, y }) => {
    tiles[y][x] = tile
    keep.add(key({ x: x - step[0], y: y - step[1] })).add(key({ x: x + step[0], y: y + step[1] }))
  })
}

function connectRooms(tiles, grid, random, door) {
  const keep = new Set()
  grid.forEach((row) =>
    row.forEach((room, col) => {
      if (row[col + 1]) {
        const cells = doorwayOffsets(random, room.y0, room.y1).map((y) => ({ x: room.x1 + 1, y }))
        cutDoorway(tiles, keep, cells, [1, 0], door)
      }
      if (grid[room.row + 1]?.[col]) {
        const cells = doorwayOffsets(random, room.x0, room.x1).map((x) => ({ x, y: room.y1 + 1 }))
        cutDoorway(tiles, keep, cells, [0, 1], door)
      }
    }),
  )
  return keep
}

const isMarkerTile = (id) => id !== WORLD_DOOR_MARK && !getTile(id).solid && !getTile(id).role
const markerCells = (tiles, cells) => cells.filter(({ x, y }) => isMarkerTile(tiles[y][x]))

function pickMarkers(playerCells, enemyCells, random) {
  const playerStarts = shuffle(playerCells, random).slice(0, MARKERS_PER_SIDE)
  const taken = new Set(playerStarts.map(key))
  const enemySpawns = shuffle(
    enemyCells.filter((cell) => !taken.has(key(cell))),
    random,
  ).slice(0, MARKERS_PER_SIDE)
  return { playerStarts, enemySpawns }
}

function placeMarkers(tiles, playerRoom, enemyRoom, random) {
  const openIn = (room) => markerCells(tiles, roomCells(room))
  if (playerRoom === enemyRoom) {
    const cells = openIn(playerRoom).sort((a, b) => a.x + a.y - (b.x + b.y))
    const players = Math.min(MARKERS_PER_SIDE, Math.floor(cells.length / 2))
    return {
      playerStarts: cells.slice(0, players),
      enemySpawns: cells.slice(Math.max(players, cells.length - MARKERS_PER_SIDE)).reverse(),
    }
  }
  return pickMarkers(openIn(playerRoom), openIn(enemyRoom), random)
}

function labelRegions(tiles, regions, names, random) {
  const ordered = shuffle(names, random)
  return regions.slice(0, ordered.length).flatMap((cells, i) => {
    const position = cells.find(({ x, y }) => !getTile(tiles[y][x]).solid)
    return position ? [{ name: ordered[i], position }] : []
  })
}

/**
 * Deck room grid for Generate New Map.
 * @param {{ floor: string, wall: string, door?: string, furnishRooms?: Function }} style
 */
export function makeWorldDeckGenerator({
  floor,
  wall,
  door = WORLD_DOOR_MARK,
  furnishRooms = () => {},
} = {}) {
  return function generateDeck(map, random, areaNames = []) {
    const { width, height } = map
    const tiles = makeGrid(width, height, (x, y) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? wall : floor))

    const columns = splitAxis(1, width - 2, random)
    const rows = splitAxis(1, height - 2, random)
    const grid = rows.map(([y0, y1], row) => columns.map(([x0, x1], col) => ({ row, col, x0, x1, y0, y1 })))
    const rooms = grid.flat()
    columns.slice(0, -1).forEach(([, x1]) => {
      for (let y = 1; y < height - 1; y++) tiles[y][x1 + 1] = wall
    })
    rows.slice(0, -1).forEach(([, y1]) => {
      for (let x = 1; x < width - 1; x++) tiles[y1 + 1][x] = wall
    })

    const keep = connectRooms(tiles, grid, random, door)

    const playerRow = random() < 0.5 ? 0 : rows.length - 1
    const playerCol = random() < 0.5 ? 0 : columns.length - 1
    const playerRoom = grid[playerRow][playerCol]
    const enemyRoom = grid[rows.length - 1 - playerRow][columns.length - 1 - playerCol]

    furnishRooms(tiles, keep, rooms, random, { floor, wall })

    const markers = placeMarkers(tiles, playerRoom, enemyRoom, random)
    const areas = labelRegions(tiles, rooms.map(roomCells), areaNames, random)
    return { ...map, tiles, areas, markers }
  }
}
