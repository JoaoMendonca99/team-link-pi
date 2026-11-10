'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { searchConcepts, type ConceptChoice, type ConceptHit } from '@/lib/concepts'

type Props = { label: string; value: ConceptChoice[]; onChange: (next: ConceptChoice[]) => void; inputId?: string; optional?: boolean; maxItems?: number; maxLength?: number; disabled?: boolean; placeholder?: string; helperText?: string; className?: string }

/** Explicit selection/proposal: blur never silently creates a concept or resolves an ambiguous legacy chip. */
export function ConceptChipInput({ label, value, onChange, inputId, optional, maxItems=16, maxLength=40, disabled=false, placeholder='Pesquise um conceito', helperText, className }: Props) {
  const generated=useId(), id=inputId || 'concept-'+generated, listId=id+'-results'
  const root=useRef<HTMLDivElement>(null), input=useRef<HTMLInputElement>(null), popup=useRef<HTMLDivElement>(null)
  const cache=useRef(new Map<string,ConceptHit[]>())
  const suppressOpen=useRef(false)
  const [draft,setDraft]=useState(''), [open,setOpen]=useState(false), [active,setActive]=useState(-1)
  const [rows,setRows]=useState<ConceptHit[]>([]), [loading,setLoading]=useState(false), [failed,setFailed]=useState(false)
  const [notice,setNotice]=useState('')
  const [replace,setReplace]=useState<number|null>(null), [position,setPosition]=useState<CSSProperties>()
  const full=value.length>=maxItems && replace===null, query=draft.trim()
  useEffect(()=>{
    const close=(event:PointerEvent)=>{ if(event.target instanceof Node && !root.current?.contains(event.target) && !popup.current?.contains(event.target))setOpen(false) }
    document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)
  },[])
  useLayoutEffect(()=>{
    if(!open)return
    const place=()=>{
      const box=input.current?.getBoundingClientRect();if(!box)return
      const below=window.innerHeight-box.bottom-12,above=box.top-12
      const next:CSSProperties={left:box.left,width:box.width,maxHeight:Math.max(80,Math.min(360,Math.max(below,above)))}
      if(below>=200 || below>=above){next.top=box.bottom+6;next.maxHeight=Math.max(80,Math.min(360,below))}
      else{next.bottom=window.innerHeight-box.top+6;next.maxHeight=Math.max(80,Math.min(360,above))}
      setPosition(current=>JSON.stringify(current)===JSON.stringify(next)?current:next)
    }
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true)
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)}
  },[open])
  useEffect(()=>{
    setRows([]);setActive(-1);setFailed(false)
    if(!open || !query || disabled || full){setLoading(false);return}
    const controller=new AbortController();setLoading(true)
    const timer=window.setTimeout(()=>{
      const existing=cache.current.get(query)
      void (existing?Promise.resolve(existing):searchConcepts(query,controller.signal)).then(result=>{
        if(controller.signal.aborted)return
        if(cache.current.size>=40)cache.current.delete(cache.current.keys().next().value!)
        cache.current.set(query,result);setRows(result);setLoading(false)
      }).catch(()=>{if(!controller.signal.aborted){setFailed(true);setLoading(false)}})
    },250)
    return()=>{window.clearTimeout(timer);controller.abort()}
  },[query,open,disabled,full])
  useEffect(()=>{if(active>=0)document.getElementById(listId+'-'+active)?.scrollIntoView({block:'nearest'})},[active,listId])
  function select(choice:ConceptChoice){
    const others=value.filter((_,i)=>i!==replace)
    const duplicate=others.some(v=>choice.id?v.id===choice.id:!v.id&&v.label.toLocaleLowerCase()===choice.label.toLocaleLowerCase()&&v.domain===choice.domain)
    if(!duplicate)onChange(replace===null?[...value,choice]:value.map((v,i)=>i===replace?choice:v))
    setNotice(duplicate?'Esse conceito já está na lista. Use o X para remover o termo que deseja substituir.':'')
    setDraft('');setReplace(null);setOpen(false);setActive(-1);suppressOpen.current=true;input.current?.focus();suppressOpen.current=false
  }
  const canPropose=Boolean(query && query.length<=maxLength && /[\p{L}\p{N}]/u.test(query) && !/[<>@\x00-\x1f]/.test(query) && !/https?:\/\/|www\./i.test(query))
  function choose(index:number){const row=rows[index];if(row)select({id:row.id,label:row.nome,domain:row.dominio,status:row.status})}
  const showResults=open&&query&&!loading&&!failed, count=rows.length
  return <div ref={root} className={cn('min-w-0 space-y-2',className)} onBlur={event=>{
    if(!event.currentTarget.contains(event.relatedTarget)&&!popup.current?.contains(event.relatedTarget))setOpen(false)
  }}>
    <div className="flex flex-wrap items-center gap-2"><Label htmlFor={id}>{label}</Label>{optional&&<span className="text-[11px] font-bold uppercase tracking-wider text-primary">(opcional)</span>}</div>
    <input ref={input} id={id} value={draft} maxLength={120} disabled={disabled||full} placeholder={full?'Limite atingido':placeholder}
      role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open} aria-controls={showResults?listId:undefined}
      aria-activedescendant={showResults&&active>=0?listId+'-'+active:undefined} aria-describedby={id+'-help'}
      className="flex h-10 w-full min-w-0 rounded-2xl border border-input bg-background px-4 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
      onFocus={()=>{if(!suppressOpen.current)setOpen(true)}} onChange={event=>{setDraft(event.target.value);setOpen(true)}} onKeyDown={event=>{
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);if(count)setActive(n=>event.key==='ArrowDown'?Math.min(n+1,count-1):Math.max(n-1,0))}
        if(event.key==='Enter'){event.preventDefault();if(showResults&&active>=0)choose(active)}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);setReplace(null);setDraft('')}
      }} />
    {value.length>0&&<ul className="flex flex-wrap gap-2" aria-label={label+' adicionados'}>{value.map((choice,index)=><li key={choice.id||index+'-'+choice.label}
      className="inline-flex max-w-full items-center gap-1 rounded-2xl border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-foreground">
      <span className="min-w-0 break-words">{choice.label}{choice.domain&&<span className="text-muted-foreground"> · {choice.domain}</span>}{choice.status==='provisorio'&&<span className="ml-1 font-medium text-primary">· Provisório</span>}{choice.status==='inativo'&&<span className="ml-1 text-muted-foreground">· Inativo</span>}</span>
      {!choice.id&&!choice.proposal&&<button type="button" disabled={disabled} className="min-h-8 rounded px-1 font-semibold text-primary underline focus-visible:ring-2 focus-visible:ring-ring" aria-label={'Confirmar conceito '+choice.label}
        onClick={()=>{setReplace(index);setDraft(choice.label);setOpen(true);input.current?.focus()}}>Confirmar</button>}
      <button type="button" disabled={disabled} aria-label={'Remover '+choice.label} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={()=>{onChange(value.filter((_,at)=>at!==index));setReplace(null);input.current?.focus()}}><X className="size-3.5" aria-hidden /></button>
    </li>)}</ul>}
    <p id={id+'-help'} className="text-xs text-muted-foreground">{replace!==null?'Selecione a identidade correta para substituir o termo pendente.':helperText||'Selecione um resultado ou adicione uma sugestão provisória. Setas e Enter para escolher.'} ({value.length}/{maxItems})</p>
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    {open&&!disabled&&!full&&position&&createPortal(<div ref={popup} style={position} className="fixed z-[90] overflow-y-auto overscroll-contain rounded-xl border bg-popover p-1 text-popover-foreground shadow-xl">
      {!query?<p className="p-3 text-sm text-muted-foreground">Digite para pesquisar no catálogo.</p>:loading?<p role="status" className="p-3 text-sm">Pesquisando conceitos…</p>:failed?<p role="alert" className="p-3 text-sm text-destructive">Não foi possível pesquisar. Altere o texto para tentar novamente.</p>:<>
        {!rows.length&&<p role="status" className="p-3 text-sm text-muted-foreground">Nenhum conceito encontrado.</p>}
        <ul role="listbox" id={listId} aria-label={'Resultados para '+label}>
          {rows.map((row,index)=><li role="option" id={listId+'-'+index} key={row.id} aria-selected={active===index} onMouseDown={e=>e.preventDefault()} onMouseMove={()=>setActive(index)} onClick={()=>choose(index)}
            className={cn('cursor-pointer break-words rounded-lg p-3 text-sm',active===index?'bg-primary/15':'hover:bg-muted')}>
            <span className="font-medium">{row.nome}</span><span className="ml-2 text-xs text-primary">{row.status==='validado'?'Validado':'Provisório'}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{row.dominio}{row.alias!==row.nome?' · Alias: '+row.alias:''}{row.confirmacao?' · Confirme o contexto':''}{row.descricao?' · '+row.descricao:''}</span>
          </li>)}
        </ul>
        {canPropose&&<button type="button" className="mt-1 min-h-11 w-full rounded-lg border-t p-3 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onMouseDown={e=>e.preventDefault()} onClick={()=>select({id:null,label:query,status:'provisorio',proposal:true})}>Não encontrou? Sugerir novo conceito<span className="mt-1 block break-words">“{query}” · provisório, enviado ao salvar.</span></button>}
        {!canPropose&&query.length>maxLength&&<p className="p-3 text-xs text-muted-foreground">Sugestões novas: até {maxLength} caracteres. Conceitos do catálogo podem ter nomes maiores.</p>}
        <p className="border-t p-2 text-[11px] text-muted-foreground">Inclui dados <a href="https://esco.ec.europa.eu/en" target="_blank" rel="noreferrer" className="underline">ESCO / Comissão Europeia</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="underline">CC BY 4.0</a>.</p>
      </>}
    </div>,root.current?.closest('dialog')??document.body)}
  </div>
}
