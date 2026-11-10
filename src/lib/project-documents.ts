import {getSupabaseClient} from '@/lib/supabase/client'
export type Evidence={id:string;filename:string;mime:string;size:number}
export type ReferenceDocument={id:string;name:string;description:string;document_type:string;institution:string;version:string;status:'pending'|'published'|'rejected';builtin:boolean;filename:string|null;size:number|null;created_at:string;uploader_id:string|null;review_note:string}
export async function documentAction<T>(body:FormData|Record<string,unknown>):Promise<T>{
 const {data,error}=await getSupabaseClient().functions.invoke('project-documents',{body})
 if(error||data?.error){let message=data?.error;try{if(error?.context instanceof Response)message=(await error.context.json()).error}catch{}throw Error(message||'Não foi possível acessar o arquivo. Tente novamente.')}
 return data as T
}
export async function readDocument(scope:'activity'|'reference',id:string){
 const {url}=await documentAction<{url:string}>({action:'download',scope,id})
 const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'})
 if(!response.ok)throw Error('Não foi possível baixar o arquivo. Tente novamente.')
 return response.blob()
}
export function saveBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30_000)}
