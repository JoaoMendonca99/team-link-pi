import type { Metadata } from 'next'

import { ContatoContent } from './contato-content'

export const metadata: Metadata = {
  title: 'Contato',
  description:
    'Canal institucional até definição de e-mail público oficial para contato pelo projeto Team Link acadêmico.',
}

export default function ContatoPage() {
  return <ContatoContent />
}
