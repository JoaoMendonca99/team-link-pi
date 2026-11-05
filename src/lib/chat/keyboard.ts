import type { KeyboardEvent } from 'react'

export function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, canSend: boolean, send: () => void) {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing || event.keyCode === 229) return
  event.preventDefault()
  if (canSend && !event.repeat) send()
}
