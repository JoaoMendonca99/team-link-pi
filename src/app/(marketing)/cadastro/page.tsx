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
import { cn } from '@/lib/utils'

type SignupStep = 1 | 2

type FieldErrors = {
  name?: string
  email?: string
  password?: string
  confirmPassword?: string
  course?: string
}

const EMAIL_ALREADY_REGISTERED =
  'Este e-mail já está cadastrado. Entre na sua conta ou use outro e-mail.'

function isAlreadyRegisteredAuthMessage(message: string | undefined): boolean {
  const normalized = (message ?? '').toLowerCase()
  return (
    normalized.includes('user already registered') ||
    normalized.includes('already registered') ||
    normalized.includes('already exists') ||
    normalized.includes('user_already_exists')
  )
}

function isDuplicateSignupResponse(identities: unknown): boolean {
  return Array.isArray(identities) && identities.length === 0
}

type OrientationMiniCardProps = {
  title: string
  description: string
  active?: boolean
}

function OrientationMiniCard({ title, description, active = false }: OrientationMiniCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3.5',
        active
          ? 'border-primary/45 bg-primary/10 shadow-sm'
          : 'border-card-outline/70 bg-muted/15',
      )}
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

function SignupStepProgress({ step }: { step: SignupStep }) {
  const percent = step === 1 ? 50 : 100

  return (
    <div className="space-y-2" aria-label={`Progresso: etapa ${step} de 2`}>
      <div className="flex items-center justify-between gap-3 text-xs font-medium">
        <span className="text-muted-foreground">Progresso do cadastro</span>
        <span className="shrink-0 text-primary">{step} de 2</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted/80">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}

function SignupOrientationPanel({ step }: { step: SignupStep }) {
  if (step === 1) {
    return (
      <aside
        className="flex flex-col gap-6 rounded-[1.75rem] border border-card-outline bg-card/80 p-6 shadow-xl sm:p-7 md:h-full"
        aria-label="Orientação do cadastro"
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
              Etapa 1 de 2
            </p>
            <h1 className="text-balance text-2xl font-bold leading-tight sm:text-[1.65rem] lg:text-3xl">
              Crie sua conta no Team Link
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Primeiro criamos seu acesso. Depois você pode completar seu perfil acadêmico com
              curso, habilidades e áreas de interesse.
            </p>
          </div>

          <SignupStepProgress step={1} />

          <div className="space-y-3">
            <OrientationMiniCard
              title="Acesso"
              description="Nome, e-mail e senha."
              active
            />
            <OrientationMiniCard
              title="Perfil"
              description="Curso, habilidades e interesses depois."
            />
            <OrientationMiniCard
              title="Projetos"
              description="Publique ideias ou participe de equipes."
            />
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="flex flex-col gap-6 rounded-[1.75rem] border border-card-outline bg-card/80 p-6 shadow-xl sm:p-7 md:h-full"
      aria-label="Orientação do cadastro"
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            Etapa 2 de 2
          </p>
          <h1 className="text-balance text-2xl font-bold leading-tight sm:text-[1.65rem] lg:text-3xl">
            Complete seu perfil acadêmico
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Agora informe seu curso e, se quiser, adicione habilidades e áreas de interesse.
          </p>
        </div>

        <SignupStepProgress step={2} />

        <div className="space-y-3">
          <OrientationMiniCard
            title="Acesso"
            description="Nome, e-mail e senha."
          />
          <OrientationMiniCard
            title="Perfil"
            description="Curso, habilidades e interesses."
            active
          />
          <OrientationMiniCard
            title="Projetos"
            description="Publique ideias ou participe de equipes."
          />
        </div>
      </div>

    </aside>
  )
}

export default function CadastroPage() {
  const router = useRouter()
  const { isAuthenticated, loading } = useSupabaseSession()

  const [step, setStep] = useState<SignupStep>(1)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [course, setCourse] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [interests, setInterests] = useState<string[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [step1Submitting, setStep1Submitting] = useState(false)
  const [step1AuthDone, setStep1AuthDone] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [envMissing, setEnvMissing] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [step1Touched, setStep1Touched] = useState(false)

  useEffect(() => {
    setEnvMissing(!isSupabaseConfigured())
  }, [])

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace('/perfil')
    }
  }, [isAuthenticated, loading, router])

  const trimmedEmail = email.trim()
  const emailFormatValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail),
    [trimmedEmail],
  )
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword

  function validateStep1(): boolean {
    const errors: FieldErrors = {}

    if (name.trim().length === 0) {
      errors.name = 'Informe seu nome completo.'
    }
    if (trimmedEmail.length === 0) {
      errors.email = 'Informe seu e-mail.'
    } else if (!emailFormatValid) {
      errors.email = 'Digite um e-mail válido.'
    }
    if (password.length < 8) {
      errors.password = 'A senha deve ter pelo menos 8 caracteres.'
    }
    if (confirmPassword.length === 0) {
      errors.confirmPassword = 'Confirme sua senha.'
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'As senhas precisam coincidir.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  function validateStep2(): boolean {
    if (course.trim().length > 0) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next.course
        return next
      })
      return true
    }

    setFieldErrors((prev) => ({
      ...prev,
      course: 'Informe seu curso ou área principal.',
    }))
    return false
  }

  const markEmailAlreadyRegistered = () => {
    setFieldErrors((prev) => ({ ...prev, email: EMAIL_ALREADY_REGISTERED }))
    setStep1Touched(true)
  }

  const handleContinue = async () => {
    if (step1Submitting) return

    setErrorMessage(null)
    setStep1Touched(true)

    if (!validateStep1()) return

    if (envMissing) {
      setErrorMessage('Não foi possível conectar ao serviço de dados. Tente novamente em instantes.')
      return
    }

    setStep1Submitting(true)
    try {
      const client = getSupabaseClient()
      const normalizedEmail = trimmedEmail.toLowerCase()

      const { data: existingProfile } = await client
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (existingProfile?.id) {
        markEmailAlreadyRegistered()
        return
      }

      const { data, error } = await client.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: name.trim(),
            course: '',
            skills: [],
            interests: [],
          },
        },
      })

      if (error) {
        if (isAlreadyRegisteredAuthMessage(error.message)) {
          markEmailAlreadyRegistered()
          return
        }
        setErrorMessage(translateAuthError(error.message))
        return
      }

      if (isDuplicateSignupResponse(data.user?.identities)) {
        markEmailAlreadyRegistered()
        return
      }

      setStep1AuthDone(true)
      setStep(2)
    } catch (error) {
      const message = error instanceof Error ? error.message : null
      setErrorMessage(translateAuthError(message))
    } finally {
      setStep1Submitting(false)
    }
  }

  const handleBack = () => {
    setErrorMessage(null)
    setStep1AuthDone(false)
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next.course
      return next
    })
    setStep(1)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    setErrorMessage(null)

    if (!validateStep2()) return

    if (envMissing) {
      setErrorMessage('Não foi possível conectar ao serviço de dados. Tente novamente em instantes.')
      return
    }

    const normalizedEmail = trimmedEmail.toLowerCase()
    const profilePayload = {
      full_name: name.trim(),
      course: course.trim(),
      skills,
      interests,
    }

    setSubmitting(true)
    try {
      const client = getSupabaseClient()

      if (step1AuthDone) {
        const {
          data: { session },
        } = await client.auth.getSession()

        if (session) {
          const { error: authError } = await client.auth.updateUser({
            data: profilePayload,
          })
          if (authError) {
            setErrorMessage(translateAuthError(authError.message))
            return
          }

          const { error: profileError } = await client
            .from('profiles')
            .update(profilePayload)
            .eq('id', session.user.id)

          if (profileError) {
            setErrorMessage(translateAuthError(profileError.message))
            return
          }

          router.push('/perfil')
          return
        }
      }

      const { data, error } = await client.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: profilePayload },
      })

      if (error) {
        if (isAlreadyRegisteredAuthMessage(error.message)) {
          markEmailAlreadyRegistered()
          setPassword('')
          setConfirmPassword('')
          setStep1AuthDone(false)
          setStep(1)
          return
        }

        setErrorMessage(translateAuthError(error.message))
        return
      }

      if (data.session) {
        router.push('/perfil')
        return
      }

      if (!step1AuthDone && isDuplicateSignupResponse(data.user?.identities)) {
        markEmailAlreadyRegistered()
        setPassword('')
        setConfirmPassword('')
        setStep1AuthDone(false)
        setStep(1)
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

  const emailAlreadyRegistered =
    fieldErrors.email === EMAIL_ALREADY_REGISTERED
  const showNameError = step1Touched && Boolean(fieldErrors.name)
  const showEmailError = step1Touched && Boolean(fieldErrors.email)
  const showPasswordError = step1Touched && Boolean(fieldErrors.password)
  const showConfirmError = step1Touched && Boolean(fieldErrors.confirmPassword)

  return (
    <div className="bg-gradient-to-b from-muted/50 via-background to-background py-12 sm:py-14">
      <Container className="grid items-stretch gap-6 md:grid-cols-2 md:gap-8 lg:gap-10">
        <SignupOrientationPanel step={step} />

        <div className="flex min-h-0 w-full min-w-0 flex-col">
        <AuthCard
          eyebrow={step === 1 ? 'Cadastro' : 'Perfil'}
          title={step === 1 ? 'Criar conta' : 'Completar perfil'}
          description={
            step === 1
              ? 'Nome, e-mail e senha para começar.'
              : 'Curso obrigatório. Habilidades e interesses são opcionais.'
          }
          className="h-full w-full max-w-none p-6 sm:p-7 [&>div:first-child]:mb-5"
        >
          {step === 1 ? (
            <form
              className="space-y-4 text-left"
              onSubmit={(event) => {
                event.preventDefault()
                handleContinue()
              }}
              noValidate
            >
              <div className="space-y-2">
                <Label htmlFor="nome">Nome completo</Label>
                <Input
                  id="nome"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    if (fieldErrors.name) {
                      setFieldErrors((prev) => {
                        const next = { ...prev }
                        delete next.name
                        return next
                      })
                    }
                  }}
                  aria-invalid={showNameError}
                  className={cn('rounded-2xl', showNameError && 'border-destructive')}
                />
                {showNameError ? (
                  <p className="text-xs text-destructive">{fieldErrors.name}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cadastro-email">E-mail</Label>
                <Input
                  id="cadastro-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setStep1AuthDone(false)
                    if (fieldErrors.email) {
                      setFieldErrors((prev) => {
                        const next = { ...prev }
                        delete next.email
                        return next
                      })
                    }
                  }}
                  aria-invalid={showEmailError}
                  aria-describedby="cadastro-email-hint"
                  className={cn('rounded-2xl', showEmailError && 'border-destructive')}
                />
                <div id="cadastro-email-hint" aria-live="polite" className="space-y-1">
                  {emailAlreadyRegistered ? (
                    <>
                      <p className="text-xs font-medium text-destructive">
                        {EMAIL_ALREADY_REGISTERED}
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
                  ) : showEmailError ? (
                    <p className="text-xs text-destructive">{fieldErrors.email}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Use um e-mail válido para criar sua conta.</p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nova-senha">Senha</Label>
                  <Input
                    id="nova-senha"
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setStep1AuthDone(false)
                      if (fieldErrors.password) {
                        setFieldErrors((prev) => {
                          const next = { ...prev }
                          delete next.password
                          return next
                        })
                      }
                    }}
                    aria-invalid={showPasswordError}
                    className={cn('rounded-2xl', showPasswordError && 'border-destructive')}
                  />
                  {showPasswordError ? (
                    <p className="text-xs text-destructive">{fieldErrors.password}</p>
                  ) : (
                    <PasswordStrengthMeter password={password} className="pt-0.5" />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirme-senha">Confirmar senha</Label>
                  <Input
                    id="confirme-senha"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value)
                      if (fieldErrors.confirmPassword) {
                        setFieldErrors((prev) => {
                          const next = { ...prev }
                          delete next.confirmPassword
                          return next
                        })
                      }
                    }}
                    aria-invalid={showConfirmError || mismatch}
                    className={cn(
                      'rounded-2xl',
                      (showConfirmError || mismatch) && 'border-destructive',
                    )}
                  />
                  {showConfirmError ? (
                    <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
                  ) : mismatch ? (
                    <p className="text-xs text-destructive">As senhas precisam coincidir.</p>
                  ) : null}
                </div>
              </div>

              {envMissing ? (
                <div
                  role="status"
                  className="rounded-2xl border border-amber-400/40 bg-amber-100/60 px-4 py-3 text-sm font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
                >
                  Não foi possível conectar ao serviço de dados. Tente novamente em instantes.
                </div>
              ) : null}

              {errorMessage ? (
                <div
                  role="alert"
                  className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
                >
                  {errorMessage}
                </div>
              ) : null}

              <Button
                type="submit"
                disabled={step1Submitting}
                className="w-full rounded-2xl py-4 text-base font-semibold"
              >
                {step1Submitting ? 'Criando conta...' : 'Criar conta'}
              </Button>
            </form>
          ) : (
            <form className="space-y-4 text-left" onSubmit={handleSubmit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="curso">Curso ou área principal</Label>
                <Input
                  id="curso"
                  value={course}
                  onChange={(event) => {
                    setCourse(event.target.value)
                    if (fieldErrors.course) {
                      setFieldErrors((prev) => {
                        const next = { ...prev }
                        delete next.course
                        return next
                      })
                    }
                  }}
                  placeholder="Ex.: Engenharia, Design, Administração..."
                  aria-invalid={Boolean(fieldErrors.course)}
                  className={cn('rounded-2xl', fieldErrors.course && 'border-destructive')}
                />
                {fieldErrors.course ? (
                  <p className="text-xs text-destructive">{fieldErrors.course}</p>
                ) : null}
              </div>

              <ChipInput
                label="Habilidades"
                optional
                value={skills}
                onChange={setSkills}
                placeholder="Ex.: React, Figma, Arduino..."
                inputId="skills-iniciais"
              />

              <ChipInput
                label="Áreas de interesse"
                optional
                value={interests}
                onChange={setInterests}
                placeholder="Ex.: sustentabilidade, educação, IA..."
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
                  Não foi possível conectar ao serviço de dados. Tente novamente em instantes.
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={submitting}
                  className="w-full rounded-2xl py-4 font-semibold sm:flex-1"
                >
                  Voltar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-2xl py-4 text-base font-semibold sm:flex-[1.4]"
                >
                  {submitting ? 'Finalizando...' : 'Finalizar cadastro'}
                </Button>
              </div>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Já tem uma conta?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </AuthCard>
        </div>
      </Container>
    </div>
  )
}
