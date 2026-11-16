import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDisplaySettings } from '../../settings/DisplaySettingsContext.js'

// Presentation only: which part of the battlefield is on screen. WASD / arrow keys, right-click drag, one-finger drag,
// or (when edge scrolling is on) holding the pointer at the map's edge pans; the mouse wheel zooms. When focus.key
// changes (a new turn, or a unit finished a move) the camera glides to centre focus.point. Never touches combat state.
const PAN_SPEED = 700
// Screen pixels at the map's edge that pan the camera (debug paints this band when Debug is on).
// Kept narrow so it does not fight Camera Follow across half the board.
export const EDGE_MARGIN = 48
// Share of the remaining gap closed per 60 Hz frame.
// Active follow sticks hard on the lead (~1–2 frames of lag). Soft return after a free pan.
const GLIDE = 0.45
const RETURN_GLIDE = 0.16
// After WASD / drag release: keep coasting, then slow each 60 Hz frame by this factor.
const COAST_FRICTION = 0.92
const COAST_STOP = 12
// Display setting wasdCoast (0–100) scales WASD after-glide: 100 = this full coast, 0 = stop on release.
const KEYS = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] }

function clampAxis(value, min, max, view) {
  if (max - min <= view) return (min + max - view) / 2
  return Math.min(Math.max(value, min), max - view)
}

const clamp = (camera, bounds, view) => ({
  x: clampAxis(camera.x, bounds.minX, bounds.maxX, view.width),
  y: clampAxis(camera.y, bounds.minY, bounds.maxY, view.height),
})

const centredOn = (point, view) => ({ x: point.x - view.width / 2, y: point.y - view.height / 2 })

const TOUCH_SLOP = 10
const MIN_ZOOM = 0.6
const ZOOM_STEP = 1.15
// One closer wheel step than the original 2× cap, shared by exploration, combat, and the map editor.
const MAX_ZOOM = 2 * ZOOM_STEP
// Wheel → target zoom: pixel delta scale (trackpads send small values; mice ~100/notch).
const ZOOM_WHEEL_GAIN = 0.00135
// Share of remaining zoom gap closed per 60 Hz frame (higher = snappier, lower = silkier).
const ZOOM_GLIDE = 0.22

function swallowNextClick() {
  const swallow = (event) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  // If the browser sends no click after the drag, don't eat the next real tap.
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400)
}

const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

// -1..1 on each axis: how far into the edge band the pointer is, toward that side of the map. Outside the band, or
// when the map is too small to have a band, both are 0.
function edgeScroll(x, y, width, height, margin = EDGE_MARGIN) {
  if (width < margin * 2 || height < margin * 2) return { x: 0, y: 0 }
  if (x < 0 || y < 0 || x > width || y > height) return { x: 0, y: 0 }
  let ex = 0
  let ey = 0
  if (x < margin) ex = -((margin - x) / margin)
  else if (x > width - margin) ex = (x - (width - margin)) / margin
  if (y < margin) ey = -((margin - y) / margin)
  else if (y > height - margin) ey = (y - (height - margin)) / margin
  return { x: ex, y: ey }
}

const overControl = (target) => target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, label, [role="button"]'))

// bounds: world rectangle { minX, maxX, minY, maxY }; view: { width, height }; focus: { key, point }.
// follow false: the camera stays where the player left it (it still starts centred on focus).
// onRightClick: a right-button press released without dragging (a drag pans instead).
// rightPans: the right button drags the camera too (false where it has another use). The middle button always does.
// The mouse wheel zooms; zoom divides the visible world size, so 2 shows half as much at twice the size. Following, it
// zooms around the followed point so that stays put on screen; free, it zooms toward the pointer.
// onPan(): the player started panning by key or drag while the camera follows (so the caller can stop following;
// turning follow back on glides the camera back to focus.point).
// onFollow(): Space asks the caller to turn following back on after a free pan (exploration flips followCamera).
// edgeScrollEnabled: the pointer at the map's edge pans. Exploration and combat leave it on. The map editor passes false.
// onSpace: when set (map editor), Space runs this instead of camera re-follow (rotate / flip paint axis).
// onMiddleClick: middle button released without dragging (map editor: same as Space / R).
export default function useCamera(
  bounds,
  view,
  focus,
  follow = true,
  onRightClick = null,
  rightPans = true,
  onPan = null,
  onFollow = null,
  edgeScrollEnabled = true,
  onSpace = null,
  onMiddleClick = null,
) {
  const wasdCoast = useDisplaySettings().wasdCoast ?? 100
  const [camera, setCamera] = useState(() => clamp(centredOn(focus.point, view), bounds, view))
  const [zoom, setZoom] = useState(1)
  const cameraRef = useRef(camera)
  const zoomRef = useRef(zoom)
  // Wheel updates the target; the tick eases zoomRef toward it so notches don't jump the board.
  const zoomTargetRef = useRef(1)
  // World point kept under the cursor (or follow focus) while zoom is easing.
  const zoomAnchorRef = useRef(null)
  const zoomingRef = useRef(false)
  const viewSizeRef = useRef({ width: view.width, height: view.height })
  // The world point the camera is gliding to centre on (not a corner), so a zoom mid-glide doesn't restart it.
  const targetRef = useRef(null)
  const heldRef = useRef(new Set())
  const svgRef = useRef(null)
  const followRef = useRef({ follow, point: focus.point })
  // True from following being turned back on until the camera arrives (RETURN_GLIDE).
  const returningRef = useRef(false)
  const wasFollowingRef = useRef(follow)
  const onPanRef = useRef(onPan)
  const onFollowRef = useRef(onFollow)
  const onSpaceRef = useRef(onSpace)
  const onMiddleClickRef = useRef(onMiddleClick)
  const wasdCoastRef = useRef(wasdCoast)
  // True while WASD / arrows are held, so the first coast frame can scale after-glide by wasdCoast.
  const keyPanningRef = useRef(false)
  // True while a glide, key-pan or drag is in flight (see writeViewBox).
  const movingRef = useRef(false)
  // World units per second from the last pan; decays with COAST_FRICTION after release.
  const velocityRef = useRef({ x: 0, y: 0 })
  // Pointer in the map's edge band, as edgeScroll() reports it. Edge panning stops dead when the pointer leaves;
  // it does not coast the way WASD and a drag do. edgeEnabledRef follows the editor's checkbox.
  const edgeRef = useRef({ x: 0, y: 0 })
  const edgeEnabledRef = useRef(edgeScrollEnabled)
  const edgeDrivingRef = useRef(false)
  // True while a mouse or touch drag owns the camera, so the edge band does not fight it.
  const draggingRef = useRef(false)
  useEffect(() => {
    onPanRef.current = onPan
    onFollowRef.current = onFollow
    onSpaceRef.current = onSpace
    onMiddleClickRef.current = onMiddleClick
  })
  useEffect(() => {
    wasdCoastRef.current = wasdCoast
  }, [wasdCoast])
  useEffect(() => {
    edgeEnabledRef.current = edgeScrollEnabled
    if (!edgeScrollEnabled) edgeRef.current = { x: 0, y: 0 }
  }, [edgeScrollEnabled])
  // True from the first pan input until coast settles. Blocks follow from re-arming a target mid-pan / mid-coast
  // (exploration still ticks the lead every frame, which would otherwise cancel WASD glide).
  const freePanRef = useRef(false)
  // Stops the follow straight away (before the caller re-renders) so it doesn't pull against the player's pan.
  const panStarted = () => {
    targetRef.current = null
    returningRef.current = false
    freePanRef.current = true
    if (!followRef.current.follow || !onPanRef.current) return
    followRef.current = { ...followRef.current, follow: false }
    onPanRef.current?.()
  }
  // Space (and turning follow back on): drop any pan/coast and glide to the current focus point.
  const beginReturnToFocus = () => {
    heldRef.current.clear()
    velocityRef.current = { x: 0, y: 0 }
    freePanRef.current = false
    returningRef.current = true
    targetRef.current = { x: followRef.current.point.x, y: followRef.current.point.y }
  }
  const endFreePan = () => {
    velocityRef.current = { x: 0, y: 0 }
    freePanRef.current = false
    if (followRef.current.follow) {
      returningRef.current = true
      targetRef.current = { x: followRef.current.point.x, y: followRef.current.point.y }
    }
  }
  const { minX, maxX, minY, maxY } = bounds
  const width = view.width / zoom
  const height = view.height / zoom
  const { x: focusX, y: focusY } = focus.point
  viewSizeRef.current = { width: view.width, height: view.height }

  // A camera move changes nothing on the board except which part of it is on screen, but it happens on every animation
  // frame of a glide or drag. Writing the viewBox straight onto the element keeps those frames out of React, which would
  // otherwise rebuild the board's hundreds of tiles each time; the state is committed once the move settles.
  const writeViewBox = (point, size = null) => {
    const live = size ?? { width: viewSizeRef.current.width / zoomRef.current, height: viewSizeRef.current.height / zoomRef.current }
    svgRef.current?.setAttribute('viewBox', `${point.x} ${point.y} ${live.width} ${live.height}`)
  }

  // React renders the viewBox from state, which lags behind during a move: put the live camera back after every render.
  useLayoutEffect(() => {
    if (movingRef.current || zoomingRef.current) writeViewBox(cameraRef.current)
  })

  useEffect(() => {
    const element = svgRef.current
    if (!element) return undefined
    // Native listener: React's wheel handler is passive and can't stop the page from scrolling.
    const wheel = (event) => {
      event.preventDefault()
      // Continuous delta (trackpad + mouse). Line/page modes → approximate pixels.
      let dy = event.deltaY
      if (event.deltaMode === 1) dy *= 16
      else if (event.deltaMode === 2) dy *= viewSizeRef.current.height || 800
      const from = zoomTargetRef.current
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, from * Math.exp(-dy * ZOOM_WHEEL_GAIN)))
      if (nextZoom === from) return
      const oldZoom = zoomRef.current
      const oldSize = {
        width: viewSizeRef.current.width / oldZoom,
        height: viewSizeRef.current.height / oldZoom,
      }
      const current = cameraRef.current
      const following = followRef.current.follow
      let anchor
      if (following) {
        anchor = { x: followRef.current.point.x, y: followRef.current.point.y }
      } else {
        const rect = element.getBoundingClientRect()
        anchor = {
          x: current.x + ((event.clientX - rect.left) / rect.width) * oldSize.width,
          y: current.y + ((event.clientY - rect.top) / rect.height) * oldSize.height,
        }
      }
      zoomAnchorRef.current = {
        x: anchor.x,
        y: anchor.y,
        fx: (anchor.x - current.x) / oldSize.width,
        fy: (anchor.y - current.y) / oldSize.height,
        following,
      }
      if (!following) targetRef.current = null
      zoomTargetRef.current = nextZoom
      zoomingRef.current = true
      movingRef.current = true
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [minX, maxX, minY, maxY])

  useEffect(() => {
    if (follow && !wasFollowingRef.current) beginReturnToFocus()
    wasFollowingRef.current = follow
    followRef.current = { follow, point: { x: focusX, y: focusY } }
    // While the player is panning or coasting, leave the target alone so follow ticks cannot cancel the glide.
    if (freePanRef.current) return
    targetRef.current = follow ? { x: focusX, y: focusY } : null
  }, [focus.key, focusX, focusY, follow])

  useEffect(() => {
    const down = (event) => {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault()
        // Map editor: Space flips paint axis / rotates Template Piece (same as R). Play: re-follow.
        if (onSpaceRef.current) {
          onSpaceRef.current()
          return
        }
        // After WASD / drag free-pan: glide back onto the followed point and ask the caller to turn follow on.
        beginReturnToFocus()
        if (!followRef.current.follow) onFollowRef.current?.()
        return
      }
      const key = event.key.toLowerCase()
      if (!KEYS[key]) return
      event.preventDefault()
      heldRef.current.add(key)
    }
    const up = (event) => heldRef.current.delete(event.key.toLowerCase())
    const clear = () => heldRef.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useEffect(() => {
    const limits = { minX, maxX, minY, maxY }
    let frame
    let last = performance.now()
    const tick = (now) => {
      const seconds = Math.min(50, now - last) / 1000
      last = now
      // Live zoom size — do not close over React zoom or wheel easing fights a stale viewBox.
      const liveZoom = zoomRef.current
      const size = {
        width: viewSizeRef.current.width / liveZoom,
        height: viewSizeRef.current.height / liveZoom,
      }
      let dx = 0
      let dy = 0
      for (const key of heldRef.current) {
        dx += KEYS[key][0]
        dy += KEYS[key][1]
      }
      let current = cameraRef.current
      let next = null
      let zoomChanged = false
      let zoomSettled = false

      // Ease zoom toward the wheel target; keep the anchor under the cursor / follow point.
      if (zoomingRef.current) {
        const want = zoomTargetRef.current
        const gap = want - liveZoom
        if (Math.abs(gap) < 0.0008) {
          zoomRef.current = want
          zoomingRef.current = false
          zoomChanged = true
          zoomSettled = true
        } else {
          const ease = 1 - (1 - ZOOM_GLIDE) ** (seconds * 60)
          zoomRef.current = liveZoom + gap * ease
          zoomChanged = true
        }
        const z = zoomRef.current
        const newSize = {
          width: viewSizeRef.current.width / z,
          height: viewSizeRef.current.height / z,
        }
        const anchor = zoomAnchorRef.current
        if (anchor) {
          const focusPoint = anchor.following ? followRef.current.point : anchor
          const fx = anchor.following
            ? (focusPoint.x - current.x) / size.width
            : anchor.fx
          const fy = anchor.following
            ? (focusPoint.y - current.y) / size.height
            : anchor.fy
          const ax = anchor.following ? focusPoint.x : anchor.x
          const ay = anchor.following ? focusPoint.y : anchor.y
          next = clamp({ x: ax - fx * newSize.width, y: ay - fy * newSize.height }, limits, newSize)
          cameraRef.current = next
          current = next
        }
        size.width = newSize.width
        size.height = newSize.height
      }

      const edge = edgeRef.current
      const edgeActive = !draggingRef.current && (edge.x !== 0 || edge.y !== 0)
      if (dx || dy) {
        panStarted()
        keyPanningRef.current = true
        edgeDrivingRef.current = false
        const length = Math.hypot(dx, dy) || 1
        velocityRef.current = { x: (dx / length) * PAN_SPEED, y: (dy / length) * PAN_SPEED }
        next = clamp({ x: current.x + velocityRef.current.x * seconds, y: current.y + velocityRef.current.y * seconds }, limits, size)
      } else if (edgeActive) {
        panStarted()
        keyPanningRef.current = false
        edgeDrivingRef.current = true
        const length = Math.hypot(edge.x, edge.y) || 1
        const intensity = Math.min(1, Math.max(Math.abs(edge.x), Math.abs(edge.y)))
        velocityRef.current = { x: (edge.x / length) * PAN_SPEED * intensity, y: (edge.y / length) * PAN_SPEED * intensity }
        next = clamp({ x: current.x + velocityRef.current.x * seconds, y: current.y + velocityRef.current.y * seconds }, limits, size)
      } else if (edgeDrivingRef.current) {
        edgeDrivingRef.current = false
        // A drag that began at the edge keeps its own coast; leaving the band otherwise stops at once.
        if (!draggingRef.current) {
          velocityRef.current = { x: 0, y: 0 }
          endFreePan()
        }
      } else if (freePanRef.current) {
        // WASD / drag coast: keep sliding after release, then ease to a stop (takes priority over follow).
        // WASD after-glide is scaled by Settings > WASD After Glide (0 = stop on release, 100 = full coast).
        if (keyPanningRef.current) {
          keyPanningRef.current = false
          const scale = Math.min(1, Math.max(0, wasdCoastRef.current / 100))
          velocityRef.current = { x: velocityRef.current.x * scale, y: velocityRef.current.y * scale }
        }
        const velocity = velocityRef.current
        const speed = Math.hypot(velocity.x, velocity.y)
        if (speed > COAST_STOP) {
          next = clamp({ x: current.x + velocity.x * seconds, y: current.y + velocity.y * seconds }, limits, size)
          const friction = COAST_FRICTION ** (seconds * 60)
          velocityRef.current = { x: velocity.x * friction, y: velocity.y * friction }
          // Hit the map edge: drop the axis that cannot move so the other can still coast.
          if (next.x === current.x) velocityRef.current.x = 0
          if (next.y === current.y) velocityRef.current.y = 0
        } else {
          endFreePan()
        }
      } else if (!zoomingRef.current && (followRef.current.follow || targetRef.current)) {
        velocityRef.current = { x: 0, y: 0 }
        // While following, chase the live focus point every frame — don't drop the target on arrival
        // or the camera freezes between React position updates.
        const focusPoint = followRef.current.follow ? followRef.current.point : targetRef.current
        const target = clamp(centredOn(focusPoint, size), limits, size)
        const close = Math.abs(target.x - current.x) < 0.35 && Math.abs(target.y - current.y) < 0.35
        // GLIDE is the share of the way covered per 60 Hz frame; scaled by the real frame time so the camera moves at the
        // same speed whatever the refresh rate and however uneven the frames (a fixed share per frame juddered).
        const glide = 1 - (1 - (returningRef.current ? RETURN_GLIDE : GLIDE)) ** (seconds * 60)
        next = close ? target : { x: current.x + (target.x - current.x) * glide, y: current.y + (target.y - current.y) * glide }
        if (close && !followRef.current.follow) {
          targetRef.current = null
          returningRef.current = false
        } else if (close && returningRef.current) {
          returningRef.current = false
        }
      }
      if (next && (next.x !== cameraRef.current.x || next.y !== cameraRef.current.y || zoomChanged)) {
        cameraRef.current = next
        movingRef.current = true
        writeViewBox(next, size)
      } else if (zoomChanged) {
        movingRef.current = true
        writeViewBox(cameraRef.current, size)
      } else if (movingRef.current && !zoomingRef.current) {
        // Settled: one render to put the element's viewBox and React's idea of the camera back in step.
        if (freePanRef.current) endFreePan()
        movingRef.current = false
        setCamera(cameraRef.current)
      }
      if (zoomSettled) {
        setZoom(zoomRef.current)
        setCamera(cameraRef.current)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [minX, maxX, minY, maxY])

  // Right-button drag (mouse) or one-finger drag (touch): the world follows the pointer. Screen pixels are converted to
  // world pixels using the element's on-screen size, because the whole stage is scaled to fit the window.
  // A touch only pans once it has moved past TOUCH_SLOP, so a tap still selects a tile or unit; after a pan, the click
  // the browser sends on release is swallowed so the drag doesn't also move the character.
  const startDrag = (event) => {
    const isTouch = event.pointerType === 'touch'
    // A middle-button press would start the browser's autoscroll; the wheel zooms instead.
    if (!isTouch && event.button === 1) event.preventDefault()
    if (isTouch ? !event.isPrimary : !(event.button === 1 || (rightPans && event.button === 2))) return
    if (!isTouch) event.preventDefault()
    const liveSize = {
      width: viewSizeRef.current.width / zoomRef.current,
      height: viewSizeRef.current.height / zoomRef.current,
    }
    const scale = event.currentTarget.getBoundingClientRect().width / liveSize.width
    const start = { x: event.clientX, y: event.clientY, camera: cameraRef.current }
    let panning = !isTouch
    let dragged = false
    if (panning) {
      targetRef.current = null
      velocityRef.current = { x: 0, y: 0 }
    }
    let announced = false
    let lastSample = { x: event.clientX, y: event.clientY, at: performance.now() }
    if (panning) draggingRef.current = true
    const move = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return
      if (Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) >= TOUCH_SLOP) dragged = true
      if (!panning) {
        if (Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) < TOUCH_SLOP) return
        panning = true
      }
      if (!announced) {
        announced = true
        keyPanningRef.current = false
        draggingRef.current = true
        panStarted()
      }
      const next = clamp(
        { x: start.camera.x - (moveEvent.clientX - start.x) / scale, y: start.camera.y - (moveEvent.clientY - start.y) / scale },
        { minX, maxX, minY, maxY },
        liveSize,
      )
      const now = performance.now()
      const dt = Math.max(1, now - lastSample.at) / 1000
      // Pointer drag is absolute from the press; sample recent motion so release can coast.
      velocityRef.current = {
        x: -(moveEvent.clientX - lastSample.x) / scale / dt,
        y: -(moveEvent.clientY - lastSample.y) / scale / dt,
      }
      lastSample = { x: moveEvent.clientX, y: moveEvent.clientY, at: now }
      cameraRef.current = next
      movingRef.current = true
      writeViewBox(next)
    }
    const end = (endEvent) => {
      if (endEvent.pointerId !== event.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      draggingRef.current = false
      // Leave velocity for the tick loop to coast; only snap-stop a tap that never panned.
      if (!panning || !dragged) velocityRef.current = { x: 0, y: 0 }
      if (movingRef.current && Math.hypot(velocityRef.current.x, velocityRef.current.y) <= COAST_STOP) {
        movingRef.current = false
        setCamera(cameraRef.current)
      }
      if (isTouch && panning) swallowNextClick()
      if (!isTouch && !dragged && event.button === 2) onRightClick?.()
      if (!isTouch && !dragged && event.button === 1) onMiddleClickRef.current?.()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  // The map's own edge, in screen pixels (the stage is scaled). Only while the pointer is on the map: a panel, menu
  // or button on top does not scroll, and neither does a camera drag.
  useEffect(() => {
    const update = (event) => {
      const element = svgRef.current
      if (!edgeEnabledRef.current || !element || event.pointerType === 'touch' || draggingRef.current || !element.contains(event.target) || overControl(event.target)) {
        edgeRef.current = { x: 0, y: 0 }
        return
      }
      const rect = element.getBoundingClientRect()
      edgeRef.current = edgeScroll(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height)
    }
    const clear = () => {
      edgeRef.current = { x: 0, y: 0 }
    }
    window.addEventListener('pointermove', update)
    window.addEventListener('blur', clear)
    document.documentElement.addEventListener('mouseleave', clear)
    return () => {
      window.removeEventListener('pointermove', update)
      window.removeEventListener('blur', clear)
      document.documentElement.removeEventListener('mouseleave', clear)
      edgeRef.current = { x: 0, y: 0 }
    }
  }, [])

  const dragHandlers = { ref: svgRef, onPointerDown: startDrag, onContextMenu: (event) => event.preventDefault() }
  return { camera: { ...camera, width, height }, dragHandlers }
}
