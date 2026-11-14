import { useEffect } from 'react'
import { WORLD_GENERATION_HELP_TOPICS } from '../../data/adaptation/maps/worldGenerationWorkflow.js'

/** Help menu dialog — topics come from worldGenerationWorkflow.js. */
export default function WorldGenerationHelpDialog({ topicId, onClose, onSelectTopic }) {
  const topic =
    WORLD_GENERATION_HELP_TOPICS.find((entry) => entry.id === topicId) ?? WORLD_GENERATION_HELP_TOPICS[0]

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!topic) return null

  return (
    <div className="me-dialog-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="me-dialog ge-help-dialog" role="dialog" aria-modal="true" aria-labelledby="wg-help-title">
        <p id="wg-help-title" className="me-heading">
          Help
        </p>
        <div className="ge-help-layout">
          <nav className="ge-help-nav" aria-label="Help topics">
            {WORLD_GENERATION_HELP_TOPICS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`me-button ge-help-nav-btn${entry.id === topic.id ? ' is-on' : ''}`}
                onClick={() => onSelectTopic?.(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </nav>
          <div className="ge-help-body">
            <p className="ce-heading">{topic.title}</p>
            {topic.body.map((line) => (
              <p key={line} className="ge-block-hint">
                {line}
              </p>
            ))}
            <p className="ge-block-hint ge-help-edit-hint">
              Edit copy in src/data/adaptation/maps/worldGenerationWorkflow.js
            </p>
          </div>
        </div>
        <div className="me-dialog-actions">
          <button type="button" className="me-button is-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
