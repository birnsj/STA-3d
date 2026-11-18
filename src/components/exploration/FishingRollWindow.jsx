import { previewFishing } from '../../exploration/fishingSpots.js'
import { PreRollWindow, ResultWindow } from '../dice/RollWindow.jsx'

// Fishing cast before the roll: Fitness + Security at the spot's Difficulty (same dice window as challenges).
export function FishingPreRollWindow({ state, spotId, memberId, dispatch, onCancel }) {
  const performer = state.party.members[memberId]
  if (!performer) return null
  const prepared = previewFishing(state, spotId, memberId)
  return (
    <PreRollWindow
      title="Fishing"
      performer={performer}
      prepared={prepared}
      resources={state.resources}
      onCancel={onCancel}
      onRoll={({ purchase }) => dispatch({ type: 'fishRoll', spotId, memberId, purchase })}
    />
  )
}

// After the cast: dice result and any catch message. Continue closes the window.
export function FishingResultWindow({ state, lastFishing, onContinue }) {
  if (!lastFishing?.result) return null
  return (
    <ResultWindow
      title="Fishing"
      lastTask={lastFishing}
      performer={state.party.members[lastFishing.memberId ?? lastFishing.performerId]}
      onContinue={onContinue}
    />
  )
}
