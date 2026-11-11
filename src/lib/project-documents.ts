import {getSupabaseClient} from '@/lib/supabase/client'

export type Evidence={id:string;filename:string;mime:string;size:number}
export type ReferenceDocument={id:string;name:string;description:string;document_type:string;institution:string;version:string;status:'pending'|'published'|'rejected';builtin:boolean;filename:string|null;size:number|null;created_at:string;uploader_id:string|null;review_note:string}

export interface ProjectFile {
  id: string
  project_id: string
  name: string
  filename: string
  mime: string
  size: number
  sha256: string
  uploader_id: string | null
  selected_for_package: boolean
  created_at: string
  updated_at: string
  uploader?: {
    id: string
    full_name: string | null
    avatar_url: string | null
  } | null
}

export async function documentAction<T>(body:FormData|Record<string,unknown>):Promise<T>{
 const {data,error}=await getSupabaseClient().functions.invoke('project-documents',{body})
 if(error||data?.error){let message=data?.error;try{if(error?.context instanceof Response)message=(await error.context.json()).error}catch{}throw Error(message||'Não foi possível acessar o arquivo. Tente novamente.')}
 return data as T
}

export async function readDocument(scope:'activity'|'reference'|'project',id:string){
 const {url}=await documentAction<{url:string}>({action:'download',scope,id})
 const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'})
 if(!response.ok)throw Error('Não foi possível baixar o arquivo. Tente novamente.')
 return response.blob()
}

export async function loadProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const result = await getSupabaseClient()
    .from('project_files')
    .select('id, project_id, name, filename, mime, size, sha256, uploader_id, selected_for_package, created_at, updated_at, uploader:profiles!uploader_id(id, full_name, avatar_url)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (result.error) throw Error('Não foi possível carregar os arquivos do projeto.')
  return (result.data as unknown as ProjectFile[]) ?? []
}

export async function uploadProjectFile(
  projectId: string,
  file: File,
  name?: string,
  replaceId?: string
): Promise<ProjectFile> {
  const form = new FormData()
  form.set('scope', 'project')
  form.set('project_id', projectId)
  if (name?.trim()) form.set('name', name.trim())
  if (replaceId) form.set('replace_id', replaceId)
  form.append('files', file)

  const result = await documentAction<{ ok: boolean; file: ProjectFile }>(form)
  if (!result?.file) throw Error('Arquivo não retornado após envio.')
  return result.file
}

export async function deleteProjectFile(fileId: string): Promise<void> {
  await documentAction<{ ok: boolean }>({
    action: 'delete',
    scope: 'project',
    id: fileId,
  })
}

export async function setProjectFileSelected(fileId: string, selected: boolean): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_project_file_selected', {
    p_file_id: fileId,
    p_selected: selected,
  })
  if (error) throw Error(error.message || 'Não foi possível atualizar a seleção do documento.')
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function saveBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30_000)}
