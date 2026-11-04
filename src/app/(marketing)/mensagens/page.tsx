import type { Metadata } from 'next'
import { Suspense } from 'react'

import { MessagesHub } from './messages-hub'

export const metadata: Metadata = {
  title: 'Mensagens',
  description: 'Converse com amigos e com a equipe dos seus projetos.',
}

export default function MensagensPage() {
  return <Suspense fallback={<p role="status" className="p-5">Carregando mensagens…</p>}><MessagesHub /></Suspense>
}
