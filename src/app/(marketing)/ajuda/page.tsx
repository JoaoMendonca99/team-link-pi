import type { Metadata } from 'next'

import { AjudaContent } from './ajuda-content'

export const metadata: Metadata = {
  title: 'Ajuda',
  description:
    'Passos para publicar ideias, filtrar projetos e navegar pela experiência atual da Team Link nesta exportação.',
}

export default function AjudaPage() {
  return <AjudaContent />
}
