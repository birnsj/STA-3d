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
  onDoorsChange,
  onWallsChange,
  onOpenHelpTopic,
  resolveDropId = null,
  acceptId = null,
  titleForTile = null,
}) {
  const selected = WORLD_GENERATION_FLOW_NODES.find((node) => node.id === selectedNodeId) ?? WORLD_GENERATION_FLOW_NODES[0]
  const showAssembly = selected.id === 'endCaps'

  const setSetting = (setting, value) => {
    if (setting.path === 'doors.preferOpenings') {
      onDoorsChange?.({ preferOpenings: Boolean(value) })
      return
    }
    if (setting.path === 'doors.minGap') {
      onDoorsChange?.({ minGap: Number(value) })
      return
    }
    onPipelineChange?.({ [setting.key]: setting.type === 'boolean' ? Boolean(value) : Number(value) })
  }

  return (
    <section className="ge-block ge-flowchart">
      <h3 className="ge-block-title">Flowchart</h3>
      <p className="ge-block-hint">
        How generation decides walls from floors. Click a step to edit its settings. Role slots below still pick the art.
        Corners opens a visual assembly of how pieces fit together.
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
        {showAssembly ? (
          <WorldGenerationPackingAssembly
            draft={draft}
            onWallsChange={onWallsChange}
            onPipelineChange={onPipelineChange}
            resolveDropId={resolveDropId}
            acceptId={acceptId}
            titleForTile={titleForTile}
          />
        ) : selected.settings.length === 0 ? (
          <p className="ge-block-hint">
            No numeric settings on this step — use the role slots below for art, or Help for the full explanation.
          </p>
        ) : (
          <div className="ge-flow-settings">
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
        )}
      </div>
    </section>
  )
}
