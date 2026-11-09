'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { searchInstitutions, type Institution, type InstitutionSelection } from '@/lib/institutions'

export function InstitutionPicker({ id, label = 'Faculdade ou universidade (opcional)', value, onChange }: {
  id?: string; label?: string; value: InstitutionSelection; onChange: (value: InstitutionSelection) => void
}) {
  const generated = useId(), inputId = id || 'institution-' + generated, listId = inputId + '-results'
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null)
  const cache = useRef(new Map<string, Institution[]>())
  const [query, setQuery] = useState(value.name), [manual, setManual] = useState(Boolean(value.name && !value.id))
  const [open, setOpen] = useState(false), [rows, setRows] = useState<Institution[]>([]), [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false), [error, setError] = useState(false)
  useEffect(() => { setQuery(value.name); setManual(Boolean(value.name && !value.id)) }, [value.id, value.name])
  useEffect(() => {
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  useEffect(() => {
    if (!open || manual || query.trim().length < 2) { setRows([]); setLoading(false); setError(false); return }
    const key = query.trim(), controller = new AbortController()
    setRows([]); setActive(-1); setError(false); setLoading(true)
    const timer = window.setTimeout(() => {
      const existing = cache.current.get(key)
      const request = existing ? Promise.resolve(existing) : searchInstitutions(key, controller.signal)
      void request.then(results => {
        if (controller.signal.aborted) return
        if (cache.current.size >= 40) cache.current.delete(cache.current.keys().next().value!)
        cache.current.set(key, results); setRows(results); setLoading(false)
      }).catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false) } })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, open, manual])
  useEffect(() => { if (active >= 0) document.getElementById(listId + '-' + active)?.scrollIntoView({ block: 'nearest' }) }, [active, listId])
  function choose(row: Institution) { onChange({ id: row.id, name: row.nome }); setQuery(row.nome); setManual(false); setOpen(false); setActive(-1); input.current?.focus() }
  function clear() { onChange({ id: null, name: '' }); setQuery(''); setManual(false); setOpen(false); setActive(-1) }
  return <div ref={root} className="relative min-w-0 space-y-2" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); if (!manual) setQuery(value.name) } }}>
    <label htmlFor={manual ? inputId + '-manual' : inputId} className="text-sm font-medium">{label}</label>
    {manual ? <><Input id={inputId + '-manual'} maxLength={500} value={value.name} aria-describedby={inputId + '-help'} placeholder="Nome da instituição" onChange={event => onChange({ id: null, name: event.target.value })} /><p id={inputId + '-help'} className="text-xs text-muted-foreground">Informação manual, sem associação ao catálogo oficial.</p><Button type="button" size="sm" variant="outline" onClick={() => { clear(); setOpen(true) }}>Pesquisar no catálogo</Button></> : <>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden /><Input ref={input} id={inputId} className="pl-9 pr-9" role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && active >= 0 ? listId + '-' + active : undefined} aria-describedby={inputId + '-help'} maxLength={120} value={query} placeholder="Busque pelo nome ou sigla" onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1) }} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); if (rows.length) setActive(previous => event.key === 'ArrowDown' ? Math.min(previous + 1, rows.length - 1) : Math.max(previous - 1, 0)) }
        if (event.key === 'Enter' && open) { event.preventDefault(); if (active >= 0 && rows[active]) choose(rows[active]) }
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setQuery(value.name) }
      }} /><ChevronDown className="pointer-events-none absolute right-3 top-2.5 size-4 text-muted-foreground" aria-hidden /></div>
      <p id={inputId + '-help'} className="text-xs text-muted-foreground">{value.id ? 'Instituição selecionada no catálogo oficial do Inep.' : 'Opcional. Digite pelo menos 2 caracteres e selecione um resultado.'}</p>
      {open && <div className="absolute inset-x-0 top-[calc(100%_+_4px)] z-40 max-h-[min(320px,50dvh)] overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-xl">
        {query.trim().length < 2 ? <p className="p-3 text-sm text-muted-foreground">Digite pelo menos 2 caracteres.</p> : loading ? <p role="status" className="p-3 text-sm">Buscando instituições…</p> : error ? <p role="alert" className="p-3 text-sm text-destructive">Não foi possível pesquisar agora. Tente novamente ou informe manualmente.</p> : <>
          {!rows.length && <p role="status" className="p-3 text-sm text-muted-foreground">Nenhuma instituição encontrada.</p>}
          <ul id={listId} role="listbox" aria-label="Instituições encontradas">{rows.map((row, index) => <li key={row.id} id={listId + '-' + index} role="option" aria-selected={active === index} className={'cursor-pointer rounded-lg p-3 text-sm ' + (active === index ? 'bg-primary/15' : 'hover:bg-muted')} onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => choose(row)}><span className="flex items-start gap-2"><span className="min-w-0 flex-1 break-words font-medium">{row.nome}{row.sigla ? ' — ' + row.sigla : ''}</span>{value.id === row.id && <Check className="size-4 shrink-0" aria-hidden />}</span><span className="mt-1 block text-xs text-muted-foreground">{[row.municipio, row.uf].filter(Boolean).join(' · ')}</span></li>)}</ul>
        </>}
        <Button type="button" variant="ghost" className="min-h-11 h-auto w-full justify-start whitespace-normal text-left" onMouseDown={event => event.preventDefault()} onClick={() => { const name = query === value.name && value.id ? '' : query; setManual(true); onChange({ id: null, name }); setOpen(false) }}>Não encontrei minha instituição</Button>
      </div>}
    </>}
    {(value.id || value.name || manual) && <Button type="button" variant="ghost" size="sm" className="min-h-9" onClick={clear}><X className="size-3.5" aria-hidden />Não informar instituição</Button>}
  </div>
}
