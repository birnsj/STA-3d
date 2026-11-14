import { useRef } from 'react'
import '../conversation/conversationEditor.css'
import './mapEditor.css'
import EditorMenuBar from './EditorMenuBar.jsx'
import EditorTips from './EditorTips.jsx'

// Shared chrome for Mission full-screen editors: Map Editor ed-shell look.
// Optional menus → top main menu bar (File Save/Load for this editor's data).
// With title/toolbar: secondary action row + body. Without title/toolbar: children fill the shell
// (Conversation keeps a custom toolbar under the menu bar).
export default function EditorSubScreen({
  title = null,
  toolbar = null,
  menus = null,
  onMenuAction = null,
  menuChecks = {},
  children,
  className = '',
  shellRef = null,
  /** When set, mount EditorTips on this shell (View → Tooltips). */
  showTooltips = null,
}) {
  const localShellRef = useRef(null)
  const setShellRef = (node) => {
    localShellRef.current = node
    if (typeof shellRef === 'function') shellRef(node)
    else if (shellRef) shellRef.current = node
  }
  const classes = `me-screen ed-shell ess-screen ${className}`.trim()
  const hasMenu = Array.isArray(menus) && menus.length > 0 && typeof onMenuAction === 'function'
  const hasToolbar = title != null || toolbar != null
  const tips =
    showTooltips != null ? <EditorTips rootRef={localShellRef} enabled={Boolean(showTooltips)} /> : null

  if (!hasMenu && !hasToolbar) {
    return (
      <div ref={setShellRef} className={classes}>
        {tips}
        {children}
      </div>
    )
  }

  return (
    <div ref={setShellRef} className={classes}>
      {tips}
      {hasMenu ? <EditorMenuBar menus={menus} onAction={onMenuAction} checks={menuChecks} /> : null}
      {hasToolbar ? (
        <>
          <div className="ess-toolbar">
            {title ? <strong className="ess-title">{title}</strong> : null}
            {toolbar}
          </div>
          <div className="ess-body">{children}</div>
        </>
      ) : (
        children
      )}
    </div>
  )
}
