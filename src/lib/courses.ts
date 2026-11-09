import { getSupabaseClient } from '@/lib/supabase/client'

export type CourseSelection = { id: string | null; name: string }
export type Course = { id: string; nome: string; codigo_cine: string | null; grau_academico: number | null; nivel_academico: number; cine_nome: string | null }
export async function searchCourses(query: string, signal: AbortSignal): Promise<Course[]> {
  const { data, error } = await getSupabaseClient().rpc('search_courses', { p_query: query, p_limit: 12 }).abortSignal(signal)
  if (error) throw error
  return (data ?? []) as Course[]
}
export function courseDescription(course: Course) {
  const degrees: Record<number, string> = { 1: 'Bacharelado', 2: 'Licenciatura', 3: 'Tecnológico', 4: 'Bacharelado e Licenciatura' }
  return [course.grau_academico ? degrees[course.grau_academico] : 'Grau não aplicável', course.nivel_academico === 1 ? 'Graduação' : 'Sequencial de Formação Específica', course.codigo_cine ? 'Cine ' + course.codigo_cine : null, course.cine_nome].filter(Boolean).join(' · ')
}
