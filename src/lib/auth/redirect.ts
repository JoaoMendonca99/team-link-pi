export function getSafeRedirectPath(path:string|null):string {
 const fallback='/meu-espaco'
 if(!path||!path.startsWith('/')||path.startsWith('//')||/[\\\s\u0000-\u001f\u007f]/.test(path))return fallback
 try {
  const url=new URL(path,'https://team-link.invalid'),decoded=decodeURIComponent(url.pathname)
  if(url.origin!=='https://team-link.invalid'||decoded.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(decoded)||decoded.replace(/\/+$/,'')==='/login')return fallback
  return url.pathname+url.search+url.hash
 } catch { return fallback }
}
