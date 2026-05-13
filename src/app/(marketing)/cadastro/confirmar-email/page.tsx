import type { Metadata } from 'next'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'

import { AuthCard } from '@/components/team-link/auth-card'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Confirme seu e-mail | Team Link',
  description:
    'Verifique sua caixa de entrada e clique no link de confirmação para ativar sua conta no Team Link.',
}

export default function ConfirmarEmailPage() {
  return (
    <div className="bg-gradient-to-b from-muted/50 via-background to-background py-20">
      <Container className="flex justify-center">
        <AuthCard
          eyebrow="Confirmação"
          title="Confirme seu e-mail"
          description="Enviamos um link de confirmação para o e-mail informado."
        >
          <div className="space-y-6 text-left">
            <div className="flex justify-center">
              <span
                aria-hidden="true"
                className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <MailCheck className="h-7 w-7" />
              </span>
            </div>

            <p className="text-sm text-muted-foreground">
              Abra sua caixa de entrada e clique no link enviado para ativar sua conta. Depois disso, você poderá entrar no Team Link.
            </p>

            <p className="text-xs text-muted-foreground">
              Se não encontrar a mensagem, verifique a pasta de spam ou lixo eletrônico.
            </p>

            <div className="space-y-3">
              <Button asChild className="w-full rounded-2xl py-5 text-base font-semibold">
                <Link href="/login">Ir para login</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="w-full rounded-2xl text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <Link href="/cadastro">Voltar para cadastro</Link>
              </Button>
            </div>
          </div>
        </AuthCard>
      </Container>
    </div>
  )
}
