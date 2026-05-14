import type { Metadata } from 'next'

import { MessagesClient } from './messages-client'

export const metadata: Metadata = {
  title: 'Mensagens',
  description: 'Converse com a equipe dos seus projetos.',
}

export default function MensagensPage() {
  return <MessagesClient />
}
