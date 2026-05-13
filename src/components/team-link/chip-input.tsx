'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const DEFAULT_MAX_LENGTH = 40

/**
 * Normaliza qualquer valor (array ou string com vírgulas) em uma lista
 * tipada de strings, garantindo trim e eliminando entradas vazias.
 * Útil para compatibilidade com dados antigos no perfil.
 */
export function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0)
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return []
}

export interface ChipInputProps {
  label: string
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  helperText?: string
  maxItems?: number
  maxLength?: number
  disabled?: boolean
  inputId?: string
  className?: string
}

export function ChipInput({
  label,
  value,
  onChange,
  placeholder,
  helperText,
  maxItems,
  maxLength = DEFAULT_MAX_LENGTH,
  disabled = false,
  inputId,
  className,
}: ChipInputProps) {
  const generatedId = useId()
  const id = inputId ?? `chip-input-${generatedId}`
  const helperId = `${id}-helper`
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')

  const reachedMax = maxItems !== undefined && value.length >= maxItems

  function commit(raw: string) {
    const trimmed = raw.trim().replace(/,+$/, '').trim()
    if (!trimmed) return
    if (reachedMax) return
    const sliced = trimmed.slice(0, maxLength)
    const exists = value.some((entry) => entry.toLowerCase() === sliced.toLowerCase())
    if (exists) {
      setDraft('')
      return
    }
    onChange([...value, sliced])
    setDraft('')
  }

  function remove(item: string) {
    onChange(value.filter((entry) => entry !== item))
    inputRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit(draft)
      return
    }
    if (event.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      event.preventDefault()
      onChange(value.slice(0, -1))
    }
  }

  function handleBlur() {
    if (draft.trim().length > 0) {
      commit(draft)
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>

      <input
        ref={inputRef}
        id={id}
        type="text"
        value={draft}
        maxLength={maxLength}
        disabled={disabled || reachedMax}
        aria-describedby={helperText ? helperId : undefined}
        placeholder={reachedMax ? 'Limite atingido' : placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={cn(
          'flex h-10 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm outline-none transition-shadow',
          'placeholder:text-muted-foreground',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      />

      {value.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2" role="list" aria-label={`${label} adicionados`}>
          {value.map((item) => (
            <span
              key={item}
              role="listitem"
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300"
            >
              <span className="max-w-[14rem] truncate">{item}</span>
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label={`Remover ${item}`}
                className="ml-0.5 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-blue-700/80 transition-colors hover:bg-blue-500/20 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-blue-300/80 dark:hover:text-blue-200"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {helperText ? (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}
    </div>
  )
}
