'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useOnboarding } from '@/hooks/use-onboarding'

export function FirstStepsPreference({ userId }: { userId: string }) {
  const { state, saving, error, refresh, save } = useOnboarding(userId)
  const loaded = Boolean(state)
  useEffect(() => {
    if (loaded && window.location.hash === '#primeiros-passos') {
      document.getElementById('primeiros-passos')?.scrollIntoView({ block: 'start' })
      document.getElementById('first-steps-preference-title')?.focus({ preventScroll: true })
    }
  }, [loaded])
  return <section id="primeiros-passos" aria-labelledby="first-steps-preference-title" className="scroll-mt-36 space-y-3 rounded-2xl border border-border bg-card p-4">
    <h2 id="first-steps-preference-title" tabIndex={-1} className="text-lg font-semibold">Guia de primeiros passos</h2>
    <p id="first-steps-preference-help" className="text-sm text-muted-foreground">Mostre ou oculte as missões iniciais no seu Dashboard.</p>
    <div className="min-h-11">{state ? <label className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
      <span className="min-w-0 text-sm font-medium">Mostrar guia de primeiros passos</span>
      <span className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{state.hidden ? 'Desativado' : 'Ativado'}</span><input type="checkbox" role="switch" aria-label="Mostrar guia de primeiros passos" aria-describedby="first-steps-preference-help" checked={!state.hidden} disabled={saving} onChange={event => { void save({ hidden: !event.target.checked }) }} className="size-5 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" /></span>
    </label> : !error && <p role="status" className="text-sm text-muted-foreground">Carregando preferência…</p>}</div>
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" size="sm" variant="outline" onClick={() => { void refresh() }}>Tentar novamente</Button></div>}
  </section>
}
