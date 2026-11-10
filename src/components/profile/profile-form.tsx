'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'

import { AvatarEditor, exportAvatar, type AvatarCrop } from '@/components/profile/avatar-editor'
import { normalizeStringArray } from '@/components/team-link/chip-input'
import { ConceptChipInput } from '@/components/team-link/concept-chip-input'
import { legacyConcepts, type ConceptChoice } from '@/lib/concepts'
import { FormSection } from '@/components/team-link/form-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getSupabaseClient } from '@/lib/supabase/client'
import { PROFILE_CHANGED } from '@/lib/profile-social'
import { PresenceControl, usePresencePreference } from './presence-preference'
import { EducationEditor } from './education-editor'
import { educationDraft,educationPayload,type EducationDraft,type EducationState,type LegacyEducation } from '@/lib/education'
import type { ProfileRow } from '@/types/database'

export function ProfileForm({ profile, backHref='/perfil' }: { profile: ProfileRow; backHref?:string }) {
  const [name, setName] = useState(profile.full_name ?? '')
  const [formations,setFormations]=useState<EducationDraft[]>([]),[primary,setPrimary]=useState<string|null>(null)
  const [revision,setRevision]=useState(0),[legacy,setLegacy]=useState<LegacyEducation|null>(null),[resolvedLegacyId,setResolvedLegacyId]=useState<string|null>(null),[editingEducation,setEditingEducation]=useState(false)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [skills, setSkills] = useState<ConceptChoice[]>(() => legacyConcepts(normalizeStringArray(profile.skills)))
  const [interests, setInterests] = useState<ConceptChoice[]>(() => legacyConcepts(normalizeStringArray(profile.interests)))
  const [conceptsReady, setConceptsReady] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url)
  const [draft, setDraft] = useState<AvatarCrop | null>()
  const {visibility,setVisibility,presenceError,saveVisibility}=usePresencePreference()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let cancelled=false
    const client=getSupabaseClient()
    void Promise.all([client.rpc('get_my_concept_refs'),client.rpc('get_my_education')]).then(([concepts,education])=>{
      if(cancelled)return
      if(concepts.error || !concepts.data || education.error || !education.data){setError('Não foi possível carregar os dados. Recarregue a página para editar com segurança.');return}
      const state=education.data as EducationState
      setFormations(state.formations.map(row=>educationDraft(row)));setPrimary(state.primary_id);setRevision(state.revision);setLegacy(state.legacy)
      setSkills(concepts.data.skills);setInterests(concepts.data.interests);setConceptsReady(true)
    })
    return()=>{cancelled=true}
  },[profile.id])

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
    if (saving || !conceptsReady || editingEducation) return
    setSaving(true)
    setError('')
    setStatus('')
    let profileSaved = false
    try {
      const client = getSupabaseClient()
      const photo = draft ? await exportAvatar(draft) : undefined
      const { error } = await client.rpc('save_profile_with_education', { p_profile: {
        full_name: name.trim(),
        bio: bio.trim() || null,
      }, p_skills: skills, p_interests: interests,p_formations:educationPayload(formations),p_primary:primary,p_revision:revision,p_resolve_legacy:formations.some(f=>f.id===resolvedLegacyId) })
      if (error) throw new Error(['22023','40001'].includes(error.code)?error.message:'Não foi possível salvar os dados do perfil.')
      profileSaved = true
      setRevision(current=>current+1)
      const { data: savedConcepts } = await client.rpc('get_my_concept_refs')
      if(savedConcepts){setSkills(savedConcepts.skills);setInterests(savedConcepts.interests)}
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
    <FormSection title="Dados do perfil">
      <AvatarEditor name={name || 'Estudante'} avatarUrl={avatarUrl} draft={draft} onChange={setDraft} disabled={saving} />
      <div className="space-y-2"><Label htmlFor="profile-name">Nome completo</Label>
        <Input id="profile-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="profile-bio">Biografia</Label>
        <Textarea id="profile-bio" className="scroll-mt-36" rows={4} value={bio} onChange={(event) => setBio(event.target.value)} /></div>
    </FormSection>
    <div id="profile-academics" tabIndex={-1} className="min-w-0 scroll-mt-36 rounded-3xl border border-card-outline bg-card p-5 sm:p-7">
      <EducationEditor value={formations} onChange={setFormations} primary={primary} onPrimary={setPrimary} legacy={legacy} resolvedLegacyId={resolvedLegacyId} onResolveLegacy={setResolvedLegacyId} onEditing={setEditingEducation} disabled={saving||!conceptsReady}/>
    </div>
    <FormSection title="Habilidades e interesses">
      <ConceptChipInput inputId="profile-skills" label="Habilidades" value={skills} onChange={setSkills} disabled={!conceptsReady||saving} optional
        placeholder="Ex.: Python, React, Design" />
      <ConceptChipInput inputId="profile-interests" label="Interesses" value={interests} onChange={setInterests} disabled={!conceptsReady||saving} optional
        placeholder="Ex.: Robótica, Educação, Jogos" helperText="Interesses não são considerados habilidades. Confirme os termos legados quando desejar." />
    </FormSection>
    <FormSection title="Privacidade">
      <PresenceControl value={visibility} onChange={setVisibility} disabled={saving} error={presenceError}/>
    </FormSection>
    {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
    {status && <p role="status" className="text-sm font-medium text-primary">{status}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      <Button asChild variant="outline"><Link href={backHref}>Voltar ao perfil</Link></Button>
      <Button type="submit" disabled={saving||!conceptsReady||editingEducation}>{saving ? 'Salvando…' : 'Salvar alterações'}</Button>
    </div>
  </form>
}

