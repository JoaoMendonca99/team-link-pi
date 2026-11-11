'use client'

import { useEffect, useState } from 'react'
import { useProjectViewer } from '@/components/providers/project-viewer'
import { useProjectCardState } from '@/hooks/use-project-card-state'
import { cn } from '@/lib/utils'

export type ProjectImageDraft = { mode: 'set'; file: Blob } | { mode: 'remove' }
export function projectInitials(title: string) {
  return title.trim().split(/\s+/u).filter(Boolean).slice(0, 2)
    .map(word => Array.from(word)[0]).join('').toLocaleUpperCase('pt-BR') || 'P'
}

export function ProjectLogo({ projectId, title, draft, className }: {
  projectId?: string; title: string; draft?: ProjectImageDraft; className?: string
}) {
  const { row } = useProjectCardState(projectId)
  const { token } = useProjectViewer()
  const revision = row?.image_ref
  const source = draft?.mode === 'set' ? draft.file : draft?.mode === 'remove' ? null : revision
  const [result, setResult] = useState<{ source: string | Blob; token: string | null; url: string }>()
  const url = result && result.source === source && result.token === token ? result.url : undefined
  useEffect(() => {
    if (!source) return
    let active = true, objectUrl: string | undefined
    const abort = new AbortController()
    const show = (blob: Blob) => {
      if (!active) return
      objectUrl = URL.createObjectURL(blob)
      setResult({ source, token, url: objectUrl })
    }
    if (typeof source !== 'string') show(source)
    else {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL
      const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (projectId && base && apikey) {
        const endpoint = new URL('/functions/v1/project-image', base)
        endpoint.searchParams.set('id', projectId)
        const headers: Record<string, string> = { apikey }
        if (token) headers.Authorization = 'Bearer ' + token
        void fetch(endpoint, { headers, cache: 'no-store', signal: abort.signal })
          .then(async response => {
            if (response.ok && response.headers.get('Content-Type')?.startsWith('image/png')) show(await response.blob())
          }).catch(() => {})
      }
    }
    return () => {
      active = false
      abort.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [source, projectId, token])
  return <span aria-hidden className={cn('grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted text-base font-bold text-foreground sm:size-16', className)}>
    {url ?
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="size-full object-contain" /> :
      projectInitials(title)}
  </span>
}
