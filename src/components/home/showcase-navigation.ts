export function nextShowcaseTab(key: string, selected: number, count: number): number | null {
  if (count < 1) return null
  if (key === 'ArrowRight') return (selected + 1) % count
  if (key === 'ArrowLeft') return (selected + count - 1) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

/** Horizontal intent only: vertical scrolling and short taps never change images. */
export function showcaseSwipeStep(deltaX: number, deltaY: number): -1 | 0 | 1 {
  if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return 0
  return deltaX < 0 ? 1 : -1
}
