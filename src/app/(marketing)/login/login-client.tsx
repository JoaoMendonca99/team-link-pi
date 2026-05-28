'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'

import { AuthCard } from '@/components/team-link/auth-card'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { translateAuthError } from '@/lib/supabase/auth-errors'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

function getSafeRedirectPath(path: string | null): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) {
    return '/perfil'
  }
  return path
}

export function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = getSafeRedirectPath(searchParams.get('next'))
  const { isAuthenticated, loading } = useSupabaseSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [envMissing, setEnvMissing] = useState(false)

  useEffect(() => {
    setEnvMissing(!isSupabaseConfigured())
  }, [])

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace(redirectTo)
    }
  }, [isAuthenticated, loading, redirectTo, router])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      setErrorMessage('Informe seu e-mail.')
      return
    }
    if (!password) {
      setErrorMessage('Informe sua senha.')
      return
    }

    if (envMissing) {
      setErrorMessage('Não foi possível conectar ao serviço de dados. Tente novamente em instantes.')
      return
    }

    setSubmitting(true)
    try {
      const client = getSupabaseClient()
      const { error } = await client.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      })

      if (error) {
        setErrorMessage(translateAuthError(error.message))
        return
      }

      router.push(redirectTo)
    } catch (error) {
      const message = error instanceof Error ? error.message : null
      setErrorMessage(translateAuthError(message))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-primary/25 via-background to-background py-12 sm:py-20 lg:py-24">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-20%] top-[-40%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,#4F46E5_0%,transparent_72%)] opacity-65 blur-3xl" />
        <div className="absolute bottom-[-35%] right-[-25%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,#14B8A6_0%,transparent_70%)] opacity-65 blur-3xl" />
      </div>

      <Container className="relative z-10 grid min-w-0 gap-8 md:grid-cols-2 md:gap-12">
        <div className="order-2 space-y-5 text-balance rounded-[2rem] border border-white/60 bg-background/85 p-5 shadow-xl backdrop-blur-xl sm:space-y-6 sm:p-8 dark:bg-card/85 md:order-1">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-primary">Acesso</p>
          <h1 className="text-3xl font-bold sm:text-4xl md:text-[2.85rem]">Entre na sua conta Team Link.</h1>
          <ul className="space-y-3 text-muted-foreground">
            <li>• Acompanhe e gerencie os projetos que você publicou.</li>
            <li>• Solicite participação em projetos compatíveis com suas habilidades.</li>
            <li>• Mantenha curtidas, comentários e participações organizados em um só lugar.</li>
          </ul>
          <div className="rounded-3xl bg-muted/40 px-6 py-4 text-sm text-muted-foreground">
            Sua sessão fica ativa neste navegador até você sair da conta.
          </div>
          <Link href="/explorar" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
            Explorar projetos sem entrar
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="order-1 min-w-0 md:order-2">
        <AuthCard
          className="max-w-none md:max-w-md"
          eyebrow="Entrar"
          title="Faça login"
          description="Use o e-mail e a senha cadastrados no Team Link."
          footer={<p className="text-xs text-muted-foreground">Esqueceu a senha? Em breve você poderá recuperar o acesso por e-mail.</p>}
        >
          <form className="space-y-5 text-left" onSubmit={handleSubmit} noValidate>
            <div className="space-y-3">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu.email@exemplo.com"
                className="rounded-2xl"
                required
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="rounded-2xl"
                required
              />
            </div>

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

            <Button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl py-5 text-base font-semibold"
            >
              {submitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Ainda não tem conta?{' '}
            <Link href="/cadastro" className="font-semibold text-primary hover:underline">
              Cadastre-se
            </Link>
          </div>
        </AuthCard>
        </div>
      </Container>
    </div>
  )
}
