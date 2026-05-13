import Link from 'next/link'

import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'

export default function MarketingNotFound() {
  return (
    <main className="flex min-h-[72vh] flex-col items-center justify-center bg-muted/35 py-16 text-center">
      <Container className="flex flex-col items-center justify-center gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-primary">Página não encontrada</p>
          <h1 className="mt-4 text-4xl font-bold">Não encontramos esta página</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            O endereço acessado não existe ou foi removido. Use os links abaixo para continuar navegando.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <Button asChild className="rounded-2xl font-semibold">
            <Link href="/">Voltar ao início</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl font-semibold">
            <Link href="/explorar">Ir para explorar</Link>
          </Button>
        </div>
      </Container>
    </main>
  )
}
