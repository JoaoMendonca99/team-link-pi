'use client'

import { useMemo } from 'react'

import { cn } from '@/lib/utils'

export interface PasswordStrengthInfo {
  /** Quantidade de critérios atendidos (0 a 5). */
  score: number
  /** Rótulo visual exibido ao usuário. */
  label: string
  /** Classes Tailwind aplicadas no preenchimento da barra. */
  colorClass: string
  /** Classes Tailwind aplicadas no texto do rótulo. */
  textClass: string
  /** Largura do preenchimento em porcentagem. */
  widthPercent: number
}

/**
 * Critérios avaliados (ordem importa apenas para clareza, não para o score):
 * 1. ≥ 8 caracteres
 * 2. Letra minúscula
 * 3. Letra maiúscula
 * 4. Número
 * 5. Caractere especial
 */
const PASSWORD_CRITERIA: Array<(value: string) => boolean> = [
  (value) => value.length >= 8,
  (value) => /[a-z]/.test(value),
  (value) => /[A-Z]/.test(value),
  (value) => /[0-9]/.test(value),
  (value) => /[^A-Za-z0-9]/.test(value),
]

export function getPasswordStrength(password: string): PasswordStrengthInfo {
  if (password.length === 0) {
    return {
      score: 0,
      label: 'Senha vazia',
      colorClass: 'bg-border',
      textClass: 'text-muted-foreground',
      widthPercent: 0,
    }
  }

  const score = PASSWORD_CRITERIA.reduce(
    (acc, predicate) => (predicate(password) ? acc + 1 : acc),
    0,
  )

  if (score <= 2) {
    return {
      score,
      label: 'Senha fraca',
      colorClass: 'bg-red-500 dark:bg-red-400',
      textClass: 'text-red-600 dark:text-red-300',
      // Garante uma fatia visível mesmo no score mínimo (1/5 → 20%).
      widthPercent: Math.max(score, 1) * 20,
    }
  }

  if (score <= 4) {
    return {
      score,
      label: 'Senha média',
      colorClass: 'bg-amber-500 dark:bg-amber-400',
      textClass: 'text-amber-700 dark:text-amber-300',
      widthPercent: score * 20,
    }
  }

  return {
    score,
    label: 'Senha forte',
    colorClass: 'bg-emerald-500 dark:bg-emerald-400',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    widthPercent: 100,
  }
}

export function PasswordStrengthMeter({
  password,
  className,
}: {
  password: string
  className?: string
}) {
  const info = useMemo(() => getPasswordStrength(password), [password])
  const isEmpty = password.length === 0

  return (
    <div className={cn('space-y-1.5', className)} aria-live="polite">
      <div
        className="relative h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={info.score}
        aria-label="Força da senha"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width,background-color] duration-300 ease-out',
            info.colorClass,
          )}
          style={{ width: `${info.widthPercent}%` }}
        />
      </div>
      {isEmpty ? (
        <p className="text-[11px] leading-tight text-muted-foreground">
          Use pelo menos 8 caracteres. Misture letras, números e símbolos para aumentar a segurança.
        </p>
      ) : (
        <p className={cn('text-[11px] font-semibold leading-tight', info.textClass)}>
          {info.label}
        </p>
      )}
    </div>
  )
}
