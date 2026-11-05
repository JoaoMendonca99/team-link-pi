'use client'

import { useEffect, useRef, type ComponentProps } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { sendOnEnter } from '@/lib/chat/keyboard'

type Props = ComponentProps<'textarea'> & { sending: boolean; canSend: boolean; onSend: () => void; plain?: boolean }
export function MessageTextarea({ sending, canSend, onSend, plain, onKeyDown, readOnly, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const wasSending = useRef(false)
  useEffect(() => {
    if (wasSending.current && !sending) ref.current?.focus({ preventScroll: true })
    wasSending.current = sending
  }, [sending])
  const shared = { ...props, ref, readOnly: sending || readOnly, onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event)
    if (!event.defaultPrevented) sendOnEnter(event, canSend && !sending && !props.disabled && !readOnly, onSend)
  } }
  return plain ? <textarea {...shared} /> : <Textarea {...shared} />
}
