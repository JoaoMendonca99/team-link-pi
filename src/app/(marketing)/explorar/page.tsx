import { Suspense } from 'react'

import { Container } from '@/components/layout/container'
import { ExploreCatalog } from './explore-catalog'

function ExploreFallback() {
  return (
    <Container className="py-16">
      <div className="h-10 w-64 animate-pulse rounded-full bg-muted" />
      <div className="mt-6 h-24 animate-pulse rounded-[1.75rem] bg-muted" />
      <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={String(index)} className="h-80 animate-pulse rounded-[1.75rem] bg-muted" />
        ))}
      </div>
    </Container>
  )
}

export default function ExplorarPage() {
  return (
    <Suspense fallback={<ExploreFallback />}>
      <ExploreCatalog />
    </Suspense>
  )
}
