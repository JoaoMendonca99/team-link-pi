'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft } from 'lucide-react'

import { AvatarEditor, exportAvatar, type AvatarCrop } from '@/components/profile/avatar-editor'
import { ChipInput, normalizeStringArray } from '@/components/team-link/chip-input'
import { FormSection } from '@/components/team-link/form-section'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getSupabaseClient } from '@/lib/supabase/client'
import { normalizeProfileTags, profileRpc, PROFILE_CHANGED } from '@/lib/profile-social'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import type { ProfileRow } from '@/types/database'

function ProfileForm({ profile }: { profile: ProfileRow }) {
  const [name, setName] = useState(profile.full_name ?? '')
  const [course, setCourse] = useState(profile.course ?? '')
  const [university, setUniversity] = useState(profile.university ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [skills, setSkills] = useState(() => normalizeProfileTags(normalizeStringArray(profile.skills)))
  const [interests, setInterests] = useState(() => normalizeProfileTags(normalizeStringArray(profile.interests)))
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url)
  const [draft, setDraft] = useState<AvatarCrop | null>()
  const [visibility, setVisibility] = useState<boolean | null>(null)
  const [savedVisibility, setSavedVisibility] = useState<boolean | null>(null)
  const [presenceError, setPresenceError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let active = true
    void profileRpc<boolean>('get_my_presence_visibility').then((value) => {
      if (active) { setVisibility(value); setSavedVisibility(value) }
    }).catch(() => { if (active) setPresenceError(true) })
    return () => { active = false }
  }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setStatus('')
    let profileSaved = false
    try {
      const client = getSupabaseClient()
      const photo = draft ? await exportAvatar(draft) : undefined
      const { error } = await client.from('profiles').update({
        full_name: name.trim(), course: course.trim() || null, university: university.trim() || null,
        bio: bio.trim() || null, skills: normalizeProfileTags(skills), interests: normalizeProfileTags(interests),
      }).eq('id', profile.id).select('id').single()
      if (error) throw new Error('Não foi possível salvar os dados do perfil.')
      profileSaved = true
      if (visibility !== null && visibility !== savedVisibility) {
        await profileRpc('set_my_presence_visibility', { p_visible: visibility })
        setSavedVisibility(visibility)
      }
      if (draft !== undefined) {
        const result = await client.functions.invoke<{ avatar_url: string | null }>('profile-avatar', photo
          ? { body: photo, headers: { 'Content-Type': 'image/jpeg' } }
          : { method: 'DELETE' })
        if (result.error || !result.data) throw new Error('Não foi possível atualizar a fotografia. Tente novamente.')
        setAvatarUrl(result.data.avatar_url)
        setDraft(undefined)
      }
      setStatus('Perfil atualizado com sucesso.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível atualizar o perfil.'
      setError(profileSaved ? 'Os dados básicos foram salvos. ' + message : message)
    } finally {
      if (profileSaved) window.dispatchEvent(new Event(PROFILE_CHANGED))
      setSaving(false)
    }
  }

  return <form className="space-y-4" onSubmit={save}>
    <FormSection title="Identidade acadêmica">
      <AvatarEditor name={name || 'Estudante'} avatarUrl={avatarUrl} draft={draft} onChange={setDraft} disabled={saving} />
      <div className="space-y-2"><Label htmlFor="profile-name">Nome completo</Label>
        <Input id="profile-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="profile-course">Curso</Label>
          <Input id="profile-course" value={course} onChange={(event) => setCourse(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="profile-university">Faculdade ou universidade</Label>
          <Input id="profile-university" maxLength={120} value={university} onChange={(event) => setUniversity(event.target.value)} /></div>
      </div>
      <div className="space-y-2"><Label htmlFor="profile-bio">Biografia</Label>
        <Textarea id="profile-bio" rows={4} value={bio} onChange={(event) => setBio(event.target.value)} /></div>
    </FormSection>
    <FormSection title="Habilidades e interesses">
      <ChipInput label="Habilidades" value={skills} onChange={(items) => setSkills(normalizeProfileTags(items))}
        placeholder="Ex.: Python, React, UI/UX" helperText="Pressione Enter para adicionar cada habilidade." />
      <ChipInput label="Interesses" value={interests} onChange={(items) => setInterests(normalizeProfileTags(items))}
        placeholder="Ex.: Robótica, IoT, jogos" helperText="Pressione Enter para adicionar cada interesse." />
    </FormSection>
    <FormSection title="Privacidade">
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={visibility === true} disabled={saving || visibility === null}
          onChange={(event) => setVisibility(event.target.checked)} aria-describedby="profile-presence-help" className="mt-1 size-4 accent-primary" />
        <span><span className="block text-sm font-semibold">Mostrar meu status online</span>
          <span id="profile-presence-help" className="block text-xs text-muted-foreground">Permitir que seus amigos vejam quando você está online e sua última atividade.</span>
        </span>
      </label>
      {presenceError && <p role="alert" className="text-xs text-destructive">Não foi possível carregar sua preferência de presença. Recarregue a página para alterá-la.</p>}
    </FormSection>
    {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
    {status && <p role="status" className="text-sm font-medium text-primary">{status}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      <Button asChild variant="outline"><Link href="/perfil">Voltar ao perfil</Link></Button>
      <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</Button>
    </div>
  </form>
}

export default function EditProfilePage() {
  const { loading, isAuthenticated, profile } = useSupabaseSession()
  return <main className="bg-background">
    <Container size="article" className="space-y-5 py-8">
      <Button asChild variant="ghost"><Link href="/perfil"><ArrowLeft aria-hidden /> Perfil</Link></Button>
      <h1 className="text-2xl font-bold">Editar perfil</h1>
      {loading ? <p role="status">Carregando perfil…</p> : !isAuthenticated ?
        <Button asChild><Link href="/login">Entre na sua conta</Link></Button> : profile ?
          <ProfileForm key={profile.id} profile={profile} /> :
          <p role="alert">Não foi possível carregar seus dados. Recarregue a página para tentar novamente.</p>}
    </Container>
  </main>
}
