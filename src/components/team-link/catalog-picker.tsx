'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type CatalogSelection = { id: string | null; name: string }
export type CatalogOption = { id: string; name: string; title: string; detail: string }
type Props = {
  id?: string; label: string; value: CatalogSelection; onChange: (value: CatalogSelection) => void
  search: (query: string, signal: AbortSignal) => Promise<CatalogOption[]>
  placeholder: string; manualPlaceholder: string; selectedHelp: string; resultsLabel: string
  loadingText: string; emptyText: string; manualAction: string; clearAction: string
}

/** Shared interaction for official academic catalogs; text is manual only by explicit choice. */
export function CatalogPicker({ id, label, value, onChange, search, placeholder, manualPlaceholder, selectedHelp, resultsLabel, loadingText, emptyText, manualAction, clearAction }: Props) {
  const generated = useId(), inputId = id || 'catalog-' + generated, listId = inputId + '-results'
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<CSSProperties>()
  const cache = useRef(new Map<string, CatalogOption[]>())
  const [query, setQuery] = useState(value.name), [manual, setManual] = useState(false)
  const [manualDraft,setManualDraft]=useState(''),[manualError,setManualError]=useState('')
  const [open, setOpen] = useState(false), [rows, setRows] = useState<CatalogOption[]>([]), [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false), [error, setError] = useState(false)
  useEffect(() => { setQuery(value.name); setManual(false) }, [value.id, value.name])
  useEffect(() => {
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  useLayoutEffect(() => {
    if (!open || manual) return
    const place = () => {
      const box = input.current?.getBoundingClientRect()
      if (!box) return
      const below = window.innerHeight - box.bottom - 12, above = box.top - 12
      const next: CSSProperties = { left: box.left, width: box.width, maxHeight: Math.max(80, Math.min(320, Math.max(below, above))) }
      if (below >= 160 || below >= above) { next.top = box.bottom + 6; next.maxHeight = Math.max(80, Math.min(320, below)) }
      else { next.bottom = window.innerHeight - box.top + 6; next.maxHeight = Math.max(80, Math.min(320, above)) }
      setPosition(current => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, manual])
  useEffect(() => {
    if (!open || manual || query.trim().length < 2) { setRows([]); setActive(-1); setLoading(false); setError(false); return }
    const key = query.trim(), controller = new AbortController()
    setRows([]); setActive(-1); setError(false); setLoading(true)
    const timer = window.setTimeout(() => {
      const existing = cache.current.get(key)
      const request = existing ? Promise.resolve(existing) : search(key, controller.signal)
      void request.then(results => {
        if (controller.signal.aborted) return
        if (cache.current.size >= 40) cache.current.delete(cache.current.keys().next().value!)
        cache.current.set(key, results); setRows(results); setLoading(false)
      }).catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false) } })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, open, manual, search])
  useEffect(() => { if (active >= 0) document.getElementById(listId + '-' + active)?.scrollIntoView({ block: 'nearest' }) }, [active, listId])
  function choose(row: CatalogOption) { onChange({ id: row.id, name: row.name }); setQuery(row.name); setManual(false); setOpen(false); setActive(-1); input.current?.focus() }
  function clear() { onChange({ id: null, name: '' }); setQuery(''); setManual(false); setOpen(false); setActive(-1) }
  function confirmManual(){
    const name=manualDraft.trim()
    if(!name || /[<>\x00-\x1f]/.test(name)){setManualError('Informe um nome válido antes de confirmar.');return}
    onChange({id:null,name});setQuery(name);setManual(false);setOpen(false);setManualError('')
  }
  function cancelManual(){setManual(false);setQuery(value.name);setOpen(false);setManualError('')}
  const showResults = open && query.trim().length >= 2 && !loading && !error
  return <div ref={root} className="relative min-w-0 space-y-2" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget) && !popup.current?.contains(event.relatedTarget)) { setOpen(false); if (!manual) setQuery(value.name) }
  }}>
    <label htmlFor={manual ? inputId + '-manual' : inputId} className="text-sm font-medium">{label}</label>
    {manual ? <>
      <Input autoFocus id={inputId + '-manual'} maxLength={500} value={manualDraft} aria-describedby={inputId + '-help'} placeholder={manualPlaceholder} onChange={event => {setManualDraft(event.target.value);setManualError('')}}
        onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();confirmManual()}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelManual()}}} />
      <p id={inputId + '-help'} className="text-xs text-muted-foreground">Informação manual, sem associação ao catálogo oficial.</p>
      {value.name&&<p className="break-words text-xs text-muted-foreground">Seleção atual mantida até confirmar: {value.name}</p>}
      {manualError&&<p role="alert" className="text-xs text-destructive">{manualError}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={confirmManual}>Confirmar</Button>
        <Button type="button" size="sm" variant="outline" onClick={()=>{setManual(false);setQuery(manualDraft);setOpen(true);setManualError('')}}>Voltar à pesquisa</Button>
        <Button type="button" size="sm" variant="ghost" onClick={cancelManual}>Cancelar</Button></div>
    </> : <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input ref={input} id={inputId} className="pl-9 pr-9" role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open}
          aria-controls={showResults ? listId : undefined} aria-activedescendant={showResults && active >= 0 && rows[active] ? listId + '-' + active : undefined}
          aria-describedby={inputId + '-help'} maxLength={120} value={query} placeholder={placeholder}
          onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1) }} onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); if (rows.length) setActive(previous => event.key === 'ArrowDown' ? Math.min(previous + 1, rows.length - 1) : Math.max(previous - 1, 0)) }
            if (event.key === 'Enter' && open) { event.preventDefault(); if (active >= 0 && rows[active]) choose(rows[active]) }
            if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setQuery(value.name) }
          }} />
        <ChevronDown className="pointer-events-none absolute right-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
      </div>
      <p id={inputId + '-help'} className="text-xs text-muted-foreground">{value.id ? selectedHelp : value.name ? 'Nome informado manualmente, sem associação ao catálogo oficial.' : 'Digite pelo menos 2 caracteres e selecione um resultado.'}</p>
      {open && position && createPortal(<div ref={popup} style={position} className="fixed z-[80] overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-xl">
        {query.trim().length < 2 ? <p className="p-3 text-sm text-muted-foreground">Digite pelo menos 2 caracteres.</p>
          : loading ? <p role="status" className="p-3 text-sm">{loadingText}</p>
          : error ? <p role="alert" className="p-3 text-sm text-destructive">Não foi possível pesquisar agora. Tente novamente ou informe manualmente.</p> : <>
            {!rows.length && <p role="status" className="p-3 text-sm text-muted-foreground">{emptyText}</p>}
            <ul id={listId} role="listbox" aria-label={resultsLabel}>{rows.map((row, index) => <li key={row.id} id={listId + '-' + index} role="option" aria-selected={active === index}
              className={'cursor-pointer rounded-lg p-3 text-sm ' + (active === index ? 'bg-primary/15' : 'hover:bg-muted')}
              onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => choose(row)}>
              <span className="flex items-start gap-2"><span className="min-w-0 flex-1 break-words font-medium">{row.title}</span>{value.id === row.id && <Check className="size-4 shrink-0" aria-hidden />}</span>
              <span className="mt-1 block break-words text-xs text-muted-foreground">{row.detail}</span>
            </li>)}</ul>
          </>}
        <Button type="button" variant="ghost" className="min-h-11 h-auto w-full justify-start whitespace-normal text-left" onMouseDown={event => event.preventDefault()} onClick={() => {
          setManualDraft(query);setManualError('');setManual(true);setOpen(false)
        }}>{manualAction}</Button>
      </div>, root.current?.closest('dialog') ?? document.body)}
    </>}
    {!manual&&(value.id || value.name) && <Button type="button" variant="ghost" size="sm" className="min-h-9" onClick={clear}><X className="size-3.5" aria-hidden />{clearAction}</Button>}
  </div>
}
