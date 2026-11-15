import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Expand #rgb → #rrggbb; return null if invalid. */
export function normalizeHexColour(raw, fallback = '#ffffff') {
  if (typeof raw !== 'string') return fallback
  let value = raw.trim()
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    value = `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return fallback
  return value.toLowerCase()
}

function hexToRgb(hex) {
  const value = normalizeHexColour(hex, '#ffffff').slice(1)
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

function rgbToHex(r, g, b) {
  const to = (n) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function rgbToHsv(r, g, b) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
    else if (max === gn) h = ((bn - rn) / d + 2) / 6
    else h = ((rn - gn) / d + 4) / 6
  }
  const s = max === 0 ? 0 : d / max
  return { h: h * 360, s, v: max }
}

function hsvToRgb(h, s, v) {
  const hh = (((h % 360) + 360) % 360) / 60
  const c = v * s
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (hh < 1) [r, g, b] = [c, x, 0]
  else if (hh < 2) [r, g, b] = [x, c, 0]
  else if (hh < 3) [r, g, b] = [0, c, x]
  else if (hh < 4) [r, g, b] = [0, x, c]
  else if (hh < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

function hsvToHex(h, s, v) {
  const { r, g, b } = hsvToRgb(h, s, v)
  return rgbToHex(r, g, b)
}

function hueCss(h) {
  return hsvToHex(h, 1, 1)
}

/**
 * Editor colour field: swatch + hex, with an in-theme HSV popover (no native OS picker).
 * presets: optional [{ colour, label }].
 */
export default function EditorColourField({
  value,
  onChange,
  label,
  title,
  ariaLabel,
  presets = null,
  className = '',
}) {
  const colour = normalizeHexColour(value, '#ffffff')
  const [open, setOpen] = useState(false)
  const [hexDraft, setHexDraft] = useState(colour)
  const [hsv, setHsv] = useState(() => {
    const { r, g, b } = hexToRgb(colour)
    return rgbToHsv(r, g, b)
  })
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const svRef = useRef(null)
  const hueRef = useRef(null)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const panelId = useId()

  useEffect(() => {
    const next = normalizeHexColour(value, '#ffffff')
    setHexDraft(next)
    const { r, g, b } = hexToRgb(next)
    setHsv(rgbToHsv(r, g, b))
  }, [value])

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return
    const place = () => {
      const rect = rootRef.current.getBoundingClientRect()
      const width = 220
      const height = presets?.length ? 248 : 210
      let left = rect.left
      let top = rect.bottom + 6
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8)
      if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6)
      setPanelPos({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, presets])

  useEffect(() => {
    if (!open) return
    const onPointer = (event) => {
      const t = event.target
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const commit = (nextHsv) => {
    const hex = hsvToHex(nextHsv.h, nextHsv.s, nextHsv.v)
    setHsv(nextHsv)
    setHexDraft(hex)
    onChange?.(hex)
  }

  const dragOn = (ref, read) => (event) => {
    event.preventDefault()
    const el = ref.current
    if (!el) return
    const apply = (clientX, clientY) => {
      const box = el.getBoundingClientRect()
      const x = Math.min(1, Math.max(0, (clientX - box.left) / box.width))
      const y = Math.min(1, Math.max(0, (clientY - box.top) / box.height))
      commit(read(x, y, hsv))
    }
    apply(event.clientX, event.clientY)
    const move = (e) => apply(e.clientX, e.clientY)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const panel =
    open &&
    createPortal(
      <div
        ref={panelRef}
        id={panelId}
        className="ed-colour-panel"
        role="dialog"
        aria-label={ariaLabel || label || 'Colour'}
        style={{ top: panelPos.top, left: panelPos.left }}
      >
        <div
          ref={svRef}
          className="ed-colour-sv"
          style={{ backgroundColor: hueCss(hsv.h) }}
          onPointerDown={dragOn(svRef, (x, y) => ({ ...hsv, s: x, v: 1 - y }))}
        >
          <div className="ed-colour-sv-white" />
          <div className="ed-colour-sv-black" />
          <span className="ed-colour-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
        </div>
        <div
          ref={hueRef}
          className="ed-colour-hue"
          onPointerDown={dragOn(hueRef, (x) => ({ ...hsv, h: x * 360 }))}
        >
          <span className="ed-colour-hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
        </div>
        <div className="ed-colour-row">
          <span className="ed-colour-preview" style={{ background: colour }} title={colour} />
          <input
            className="ed-colour-hex me-name"
            value={hexDraft}
            aria-label={`${ariaLabel || label || 'Colour'} hex`}
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value.trim()
              setHexDraft(next)
              if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next)) {
                const hex = normalizeHexColour(next)
                const { r, g, b } = hexToRgb(hex)
                setHsv(rgbToHsv(r, g, b))
                onChange?.(hex)
              }
            }}
            onBlur={() => setHexDraft(colour)}
          />
        </div>
        {presets?.length ? (
          <div className="ed-colour-presets" role="list">
            {presets.map((entry) => {
              const swatch = normalizeHexColour(entry.colour)
              return (
                <button
                  key={swatch + (entry.label || '')}
                  type="button"
                  className={`ed-colour-preset${swatch === colour ? ' is-active' : ''}`}
                  style={{ background: swatch }}
                  title={entry.label || swatch}
                  aria-label={entry.label || swatch}
                  onClick={() => {
                    const { r, g, b } = hexToRgb(swatch)
                    commit(rgbToHsv(r, g, b))
                  }}
                />
              )
            })}
          </div>
        ) : null}
      </div>,
      document.body,
    )

  return (
    <div
      ref={rootRef}
      className={`ed-colour-field me-ambient ed-emissive${className ? ` ${className}` : ''}`}
      title={title}
    >
      {label ? <span className="ed-colour-field-label">{label}</span> : null}
      <button
        type="button"
        className="ed-colour-swatch"
        style={{ background: colour }}
        aria-label={ariaLabel || label || 'Colour'}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={title || colour}
        onClick={() => setOpen((v) => !v)}
      />
      <input
        className="ed-colour-hex me-name"
        value={hexDraft}
        aria-label={`${ariaLabel || label || 'Colour'} hex`}
        spellCheck={false}
        onChange={(event) => {
          const next = event.target.value.trim()
          setHexDraft(next)
          if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next)) {
            const hex = normalizeHexColour(next)
            const { r, g, b } = hexToRgb(hex)
            setHsv(rgbToHsv(r, g, b))
            onChange?.(hex)
          }
        }}
        onBlur={() => setHexDraft(colour)}
      />
      {panel}
    </div>
  )
}

/** Warm / cool keys useful for the board Sun light. */
export const SUN_COLOUR_PRESETS = [
  { colour: '#fff2e0', label: 'Warm white' },
  { colour: '#fff8f0', label: 'Noon' },
  { colour: '#ffe0a8', label: 'Golden hour' },
  { colour: '#ff9a5c', label: 'Sunset' },
  { colour: '#ff6b4a', label: 'Red dusk' },
  { colour: '#c8d8ff', label: 'Blue hour' },
  { colour: '#a8e0ff', label: 'Ice' },
  { colour: '#e8ffe0', label: 'Sickly green' },
]
