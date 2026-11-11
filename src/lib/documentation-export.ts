import {jsPDF} from 'jspdf'
import {strToU8,zipSync} from 'fflate'
import {abntGuideSections,academicFieldLabels,buildAiPrompt,kindLabels,type DocumentationData,type DocumentKind} from './documentation'
import {readDocument,type ProjectFile,type ReferenceDocument} from './project-documents'
import {safeFileName} from '../../supabase/functions/_shared/file-validation'

function writer(title:string,font:string){
 const pdf=new jsPDF({format:'a4',compress:true,putOnlyUsedFonts:true});pdf.addFileToVFS('NotoSans.ttf',font);pdf.addFont('NotoSans.ttf','NotoSans','normal');pdf.setFont('NotoSans');pdf.setProperties({title,author:'Team Link'})
 let y=22
 function text(value:string,size=10){if(size>11&&y>252){pdf.addPage();y=22}pdf.setFontSize(size);pdf.setTextColor(size>11?'#aa4614':'#202731');const lines:string[]=pdf.splitTextToSize(value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,''),170);for(const line of lines){if(y>275){pdf.addPage();y=22}pdf.text(line,20,y);y+=size>11?7:5}y+=3}
 text(title,17)
 function finish(){const pages=pdf.getNumberOfPages();for(let i=1;i<=pages;i++){pdf.setPage(i);pdf.setFontSize(8);pdf.setTextColor('#666666');pdf.text('Team Link · '+i+' / '+pages,20,288)}return pdf}
 return {text,finish}
}
export async function loadDocumentationFont(){const response=await fetch('/fonts/NotoSans-Regular.ttf');if(!response.ok)throw Error('Não foi possível carregar a fonte do PDF.');const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary)}
export function createDataPdf(data:DocumentationData,kind:DocumentKind,font:string){
 const out=writer('TEAM LINK — DADOS PARA IA',font),write=out.text,missing='Não informado / não registrado'
 const date=(value:string|null)=>value?new Date(value).toLocaleString('pt-BR'):missing
 const who=(ids:string[])=>ids.map(id=>data.members.find(m=>m.id===id)?.name||'Integrante sem nome disponível').join('; ')||missing
 write(data.project.title,14);write('Documento solicitado: '+kindLabels[kind]);write('Extraído em: '+date(data.extracted_at)+' · instante UTC: '+data.extracted_at)
 write('Este PDF é um retrato de dados autorizados. Não é um relatório acadêmico final. Ausências são explícitas; descrições e objetivos não estruturados exigem confirmação. Nenhuma conversa privada ou candidatura é incluída.')
 write('1. Informações do projeto',13)
 const statuses:Record<string,string>={open:'Aberto',in_progress:'Em andamento',completed:'Concluído',archived:'Arquivado'}
 for(const [label,value] of [['Nome',data.project.title],['Resumo',data.project.summary],['Descrição',data.project.description],['Categoria',data.project.category],['Categorias secundárias',data.project.secondary_categories?.join('; ')],['Tags gerais',data.project.tags?.join('; ')],['Habilidades registradas',data.project.skills?.join('; ')],['Criado em',date(data.project.created_at)],['Estado atual',statuses[data.project.status]||data.project.status],['Encerrado em',date(data.project.closed_at)]] as [string,string|null][])write(label+': '+(value||missing))
 write('2. Informações acadêmicas',13);for(const [key,label] of Object.entries(academicFieldLabels))write(label+': '+(data.academics[key as keyof typeof academicFieldLabels]||missing))
 write('3. Equipe e participação registrada',13)
 const roles:Record<string,string>={owner:'Líder',manager:'Gestor',reviewer:'Revisor',member:'Membro',admin:'Administrador',mentor:'Mentor'}
 for(const member of data.members)write((member.name||'Nome indisponível')+' · '+(roles[member.role]||member.role)+(member.display_role?' · '+member.display_role:'')+' · vínculo: '+member.status+' · ingresso: '+date(member.joined_at))
 if(!data.members.length)write(missing)
 write('Responsabilidades formais e histórico de saída: incluídos apenas quando explicitamente registrados; não deduza responsabilidades pelo cargo.')
 write('4. Atividades do período selecionado',13)
 if(!data.activities_authorized)write('Atividades não incluídas: módulo indisponível ou acesso não autorizado.')
 const done=data.tasks.filter(t=>t.kind==='done').length
 write(`${data.tasks.length} atividades registradas; ${done} na etapa de conclusão. Progresso operacional: ${data.tasks.length?Math.round(done/data.tasks.length*100)+'%':'não calculável, sem atividades'}. Isso não comprova resultados científicos.`)
 for(const task of data.tasks){write(task.title,12);write(task.description||'Descrição: '+missing);write('Responsáveis: '+who(task.assignees));write('Etapa: '+task.stage+' · Prazo: '+date(task.due_at));write('Revisão obrigatória: '+(task.requires_review?'Sim':'Não')+' · Revisor designado: '+(task.reviewer_id?who([task.reviewer_id]):'Administradores conforme regras do projeto'));write('Criada: '+date(task.created_at)+' · Atualizada: '+date(task.updated_at));write('Resultados específicos: '+missing)}
 write('5. Metas e registros de acompanhamento',13);if(!data.goals.length)write('Metas: '+missing)
 for(const goal of data.goals){write(goal.title,12);write(goal.description||missing);write('Prazo: '+date(goal.due_at));if(goal.kind==='numeric')write(`Valor registrado: ${goal.actual} / ${goal.target} ${goal.unit}`)}
 write('6. Histórico registrado de atividades',13);if(!data.events.length)write(missing)
 const actions:Record<string,string>={move:'Alteração de etapa',approve:'Aprovação',return:'Devolução para ajustes',save_task:'Criação/edição',transfer_task:'Transferência de período'}
 for(const event of data.events)write(`${date(event.created_at)} · ${event.name||'Autor indisponível'} · ${event.task} · ${actions[event.action]||event.action}${event.reason?' · Justificativa: '+event.reason:''}`)
 write('7. Informações ausentes e limites',13);data.missing.forEach(v=>write(v));write('Mensagens privadas, candidaturas, tokens, credenciais, dados de autenticação e arquivos de evidência não são exportados. Os documentos de referência são escolhidos separadamente pelo usuário.')
 return out.finish()
}
export function createAbntGuide(font:string){const out=writer('GUIA ABNT — TEAM LINK',font);for(const [title,text] of abntGuideSections){out.text(title,13);out.text(text)}return out.finish()}
export async function createDocumentationZip(data:DocumentationData,kind:DocumentKind,references:ReferenceDocument[],font:string,projectFiles:ProjectFile[]=[]){
 const files:Record<string,Uint8Array>={'01_Dados_do_Projeto.pdf':new Uint8Array(createDataPdf(data,kind,font).output('arraybuffer'))}
 let total=files['01_Dados_do_Projeto.pdf'].length
 for(const [index,reference] of references.entries()){
  if(reference.builtin){files['02_Guia_ABNT.pdf']=new Uint8Array(createAbntGuide(font).output('arraybuffer'));continue}
  try{const blob=await readDocument('reference',reference.id);total+=blob.size;if(total>80*1024*1024)throw Error('O pacote excede 80 MB. Selecione menos documentos.');files['03_Documentos_de_Referencia/'+String(index+1).padStart(2,'0')+'_'+safeFileName(reference.filename||reference.name)]=new Uint8Array(await blob.arrayBuffer())}catch(e){throw Error('Não foi possível incluir “'+reference.name+'”. '+(e as Error).message)}
 }
 files['04_Prompt_IA.txt']=strToU8(buildAiPrompt(data,kind,references))
 for(const [index,file] of projectFiles.entries()){
  try{
   const blob=await readDocument('project',file.id)
   total+=blob.size
   if(total>80*1024*1024)throw Error('O pacote excede 80 MB. Selecione menos documentos.')
   const cleanName=safeFileName(file.filename||file.name)
   files['05_Arquivos_do_Projeto/'+String(index+1).padStart(2,'0')+'_'+cleanName]=new Uint8Array(await blob.arrayBuffer())
  }catch(e){
   throw Error('Não foi possível incluir o arquivo do projeto “'+file.name+'”. '+(e as Error).message)
  }
 }
 const bytes=zipSync(files,{level:4});return new Blob([bytes as BlobPart],{type:'application/zip'})
}
