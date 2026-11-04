'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { FRIENDSHIPS_CHANGED, ONLINE_WINDOW, profileRpc, type Friend, type FriendshipAction, type Relationship, type SocialSummary } from '@/lib/profile-social'

export function useProfileSocial(userId?: string, viewerId?: string) {
  const [result, setResult] = useState<{ key: string; data: SocialSummary }>()
  const key = userId + ':' + (viewerId ?? '')
  useEffect(() => {
    if (!userId) return
    let active = true
    const load = () => {
      if (document.hidden) return
      void profileRpc<SocialSummary>('get_profile_social', { p_user: userId })
        .then((data) => { if (active && data) setResult({ key, data }) })
        .catch(() => { if (active) setResult(undefined) })
    }
    load()
    const timer = viewerId && userId !== viewerId ? window.setInterval(load, 60_000) : undefined
    window.addEventListener(FRIENDSHIPS_CHANGED, load)
    document.addEventListener('visibilitychange', load)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener(FRIENDSHIPS_CHANGED, load)
      document.removeEventListener('visibilitychange', load)
    }
  }, [key, userId, viewerId])
  return result?.key === key ? result.data : undefined
}

export function PresenceLabel({ lastActivity }: { lastActivity?: string | null }) {
  if (!lastActivity) return null
  const elapsed = Date.now() - Date.parse(lastActivity)
  if (!Number.isFinite(elapsed)) return null
  if (elapsed < ONLINE_WINDOW) return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
    <span aria-hidden className="size-2 rounded-full bg-emerald-500" /> Online agora
  </span>
  const minutes = Math.floor(elapsed / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
  const time = days ? relative.format(-days, 'day') : hours ? relative.format(-hours, 'hour') : relative.format(-minutes, 'minute')
  return <span className="text-xs text-muted-foreground">Visto por último {time}</span>
}

export function FriendshipControls({ userId, relationship, onChanged }: {
  userId: string
  relationship: Relationship
  onChanged?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const confirm = useRef<HTMLDialogElement>(null)
  const pending = useRef(false)
  async function change(action: FriendshipAction) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await profileRpc('update_friendship', { p_user: userId, p_action: action })
      confirm.current?.close()
      window.dispatchEvent(new Event(FRIENDSHIPS_CHANGED))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível alterar a amizade.')
      onChanged?.()
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <div className="min-w-0 space-y-1">
    <div className="flex flex-wrap items-center gap-2">
      {relationship === 'none' && <Button type="button" disabled={busy} onClick={() => void change('send')}><UserPlus aria-hidden /> Adicionar amigo</Button>}
      {relationship === 'sent' && <>
        <span className="text-xs text-muted-foreground">Solicitação enviada</span>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void change('cancel')}>Cancelar solicitação</Button>
      </>}
      {relationship === 'received' && <>
        <Button type="button" size="sm" disabled={busy} onClick={() => void change('accept')}>Aceitar</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void change('decline')}>Recusar</Button>
      </>}
      {relationship === 'accepted' && <>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">Amigos</span>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setError(''); confirm.current?.showModal() }}>Desfazer amizade</Button>
        <dialog ref={confirm} aria-label="Desfazer amizade?" onCancel={(event) => { if (pending.current) event.preventDefault() }}
          className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-xl backdrop:bg-black/70">
          <div className="space-y-3">
            <h2 className="font-semibold">Desfazer amizade?</h2>
            <p className="text-sm text-muted-foreground">O vínculo de amizade e o acesso à presença entre vocês serão removidos.</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => confirm.current?.close()}>Cancelar</Button>
              <Button type="button" variant="destructive" disabled={busy} onClick={() => void change('unfriend')}>Desfazer amizade</Button>
            </div>
          </div>
        </dialog>
      </>}
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}

const sections = [
  ['accepted', 'Meus amigos', 'Você ainda não tem amigos adicionados.'],
  ['received', 'Solicitações recebidas', 'Nenhuma solicitação recebida.'],
  ['sent', 'Solicitações enviadas', 'Nenhuma solicitação enviada.'],
] as const

export function FriendsPanel() {
  const [rows, setRows] = useState<Friend[]>()
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const request = useRef(0)
  const load = useCallback(() => {
    if (document.hidden) return
    const id = ++request.current
    void profileRpc<Friend[]>('get_my_friendships').then((data) => {
      if (id === request.current) { setRows(data); setError(false) }
    }).catch(() => {
      if (id === request.current) { setRows(undefined); setError(true) }
    })
  }, [])
  useEffect(() => {
    load()
    const timer = window.setInterval(load, 60_000)
    window.addEventListener(FRIENDSHIPS_CHANGED, load)
    document.addEventListener('visibilitychange', load)
    return () => {
      request.current += 1
      window.clearInterval(timer)
      window.removeEventListener(FRIENDSHIPS_CHANGED, load)
      document.removeEventListener('visibilitychange', load)
    }
  }, [load])

  const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
  if (error) return <div className="space-y-2"><p role="alert">Não foi possível carregar as amizades.</p><Button onClick={load}>Tentar novamente</Button></div>
  if (!rows) return <p role="status">Carregando amizades…</p>
  return <div className="space-y-4">
    <Input type="search" aria-label="Buscar amigos por nome" placeholder="Buscar amigos por nome" value={search} onChange={(event) => setSearch(event.target.value)} />
    {sections.map(([state, title, empty]) => {
      const filtered = rows.filter((row) => row.relationship === state &&
        (state !== 'accepted' || normalize(row.full_name ?? '').includes(normalize(search.trim()))))
      return <section key={state} className="rounded-2xl border border-card-outline bg-card p-4">
        <h2 className="mb-3 font-semibold">{title}</h2>
        {filtered.length === 0 ? <p className="text-sm text-muted-foreground">{state === 'accepted' && search ? 'Nenhum amigo encontrado.' : empty}</p> :
          <ul className="divide-y divide-border">{filtered.map((row) => <li key={row.user_id} className="flex flex-wrap items-center gap-3 py-3">
            <UserAvatar name={row.full_name || 'Estudante'} imageUrl={row.avatar_url ?? undefined} sizeClassName="size-10 shrink-0" />
            <div className="min-w-0 flex-1 basis-40">
              <Link href={'/usuarios/' + row.user_id} className="break-words text-sm font-semibold text-primary hover:underline">{row.full_name || 'Estudante'}</Link>
              <p className="break-words text-xs text-muted-foreground">{row.course || row.university}</p>
              <PresenceLabel lastActivity={row.last_activity} />
            </div>
            <FriendshipControls userId={row.user_id} relationship={row.relationship} onChanged={load} />
          </li>)}</ul>}
      </section>
    })}
  </div>
}
