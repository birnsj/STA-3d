import { useCallback, useRef } from 'react'

/**
 * Top-down sun orbit graphic for the Map / World Generation Sun slider.
 * Azimuth matches boardSunOffset: 0° = map +y (screen-up on this dial), 90° = map +x (right).
 */
export default function BoardSunOrbitDial({
  azimuthDeg = 0,
  colour = '#fff2e0',
  shadowStrength = 1,
  onAzimuth,
}) {
  const svgRef = useRef(null)
  const dragging = useRef(false)
  const az = ((Math.round(Number(azimuthDeg)) % 360) + 360) % 360
  const rad = (az * Math.PI) / 180
  // SVG: +x right, +y down — place az=0 at top (map +y).
  const sunX = Math.sin(rad)
  const sunY = -Math.cos(rad)
  const castOpacity = 0.18 + 0.55 * Math.min(1, Math.max(0, Number(shadowStrength) || 0))

  const setFromPointer = useCallback(
    (clientX, clientY) => {
      if (!onAzimuth || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const x = clientX - (rect.left + rect.width / 2)
      const y = clientY - (rect.top + rect.height / 2)
      if (!(Math.hypot(x, y) > 2)) return
      // Invert the dial mapping: atan2(x, -y) → 0 at top.
      const next = ((Math.round((Math.atan2(x, -y) * 180) / Math.PI) % 360) + 360) % 360
      onAzimuth(next)
    },
    [onAzimuth],
  )

  const onPointerDown = (event) => {
    if (!onAzimuth) return
    event.preventDefault()
    dragging.current = true
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setFromPointer(event.clientX, event.clientY)
  }
  const onPointerMove = (event) => {
    if (!dragging.current) return
    setFromPointer(event.clientX, event.clientY)
  }
  const onPointerUp = (event) => {
    if (!dragging.current) return
    dragging.current = false
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    } catch {
      /* ignore */
    }
  }

  const R = 40
  const ring = 32
  const sunR = 5.5
  const sx = sunX * ring
  const sy = sunY * ring
  const castLen = ring * 0.72

  return (
    <div
      className={`ed-sun-dial${onAzimuth ? ' is-interactive' : ''}`}
      title={onAzimuth ? 'Drag to orbit the sun. Same angle as the Sun slider.' : undefined}
    >
      <svg
        ref={svgRef}
        className="ed-sun-dial-svg"
        viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}
        width="88"
        height="88"
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <circle className="ed-sun-dial-disc" cx="0" cy="0" r={ring + 4} />
        <circle className="ed-sun-dial-ring" cx="0" cy="0" r={ring} fill="none" />
        {/* Cast stub opposite the sun */}
        <line
          className="ed-sun-dial-cast"
          x1="0"
          y1="0"
          x2={-sunX * castLen}
          y2={-sunY * castLen}
          strokeOpacity={castOpacity}
        />
        {/* Light ray from sun into the subject */}
        <line className="ed-sun-dial-ray" x1={sx} y1={sy} x2="0" y2="0" />
        <circle className="ed-sun-dial-subject" cx="0" cy="0" r="3.2" />
        <circle className="ed-sun-dial-sun" cx={sx} cy={sy} r={sunR} fill={colour} />
        <text className="ed-sun-dial-axis" x="0" y={-(ring + 1)} textAnchor="middle" dominantBaseline="auto">
          +Y
        </text>
        <text className="ed-sun-dial-axis" x={ring + 1} y="3" textAnchor="start" dominantBaseline="middle">
          +X
        </text>
      </svg>
    </div>
  )
}
