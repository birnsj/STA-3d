import { useState } from 'react'
import { MAX_SIZE, MIN_SIZE } from '../../maps/mapFormat.js'
import { EDITOR_GRID_SIZES } from './editorGrid.js'
import EditorSelect from './EditorSelect.jsx'

// Slim toolbar under the menu bar. Tools editors + generate actions as icon buttons
// (same commands as Tools / Properties Map). Icons are metaphors, not labels.

function Icon({ children }) {
  return (
    <svg className="ed-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      {children}
    </svg>
  )
}

/** Objective Editor — mission flag / marker. */
function IconObjectives() {
  return (
    <Icon>
      <path fill="currentColor" d="M3 2h1.2v12H3V2Zm1.8 0 7.2 2.6-7.2 2.6V2Z" />
    </Icon>
  )
}

/** Object Editor — interactive prop / console. */
function IconObjects() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M3 3.5h10v9H3v-9Zm1.5 1.5v6h7v-6h-7Zm1.2 1.2h2.2v1.4H5.7V6.2Zm3.2 0h2.2v1.4H8.9V6.2Zm-3.2 2.8h4.6v1.2H5.7V9Z"
      />
    </Icon>
  )
}

/** Conversation Editor — speech bubbles. */
function IconConversations() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M2 2.5h7.5a1 1 0 0 1 1 1V7L8.2 9H3a1 1 0 0 1-1-1V2.5Zm5.5 5.2h5.8a1 1 0 0 1 1 1v3.2a1 1 0 0 1-1 1H10l-1.8 1.6V13.7H7.5a1 1 0 0 1-1-1V8.7a1 1 0 0 1 1-1Z"
      />
    </Icon>
  )
}

/** Character Library — person bust. */
function IconCharacters() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M8 1.8a2.6 2.6 0 1 1 0 5.2A2.6 2.6 0 0 1 8 1.8ZM3.2 14c0-2.8 2.1-4.6 4.8-4.6S12.8 11.2 12.8 14H3.2Z"
      />
    </Icon>
  )
}

/** Legacy Map Generator (styles) — tile grid with pencil. */
function IconLegacyGenerator() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M2 2h5v5H2V2Zm7 0h5v5H9V2ZM2 9h5v5H2V9Zm8.1 1.4 3.2-3.2 1.4 1.4-3.2 3.2H8.1v-1.4Zm2.6 2.2.6-.6.9.9-.6.6-.9-.9Z"
      />
    </Icon>
  )
}

/** World Generation Ruleset — flowchart nodes. */
function IconWorldGen() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M6.2 1.5h3.6v2.8H6.2V1.5ZM1.5 6.2h3.6v2.8H1.5V6.2Zm9.4 0h3.6v2.8h-3.6V6.2ZM6.2 11.7h3.6v2.8H6.2v-2.8ZM7.5 4.3v1.9H5.1V6.2h1.2v1.9h1.2V6.2h1.2V4.3H7.5Zm0 4.7v2.7h1.2v-2.7H7.5Zm2.4-1.4h1.8V6.2H9.9v1.4Z"
      />
    </Icon>
  )
}

/** Story Wording — open book. */
function IconStory() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M8 3.2c-1.4-.9-3.2-1.2-5-.1v9.2c1.8-.8 3.5-.4 5 .5 1.5-.9 3.2-1.3 5-.5V3.1c-1.8-1.1-3.6-.8-5 .1Zm-1.1 1.3v7c-1.1-.5-2.3-.7-3.4-.3V4.5c1.2-.5 2.4-.3 3.4 0Zm1.1 0c1-.3 2.2-.5 3.4 0v6.7c-1.1-.4-2.3-.2-3.4.3V4.5Z"
      />
    </Icon>
  )
}

/** Run Legacy Map Generator — dice on a map grid. */
function IconRunLegacyMap() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M1.5 1.5h6v6h-6v-6Zm1.2 1.2v3.6h3.6V2.7H2.7ZM9.2 2.2h5.3v5.3H9.2V2.2Zm1.3 1.3v2.7h2.7V3.5h-2.7ZM3.5 9.5h2v2h-2v-2Zm4.2 0h2v2h-2v-2Zm4.2 0h2v2h-2v-2ZM3.5 12.8h2v2h-2v-2Zm4.2 0h2v2h-2v-2Zm4.2 0h2v2h-2v-2Z"
      />
    </Icon>
  )
}

const TOOL_BUTTONS = [
  { id: 'objectives', label: 'Objective Editor', Icon: IconObjectives, prop: 'onObjectives' },
  { id: 'objects', label: 'Object Editor', Icon: IconObjects, prop: 'onObjects' },
  { id: 'conversations', label: 'Conversation Editor', Icon: IconConversations, prop: 'onConversations' },
  { id: 'characters', label: 'Character Library', Icon: IconCharacters, prop: 'onCharacters' },
  { id: 'generators', label: 'Legacy Map Generator', Icon: IconLegacyGenerator, prop: 'onGeneratorEditor' },
  { id: 'autoPaintRuleset', label: 'World Generation Ruleset', Icon: IconWorldGen, prop: 'onAutoPaintRuleset' },
  { id: 'story', label: 'Story Wording', Icon: IconStory, prop: 'onStory' },
]

const GENERATE_BUTTONS = [
  { id: 'generateMap', label: 'Run Legacy Map Generator', Icon: IconRunLegacyMap, prop: 'onGenerateMap' },
]

function SizeFields({ width, height, onResize }) {
  const [draft, setDraft] = useState({ width, height, from: `${width}x${height}` })
  if (draft.from !== `${width}x${height}`) setDraft({ width, height, from: `${width}x${height}` })
  const field = (key) => (
    <input
      type="number"
      className="me-number"
      min={MIN_SIZE}
      max={MAX_SIZE}
      value={draft[key]}
      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
    />
  )
  const changed = Number(draft.width) !== width || Number(draft.height) !== height
  return (
    <span className="ed-seg ed-size">
      <span className="ed-size-label">Size</span>
      {field('width')}
      <span className="ed-size-x" aria-hidden="true">
        ×
      </span>
      {field('height')}
      <button type="button" className="me-button" disabled={!changed} onClick={() => onResize(Number(draft.width), Number(draft.height))}>
        Apply
      </button>
    </span>
  )
}

function IconButtonRow({ label, buttons, actions }) {
  return (
    <div className="ed-seg" role="group" aria-label={label}>
      {buttons.map(({ id, label: title, Icon, prop }) => (
        <button
          key={id}
          type="button"
          className="me-button ed-icon-btn"
          title={title}
          aria-label={title}
          onClick={() => actions[prop]?.()}
        >
          <Icon />
        </button>
      ))}
    </div>
  )
}

export default function EditorToolbar({
  map,
  dirty,
  onRename,
  onResize,
  enemiesActive,
  onEnemiesActive,
  placementPreview,
  onPlacementPreview,
  propFade = false,
  onPropFade,
  onPlay,
  placing,
  onPlacing,
  moving,
  onMoving,
  showGrid,
  onShowGrid,
  gridSize,
  onGridSize,
  onGridOptions,
  animateTiles,
  onAnimateTiles,
  onGenerateMap,
  onObjectives,
  onObjects,
  onConversations,
  onCharacters,
  onGeneratorEditor,
  onAutoPaintRuleset,
  onStory,
  overviewOpen = false,
  onOverview,
  layersOpen = false,
  onLayers,
  levelsOpen = false,
  onLevels,
}) {
  const toolActions = {
    onObjectives,
    onObjects,
    onConversations,
    onCharacters,
    onGeneratorEditor,
    onAutoPaintRuleset,
    onStory,
  }
  const generateActions = {
    onGenerateMap,
  }

  return (
    <div className="me-toolbar ed-toolbar">
      <div className="me-toolbar-row">
        <input className="me-name ed-map-name" value={map.name} aria-label="Map name" title="The map's name is also its file name" onChange={(event) => onRename(event.target.value)} />
        {dirty && <span className="ed-dirty" title="Unsaved changes">●</span>}
        <div className="ed-seg" role="group" aria-label="Brush">
          <button
            type="button"
            className={`me-button${placing ? ' is-on' : ''}`}
            aria-pressed={placing}
            title="Paint the tile chosen in Assets → Tiles"
            onClick={() => onPlacing(!placing)}
          >
            Paint
          </button>
          <button
            type="button"
            className={`me-button${moving ? ' is-on' : ''}`}
            aria-pressed={moving}
            title="Swap tiles or move markers"
            onClick={() => onMoving(!moving)}
          >
            Move
          </button>
        </div>
        <div className="ed-seg" role="group" aria-label="View">
          <button
            type="button"
            className={`me-button${animateTiles ? ' is-on' : ''}`}
            aria-pressed={animateTiles}
            title="Play animated tiles (LCARS, conduits, machinery, …)"
            onClick={() => onAnimateTiles?.(!animateTiles)}
          >
            Animate
          </button>
          <button
            type="button"
            className={`me-button${showGrid ? ' is-on' : ''}`}
            aria-pressed={showGrid}
            title="Show the guide grid overlay"
            onClick={() => onShowGrid?.(!showGrid)}
          >
            Grid
          </button>
          <EditorSelect
            className="me-select ed-grid-select"
            value={gridSize}
            aria-label="Grid size"
            title="Grid spacing in world pixels"
            disabled={!showGrid}
            onChange={(event) => onGridSize?.(Number(event.target.value))}
          >
            {EDITOR_GRID_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </EditorSelect>
          <button type="button" className="me-button ed-icon-btn" title="Grid options" aria-label="Grid options" onClick={() => onGridOptions?.()}>
            <svg className="ed-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6.2 1.2h3.6l.3 1.6a4.8 4.8 0 0 1 1.2.7l1.5-.6 1.8 3.1-1.2 1.1c.1.4.1.7.1 1.1s0 .7-.1 1.1l1.2 1.1-1.8 3.1-1.5-.6a4.8 4.8 0 0 1-1.2.7l-.3 1.6H6.2l-.3-1.6a4.8 4.8 0 0 1-1.2-.7l-1.5.6L1.4 10l1.2-1.1A4.5 4.5 0 0 1 2.5 8c0-.4 0-.7.1-1.1L1.4 5.8l1.8-3.1 1.5.6a4.8 4.8 0 0 1 1.2-.7l.3-1.6ZM8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5Z"
              />
            </svg>
          </button>
          <button
            type="button"
            className={`me-button${overviewOpen ? ' is-on' : ''}`}
            aria-pressed={overviewOpen}
            title="Overview window"
            onClick={() => onOverview?.()}
          >
            Overview
          </button>
          <button
            type="button"
            className={`me-button${layersOpen ? ' is-on' : ''}`}
            aria-pressed={layersOpen}
            title="Layers window"
            onClick={() => onLayers?.()}
          >
            Layers
          </button>
          <button
            type="button"
            className={`me-button${levelsOpen ? ' is-on' : ''}`}
            aria-pressed={levelsOpen}
            title="Levels window"
            onClick={() => onLevels?.()}
          >
            Levels
          </button>
        </div>
        <SizeFields width={map.width} height={map.height} onResize={onResize} />
        <div className="ed-toolbar-end">
          <IconButtonRow label="Tools" buttons={TOOL_BUTTONS} actions={toolActions} />
          <IconButtonRow label="Generate" buttons={GENERATE_BUTTONS} actions={generateActions} />
          <label className="me-check" title="The green or red footprint while placing an inventory object.">
            <input type="checkbox" checked={placementPreview} onChange={(event) => onPlacementPreview(event.target.checked)} /> Placement box
          </label>
          <label className="me-check" title="Props and Template Pieces turn see-through under the pointer or when a placement ghost sits behind them.">
            <input type="checkbox" checked={propFade} onChange={(event) => onPropFade(event.target.checked)} /> Fade
          </label>
          <label className="me-check" title="Off: enemies never notice the away team or start a fight.">
            <input type="checkbox" checked={enemiesActive} onChange={(event) => onEnemiesActive(event.target.checked)} /> Enemies
          </label>
          <button type="button" className="me-button is-primary" title="Play this map in game mode. The map doesn't need saving first." onClick={onPlay}>
            Play
          </button>
        </div>
      </div>
    </div>
  )
}
