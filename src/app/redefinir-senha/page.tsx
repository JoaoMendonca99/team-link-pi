'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { AuthCard } from '@/components/team-link/auth-card'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { passwordAuthError } from '@/lib/supabase/auth-errors'
import { createSupabaseRecoveryClient } from '@/lib/supabase/client'

type RecoveryStatus = 'loading' | 'ready' | 'invalid' | 'done'
const RESET_ERROR = 'Não foi possível redefinir a senha. Tente outra senha ou solicite um novo link.'

export default function ResetPasswordPage() {
  const clientRef = useRef<ReturnType<typeof createSupabaseRecoveryClient> | null>(null)
  const [status, setStatus] = useState<RecoveryStatus>('loading')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadRecoverySession() {
      try {
        const client = clientRef.current ?? createSupabaseRecoveryClient()
        clientRef.current = client
        const { data, error } = await client.auth.getSession()
        if (active) setStatus(!error && data.session ? 'ready' : 'invalid')
      } catch {
        if (active) setStatus('invalid')
      }
    }

    void loadRecoverySession()
    return () => { active = false }
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const client = clientRef.current
    if (status !== 'ready' || submitting || !client) return

    if (password.length < 8) {
      setErrorMessage('A senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirmation) {
      setErrorMessage('As senhas precisam coincidir.')
      return
    }

    setErrorMessage(null)
    setSubmitting(true)
    try {
      const { error } = await client.auth.updateUser({ password })
      if (error) {
        setErrorMessage(passwordAuthError(error, RESET_ERROR))
        return
      }

      setPassword('')
      setConfirmation('')
      clientRef.current = null
      setStatus('done')
    } catch {
      setErrorMessage(RESET_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-background py-20">
      <Container>
        <AuthCard eyebrow="Recuperação de acesso" title="Redefina sua senha">
          {status === 'loading' ? <p role="status">Verificando o link...</p> : null}
          {status === 'invalid' ? (
            <p role="alert" className="text-sm text-muted-foreground">
              O link é inválido ou expirou. Volte ao login para solicitar outro.
            </p>
          ) : null}
          {status === 'done' ? (
            <p role="status" className="text-sm text-muted-foreground">Senha atualizada.</p>
          ) : null}
          {status === 'ready' ? (
            <form className="space-y-5 text-left" onSubmit={handleSubmit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="nova-senha">Nova senha</Label>
                <Input
                  id="nova-senha"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="rounded-2xl"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirme-senha">Confirme a nova senha</Label>
                <Input
                  id="confirme-senha"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="rounded-2xl"
                  required
                />
              </div>
              {errorMessage ? (
                <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {errorMessage}
                </p>
              ) : null}
              <Button type="submit" disabled={submitting} className="w-full rounded-2xl py-5">
                {submitting ? 'Salvando...' : 'Salvar nova senha'}
              </Button>
            </form>
          ) : null}
          <Link href="/login" className="mt-5 inline-block text-sm font-semibold text-primary hover:underline">
            Voltar ao login
          </Link>
        </AuthCard>
      </Container>
    </main>
  )
}
