'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { AuthCard } from '@/components/team-link/auth-card'
import { ChipInput } from '@/components/team-link/chip-input'
import { PasswordStrengthMeter } from '@/components/team-link/password-strength-meter'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { translateAuthError } from '@/lib/supabase/auth-errors'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

export default function CadastroPage() {
  const router = useRouter()
  const { isAuthenticated, loading } = useSupabaseSession()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [course, setCourse] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [interests, setInterests] = useState<string[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [existingAccount, setExistingAccount] = useState(false)
  const [envMissing, setEnvMissing] = useState(false)

  useEffect(() => {
    setEnvMissing(!isSupabaseConfigured())
  }, [])

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace('/perfil')
    }
  }, [isAuthenticated, loading, router])

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword

  const trimmedEmail = email.trim()
  const emailFormatValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail), [trimmedEmail])
  const showEmailHint = trimmedEmail.length === 0

  const disableSubmit =
    submitting ||
    name.trim().length === 0 ||
    trimmedEmail.length === 0 ||
    !emailFormatValid ||
    password.length < 8 ||
    course.trim().length === 0 ||
    mismatch

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setExistingAccount(false)

    if (mismatch) {
      setErrorMessage('As senhas precisam coincidir.')
      return
    }

    if (envMissing) {
      setErrorMessage('Conexão com o Supabase ainda não configurada neste ambiente.')
      return
    }

    setSubmitting(true)
    try {
      const client = getSupabaseClient()
      const { data, error } = await client.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: name.trim(),
            course: course.trim(),
            skills,
            interests,
          },
        },
      })

      if (error) {
        const normalized = (error.message ?? '').toLowerCase()
        const alreadyRegistered =
          normalized.includes('user already registered') ||
          normalized.includes('already registered') ||
          normalized.includes('already exists') ||
          normalized.includes('user_already_exists')

        if (alreadyRegistered) {
          setExistingAccount(true)
          setPassword('')
          setConfirmPassword('')
          return
        }

        setErrorMessage(translateAuthError(error.message))
        return
      }

      if (data.session) {
        router.push('/perfil')
        return
      }

      const identities = data.user?.identities
      if (Array.isArray(identities) && identities.length === 0) {
        setExistingAccount(true)
        setPassword('')
        setConfirmPassword('')
        return
      }

      router.push('/cadastro/confirmar-email')
    } catch (error) {
      const message = error instanceof Error ? error.message : null
      setErrorMessage(translateAuthError(message))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-gradient-to-b from-muted/50 via-background to-background py-20">
      <Container className="grid gap-10 md:grid-cols-[1.05fr_minmax(0,0.95fr)]">
        <div className="space-y-5 rounded-[2rem] border border-border bg-card/80 p-8 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-primary">Comece agora</p>
          <h1 className="text-4xl font-bold md:text-[2.7rem]">Crie seu perfil no Team Link</h1>
          <p className="text-base text-muted-foreground">
            Publique ideias, encontre colaboradores e participe de projetos acadêmicos em um só lugar.
          </p>
          <ul className="space-y-3 text-muted-foreground">
            <li>Com seu perfil, você poderá criar projetos, solicitar participação em equipes e acompanhar suas interações.</li>
            <li>Depois do cadastro, você poderá completar sua bio, habilidades e interesses quando quiser.</li>
          </ul>
        </div>

        <AuthCard
          eyebrow="Cadastro"
          title="Criar conta"
          description="Informe seus dados para começar a usar o Team Link."
          footer={<p className="text-xs text-muted-foreground">Você poderá enriquecer seu perfil em &quot;Editar perfil&quot; assim que entrar.</p>}
        >
          <form className="space-y-5 text-left" onSubmit={handleSubmit} noValidate>
            <div className="space-y-3">
              <Label htmlFor="nome">Nome completo</Label>
              <Input
                id="nome"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="rounded-2xl"
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="cadastro-email">E-mail</Label>
              <Input
                id="cadastro-email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  if (existingAccount) setExistingAccount(false)
                }}
                required
                aria-invalid={existingAccount || (!showEmailHint && !emailFormatValid)}
                aria-describedby="cadastro-email-hint"
                className={`rounded-2xl ${
                  existingAccount
                    ? 'border-amber-500/70'
                    : !showEmailHint && !emailFormatValid
                      ? 'border-destructive'
                      : ''
                }`}
              />
              <div id="cadastro-email-hint" aria-live="polite" className="space-y-1">
                {existingAccount ? (
                  <>
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      Este e-mail já possui uma conta. Faça login para continuar.
                    </p>
                    <div className="mt-1.5 flex justify-center">
                      <Link
                        href="/login"
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-blue-500/40 bg-transparent px-3 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card dark:text-blue-300 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
                      >
                        Ir para o login
                        <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </>
                ) : (
                  <p
                    className={`text-xs ${
                      showEmailHint
                        ? 'text-muted-foreground'
                        : emailFormatValid
                          ? 'text-emerald-600 dark:text-emerald-300'
                          : 'text-destructive'
                    }`}
                  >
                    {showEmailHint
                      ? 'Use um e-mail válido para criar sua conta.'
                      : emailFormatValid
                        ? 'Formato de e-mail válido.'
                        : 'Digite um e-mail válido.'}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <Label htmlFor="nova-senha">Senha</Label>
                <Input
                  id="nova-senha"
                  type="password"
                  value={password}
                  minLength={8}
                  required
                  onChange={(event) => setPassword(event.target.value)}
                  className="rounded-2xl"
                />
                <PasswordStrengthMeter password={password} className="pt-1" />
              </div>
              <div className="space-y-3">
                <Label htmlFor="confirme-senha">Confirmar senha</Label>
                <Input
                  id="confirme-senha"
                  type="password"
                  value={confirmPassword}
                  required
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className={`rounded-2xl ${mismatch ? 'border-destructive' : ''}`}
                />
                {mismatch ? <p className="text-xs text-destructive">As senhas precisam coincidir.</p> : null}
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="curso">Curso ou área principal</Label>
              <Input
                id="curso"
                value={course}
                required
                onChange={(event) => setCourse(event.target.value)}
                placeholder="Engenharia da Computação..."
                className="rounded-2xl"
              />
            </div>

            <ChipInput
              label="Habilidades"
              value={skills}
              onChange={setSkills}
              placeholder="Ex.: React, Figma, Arduino..."
              helperText="Adicione habilidades que você já possui ou quer usar em projetos. Pressione Enter para adicionar."
              inputId="skills-iniciais"
            />

            <ChipInput
              label="Áreas de interesse"
              value={interests}
              onChange={setInterests}
              placeholder="Ex.: sustentabilidade, educação, IA, robótica..."
              helperText="Adicione temas de projetos que você gostaria de encontrar. Pressione Enter para adicionar."
              inputId="interesses-iniciais"
            />

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
                Configure as variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local para habilitar o cadastro.
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={disableSubmit}
              className="w-full rounded-2xl py-5 text-base font-semibold"
            >
              {submitting ? 'Criando conta...' : 'Criar conta'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Já tem uma conta?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </AuthCard>
      </Container>
    </div>
  )
}
