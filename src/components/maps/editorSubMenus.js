// File menus for Map Editor full-screen Tools editors.
// Save / Load act on that editor's data — not the open map — unless the screen is map-embedded.

/** Toolbar + File → back when leaving a Tools sub-screen for Dev Edit. */
export const SUB_EDITOR_BACK_LABEL = 'Back to Editor'

/** Dirty Tools sub-screen back (confirm / discard). */
export const SUB_EDITOR_BACK_DISCARD_LABEL = 'Back (discard changes)'

export function subEditorFileMenus({
  newItem = false,
  load = true,
  save = true,
  revert = false,
  deleteItem = false,
  newLabel = 'New',
  loadLabel = 'Load…',
  saveLabel = 'Save',
  revertLabel = 'Revert',
  deleteLabel = 'Delete',
  backLabel = SUB_EDITOR_BACK_LABEL,
  extraFileItems = [],
} = {}) {
  const items = []
  if (newItem) items.push({ id: 'new', label: newLabel })
  if (load) items.push({ id: 'load', label: loadLabel })
  if (save) items.push({ id: 'save', label: saveLabel })
  if (revert) items.push({ id: 'revert', label: revertLabel })
  if (deleteItem) items.push({ id: 'delete', label: deleteLabel })
  for (const entry of extraFileItems) items.push(entry)
  if (items.length) items.push({ sep: true })
  items.push({ id: 'back', label: backLabel })
  return [{ id: 'file', label: 'File', items }]
}

/** Objectives / Objects: data lives on the open map. */
export function mapEmbeddedEditorMenus() {
  return subEditorFileMenus({
    load: true,
    save: true,
    loadLabel: 'Load Map…',
    saveLabel: 'Save Map',
    extraFileItems: [{ id: 'saveAs', label: 'Save Map As…' }],
  })
}
