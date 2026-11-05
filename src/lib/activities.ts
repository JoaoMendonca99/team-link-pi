import { getSupabaseClient } from '@/lib/supabase/client'

export type Kind = 'todo' | 'doing' | 'review' | 'done'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type Stage = { id: string; name: string; kind: Kind; position: number; version: number }
export type Goal = { id: string; title: string; description: string; due_at: string | null; owners: string[]; kind: 'tasks' | 'numeric'; target: number; actual: number; unit: string; version: number }
export type Task = { id: string; title: string; description: string; stage_id: string; assignees: string[]; due_at: string | null; priority: Priority; goal_id: string | null; reviewer_id: string | null; requires_review: boolean; version: number }
export type ChecklistItem = { id: string; task_id: string; label: string; done: boolean; version: number }
export type Person = { id: string; name: string | null; avatar: string | null; level: string }
export type Workspace = { project: { id: string; title: string; slug: string }; manager: boolean; stages: Stage[]; tasks: Task[]; goals: Goal[]; checklist: ChecklistItem[]; members: Person[] }
export type Details = {
  comments: { id: string; author_id: string | null; name: string | null; avatar: string | null; body: string; created_at: string }[]
  history: { id: number; name: string | null; action: string; details: { reason?: string }; created_at: string }[]
}
export const kinds: Record<Kind, string> = { todo: 'A fazer', doing: 'Em andamento', review: 'Em revisão', done: 'Concluído' }
export const priorities: Record<Priority, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' }
export const historyLabels: Record<string, string> = {
  save_task: 'Atividade criada ou editada', move: 'Status alterado', approve: 'Entrega aprovada', return: 'Entrega devolvida',
  comment: 'Comentário adicionado', checklist: 'Checklist atualizado', delete_checklist: 'Item removido', delete_task: 'Atividade excluída',
  save_goal: 'Meta criada ou editada', delete_goal: 'Meta excluída', save_stage: 'Etapa configurada', delete_stage: 'Etapa removida', reorder_stages: 'Etapas reorganizadas',
}
export async function activityRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(name, args)
  if (error) throw new Error(error.code === 'P0001' ? error.message : 'Não foi possível concluir a operação.')
  return data as T
}
export const taskKind = (task: Task, stages: Stage[]) => stages.find((stage) => stage.id === task.stage_id)?.kind
export const overdue = (due: string | null, done: boolean, now = Date.now()) => !done && Boolean(due && Date.parse(due) < now)
export const dueSoon = (due: string | null, done: boolean, now = Date.now()) => !done && Boolean(due && Date.parse(due) >= now && Date.parse(due) <= now + 3 * 86_400_000)
export function goalProgress(goal: Goal, tasks: Task[], stages: Stage[]) {
  const linked = tasks.filter((task) => task.goal_id === goal.id)
  const total = goal.kind === 'numeric' ? Number(goal.target) : linked.length
  const actual = goal.kind === 'numeric' ? Number(goal.actual) : linked.filter((task) => taskKind(task, stages) === 'done').length
  return { total, actual, percent: total > 0 ? actual >= total ? 100 : Math.min(99, Math.round(actual / total * 100)) : 0 }
}
export const localDateTime = (value: string | null) => {
  if (!value) return ''
  const d = new Date(value)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
export const isoDateTime = (value: string) => value ? new Date(value).toISOString() : null
export const activityDate = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem prazo'
