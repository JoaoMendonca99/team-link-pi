import { nodeText, paragraph, type Report, type RichNode, type Section } from './model'

export type SourceRecord = { id:string;title:string;detail:string;period?:string }
export type SourceSelection = { id:string;category:string;records:SourceRecord[];format:string;capturedAt:string }
export const steps = ['Documento','Informações','Dados','Conteúdo','Finalizar']
export function resumeStep(report:Report,status:string) {
  if(report.assistant?.step && report.assistant.step>=1 && report.assistant.step<=5)return report.assistant.step
  if(status==='final'||status==='revised')return 5
  return report.sections.some(s=>sectionHasContent(s))?4:2
}
export function sectionHasContent(section:Section):boolean {
  const walk=(n:RichNode):boolean=>Boolean(n.text?.trim()||['figure','academicTable','citation'].includes(n.type)||n.content?.some(walk))
  return Boolean(nodeText(section.content).trim()||walk(section.content))
}
export function sourceContent(records:SourceRecord[],format:string,capturedAt:string):RichNode[] {
  if(format==='list')return [{type:'bulletList',content:records.map(item=>({type:'listItem',content:[paragraph(item.title+': '+item.detail)]}))}]
  if(format==='table'||format==='frame')return [{type:'academicTable',attrs:{kind:format,title:'Informações selecionadas do projeto',source:'Dados do projeto consultados em '+new Date(capturedAt).toLocaleDateString('pt-BR')},content:[{type:'table',content:[['Registro','Informações'],...records.map(i=>[i.title,i.detail])].map((cells,i)=>({type:'tableRow',content:cells.map(text=>({type:i===0?'tableHeader':'tableCell',content:[paragraph(text)]}))}))}]}]
  return records.flatMap(item=>[paragraph(item.title),...item.detail.split('\n').map(paragraph)])
}
export function sectionHint(title:string,kind:Report['kind']) {
  const key=title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  const hints:[string,string][]=[
    ['introducao','Explique qual problema motivou o projeto, para quem ele foi criado e qual solução pretende oferecer.'],
    ['objetivo geral','Descreva o principal resultado que o projeto pretende alcançar.'],
    ['objetivos especificos','Liste as etapas ou resultados necessários para atingir o objetivo geral.'],
    ['objetivos','Apresente o objetivo geral e os resultados específicos que o trabalho pretende alcançar.'],
    ['justificativa','Explique por que o projeto é importante e qual necessidade ele procura atender.'],
    ['metodologia','Descreva como o trabalho foi desenvolvido, quais procedimentos foram utilizados e como as atividades foram organizadas.'],
    ['desenvolvimento','Explique o que foi feito durante o projeto, apresentando as etapas e as soluções implementadas.'],
    ['resultados','Apresente os resultados obtidos, utilizando informações e evidências verificáveis.'],
    ['consideracoes finais','Resuma o que foi realizado, quais objetivos foram alcançados e quais limitações ou trabalhos futuros permanecem.'],
    ['referencial','Apresente os conceitos e trabalhos que fundamentam o projeto. Cite apenas fontes realmente consultadas.'],
    ['referencias','Cadastre as fontes consultadas e utilizadas ao longo do relatório.'],
    ['nao escopo','Explique o que não será realizado neste projeto e delimite suas fronteiras.'],
    ['escopo','Descreva o que será entregue e os limites do projeto.'],
    ['riscos','Identifique os riscos, seus possíveis efeitos e as ações previstas para tratá-los.'],
    ['premissas','Registre as condições consideradas verdadeiras para planejar o projeto.'],
    ['restricoes','Informe os limites de prazo, recursos e outras condições que precisam ser respeitadas.'],
    ['cronograma','Organize as etapas, os prazos e os marcos previstos para acompanhar as entregas.'],
    ['responsaveis','Identifique as pessoas e suas responsabilidades no projeto.'],
    ['identificacao','Identifique o projeto, sua finalidade e o contexto em que será desenvolvido.'],
    ['contextualizacao','Apresente o contexto e a necessidade que deram origem ao projeto.'],
    ['entregaveis','Liste as entregas previstas e como sua conclusão será verificada.'],
    ['criterios de sucesso','Descreva critérios verificáveis para avaliar se os objetivos foram alcançados.'],
    ['recursos','Indique os recursos humanos, materiais e financeiros necessários.'],
    ['autorizacao','Registre as condições de aprovação e os responsáveis pela autorização do projeto.'],
    ['resumo',kind==='abstract'?'Apresente os pontos principais do trabalho, respeitando o limite de palavras e as orientações da instituição ou evento.':'Apresente de forma breve o objetivo, a metodologia, os resultados e as conclusões do trabalho.'],
  ]
  return hints.find(([match])=>key.includes(match))?.[1]||'Escreva o conteúdo desta seção conforme a finalidade do documento e as orientações do professor. Utilize evidências e fontes verificáveis.'
}
