import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { GithubSetupClient } from './github-setup-client'

function SetupLoading() {
  return (
    <main className="bg-background">
      <Container className="flex min-h-[50vh] flex-col items-center justify-center gap-3 py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm font-medium text-muted-foreground">Carregando…</p>
      </Container>
    </main>
  )
}

export default function GithubSetupPage() {
  return (
    <Suspense fallback={<SetupLoading />}>
      <GithubSetupClient />
    </Suspense>
  )
}
