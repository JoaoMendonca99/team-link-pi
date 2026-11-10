import type { Metadata } from 'next'
import type {ReactNode} from 'react'


export const metadata:Metadata={title:'Meu Espaço',robots:{index:false,follow:false}}

export default function MySpaceLayout({ children }: { children: ReactNode }) {
  return children
}
