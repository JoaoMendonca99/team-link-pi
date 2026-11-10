"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { lockDialogScroll } from "@/lib/dialog-scroll-lock"
import { cn } from "@/lib/utils"

/** Native modal supplies focus containment and makes the background inert. */
export function AccessibleDialog({open, label, busy=false, onClose, children, className}: {
  open:boolean; label:string; busy?:boolean; onClose:()=>void; children:ReactNode; className?:string
}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    if(!open)return
    const element=ref.current, previous=document.activeElement as HTMLElement|null
    const unlock=lockDialogScroll()
    element?.showModal()
    return()=>{element?.close();unlock();previous?.focus({preventScroll:true})}
  },[open])
  return <dialog ref={ref} tabIndex={-1} onKeyDown={event=>{
    if(event.key!=="Tab")return
    const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(el=>el.getClientRects().length>0)
    const first=items[0],last=items.at(-1)
    if(!first){event.preventDefault();event.currentTarget.focus();return}
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }} aria-label={label} aria-busy={busy} onCancel={event=>{event.preventDefault();event.stopPropagation();if(!busy)onClose()}}
    onClick={event=>{if(event.target!==event.currentTarget||busy)return;const b=event.currentTarget.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)onClose()}}
    className={cn("fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-3xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/70",className)}>{children}</dialog>
}
