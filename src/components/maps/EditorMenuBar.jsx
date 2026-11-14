import { useEffect, useMemo, useRef, useState } from 'react'

// File / Edit / View / Tools / Test / Help. Tools editors also sit as toolbar icons.

const BASE_MENUS = [
  {
    id: 'file',
    label: 'File',
    items: [
      { id: 'new', label: 'New' },
      { id: 'load', label: 'Load…' },
      { id: 'openRecent', label: 'Open Recent', submenu: true },
      { id: 'save', label: 'Save' },
      { id: 'saveAs', label: 'Save As…' },
      { id: 'delete', label: 'Delete Map' },
      { sep: true },
      { id: 'back', label: 'Back to Menu' },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { id: 'undo', label: 'Undo' },
      { id: 'redo', label: 'Redo' },
      { sep: true },
      { id: 'placeTiles', label: 'Toggle Place Tiles' },
      { id: 'move', label: 'Toggle Move' },
      { sep: true },
      { id: 'autoPaint', label: 'Toggle Auto-Paint' },
      { id: 'rebuildAutoPaint', label: 'Rebuild Auto-Paint Walls' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { id: 'ghost', label: 'See-through blocks' },
      { id: 'animate', label: 'Tile animations' },
      { id: 'lighting', label: 'Lighting' },
      { id: 'surfaces', label: 'Placement surfaces' },
      { id: 'weatherFx', label: 'Weather FX' },
      { id: 'grid', label: 'Grid' },
      { id: 'gridOptions', label: 'Grid options…' },
      { id: 'viewScale', label: 'View scale…' },
      { id: 'tooltips', label: 'Tooltips' },
      { sep: true },
      { id: 'overview', label: 'Overview window' },
      { id: 'layers', label: 'Layers window' },
      { id: 'levels', label: 'Levels window' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    items: [
      { id: 'objectives', label: 'Objective Editor' },
      { id: 'objects', label: 'Object Editor' },
      { id: 'conversations', label: 'Conversation Editor' },
      { id: 'characters', label: 'Character Library' },
      { id: 'generators', label: 'Legacy Map Generator' },
      { id: 'autoPaintRuleset', label: 'World Generation Ruleset' },
      { id: 'story', label: 'Story Wording' },
    ],
  },
  {
    id: 'test',
    label: 'Test',
    items: [
      { id: 'play', label: 'Play' },
      { id: 'enemies', label: 'Toggle Enemies Active' },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { id: 'help', label: 'Keyboard Shortcuts…' },
      { sep: true },
      { id: 'about', label: 'About STA Builder' },
    ],
  },
]

function menusWithRecent(recentMaps) {
  const submenu =
    recentMaps?.length > 0
      ? recentMaps.map((entry) => ({
          id: `recent:${entry.id}`,
          label: entry.name || entry.id,
        }))
      : [{ id: 'recent:none', label: '(No recent maps)', disabled: true }]

  return BASE_MENUS.map((menu) => {
    if (menu.id !== 'file') return menu
    return {
      ...menu,
      items: menu.items.map((item) => (item.id === 'openRecent' ? { ...item, submenu } : item)),
    }
  })
}

function MenuItemButton({ item, checks, onPick }) {
  const disabled = Boolean(item.disabled)
  return (
    <button
      type="button"
      className="ed-menu-item"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        onPick(item.id)
      }}
    >
      {item.label}
      {checks[item.id] != null && <span className="ed-menu-check">{checks[item.id] ? '✓' : ''}</span>}
    </button>
  )
}

export default function EditorMenuBar({ onAction, checks = {}, menus = null, recentMaps = [] }) {
  const [open, setOpen] = useState(null)
  const [flyout, setFlyout] = useState(null)
  const root = useRef(null)
  const resolvedMenus = useMemo(() => menus ?? menusWithRecent(recentMaps), [menus, recentMaps])

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (root.current && !root.current.contains(event.target)) {
        setOpen(null)
        setFlyout(null)
      }
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const pick = (id) => {
    setOpen(null)
    setFlyout(null)
    onAction?.(id)
  }

  return (
    <div className="ed-menubar" ref={root} role="menubar">
      {resolvedMenus.map((menu) => (
        <div key={menu.id} className="ed-menu">
          <button
            type="button"
            className={`ed-menu-trigger${open === menu.id ? ' is-open' : ''}`}
            aria-haspopup="true"
            aria-expanded={open === menu.id}
            onClick={() => {
              setFlyout(null)
              setOpen((current) => (current === menu.id ? null : menu.id))
            }}
          >
            {menu.label}
          </button>
          {open === menu.id && (
            <ul className="ed-menu-list" role="menu">
              {menu.items.map((item, index) =>
                item.sep ? (
                  <li key={`sep-${index}`} className="ed-menu-sep" role="separator" />
                ) : item.submenu ? (
                  <li
                    key={item.id}
                    className={`ed-menu-flyout${flyout === item.id ? ' is-open' : ''}`}
                    role="none"
                    onPointerEnter={() => setFlyout(item.id)}
                    onPointerLeave={() => setFlyout((current) => (current === item.id ? null : current))}
                  >
                    <button type="button" className="ed-menu-item ed-menu-flyout-trigger" role="menuitem" aria-haspopup="true">
                      <span>{item.label}</span>
                      <span className="ed-menu-flyout-chevron" aria-hidden="true">
                        ›
                      </span>
                    </button>
                    {flyout === item.id && (
                      <ul className="ed-menu-list ed-menu-submenu" role="menu">
                        {(Array.isArray(item.submenu) ? item.submenu : []).map((sub) => (
                          <li key={sub.id} role="none">
                            <MenuItemButton item={sub} checks={checks} onPick={pick} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ) : (
                  <li key={item.id} role="none">
                    <MenuItemButton item={item} checks={checks} onPick={pick} />
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

export { BASE_MENUS, menusWithRecent }
