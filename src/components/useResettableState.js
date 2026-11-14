import { useState } from 'react'

// Same comparison React uses for effect dependencies when the key is a list: element by element.
const sameKey = (a, b) =>
  Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((item, i) => Object.is(item, b[i])) : Object.is(a, b)

// State that starts over from `initial` whenever `resetKey` changes: a text draft that follows the saved value, a
// "failed to load" flag that clears when the picture changes, a card that closes when another one is picked.
// `resetKey` is a value, or a list of values (changing any of them resets).
// Done while rendering, as React recommends, rather than in an effect: an effect would paint one frame with the old
// value first and render twice.
export default function useResettableState(initial, resetKey) {
  const [value, setValue] = useState(initial)
  const [seenKey, setSeenKey] = useState(resetKey)
  if (!sameKey(resetKey, seenKey)) {
    setSeenKey(resetKey)
    setValue(initial)
  }
  return [value, setValue]
}
