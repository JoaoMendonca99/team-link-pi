import Link from 'next/link'
import type {ReactNode} from 'react'
import {activityUuid} from '@/lib/activity-details'
export function ActivityProfileLink({id,name,children,className=''}:{id?:string|null;name:string;children:ReactNode;className?:string}){
 if(!activityUuid(id??null))return <span className={className}>{children}</span>
 return <Link href={'/usuarios/'+encodeURIComponent(id!)} target="_blank" rel="noopener noreferrer" aria-label={'Abrir perfil de '+name+' em nova aba'} onClick={e=>e.stopPropagation()} className={'inline-flex min-h-8 items-center rounded-md transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring '+className}>{children}</Link>
}
