import { WORLD_GENERATION_FLOW_NODES } from '../../data/adaptation/maps/worldGenerationWorkflow.js'
import WorldGenerationPackingAssembly from './WorldGenerationPackingAssembly.jsx'

function readSetting(draft, setting) {
  if (setting.path === 'doors.preferOpenings') return draft.doors?.preferOpenings !== false
  if (setting.path === 'doors.minGap') return draft.doors?.minGap ?? 1
  return draft.pipeline?.[setting.key]
}

/** Visual pipeline + selected-node settings (writes into ruleset draft). */
export default function WorldGenerationFlowchart({
  draft,
  selectedNodeId,
  onSelectNode,
  onPipelineChange,
  onFloorsChange,
  onDoorsChange,
  onWallsChange,
  onOpenHelpTopic,
  resolveDropId = null,
  acceptId = null,
  titleForTile = null,
}) {
  const selected = WORLD_GENERATION_FLOW_NODES.find((node) => node.id === selectedNodeId) ?? WORLD_GENERATION_FLOW_NODES[0]

  const setSetting = (setting, value) => {
    if (setting.path === 'doors.preferOpenings') {
      onDoorsChange?.({ preferOpenings: Boolean(value) })
      return
    }
    if (setting.path === 'doors.minGap') {
      onDoorsChange?.({ minGap: Number(value) })
      return
    }
    if (setting.type === 'boolean') {
      onPipelineChange?.({ [setting.key]: Boolean(value) })
      return
    }
    const num = Number(value)
    // Door gap ↔ lining stay paired: cells×2 tip slots; lining is tipUnits (default cells×2−1 so one tip
    // remains for the jamb). Changing one updates the other so Generate cannot drift out of sync.
    if (setting.key === 'doorCells') {
      const doorCells = Math.min(setting.max, Math.max(setting.min, Math.round(num) || setting.min))
      const doorTipUnits = Math.min(6, Math.max(1, doorCells * 2 - 1))
      onPipelineChange?.({ doorCells, doorTipUnits })
      return
    }
    if (setting.key === 'doorTipUnits') {
      const doorTipUnits = Math.min(setting.max, Math.max(setting.min, Math.round(num) || setting.min))
      const doorCells = Math.min(4, Math.max(1, Math.ceil(doorTipUnits / 2)))
      onPipelineChange?.({ doorTipUnits, doorCells })
      return
    }
    onPipelineChange?.({ [setting.key]: num })
  }

  return (
    <div className="ge-flowchart">
      <p className="ge-block-hint">
        How generation decides walls from floors. Click a step for its visual assembly (same style as Corners) and any
        settings. Role slots below still pick the art.
      </p>
      <div className="ge-flow-row" role="list">
        {WORLD_GENERATION_FLOW_NODES.map((node, index) => (
          <div key={node.id} className="ge-flow-item" role="listitem">
            {index > 0 ? (
              <span className="ge-flow-arrow" aria-hidden="true">
                →
              </span>
            ) : null}
            <button
              type="button"
              className={`ge-flow-node${node.id === selected.id ? ' is-selected' : ''}`}
              onClick={() => onSelectNode?.(node.id)}
              title={node.summary}
            >
              <span className="ge-flow-node-label">{node.label}</span>
              <span className="ge-flow-node-summary">{node.summary}</span>
            </button>
          </div>
        ))}
      </div>

      <div className="ge-flow-detail">
        <div className="ge-flow-detail-head">
          <p className="ce-heading">{selected.label}</p>
          {selected.helpTopicId ? (
            <button type="button" className="me-button" onClick={() => onOpenHelpTopic?.(selected.helpTopicId)}>
              Help: {selected.label}
            </button>
          ) : null}
        </div>
        <p className="ge-block-hint">{selected.summary}</p>
        <WorldGenerationPackingAssembly
          nodeId={selected.id}
          draft={draft}
          onFloorsChange={onFloorsChange}
          onDoorsChange={onDoorsChange}
          onWallsChange={onWallsChange}
          onPipelineChange={onPipelineChange}
          resolveDropId={resolveDropId}
          acceptId={acceptId}
          titleForTile={titleForTile}
        />
        {selected.settings.length > 0 ? (
          <div className="ge-flow-settings">
            {selected.settingsHint ? <p className="ge-block-hint">{selected.settingsHint}</p> : null}
            {selected.settings.map((setting) => {
              const value = readSetting(draft, setting)
              if (setting.type === 'boolean') {
                return (
                  <label key={setting.key} className="ge-section-check">
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) => setSetting(setting, event.target.checked)}
                    />
                    {setting.label}
                  </label>
                )
              }
              return (
                <label key={setting.key} className="me-field ge-flow-number">
                  <span className="ce-field-label">{setting.label}</span>
                  <input
                    className="me-name"
                    type="number"
                    min={setting.min}
                    max={setting.max}
                    step={setting.step}
                    value={Number(value) || 0}
                    onChange={(event) => setSetting(setting, event.target.value)}
                  />
                </label>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
