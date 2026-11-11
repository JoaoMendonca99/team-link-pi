'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useProjectViewer } from '@/components/providers/project-viewer'

export type ProjectCardState = { project_id: string; image_ref: string | null; likes_count: number | null; liked: boolean }
type Result = ProjectCardState | null | undefined
const updates = new EventTarget()
const pending = new Map<string, Array<(row: Result) => void>>()
let scheduled = false

function readBatch(id: string): Promise<Result> {
  return new Promise(resolve => {
    const listeners = pending.get(id) ?? []
    listeners.push(resolve)
    pending.set(id, listeners)
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      const batch = [...pending]
      pending.clear()
      scheduled = false
      for (let i = 0; i < batch.length; i += 60) void resolveBatch(batch.slice(i, i + 60))
    })
  })
}

async function resolveBatch(batch: Array<[string, Array<(row: Result) => void>]>) {
  try {
    const { data, error } = await getSupabaseClient().rpc('get_project_card_state', { p_projects: batch.map(([id]) => id) })
    if (error) throw error
    const rows = new Map((data as ProjectCardState[]).map(row => [row.project_id, row]))
    batch.forEach(([id, listeners]) => listeners.forEach(listener => listener(rows.get(id) ?? null)))
  } catch {
    batch.forEach(([, listeners]) => listeners.forEach(listener => listener(undefined)))
  }
}

export function useProjectCardState(id?: string) {
  const { loading, userId } = useProjectViewer()
  const key = id && !loading ? (userId ?? 'anon') + ':' + id : undefined
  const [snapshot, setSnapshot] = useState<{ key: string; row: Result }>()
  const generation = useRef(0)
  const reload = useCallback(async () => {
    if (!id || !key) return undefined
    const sequence = ++generation.current
    const row = await readBatch(id)
    if (generation.current === sequence) setSnapshot({ key, row })
    return row
  }, [id, key])
  useEffect(() => {
    if (!key) return
    const revision = generation
    void reload()
    const update = (event: Event) => {
      ++generation.current
      setSnapshot({ key, row: (event as CustomEvent<ProjectCardState>).detail })
    }
    updates.addEventListener(key, update)
    return () => { ++revision.current; updates.removeEventListener(key, update) }
  }, [key, reload])
  const ready = Boolean(key && snapshot?.key === key)
  return { row: ready ? snapshot?.row : undefined, ready, reload, key }
}

export function publishProjectCardState(key: string, row: ProjectCardState) {
  updates.dispatchEvent(new CustomEvent(key, { detail: row }))
}
