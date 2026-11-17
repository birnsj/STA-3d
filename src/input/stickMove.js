// What a left-stick / D-pad step does on the exploration board. The first step of a push (fresh) is a new walk order, so it
// drops anything queued by an earlier click ("walk to that NPC and talk", "walk to that item and pick it up", "walk to
// that horse and mount") and closes open ring menus, exactly as a mouse click does. Later steps of the same push only
// steer. Without this, a queued pickup could still fire after the player had steered elsewhere.
export function stickMove(target, fresh, { clearPending, dispatch }) {
  if (fresh) clearPending()
  dispatch({ type: 'moveTo', target, fresh })
}
