// Browser Gamepad API helpers (standard Xbox-style mapping). Presentation/input only —
// never owns game state. Poll from rAF (useCamera) or a React hook (useGamepadActions).

export const DEADZONE = 0.22

/** W3C “standard” gamepad button indices (Xbox layout). */
export const BUTTON = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
}

export const CAMERA_FOLLOW_EVENT = 'sta-camera-follow'

export function requestCameraFollow() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CAMERA_FOLLOW_EVENT))
}

export function readGamepad(preferredIndex = 0) {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null
  const pads = navigator.getGamepads()
  if (!pads) return null
  if (pads[preferredIndex]) return pads[preferredIndex]
  for (const pad of pads) {
    if (pad) return pad
  }
  return null
}

export function buttonDown(pad, index) {
  return Boolean(pad?.buttons?.[index]?.pressed)
}

/** Circular deadzone; returns −1..1 on each axis (0 when inside the deadzone). */
export function stickAxes(pad, stick = 'left', deadzone = DEADZONE) {
  if (!pad) return { x: 0, y: 0 }
  const ax = stick === 'left' ? 0 : 2
  const ay = stick === 'left' ? 1 : 3
  const x = pad.axes[ax] ?? 0
  const y = pad.axes[ay] ?? 0
  const mag = Math.hypot(x, y)
  if (mag < deadzone) return { x: 0, y: 0 }
  const scale = (mag - deadzone) / (1 - deadzone)
  return { x: (x / mag) * Math.min(1, scale), y: (y / mag) * Math.min(1, scale) }
}

/** Digital D-pad as a unit pan vector (same axes as WASD). */
export function dpadAxes(pad) {
  if (!pad) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  if (buttonDown(pad, BUTTON.LEFT)) x -= 1
  if (buttonDown(pad, BUTTON.RIGHT)) x += 1
  if (buttonDown(pad, BUTTON.UP)) y -= 1
  if (buttonDown(pad, BUTTON.DOWN)) y += 1
  return { x, y }
}

export function isTypingTarget(target = typeof document !== 'undefined' ? document.activeElement : null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

/** Tracks rising edges for the standard face / shoulder / menu buttons. */
export function createButtonEdgeTracker(indices = Object.values(BUTTON)) {
  let prev = new Set()
  return {
    edges(pad) {
      const now = new Set()
      const pressed = []
      if (pad) {
        for (const index of indices) {
          if (buttonDown(pad, index)) {
            now.add(index)
            if (!prev.has(index)) pressed.push(index)
          }
        }
      }
      prev = now
      return pressed
    },
    clear() {
      prev = new Set()
    },
  }
}
