'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { MyApplications } from '@/components/team-link/recruitment'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

export default function Page() {
  const {user} = useSupabaseSession(),params = useSearchParams(),router = useRouter()
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Minhas candidaturas</h1><p className="text-sm text-muted-foreground">Acompanhe suas vagas, decisões e conversas com as equipes.</p>{user&&<MyApplications key={user.id} userId={user.id} workspace initialRequestId={params.get('candidatura')} initialStatus={params.get('status')} onSelect={id=>{const next=new URLSearchParams(params.toString());if(id)next.set('candidatura',id);else next.delete('candidatura');router.replace('/meu-espaco/candidaturas'+(next.size?'?'+next:'') ,{scroll:false})}}/>}</div>
}
