// Right-click menus inside ScaledStage must live in stage/design pixels and portal into the shell.
// Client coordinates + position:fixed look/feel wrong under CSS transform:scale (and can close on open).
// Shared by EditorContextMenu and GeThumbContextMenu; kept out of the .jsx files so those export only components.

function hostOf(el) {
  return el?.closest?.('.me-screen') || el?.closest?.('.stage') || null
}

function pointInHost(clientX, clientY, host) {
  if (!host) return { x: clientX, y: clientY }
  const rect = host.getBoundingClientRect()
  const scaleX = rect.width / (host.offsetWidth || 1)
  const scaleY = rect.height / (host.offsetHeight || 1)
  if (!(scaleX > 0) || !(scaleY > 0)) return { x: clientX, y: clientY }
  return {
    x: (clientX - rect.left) / scaleX,
    y: (clientY - rect.top) / scaleY,
  }
}

export function contextMenuPlacement(event) {
  const host = hostOf(event.currentTarget)
  if (!host) return null
  const point = pointInHost(event.clientX, event.clientY, host)
  return { host, x: point.x, y: point.y }
}
