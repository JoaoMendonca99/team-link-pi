'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { PageHeader } from '@/components/team-link/page-header'
import { ProjectForm } from '@/components/team-link/project-form'
import { Button } from '@/components/ui/button'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { isSupabaseConfigured } from '@/lib/supabase/client'

export default function NovaIdeiaPage() {
  const { loading, isAuthenticated, profile } = useSupabaseSession()

  return (
    <main className="bg-background pb-20">
      <div className="border-b border-border bg-gradient-to-br from-muted/60 via-background to-background">
        <Container className="space-y-6 py-12">
          <Button asChild variant="ghost" className="gap-2">
            <Link href="/explorar"><ArrowLeft aria-hidden className="size-4" /> Explorar</Link>
          </Button>
          <PageHeader title="Criar projeto" description="Apresente sua ideia e publique as vagas da sua equipe." />
        </Container>
      </div>
      <Container className="py-8 sm:py-12">
        {loading ? <p role="status">Carregando…</p>
          : !isSupabaseConfigured() ? <p role="alert">Não foi possível conectar ao serviço de dados.</p>
          : isAuthenticated ? <ProjectForm previewOwner={profile?.full_name ?? undefined} />
          : (
            <div className="space-y-4">
              <p>Entre na sua conta para criar um projeto.</p>
              <div className="flex flex-wrap gap-3">
                <Button asChild><Link href="/login">Entrar</Link></Button>
                <Button asChild variant="outline"><Link href="/cadastro">Criar conta</Link></Button>
              </div>
            </div>
          )}
      </Container>
    </main>
  )
}
