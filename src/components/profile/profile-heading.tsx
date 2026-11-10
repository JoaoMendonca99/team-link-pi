'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Download, Pencil, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { TagList } from '@/components/team-link/tag-list'
import { PresenceLabel } from '@/components/profile/friendships'
import type { ProfileRow } from '@/types/database'
import type { ProjectDisplay } from '@/lib/projects/display'
import type { SocialSummary } from '@/lib/profile-social'
import { educationLabels,educationStatus } from '@/lib/education'

export function ProfileHeading({ profile, projects, projectCount, social, own, children, editHref = '/perfil/editar' }: {
  profile: ProfileRow
  projects: ProjectDisplay[]
  projectCount?: number
  social?: SocialSummary
  editHref?: string
  own?: boolean
  children?: ReactNode
}) {
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [card, setCard] = useState('')
  const [preparing, setPreparing] = useState(false)
  const preview = useRef<HTMLDialogElement>(null)
  useEffect(() => () => { if (card) URL.revokeObjectURL(card) }, [card])
  const name = profile.full_name?.trim() || 'Estudante Team Link'
  const academic = profile.course&&profile.university?[profile.course,profile.university].join(' · '):''
  const publicUrl = () => new URL('/usuarios/' + profile.id, window.location.origin).href

  async function share() {
    setError('')
    setStatus('')
    try {
      await navigator.clipboard.writeText(publicUrl())
      setStatus('Link do perfil copiado')
    } catch {
      setError('Não foi possível copiar o link. Você pode selecioná-lo abaixo.')
    }
  }

  async function prepareCard() {
    setPreparing(true)
    setError('')
    setCard('')
    preview.current?.showModal()
    try {
      const { makeProfileCard } = await import('@/lib/profile-card')
      setCard(URL.createObjectURL(await makeProfileCard(profile, projects, publicUrl())))
    } catch {
      setError('Não foi possível gerar o cartão. Tente novamente.')
    } finally {
      setPreparing(false)
    }
  }

  return <section className="min-w-0 rounded-3xl border border-card-outline bg-card bg-gradient-to-br from-primary/10 to-transparent p-5 shadow-sm sm:p-7">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <UserAvatar name={name} imageUrl={profile.avatar_url ?? undefined} sizeClassName="size-20 shrink-0 sm:size-24" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{own ? 'Seu perfil' : 'Perfil acadêmico'}</p>
        <h1 className="break-words text-2xl font-bold sm:text-3xl">{name}</h1>
        {profile.educations?.length?<section className="space-y-2" aria-label="Formação acadêmica"><h2 className="text-sm font-semibold">Formação acadêmica</h2><ul className="grid gap-2 sm:grid-cols-2">{profile.educations.map(row=>{const names=educationLabels(row);return <li key={row.id} className="min-w-0 rounded-xl border bg-background/40 p-3 text-sm"><p className="break-words font-medium">{names.course}</p><p className="break-words text-muted-foreground">{names.institution}{names.acronym?' — '+names.acronym:''}</p><p className="mt-1 text-xs text-muted-foreground">{educationStatus(row.cursando_atualmente)}</p></li>})}</ul></section>:academic&&<p className="break-words text-sm text-muted-foreground">{academic}</p>}
        {profile.bio && <p className="whitespace-pre-line break-words text-sm leading-relaxed">{profile.bio}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {social && <span><strong className="text-foreground">{social.count}</strong> {social.count === 1 ? 'amigo' : 'amigos'}</span>}
          <span><strong className="text-foreground">{projectCount ?? projects.length}</strong> {(projectCount ?? projects.length) === 1 ? 'projeto' : 'projetos'}</span>
          <PresenceLabel lastActivity={social?.last_activity} />
        </div>
        <div className="flex flex-wrap items-start gap-2 pt-2">
          {own && <Button asChild><Link href={editHref}><Pencil aria-hidden /> Editar perfil</Link></Button>}
          <Button type="button" variant="outline" onClick={() => void share()}><Share2 aria-hidden /> Compartilhar perfil</Button>
          {own && <Button type="button" variant="outline" disabled={preparing} onClick={() => void prepareCard()}><Download aria-hidden /> Baixar card</Button>}
          {children}
        </div>
        {status && <p role="status" className="text-xs text-primary">{status}</p>}
        {error && !preview.current?.open && <p role="alert" className="break-all text-xs text-destructive">{error} <Link href={'/usuarios/' + profile.id}>{publicUrl()}</Link></p>}
      </div>
    </div>
    {own && <dialog ref={preview} aria-label="Prévia do cartão acadêmico"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-4 text-card-foreground shadow-xl backdrop:bg-black/70">
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Prévia do cartão acadêmico</h2>
        {preparing && <p role="status">Gerando imagem…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {card && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card} alt="Cartão acadêmico com QR Code para o perfil público" className="mx-auto max-h-[65dvh] max-w-full rounded-xl object-contain" />
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => { preview.current?.close(); setError('') }}>Fechar</Button>
          {card && <Button asChild><a href={card} download="team-link-perfil.png"><Download aria-hidden /> Baixar PNG</a></Button>}
        </div>
      </div>
    </dialog>}
  </section>
}

export function AcademicTags({ profile }: { profile: ProfileRow }) {
  return <div className="grid min-w-0 gap-3 sm:grid-cols-2">
    {([['Habilidades', profile.skills], ['Interesses', profile.interests]] as const).map(([title, tags]) =>
      <section key={title} className="min-w-0 rounded-2xl border border-card-outline bg-card p-4">
        <h2 className="mb-2 font-semibold">{title}</h2>
        {tags?.length ? <TagList tags={tags} max={tags.length} /> : <p className="text-sm text-muted-foreground">Nenhuma informação cadastrada.</p>}
      </section>
    )}
  </div>
}
