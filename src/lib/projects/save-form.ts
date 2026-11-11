import { getSupabaseClient } from '@/lib/supabase/client'
import type { projectFormPayload } from './form'
import type { ProjectImageDraft } from '@/components/team-link/project-logo'

type SaveError = { code?: string; message?: string }
type SaveResult = { data: string | null; error: SaveError | null }

export function projectSaveError(error?: SaveError | null) {
  if (error?.message === 'Quantidade abaixo das posições ocupadas') {
    return 'A quantidade de posições precisa comportar os integrantes que já ocupam a vaga.'
  }
  switch (error?.code) {
    case '23505': return 'Esse endereço já está em uso. Escolha outro para criar o projeto.'
    case 'AUTH': case '42501': return 'Você não tem permissão para salvar este projeto. Suas alterações foram preservadas.'
    case '22023': case '23514': case '22007': case '22008': return 'Confira os campos, as datas e as vagas do projeto. Suas alterações foram preservadas.'
    case '40001': return 'O projeto foi atualizado em outra sessão. Confira a versão atual antes de tentar novamente.'
    case 'VACANCY_CAPACITY': return 'A quantidade de posições precisa comportar os integrantes que já ocupam a vaga.'
    case 'NETWORK': return 'Não foi possível conectar. Suas alterações foram preservadas. Tente novamente.'
    case 'IMAGE_INVALID': return 'Não foi possível validar a imagem. Escolha outro arquivo. Suas alterações foram preservadas.'
    case 'IMAGE_SAVE': return 'Não foi possível salvar a imagem. Suas alterações foram preservadas. Tente novamente.'
    default: return 'Não foi possível salvar o projeto. Suas alterações foram preservadas. Tente novamente.'
  }
}

export async function saveProjectForm(p_form: ReturnType<typeof projectFormPayload>, p_academic: unknown = null,
  image?: ProjectImageDraft, expected?: string | null): Promise<SaveResult> {
  const client = getSupabaseClient()
  if (image) {
    const body = new FormData()
    body.set('payload', JSON.stringify({ form: p_form, academic: p_academic, tags: p_form.p_tag_choices, expected }))
    body.set('mode', image.mode)
    if (image.mode === 'set') body.set('image', image.file, 'project.png')
    const result = await client.functions.invoke<{ slug?: string }>('project-image', { body })
    if (!result.error && result.data?.slug) return { data: result.data.slug, error: null }
    const response = result.error?.context
    const details = response instanceof Response ? await response.json().catch(() => null) : null
    const code = typeof details?.code === 'string' ? details.code : response instanceof Response ? 'PROJECT_SAVE' : 'NETWORK'
    console.error('project-image save', { code, status: response instanceof Response ? response.status : undefined })
    return { data: null, error: { code } }
  }
  const result = await client.rpc('save_project_concepts', { p_form, p_academic, p_tag_choices: p_form.p_tag_choices })
  if (result.error) {
    console.error('save_project_concepts', { code: result.error.code, status: result.status })
    if (result.status === 0) return { data: null, error: { code: 'NETWORK' } }
  }
  return result
}
export async function checkProjectSlug(slug: string, signal?: AbortSignal) {
  let query = getSupabaseClient().from('projects').select('id').eq('slug', slug).limit(1)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw error
  // Respects RLS. A concurrent or non-visible collision is still rejected by the unique constraint on final creation.
  return !data?.length
}
