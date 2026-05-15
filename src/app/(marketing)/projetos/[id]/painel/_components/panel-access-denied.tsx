import Link from 'next/link'
import { Lock } from 'lucide-react'

import { EmptyState } from '@/components/team-link/empty-state'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/layout/container'

interface PanelAccessDeniedProps {
  slug: string
  isAuthenticated: boolean
}

export function PanelAccessDenied({ slug, isAuthenticated }: PanelAccessDeniedProps) {
  return (
    <main className="bg-background pb-20">
      <Container className="py-16">
        <EmptyState
          icon={Lock}
          title="Acesso restrito"
          description="Esta área é exclusiva para membros aprovados do projeto."
          className="mx-auto max-w-lg"
        />
        <div className="mx-auto mt-6 flex max-w-lg flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="outline" className="rounded-2xl font-semibold">
            <Link href={`/projetos/${slug}`}>Ver página pública</Link>
          </Button>
          {!isAuthenticated ? (
            <Button asChild className="rounded-2xl font-semibold">
              <Link href="/login">Entrar</Link>
            </Button>
          ) : null}
        </div>
      </Container>
    </main>
  )
}
