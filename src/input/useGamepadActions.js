import { useEffect, useRef } from 'react'
import {
  BUTTON,
  createButtonEdgeTracker,
  isTypingTarget,
  readGamepad,
  requestCameraFollow,
} from './gamepad.js'

// Edge-triggered gamepad buttons for play screens. Party move is useGamepadMove; camera pan is right stick in useCamera.
// actions: {
//   enabled?,
//   onConfirm?,   // A — Catch / primary; if unset, A re-follows the camera
//   onCancel?,    // B — Escape
//   onSheet?,     // X
//   onInventory?, // Y
//   onPrevMember?, onNextMember?, // LB / RB
//   onLog?,       // Start
//   onMount?,     // Select / Back
// }

export default function useGamepadActions(actions) {
  const latest = useRef(actions)
  useEffect(() => {
    latest.current = actions
  })

  useEffect(() => {
    const tracker = createButtonEdgeTracker([
      BUTTON.A,
      BUTTON.B,
      BUTTON.X,
      BUTTON.Y,
      BUTTON.LB,
      BUTTON.RB,
      BUTTON.SELECT,
      BUTTON.START,
    ])
    let frame = 0

    const tick = () => {
      frame = requestAnimationFrame(tick)
      const { enabled = true } = latest.current
      if (!enabled || isTypingTarget()) {
        tracker.clear()
        return
      }
      const pad = readGamepad()
      if (!pad) {
        tracker.clear()
        return
      }
      const edges = tracker.edges(pad)
      if (!edges.length) return
      const {
        onConfirm,
        onCancel,
        onSheet,
        onInventory,
        onPrevMember,
        onNextMember,
        onLog,
        onMount,
      } = latest.current
      for (const button of edges) {
        if (button === BUTTON.A) {
          if (onConfirm) onConfirm()
          else requestCameraFollow()
        } else if (button === BUTTON.B) onCancel?.()
        else if (button === BUTTON.X) onSheet?.()
        else if (button === BUTTON.Y) onInventory?.()
        else if (button === BUTTON.LB) onPrevMember?.()
        else if (button === BUTTON.RB) onNextMember?.()
        else if (button === BUTTON.START) onLog?.()
        else if (button === BUTTON.SELECT) onMount?.()
      }
    }

    frame = requestAnimationFrame(tick)
    const clear = () => tracker.clear()
    window.addEventListener('blur', clear)
    window.addEventListener('gamepaddisconnected', clear)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('blur', clear)
      window.removeEventListener('gamepaddisconnected', clear)
      tracker.clear()
    }
  }, [])
}
