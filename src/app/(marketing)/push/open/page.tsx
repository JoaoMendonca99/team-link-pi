'use client'
import { Suspense,useEffect } from 'react'
import { useRouter,useSearchParams } from 'next/navigation'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
function OpenPush(){const query=useSearchParams();const router=useRouter();const {user,loading}=useSupabaseSession();const raw=query.get('next')??'/perfil';const next=/^\/(mensagens|projetos|usuarios|perfil)(\/|\?|$)/.test(raw)&&!/[\\\x00-\x1f]/.test(raw)?raw:'/perfil';useEffect(()=>{if(!loading)router.replace(user?next:'/login?next='+encodeURIComponent(next))},[loading,user,next,router]);return <p role="status" className="p-6">Abrindo notificação…</p>}
export default function PushOpenPage(){return <Suspense fallback={null}><OpenPush/></Suspense>}
