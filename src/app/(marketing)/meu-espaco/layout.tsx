import type { Metadata } from 'next'
import { Suspense, type ReactNode } from 'react'
import { WorkspaceShell } from './workspace-shell'

export const metadata:Metadata={title:'Meu Espaço',robots:{index:false,follow:false}}

export default function MySpaceLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p role="status" className="p-8">Carregando Meu Espaço…</p>}><WorkspaceShell>{children}</WorkspaceShell></Suspense>
}
