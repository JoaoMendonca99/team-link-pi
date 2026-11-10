export function internalProject(path:string){
 const match=path.replace(/\/$/,'').match(/^\/projetos\/([^/]+)\/(painel(?:\/.*)?|editar)$/)
 if(!match)return null
 try{return {reference:decodeURIComponent(match[1]),editing:match[2]==='editar'}}catch{return null}
}
export const isInternalWorkspace=(path:string)=>/^\/meu-espaco(?:\/|$)/.test(path)||Boolean(internalProject(path))
export const sidebarPreferenceKey=(user:string)=>'team-link:sidebar:'+user
export type NavigationProject={id:string;slug:string;title:string}
export type ProjectNavigation={items:NavigationProject[];current:NavigationProject|null;has_more:boolean}
