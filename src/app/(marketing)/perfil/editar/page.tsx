'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import { ChipInput, normalizeStringArray } from '@/components/team-link/chip-input'
import { DemoBanner } from '@/components/team-link/demo-banner'
import { FormSection } from '@/components/team-link/form-section'
import { PageHeader } from '@/components/team-link/page-header'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/layout/container'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { translateAuthError } from '@/lib/supabase/auth-errors'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

export default function EditProfilePage() {
  const { loading, isAuthenticated, profile, user, refreshProfile } = useSupabaseSession()

  const [fullName, setFullName] = useState('')
  const [course, setCourse] = useState('')
  const [bio, setBio] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [interests, setInterests] = useState<string[]>([])
  const [avatarUrl, setAvatarUrl] = useState('')

  const [hydrated, setHydrated] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [bannerOpen, setBannerOpen] = useState(false)
  const [envMissing, setEnvMissing] = useState(false)

  useEffect(() => {
    setEnvMissing(!isSupabaseConfigured())
  }, [])

  useEffect(() => {
    if (hydrated) return
    if (!profile) return
    setFullName(profile.full_name ?? '')
    setCourse(profile.course ?? '')
    setBio(profile.bio ?? '')
    setSkills(normalizeStringArray(profile.skills))
    setInterests(normalizeStringArray(profile.interests))
    setAvatarUrl(profile.avatar_url ?? '')
    setHydrated(true)
  }, [hydrated, profile])

  if (loading) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-1/2 rounded-2xl bg-muted" />
            <div className="h-6 w-3/4 rounded-2xl bg-muted" />
            <div className="h-64 rounded-3xl bg-muted" />
          </div>
        </Container>
      </main>
    )
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <PageHeader
            title="Acesso necessário"
            description="Entre com sua conta Team Link para editar seu perfil."
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="rounded-2xl font-semibold">
              <Link href="/login">Ir para login</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-2xl font-semibold">
              <Link href="/cadastro">Criar conta</Link>
            </Button>
          </div>
        </Container>
      </main>
    )
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    if (envMissing) {
      setErrorMessage('Conexão com o Supabase ainda não configurada neste ambiente.')
      return
    }

    setSubmitting(true)
    try {
      const client = getSupabaseClient()
      const { error } = await client
        .from('profiles')
        .update({
          full_name: fullName.trim() || null,
          course: course.trim() || null,
          bio: bio.trim() || null,
          skills,
          interests,
          avatar_url: avatarUrl.trim() || null,
        })
        .eq('id', user.id)

      if (error) {
        setErrorMessage(translateAuthError(error.message))
        return
      }

      await refreshProfile()
      setBannerOpen(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : null
      setErrorMessage(translateAuthError(message))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="bg-background pb-16">
      <div className="border-b border-border bg-gradient-to-b from-muted/40 to-transparent">
        <Container className="space-y-8 py-12">
          <Button asChild variant="ghost" className="w-fit gap-2 rounded-2xl font-semibold">
            <Link href="/perfil">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao perfil
            </Link>
          </Button>
          <PageHeader
            eyebrow="Formulário de perfil"
            title="Editar perfil acadêmico"
            description="Estas informações ficam salvas com segurança em sua conta Team Link no Supabase."
          />
        </Container>
      </div>

      <Container size="article" className="space-y-8 py-12">
        <form className="space-y-8" onSubmit={handleSubmit}>
          <FormSection title="Identidade básica">
            <div className="space-y-3">
              <Label htmlFor="nome">Nome completo</Label>
              <Input
                id="nome"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="curso">Curso / Área principal</Label>
              <Input
                id="curso"
                value={course}
                onChange={(event) => setCourse(event.target.value)}
                placeholder="Engenharia da Computação..."
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={6}
                placeholder="Conte sobre sua trajetória, áreas que estuda e o que quer construir."
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="avatar">URL do avatar (opcional)</Label>
              <Input
                id="avatar"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://..."
                className="rounded-2xl"
              />
              <p className="text-xs text-muted-foreground">
                Upload direto de imagem será adicionado em uma etapa futura.
              </p>
            </div>
          </FormSection>

          <FormSection title="Habilidades & interesses">
            <ChipInput
              label="Habilidades"
              value={skills}
              onChange={setSkills}
              placeholder="Ex.: React, Figma, Arduino..."
              helperText="Adicione habilidades que ajudam outras pessoas a entender como você pode contribuir. Pressione Enter para adicionar e use o x para remover."
              inputId="habilidades"
            />
            <ChipInput
              label="Áreas de interesse"
              value={interests}
              onChange={setInterests}
              placeholder="Ex.: educação, sustentabilidade, tecnologia..."
              helperText="Adicione temas que combinam com os projetos que você quer acompanhar. Pressione Enter para adicionar e use o x para remover."
              inputId="interesses"
            />
          </FormSection>

          {errorMessage ? (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
            >
              {errorMessage}
            </div>
          ) : null}

          {envMissing ? (
            <div
              role="status"
              className="rounded-2xl border border-amber-400/40 bg-amber-100/60 px-4 py-3 text-sm font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
            >
              Configure as variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local para habilitar a edição.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-4">
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-2xl px-8 font-semibold"
            >
              {submitting ? 'Salvando...' : 'Salvar alterações'}
            </Button>
            <Button asChild type="button" variant="outline" className="rounded-2xl font-semibold">
              <Link href="/perfil">Cancelar</Link>
            </Button>
          </div>
        </form>
      </Container>

      <DemoBanner
        open={bannerOpen}
        tone="success"
        onClose={() => setBannerOpen(false)}
        message="Perfil atualizado com sucesso."
      />
    </main>
  )
}
