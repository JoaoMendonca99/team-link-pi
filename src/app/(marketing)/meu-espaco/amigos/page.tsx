'use client'
import {useRouter,useSearchParams} from 'next/navigation'
import {Recommendations} from '@/components/recommendations/recommendations'
import {FriendsPanel} from '@/components/profile/friendships'
export default function Page(){const params=useSearchParams(),router=useRouter(),section=params.get('secao');return <div className="space-y-5"><h1 className="text-2xl font-bold">Amigos</h1><FriendsPanel initialSection={section==='received'||section==='recebidas'?'received':section==='sent'?'sent':'accepted'} messagesPath="/meu-espaco/mensagens" onSectionChange={value=>router.replace('/meu-espaco/amigos?secao='+value,{scroll:false})}/><Recommendations kind="friends"/></div>}
