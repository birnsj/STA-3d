import { useEffect, useRef } from 'react'
import { dpadAxes, isTypingTarget, readGamepad, stickAxes } from './gamepad.js'

// Continuous left-stick / D-pad party move for exploration.
// While the stick is held, issues moveTo toward a point ahead of the lead (same as click-drag);
// on release, stopMove clears the selection's orders.
//
// getLeaderPosition(): { x, y } | null
// onMove(target, fresh)
// onStop()
// enabled?: boolean

const WALK_LOOKAHEAD = 1.35
const RUN_LOOKAHEAD = 3.6
const RUN_STICK = 0.72

export default function useGamepadMove({ enabled = true, getLeaderPosition, onMove, onStop }) {
  const latest = useRef({ enabled, getLeaderPosition, onMove, onStop })
  useEffect(() => {
    latest.current = { enabled, getLeaderPosition, onMove, onStop }
  })

  useEffect(() => {
    let frame = 0
    let steering = false

    const tick = () => {
      frame = requestAnimationFrame(tick)
      const { enabled: on, getLeaderPosition: leaderAt, onMove: move, onStop: stop } = latest.current
      if (!on || isTypingTarget()) {
        if (steering) {
          steering = false
          stop?.()
        }
        return
      }
      const pad = readGamepad()
      if (!pad) {
        if (steering) {
          steering = false
          stop?.()
        }
        return
      }
      const stick = stickAxes(pad, 'left')
      const padDpad = dpadAxes(pad)
      const x = stick.x + padDpad.x
      const y = stick.y + padDpad.y
      const mag = Math.hypot(x, y)
      if (mag < 0.01) {
        if (steering) {
          steering = false
          stop?.()
        }
        return
      }
      const leader = leaderAt?.()
      if (!leader) return
      const nx = x / mag
      const ny = y / mag
      const stickMag = Math.min(1, Math.hypot(stick.x, stick.y) || mag)
      const lookahead = stickMag >= RUN_STICK || Math.hypot(padDpad.x, padDpad.y) >= 0.99 ? RUN_LOOKAHEAD : WALK_LOOKAHEAD
      const fresh = !steering
      steering = true
      move?.({ x: leader.x + nx * lookahead, y: leader.y + ny * lookahead }, fresh)
    }

    frame = requestAnimationFrame(tick)
    const release = () => {
      if (!steering) return
      steering = false
      latest.current.onStop?.()
    }
    window.addEventListener('blur', release)
    window.addEventListener('gamepaddisconnected', release)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('blur', release)
      window.removeEventListener('gamepaddisconnected', release)
      release()
    }
  }, [])
}
