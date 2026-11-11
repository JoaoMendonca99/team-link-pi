import { redirect } from 'next/navigation'
import { ProfileContent } from '../../perfil/profile-content'

export default async function Page({ searchParams }: {
  searchParams: Promise<{ aba?: string; secao?: string; candidatura?: string }>
}) {
  const { aba, secao, candidatura } = await searchParams
  if (aba === 'amigos') {
    redirect(secao === 'recebidas' ? '/meu-espaco/amigos?secao=recebidas' : '/meu-espaco/amigos')
  }
  if (aba === 'candidaturas') {
    const query = typeof candidatura === 'string' && candidatura
      ? '?' + new URLSearchParams({ candidatura })
      : ''
    redirect('/meu-espaco/candidaturas' + query)
  }
  return <ProfileContent embedded />
}
