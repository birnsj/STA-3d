import { useEffect } from 'react'

// Help / About for the map editor. Version string is the prototype build label.

export const STA_BUILDER_VERSION = '.001 STA Builder'

const SHORTCUTS = [
  {
    group: 'Edit',
    rows: [
      { keys: 'Ctrl+Z', action: 'Undo' },
      { keys: 'Ctrl+Y / Ctrl+Shift+Z', action: 'Redo' },
      { keys: 'Ctrl+D', action: 'Duplicate selected destructible or ground item' },
      { keys: 'R / Space', action: 'Flip tile paint axis; yaw Template Piece brush / selection +90°' },
      { keys: 'Delete / Backspace', action: 'Remove selected Template Piece, ground item, or patrol waypoint' },
      { keys: 'Esc', action: 'Cancel move / link / patrol / place; clear tool and Place Tiles' },
    ],
  },
  {
    group: 'Mouse',
    rows: [
      { keys: 'Left click / drag', action: 'Paint or place with the current tool' },
      { keys: 'Right click', action: 'Delete object under pointer (Paint / Move); else pick tile brush or turn facing' },
      { keys: 'Middle click', action: 'Same as R / Space (flip axis / rotate Template Piece)' },
      { keys: 'Right-drag / Middle-drag', action: 'Pan the camera' },
      { keys: 'Mouse wheel', action: 'Zoom' },
    ],
  },
  {
    group: 'Camera',
    rows: [
      { keys: 'W A S D', action: 'Pan' },
      { keys: 'Arrow keys', action: 'Pan' },
    ],
  },
  {
    group: 'View',
    rows: [
      { keys: 'Tab', action: 'Next guide grid size (turns the grid on)' },
      { keys: 'Shift+Tab', action: 'Previous guide grid size' },
      { keys: 'View → Tooltips', action: 'Show or hide editor hover tips (independent of Settings → Tooltips)' },
    ],
  },
]

export default function EditorHelp({ show, onClose }) {
  useEffect(() => {
    if (!show) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show, onClose])

  if (!show) return null
  return (
    <div className="ed-help" role="dialog" aria-label="Help">
      <div className="ed-help-head">
        <span>Help</span>
        <button type="button" className="me-button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="ed-help-version">{STA_BUILDER_VERSION}</p>
      <p className="me-text is-muted">Map editor keyboard and mouse shortcuts. On Mac, use Cmd in place of Ctrl.</p>
      <div className="ed-help-body">
        {SHORTCUTS.map((section) => (
          <section key={section.group} className="ed-help-section">
            <h3 className="ed-help-group">{section.group}</h3>
            <table className="ed-help-table">
              <tbody>
                {section.rows.map((row) => (
                  <tr key={row.keys}>
                    <th scope="row">
                      <kbd>{row.keys}</kbd>
                    </th>
                    <td>{row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  )
}
