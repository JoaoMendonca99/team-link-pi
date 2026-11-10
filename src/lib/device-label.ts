export function deviceLabel(agent:string):string {
 if(!/Mozilla|AppleWebKit|Chrome\/|Firefox\/|Edg\//i.test(agent))return agent.trim().slice(0,80)||'Navegador'
 const browser=/Edg(?:e|A|iOS)?\//.test(agent)?'Microsoft Edge':/OPR\//.test(agent)?'Opera':/(Firefox|FxiOS)\//.test(agent)?'Firefox':/(Chrome|CriOS)\//.test(agent)?'Chrome':/Version\/.+Safari\//.test(agent)?'Safari':'Navegador'
 const system=/Android/.test(agent)?'Android':/iPhone|iPad|iPod/.test(agent)?'iOS / iPadOS':/Windows/.test(agent)?'Windows':/Macintosh|Mac OS X/.test(agent)?'macOS':/Linux/.test(agent)?'Linux':''
 return [browser,system].filter(Boolean).join(' · ')
}
