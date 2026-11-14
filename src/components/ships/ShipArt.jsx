import { useState } from 'react'
import { shipEmptyArt } from '../../ships/shipArtPaths.js'

const EMPTY = shipEmptyArt()

// Screens request finished PNG paths. Missing files fall back to a PNG empty tile (never SVG).
export default function ShipArt({ src, alt = '', className = '' }) {
  // Remember which path failed rather than a bare flag, so a new src is tried afresh with no reset step.
  const [failedSrc, setFailedSrc] = useState(null)
  const failed = failedSrc === src

  const shown = failed ? EMPTY : (src || EMPTY)
  return (
    <span className={`ship-art ${className}`}>
      <img
        src={shown}
        alt={alt}
        draggable={false}
        onError={() => {
          if (!failed) setFailedSrc(src)
        }}
      />
    </span>
  )
}
