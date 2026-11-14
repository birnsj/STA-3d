import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import ConfirmDialog from './ConfirmDialog.jsx'

// Editor-styled right-click menu (ed-menu-item), portaled into the map-editor shell.
export function GeThumbDeleteMenu({ x, y, host, onDelete, onClose }) {
  const root = useRef(null)

  useEffect(() => {
    const onPointer = (event) => {
      if (root.current?.contains(event.target)) return
      onClose()
    }
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointer, true)
      window.addEventListener('keydown', onKey, true)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  if (!host) return null

  return createPortal(
    <ul
      ref={root}
      className="ed-menu-list ge-ctx-menu"
      style={{ left: x, top: y }}
      role="menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      <li>
        <button type="button" className="ed-menu-item" role="menuitem" onClick={onDelete}>
          Delete
        </button>
      </li>
    </ul>,
    host,
  )
}

// Editor ConfirmDialog, portaled over the Generator Editor shell.
export function GeThumbDeleteConfirm({ label, host, onConfirm, onCancel }) {
  if (!host) return null
  return createPortal(
    <ConfirmDialog
      title="Remove from slot?"
      message={`Remove “${label}” from this slot?`}
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
    host,
  )
}
