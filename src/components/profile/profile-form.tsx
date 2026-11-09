'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'

import { AvatarEditor, exportAvatar, type AvatarCrop } from '@/components/profile/avatar-editor'
import { ChipInput, normalizeStringArray } from '@/components/team-link/chip-input'
import { FormSection } from '@/components/team-link/form-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getSupabaseClient } from '@/lib/supabase/client'
import { normalizeProfileTags, PROFILE_CHANGED } from '@/lib/profile-social'
import { PresenceControl, usePresencePreference } from './presence-preference'
import { InstitutionPicker } from '@/components/team-link/institution-picker'
import { CoursePicker } from '@/components/team-link/course-picker'
import type { ProfileRow } from '@/types/database'

export function ProfileForm({ profile, backHref='/perfil' }: { profile: ProfileRow; backHref?:string }) {
  const [name, setName] = useState(profile.full_name ?? '')
  const [course, setCourse] = useState({ id: profile.course_id ?? null, name: profile.course ?? '' })
  const [institution, setInstitution] = useState({ id: profile.institution_id ?? null, name: profile.university ?? '' })
  const [bio, setBio] = useState(profile.bio ?? '')
  const [skills, setSkills] = useState(() => normalizeProfileTags(normalizeStringArray(profile.skills)))
  const [interests, setInterests] = useState(() => normalizeProfileTags(normalizeStringArray(profile.interests)))
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url)
  const [draft, setDraft] = useState<AvatarCrop | null>()
  const {visibility,setVisibility,presenceError,saveVisibility}=usePresencePreference()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const field = window.location.hash.slice(1)
    if (!['profile-academics', 'profile-bio', 'profile-skills', 'profile-interests', 'profile-photo'].includes(field)) return
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(field)
      element?.scrollIntoView({ block: 'center' })
      element?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
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
        full_name: name.trim(), course: course.name.trim() || null, course_id: course.id, university: institution.name.trim() || null, institution_id: institution.id,
        bio: bio.trim() || null, skills: normalizeProfileTags(skills), interests: normalizeProfileTags(interests),
      }).eq('id', profile.id).select('id').single()
      if (error) throw new Error('Não foi possível salvar os dados do perfil.')
      profileSaved = true
      await saveVisibility()
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
      <div id="profile-academics" tabIndex={-1} className="grid scroll-mt-36 gap-3 sm:grid-cols-2">
        <CoursePicker id="profile-course" value={course} onChange={setCourse} />
        <InstitutionPicker id="profile-university" value={institution} onChange={setInstitution} />
      </div>
      <div className="space-y-2"><Label htmlFor="profile-bio">Biografia</Label>
        <Textarea id="profile-bio" className="scroll-mt-36" rows={4} value={bio} onChange={(event) => setBio(event.target.value)} /></div>
    </FormSection>
    <FormSection title="Habilidades e interesses">
      <ChipInput inputId="profile-skills" label="Habilidades" value={skills} onChange={(items) => setSkills(normalizeProfileTags(items))}
        placeholder="Ex.: Python, React, UI/UX" helperText="Pressione Enter para adicionar cada habilidade." />
      <ChipInput inputId="profile-interests" label="Interesses" value={interests} onChange={(items) => setInterests(normalizeProfileTags(items))}
        placeholder="Ex.: Robótica, IoT, jogos" helperText="Pressione Enter para adicionar cada interesse." />
    </FormSection>
    <FormSection title="Privacidade">
      <PresenceControl value={visibility} onChange={setVisibility} disabled={saving} error={presenceError}/>
    </FormSection>
    {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
    {status && <p role="status" className="text-sm font-medium text-primary">{status}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      <Button asChild variant="outline"><Link href={backHref}>Voltar ao perfil</Link></Button>
      <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</Button>
    </div>
  </form>
}

