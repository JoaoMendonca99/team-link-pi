import type { Metadata } from 'next'

import { ContatoContent } from './contato-content'

export const metadata: Metadata = {
  title: 'Contato',
  description:
    'Fale com a equipe do Team Link: tire dúvidas, envie sugestões ou proponha parcerias.',
}

export default function ContatoPage() {
  return <ContatoContent />
}
