'use client'
import {usePathname,useSearchParams} from 'next/navigation'
import {useRef} from 'react'
import {activitySelection} from '@/lib/activity-details'
export function useActivityLink(){
 const pathname=usePathname(),params=useSearchParams(),opened=useRef<string|null>(null)
 const selection=activitySelection(new URLSearchParams(params.toString()))
 function open(project:string,task:string){const url=new URL(window.location.href);url.searchParams.set('projeto',project);url.searchParams.set('atividade',task);opened.current=url.pathname+url.search;window.history.pushState(null,'',url)}
 function close(){const url=new URL(window.location.href);if(opened.current===url.pathname+url.search){opened.current=null;window.history.back()}else{url.searchParams.delete('atividade');url.searchParams.delete('projeto');window.history.replaceState(null,'',url)}}
 return {selection,open,close,key:pathname+':'+(selection?.project??selection?.slug??'')+':'+(selection?.task??'')}
}
