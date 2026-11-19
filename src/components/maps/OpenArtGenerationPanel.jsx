import { useEffect, useMemo, useRef, useState } from 'react'
import { getTile } from '../../maps/mapFormat.js'
import {
  canUseOpenArt,
  discardOpenArtJob,
  estimateOpenArtCredits,
  fetchOpenArtModels,
  fetchOpenArtResult,
  fetchOpenArtStatus,
  importOpenArtSprite,
  openArtImageModels,
  pickDefaultOpenArtModel,
  startOpenArtGeneration,
  waitForOpenArtJob,
} from '../../maps/openArtFiles.js'
import { spriteUrl } from '../../maps/spriteFiles.js'
import EditorSelect from './EditorSelect.jsx'
import { PropertySection } from './PropertySections.jsx'

// Sprite Sheets → AI Generation. DEV-only; talks to /__openart (OpenArt CLI).
// Designer types a short change (“Klingon”, “make it red”); the server wraps silhouette rules automatically.

function statusLabel(job) {
  if (!job) return 'Idle'
  if (job.status === 'queued') return 'Queued…'
  if (job.status === 'running') return job.dryRun ? 'Dry-run…' : 'Generating…'
  if (job.status === 'completed') return job.dryRun ? 'Dry-run complete' : 'Ready'
  if (job.status === 'failed') return `Failed: ${job.error || 'unknown error'}`
  if (job.status === 'discarded') return 'Discarded'
  return job.status
}

function baseName(path) {
  return String(path || '').split('/').pop() || '—'
}

function stemLabel(path, fallback = 'Sprite') {
  const name = baseName(path).replace(/\.png$/i, '')
  return name || fallback
}

export default function OpenArtGenerationPanel({
  templatePath = null,
  templateLabel = null,
  sourceTile = null,
  // Optional async () => base64 PNG — composed sprite sheet used as the image2image reference.
  getReferencePng = null,
  // Optional data URL of the arranged sheet (live miniature in sheet mode).
  referencePreviewUrl = null,
  disabledReason = null,
  onStatus,
  onImported,
}) {
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState(null)
  const [modelId, setModelId] = useState('')
  const [change, setChange] = useState('')
  const [busy, setBusy] = useState(false)
  const [job, setJob] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [resultPng, setResultPng] = useState(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [importLabelOverride, setImportLabelOverride] = useState(null)
  const [warnings, setWarnings] = useState([])
  const pollRef = useRef(0)

  const models = useMemo(() => openArtImageModels(catalog, { requireImage2Image: true }), [catalog])
  const selectedModelId = pickDefaultOpenArtModel(models, modelId)
  const credits = estimateOpenArtCredits(catalog, selectedModelId, 'image2image')
  const liveTile = sourceTile ? getTile(sourceTile.id) || sourceTile : null
  const labelBase = templateLabel || liveTile?.label || stemLabel(templatePath)
  const importLabel = importLabelOverride ?? `${labelBase} (AI)`
  const createsCatalogueTile = Boolean(liveTile?.id) && !getReferencePng
  const sheetMode = typeof getReferencePng === 'function'

  useEffect(() => {
    setImportLabelOverride(null)
    setChange('')
    setWarnings([])
  }, [templatePath, templateLabel])

  useEffect(() => {
    if (!canUseOpenArt) return undefined
    let cancelled = false
    fetchOpenArtModels()
      .then((data) => {
        if (cancelled) return
        setCatalog(data)
        setCatalogError(null)
      })
      .catch((error) => {
        if (!cancelled) setCatalogError(error.message)
      })
    fetchOpenArtStatus()
      .then((snap) => {
        if (!cancelled && snap.job) setJob(snap.job)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!previewUrl?.startsWith('blob:')) return undefined
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    if (!viewerOpen) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setViewerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewerOpen])

  const refreshPreview = async (nextJob) => {
    if (!nextJob || nextJob.status !== 'completed' || nextJob.dryRun) {
      setPreviewUrl(null)
      setResultPng(null)
      setViewerOpen(false)
      return
    }
    if (nextJob.resultUrl) {
      setPreviewUrl(`${nextJob.resultUrl}?v=${nextJob.finishedAt || Date.now()}`)
    }
    const result = await fetchOpenArtResult(nextJob.id)
    if (result.png) {
      setResultPng(result.png)
      const bytes = Uint8Array.from(atob(result.png), (ch) => ch.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'image/png' })
      setPreviewUrl(URL.createObjectURL(blob))
    }
  }

  const runJob = async ({ dryRun }) => {
    if (!canUseOpenArt || busy || disabledReason) return
    const trimmed = change.trim()
    if (!trimmed) {
      onStatus?.('Enter a short change (e.g. Klingon, make it red).')
      return
    }
    if (!selectedModelId) {
      onStatus?.('Select an OpenArt image model.')
      return
    }
    if (!sheetMode && !templatePath) {
      onStatus?.('Select a sprite to use as a template.')
      return
    }
    setBusy(true)
    setWarnings([])
    pollRef.current += 1
    const token = pollRef.current
    try {
      let referencePng = null
      if (sheetMode) {
        referencePng = await getReferencePng()
        if (!referencePng) throw new Error('Could not export the sprite sheet for generation.')
      }
      const started = await startOpenArtGeneration({
        prompt: trimmed,
        model: selectedModelId,
        referenceImagePath: sheetMode ? null : templatePath,
        referencePng,
        tileLabel: labelBase,
        dryRun,
      })
      setJob(started.job)
      onStatus?.(dryRun ? 'OpenArt dry-run started (no credits).' : 'OpenArt generation started…')
      const finished = await waitForOpenArtJob()
      if (token !== pollRef.current) return
      setJob(finished.job)
      if (finished.job?.status === 'failed') {
        onStatus?.(`OpenArt failed: ${finished.job.error}`)
        return
      }
      if (finished.job?.dryRun) {
        onStatus?.('OpenArt dry-run complete (no image, no credits spent).')
        setPreviewUrl(null)
        setResultPng(null)
        setViewerOpen(false)
        return
      }
      await refreshPreview(finished.job)
      onStatus?.(
        sheetMode
          ? 'OpenArt image ready — Accept to save a new sheet PNG, or Discard.'
          : createsCatalogueTile
            ? 'OpenArt image ready — Accept to add a new tile + sprite, or Discard.'
            : 'OpenArt image ready — Accept to add a new sprite beside this one, or Discard.',
      )
    } catch (error) {
      onStatus?.(`OpenArt error: ${error.message}`)
    } finally {
      if (token === pollRef.current) setBusy(false)
    }
  }

  const onDiscard = async () => {
    setBusy(true)
    try {
      const snap = await discardOpenArtJob()
      setJob(snap.job)
      setPreviewUrl(null)
      setResultPng(null)
      setViewerOpen(false)
      setWarnings([])
      onStatus?.('OpenArt result discarded.')
    } catch (error) {
      onStatus?.(`Could not discard: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  const onAccept = async () => {
    if (!resultPng) {
      onStatus?.('No generated image to import.')
      return
    }
    const label = importLabel.trim() || `${labelBase} (AI)`
    setBusy(true)
    try {
      let templatePng = null
      if (sheetMode) {
        templatePng = await getReferencePng()
        if (!templatePng) throw new Error('Could not export the sprite sheet template for Accept.')
      }
      const result = await importOpenArtSprite({
        label,
        png: resultPng,
        templatePath: sheetMode ? null : templatePath,
        templatePng,
        sourceId: sheetMode ? null : liveTile?.id ?? null,
      })
      setWarnings(result.warnings ?? [])
      if (result.warnings?.length) {
        onStatus?.(`Imported “${result.label || label}” with warnings: ${result.warnings.join(' ')}`)
      } else if (result.id) {
        onStatus?.(`Imported “${result.label}” as a new tile (${result.id}).`)
      } else {
        onStatus?.(`Imported “${result.label || label}” as ${result.path}.`)
      }
      onImported?.(result)
      await discardOpenArtJob()
      setJob(null)
      setPreviewUrl(null)
      setResultPng(null)
      setViewerOpen(false)
    } catch (error) {
      onStatus?.(`Import failed: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  if (!canUseOpenArt) {
    return (
      <PropertySection id="ai-generation" title="AI Generation" tip="OpenArt CLI image generation (development server only).">
        <p className="me-text is-muted">AI Generation needs the Vite DEV server.</p>
      </PropertySection>
    )
  }

  if (disabledReason) {
    return (
      <PropertySection id="ai-generation" title="AI Generation" tip="OpenArt CLI image generation (development server only).">
        <p className="me-text is-muted">{disabledReason}</p>
      </PropertySection>
    )
  }

  const ready = job?.status === 'completed' && !job.dryRun && Boolean(resultPng || previewUrl)

  return (
    <PropertySection
      id="ai-generation"
      title="AI Generation"
      tip="Type a short change. The selected sprite is the template; size and transparency are forced to match. Accept adds a new file — the source is never overwritten."
    >
      {catalogError && <p className="me-text is-muted">Could not load models: {catalogError}</p>}
      {catalog?.mock && <p className="me-text is-muted">Mock OpenArt mode (OPENART_MOCK) — no credits spent.</p>}

      <div className="ed-openart">
        <div className={`ed-openart-ref${sheetMode ? ' is-sheet-ref' : ''}`}>
          <div className="ed-openart-ref-art">
            {sheetMode && referencePreviewUrl ? (
              <img
                className="ed-openart-ref-thumb is-sheet-preview"
                src={referencePreviewUrl}
                alt="Arranged generation sheet"
              />
            ) : templatePath ? (
              <img className="ed-openart-ref-thumb" src={spriteUrl(templatePath)} alt="" />
            ) : (
              <div className="ed-openart-ref-thumb is-sheet" aria-hidden="true">
                Sheet
              </div>
            )}
          </div>
          <div className="ed-openart-ref-copy">
            <div className="ed-openart-ref-name">Template: {labelBase}</div>
            <div className="ed-openart-ref-file" title={templatePath || ''}>
              {sheetMode ? 'Arranged generation sheet' : baseName(templatePath)}
            </div>
            {createsCatalogueTile && (
              <div className="ed-openart-ref-file">Catalogue tile: {liveTile.label}</div>
            )}
          </div>
        </div>

        <label className="ed-openart-field">
          <span>Change</span>
          <input
            className="me-name me-wide"
            value={change}
            disabled={busy}
            placeholder="Klingon · make it red · icy metal…"
            onChange={(event) => setChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                runJob({ dryRun: false })
              }
            }}
          />
        </label>

        <p className="ed-openart-meta">
          {sheetMode
            ? 'Uses the arranged sheet as template · result forced to sheet size + transparency'
            : 'Uses this sprite as template · size + transparency matched automatically'}
          {createsCatalogueTile ? ' · Accept also adds a catalogue tile' : ''}
        </p>

        <label className="ed-openart-field">
          <span>Model</span>
          <EditorSelect
            className="me-select me-wide"
            value={selectedModelId}
            disabled={busy || !models.length}
            aria-label="OpenArt image model"
            onChange={(event) => setModelId(event.target.value)}
          >
            {models.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.displayName || entry.id}
              </option>
            ))}
          </EditorSelect>
        </label>

        <p className="ed-openart-meta">
          image2image
          {credits != null ? ` · ~${credits} credit${credits === 1 ? '' : 's'}` : ''}
        </p>

        <div className="ed-openart-actions">
          <button type="button" className="me-button" disabled={busy || !selectedModelId || !change.trim()} onClick={() => runJob({ dryRun: true })}>
            Dry-run
          </button>
          <button
            type="button"
            className="me-button is-primary"
            disabled={busy || !selectedModelId || !change.trim()}
            onClick={() => runJob({ dryRun: false })}
          >
            Generate
          </button>
        </div>

        <p className="ed-openart-status">Status: {statusLabel(job)}</p>
        {job?.referenceUpscale?.note && <p className="ed-openart-note">{job.referenceUpscale.note}</p>}
        {job?.sizeFit?.note && <p className="ed-openart-note">{job.sizeFit.note}</p>}
        {job?.dryRun && job.status === 'completed' && job.dryRunBody && (
          <pre className="ed-openart-dry">{JSON.stringify(job.dryRunBody, null, 2)}</pre>
        )}

        {previewUrl && (
          <div className="ed-openart-preview">
            <div className="ed-openart-preview-head">
              <div className="ed-openart-preview-label">Generated preview</div>
              <button
                type="button"
                className="me-button"
                title="Enlarge the generated image"
                onClick={() => setViewerOpen(true)}
              >
                View
              </button>
            </div>
            <button
              type="button"
              className="ed-openart-preview-hit"
              title="Enlarge the generated image"
              onClick={() => setViewerOpen(true)}
            >
              <img src={previewUrl} alt="OpenArt result" />
            </button>
            {job?.resultInfo && (
              <div className="ed-openart-meta">
                {job.resultInfo.width}×{job.resultInfo.height}
                {job.resultInfo.hasAlpha ? ' · RGBA' : ' · no alpha'}
              </div>
            )}
          </div>
        )}

        {ready && (
          <>
            <label className="ed-openart-field">
              <span>{sheetMode ? 'New sheet name' : createsCatalogueTile ? 'New tile name' : 'New sprite name'}</span>
              <input
                className="me-name me-wide"
                value={importLabel}
                disabled={busy}
                onChange={(event) => setImportLabelOverride(event.target.value)}
              />
            </label>
            <div className="ed-openart-actions">
              <button type="button" className="me-button" disabled={busy} onClick={() => runJob({ dryRun: false })}>
                Regenerate
              </button>
              <button type="button" className="me-button" disabled={busy} onClick={onDiscard}>
                Discard
              </button>
              <button type="button" className="me-button is-primary" disabled={busy} onClick={onAccept}>
                Accept
              </button>
            </div>
          </>
        )}

        {warnings.length > 0 && (
          <ul className="ed-openart-warnings">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </div>

      {viewerOpen && previewUrl ? (
        <div
          className="me-dialog-backdrop ed-dialog-backdrop ed-openart-viewer-backdrop"
          onPointerDown={(event) => event.target === event.currentTarget && setViewerOpen(false)}
        >
          <div
            className="ed-openart-viewer"
            role="dialog"
            aria-modal="true"
            aria-label="Generated image"
          >
            <div className="ed-openart-viewer-bar">
              <span className="me-text">
                {job?.resultInfo
                  ? `${job.resultInfo.width}×${job.resultInfo.height}${job.resultInfo.hasAlpha ? ' · RGBA' : ''}`
                  : 'Generated image'}
              </span>
              <button type="button" className="me-button" autoFocus onClick={() => setViewerOpen(false)}>
                Close
              </button>
            </div>
            <div className="ed-openart-viewer-stage">
              <img src={previewUrl} alt="OpenArt result enlarged" />
            </div>
          </div>
        </div>
      ) : null}
    </PropertySection>
  )
}
