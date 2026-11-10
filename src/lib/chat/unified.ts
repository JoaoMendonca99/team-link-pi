import type {ChatProjectListItem} from './types'
export const CHAT_DIRECTORY_CHANGED='team-link:chat-directory-changed'
export const normalizeChatSearch=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR')
export function matchingChatProjects(projects:ChatProjectListItem[],search:string){
 const query=normalizeChatSearch(search.trim())
 const time=(value?:string|null)=>value?Date.parse(value)||0:0
 return projects.filter(project=>[project.title,...project.searchTerms??[]].some(value=>normalizeChatSearch(value).includes(query)))
  .sort((a,b)=>time(b.lastMessageAt)-time(a.lastMessageAt)||a.title.localeCompare(b.title,'pt-BR')||a.id.localeCompare(b.id))
}
