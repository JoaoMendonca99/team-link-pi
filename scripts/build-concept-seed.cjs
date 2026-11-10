/* eslint-disable @typescript-eslint/no-require-imports */
// Reviewed, small vocabulary. Source keys preserve UUIDs on reimport; spelling is not identity.
const fs = require('node:fs')
const source = 'Termo existente no Team Link; revisão de identidade 2026-11-09'
const groups = {
  Tecnologia: ['.NET','Arduino','C#','Git','GitHub','Next.js','PostgreSQL','Python','React','APIs REST','SQL','Supabase','TypeScript','WPF','Cibersegurança','Desenvolvimento Desktop','Desenvolvimento Web','Engenharia de Software','Inteligência Artificial','Internet das Coisas','Programação','Sistemas Embarcados','Aplicativo Desktop','Banco de Dados','Excel','Interface Homem-Máquina','Monitoramento de Dados','Power BI','Algoritmos','API','Estruturas de Dados','Identificação de Bugs','JavaScript','Lógica de Programação','Modelagem de Dados','Pseudocódigo','React Native','Teoria dos Grafos','Testes de Software','Testes Manuais','Busca em Largura','Busca em Profundidade'],
  Engenharia: ['Automação','Robótica','Engenharia da Computação','Melhoria Contínua'],
  Educação: ['Projetos Acadêmicos','Educação'],
  Design: ['Animação 3D','Modelagem 3D','Design de Interfaces','Design Responsivo','Experiência do Usuário','Figma','Prototipagem','Usabilidade','Wireframes'],
  Administração: ['Qualidade e Produção','Formação de Equipes','Gestão de Projetos','Logística','Transporte','Garantia da Qualidade'],
  Artes: ['Animação'],
  Geral: ['Análise Crítica','Jogos','Tecnologia e Inovação','Colaboração','Criatividade','Inovação','Tecnologia','Trabalho em Equipe','Atenção aos Detalhes','Comunicação'],
}
const rows = []
const key = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9+#.]+/g,' ').trim()
for (const [domain,names] of Object.entries(groups)) for (const name of names) rows.push({ key: domain + ':' + key(name), name, domain, status:'validado',source,aliases:[] })
for (const [name,domain,description] of [
 ['Java','Tecnologia','Linguagem Java. Não equivale a JavaScript.'],['C','Tecnologia','Linguagem de programação C.'],['C++','Tecnologia','Linguagem C++; distinta de C e C#.'],
 ['Interface do Usuário','Design','Interface com que a pessoa interage; distinta da experiência do usuário.'],
 ['Aprendizado de Máquina','Tecnologia','Métodos de aprendizado de máquina; relacionado à IA, sem equivalência de identidade.'],
 ['Design Gráfico','Design'],['Marketing Digital','Comunicação'],['Pesquisa Científica','Ciências'],['Enfermagem','Saúde'],['Educação Infantil','Educação'],
 ['Sustentabilidade','Meio ambiente'],['Engenharia Mecânica','Engenharia'],['Gestão Financeira','Administração'],['Empreendedorismo','Negócios'],['Artes Visuais','Artes'],['Saúde Pública','Saúde'],
]) rows.push({key:domain+':'+key(name),name,domain,status:'validado',description:description||null,source:'Vocabulário inicial revisado; rótulo comum da área, sem equivalências inferidas',aliases:[]})
const byName = name => rows.find(r=>r.name===name)
function aliases(name, list, url, confirm=false) { for(const alias of list) byName(name).aliases.push({name:alias,source:url,confirm}) }
aliases('JavaScript',['JS'],'https://developer.mozilla.org/en-US/docs/Web/JavaScript')
aliases('React',['ReactJS','React.js'],'https://legacy.reactjs.org/docs/faq-state.html')
aliases('APIs REST',['REST APIs'],'Revisão bilíngue do termo existente; não é sinônimo de API em geral')
aliases('Inteligência Artificial',['Artificial Intelligence'],'https://www.ibm.com/br-pt/think/topics/machine-learning')
aliases('Inteligência Artificial',['IA'],'Sigla exige confirmação contextual',true)
aliases('Aprendizado de Máquina',['Machine Learning','ML'],'https://www.ibm.com/br-pt/think/topics/machine-learning',true)
aliases('Experiência do Usuário',['UX'],'https://www.nngroup.com/articles/definition-user-experience/',true)
aliases('Interface do Usuário',['UI'],'https://www.nngroup.com/articles/definition-user-experience/',true)
aliases('Interface Homem-Máquina',['IHM'],'Sigla exige confirmação contextual',true)
aliases('Garantia da Qualidade',['QA'],'Sigla exige confirmação contextual',true)
aliases('Busca em Largura',['BFS'],'https://xlinux.nist.gov/dads/HTML/breadthfirst.html')
aliases('Busca em Profundidade',['DFS'],'https://xlinux.nist.gov/dads/HTML/depthfirst.html')
for(const [name,description] of [
 ['CBA','Sigla sem contexto suficiente para determinar a identidade.'],['Modelagem','Pode representar modelagem de dados, 3D ou outras áreas.'],['Redes','Pode representar redes de computadores, relações sociais ou outros assuntos.'],
 ['Oxido','Grafia e contexto precisam de confirmação.'],['Inteligente Artificial','Possível erro de digitação; identidade não foi presumida.'],['Design,programação','Texto composto preservado; não foi dividido automaticamente.'],
 ['UX/UI','Texto composto: experiência e interface são conceitos distintos.'],['Webdev','Possível abreviação; equivalência não foi presumida.'],['Automatização','Possível equivalência contextual com Automação; revisão pendente.'],
]) rows.push({key:'pending:'+key(name),name,domain:'Geral',status:'provisorio',description,source:'Texto legado preservado; identidade pendente de revisão',confirm:['CBA','Modelagem','Redes','Oxido','Design,programação','UX/UI'].includes(name),aliases:[]})
fs.mkdirSync('data/concepts',{recursive:true})
fs.writeFileSync('data/concepts/seed.json',JSON.stringify(rows,null,2)+'\n')
fs.writeFileSync('data/concepts/relations.json',JSON.stringify([
 {from:byName('React').key,to:byName('JavaScript').key,source:'https://react.dev/'},
 {from:byName('React Native').key,to:byName('React').key,source:'https://reactnative.dev/docs/intro-react'},
 {from:byName('Aprendizado de Máquina').key,to:byName('Inteligência Artificial').key,source:'https://www.ibm.com/br-pt/think/topics/machine-learning'},
],null,2)+'\n')
console.log({concepts:rows.length,validated:rows.filter(r=>r.status==='validado').length,provisional:rows.filter(r=>r.status==='provisorio').length})
