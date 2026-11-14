import { useEffect, useState } from 'react'

// The map editor's text box (in place of the browser's prompt, which the desktop build doesn't support): area labels and
// map names. onSave(text) gets the typed text; removeLabel adds a button that saves it empty. Escape or a click outside cancels.
export default function TextDialog({ title, message, initialValue = '', placeholder, saveLabel = 'Save', removeLabel, maxLength = 60, onSave, onCancel }) {
  const [value, setValue] = useState(initialValue)
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="me-dialog-backdrop ed-dialog-backdrop"
      onPointerDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <form
        className="me-dialog ed-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="me-text-title"
        onSubmit={(event) => {
          event.preventDefault()
          onSave(value)
        }}
      >
        <p id="me-text-title" className="me-heading ed-dialog-title">
          {title}
        </p>
        {message && <p className="me-text ed-dialog-text">{message}</p>}
        <input
          className="me-name me-label-input ed-dialog-input"
          type="text"
          value={value}
          maxLength={maxLength}
          autoFocus
          placeholder={placeholder}
          aria-label={title}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="me-dialog-actions ed-dialog-actions">
          {removeLabel && (
            <button type="button" className="me-button ed-dialog-btn" onClick={() => onSave('')}>
              {removeLabel}
            </button>
          )}
          <button type="button" className="me-button ed-dialog-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="me-button ed-dialog-btn is-primary">
            {saveLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
