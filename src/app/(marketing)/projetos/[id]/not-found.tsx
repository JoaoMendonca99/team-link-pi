import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'

export default function ProjectNotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center bg-muted/40 py-16 text-center">
      <Container className="flex flex-col items-center justify-center gap-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">404</p>
          <h1 className="mt-3 text-balance text-4xl font-bold">Projeto não encontrado</h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Não há publicação disponível neste caminho ou o recurso não foi pré-exportado nesta build.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <Button asChild className="rounded-2xl font-semibold">
            <Link href="/explorar">Ir para explorar</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl font-semibold">
            <Link href="/" className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao início
            </Link>
          </Button>
        </div>
      </Container>
    </main>
  )
}
