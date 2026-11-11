const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript')
Module._extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
const {Graph,bfs,dfs,path,components,jaccard,sharedNeighbors}=require('../src/lib/graph/graph.ts')
const {technical,academic,recommend,buildGraph,MODEL}=require('../src/lib/graph/engine.ts')
const concept=(id,raw)=>({id,label:id,...(raw?{raw}:{})}),person=(id,skills=[],interests=[])=>({id,name:id,avatar:null,skills:skills.map(x=>concept(x)),interests:interests.map(x=>concept(x)),educations:[]})
const requirement=(id,weight=3)=>({key:id,concept:id,label:id,weight,source:'vacancy'})
function fixture(){return {actor:'a',people:[person('a',['React','Supabase'],['Educação']),person('b',['React'],['Educação']),person('c',['Java'])],projects:[{id:'p',slug:'p',title:'p',category:'Educação',tags:[concept('Educação')],requirements:[],joined:false,pending:false,open:true}],vacancies:[{id:'v',project:'p',title:'v',open:true,available:1,requirements:[requirement('React',5),requirement('Supabase',3),requirement('UI/UX',2)]}],concepts:['React','Supabase','UI/UX','Java','Educação'].map(x=>concept(x)),relations:[],courses:[],areas:[],institutions:[],offers:[],members:[],friends:[],excludedFriends:[],sharing:false,limited:false}}
function graph(reverse=false){const g=new Graph();for(const id of ['a','b','c','d','island'])g.addVertex({id,type:'user',label:id});for(const [from,to] of (reverse?[['c','d'],['a','c'],['b','d'],['a','b'],['d','a']]:[['a','b'],['a','c'],['b','d'],['c','d'],['d','a']]))g.addEdge({from,to,type:'friend',weight:1});return g.finalize()}

test('BFS FIFO: deterministic levels, shortest predecessor path, cycle and disconnected graph',()=>{for(const g of [graph(),graph(true)]){const t=bfs(g,'a',{trace:true});assert.deepEqual(t.order,['a','b','c','d']);assert.deepEqual(path(t,'d'),['a','b','d']);assert.equal(t.distance.get('d'),2);assert.deepEqual(path(t,'island'),[]);assert.deepEqual(t.trace[0].frontier,['b','c'])}})
test('BFS bounds, absent root and missing candidates terminate explicitly',()=>{assert.deepEqual(bfs(graph(),'a',{depth:1}).order,['a','b','c']);assert.deepEqual(bfs(graph(),'none').order,[]);assert.equal(bfs(graph(),'a',{limit:2}).truncated,true)})
test('DFS records stack frames, actual returns, cycles and weak components',()=>{const g=graph(),t=dfs(g,'a',{trace:true});assert.deepEqual(t.order,['a','b','d','c']);assert.deepEqual(path(t,'d'),['a','b','d']);assert.equal(t.trace.filter(s=>s.event==='return').length,4);assert.deepEqual(t.trace.at(-1).frontier,[]);assert.equal(components(g).length,2)})
test('Jaccard deduplicates sets and explicitly treats two empty sets as zero evidence',()=>{assert.equal(jaccard(['a','a','b'],['b','c']),1/3);assert.equal(jaccard([],[]),0);assert.equal(jaccard(['a'],[]),0)})
test('weighted coverage: exact 80%, aliases deduplicated, weights validated, no requirements are null',()=>{const req=[requirement('React',5),requirement('Supabase',3),requirement('UI/UX',2)];const t=technical([concept('React','ReactJS'),concept('React'),concept('Supabase')],req,[]);assert.equal(t.percent,80);assert.equal(t.exactPercent,80);assert.equal(t.total,10);assert.deepEqual(t.unidentified,['UI/UX']);assert.equal(technical([concept('React','ReactJS')],[requirement('React',5)],[]).identified[0].kind,'alias');assert.equal(technical([],[],[]).percent,null);assert.equal(technical([],req,[]).percent,0);for(const w of [0,6,2.5])assert.throws(()=>technical([], [requirement('x',w)],[]));assert.equal(technical([concept('React')],[requirement('React',2),requirement('React',5)],[]).total,5)})
test('semantic relevance is one-hop, directional, reduced and never satisfies essential requirements',()=>{const relations=[{from:'React',to:'Frontend',type:'mais_especifico_que'},{from:'Frontend',to:'Software',type:'mais_especifico_que'},{from:'React',to:'UI',type:'relacionado_a'}];assert.equal(technical([concept('React')],[requirement('Frontend',4)],relations).percent,50);assert.equal(technical([concept('Frontend')],[requirement('React',4)],relations).percent,0);assert.equal(technical([concept('React')],[requirement('Frontend',5)],relations).percent,0);assert.equal(technical([concept('React')],[requirement('Software',4)],relations).percent,0);assert.equal(technical([concept('React')],[requirement('UI',2)],relations).percent,35)})
test('opportunities execute traversal and exclude closed/full vacancies, members and pending applications',()=>{const d=fixture();let r=recommend(d,'opportunities');assert.equal(r.items.length,1);assert.equal(r.items[0].technical.percent,80);assert.deepEqual(r.items[0].path.slice(0,2),['user:a','concept:React']);for(const alter of [x=>x.projects[0].joined=true,x=>x.projects[0].pending=true,x=>x.projects[0].open=false,x=>x.vacancies[0].open=false,x=>x.vacancies[0].available=0]){const copy=fixture();alter(copy);assert.equal(recommend(copy,'opportunities').items.length,0)}})
test('collaborators are BFS-discovered and existing members/pending candidates are excluded',()=>{const d=fixture();const result=recommend(d,'collaborators','p');assert.equal(result.items.length,1);assert.equal(result.items[0].name,'b');assert.ok(result.items[0].path[0]==='project:p');d.members.push({user:'b',project:'p'});assert.equal(recommend(d,'collaborators','p').items.length,0);d.members=[];d.people[1].excluded=true;assert.equal(recommend(d,'collaborators','p').items.length,0)})
test('friend suggestions use projections, exclude self/friends/pending and retain fixed denominators',()=>{const d=fixture();let r=recommend(d,'friends');assert.equal(r.items[0].name,'b');assert.ok(r.items[0].score<100);assert.ok(r.items[0].coverage<1);assert.equal(sharedNeighbors(buildGraph(d),'user:a','user:b','skill').length,1);d.excludedFriends=['b'];assert.equal(recommend(d,'friends').items.length,0);d.excludedFriends=[];d.people[0].skills=[];d.people[0].interests=[];assert.equal(recommend(d,'friends').items.length,0);assert.equal(Object.values(MODEL.social).reduce((a,b)=>a+b,0),1)})
test('accepted opted-in friends are traversed as two hops and common neighbors count once',()=>{const d=fixture();d.people[0].skills=[];d.people[0].interests=[];d.people[1].skills=[];d.people[1].interests=[];d.friends=[{a:'a',b:'c'},{a:'c',b:'b'}];d.excludedFriends=['c'];const r=recommend(d,'friends');assert.equal(r.items[0].name,'b');assert.deepEqual(r.items[0].path,['user:a','user:c','user:b']);assert.equal(r.items[0].score,20)})
test('multiple formations compare canonical institutions, course identity and CINE separately',()=>{const d=fixture(),a=d.people[0],b=d.people[1];a.educations=[{course:'eng',institution:'i1',current:false,status:'concluida',primary:true},{course:'design',institution:'i2',current:true,status:'cursando',primary:false}];b.educations=[{course:'comp',institution:'i3',current:true,status:'cursando',primary:true}];d.courses=[{id:'eng',label:'Engenharia',cine:'0613E01'},{id:'comp',label:'Computação',cine:'0613C01'},{id:'design',label:'Design',cine:'0212D01'}];const x=academic(a,b,d);assert.equal(x.course,0);assert.equal(x.institution,0);assert.equal(x.cine,0.6);b.educations.push({course:null,institution:'i2',current:false,status:'interrompida',primary:false});assert.equal(academic(a,b,d).institution,1);assert.equal(academic(person('z'),b,d).coverage,0)})
test('course offerings do not invent attended institutions or student skills',()=>{const d=fixture();d.people[0].skills=[];d.people[0].interests=[];d.people[0].educations=[{course:'c',institution:'i1'}];d.people[1].skills=[];d.people[1].interests=[];d.people[1].educations=[{course:null,institution:'i2'}];d.courses=[{id:'c',label:'Curso',cine:null}];d.institutions=[{id:'i1',label:'I1'},{id:'i2',label:'I2'}];d.offers=[{course:'c',institution:'i2'}];assert.equal(recommend(d,'friends').items.length,0);assert.equal(academic(d.people[0],d.people[1],d).institution,0);assert.equal(technical(d.people[0].skills,[requirement('React')],[]).percent,0)})
test('ties and equivalently ordered input data produce reproducible recommendations',()=>{const d=fixture();d.people.push(person('d',['React'],['Educação']));const left=recommend(d,'friends').items.map(x=>[x.id,x.score]);d.people.reverse();d.projects.reverse();assert.deepEqual(recommend(d,'friends').items.map(x=>[x.id,x.score]),left)})

test('sufficiency distinguishes unresolvable requirements and missing profile data',()=>{
 const known=requirement('React',3),unknown={key:'legacy',concept:null,label:'Termo ambíguo',weight:3,source:'vacancy'}
 assert.equal(technical([concept('React')],[known,unknown],[]).evidenceCoverage,0.5)
 assert.equal(technical([],[known],[]).evidenceCoverage,0)
 assert.equal(technical([concept('React')],[],[]).evidenceCoverage,0)
})
test('a selected vacancy is ranked independently instead of disappearing behind other vacancies',()=>{
 const d=fixture();d.vacancies.push({...d.vacancies[0],id:'v2',title:'Outra vaga'})
 const r=recommend(d,'collaborators','p','v2')
 assert.ok(r.items.length>0);assert.ok(r.items.every(item=>item.vacancy==='v2'))
 assert.equal(r.vacancies.length,2)
 assert.equal(recommend(d,'collaborators','p','not-in-project').items.length,0)
})

test('vacancy weights are independent and empty vacancies never inherit project requirements', () => {
 const d = fixture()
 d.projects[0].requirements = [{...requirement('React', 5), source:'project'}]
 d.vacancies[0].requirements = [requirement('React',5),requirement('UI/UX',1)]
 d.vacancies.push(
  {...d.vacancies[0],id:'lower',requirements:[requirement('React',1),requirement('UI/UX',5)]},
  {...d.vacancies[0],id:'empty',requirements:[]},
 )
 for (const [kind, project] of [['opportunities',undefined],['collaborators','p']]) {
  const ranked = recommend(d,kind,project).items
  const first = ranked.find(item=>item.vacancy==='v')
  const second = ranked.find(item=>item.vacancy==='lower')
  assert.equal(first.technical.exactPercent,83.33)
  assert.equal(second.technical.exactPercent,16.67)
  assert.ok(first.score > second.score)
  const empty = ranked.find(item=>item.vacancy==='empty')
  assert.ok(empty.score>0,'project context can still contribute')
  assert.equal(empty.technical.percent,null)
  assert.deepEqual(empty.technical.identified,[])
 }
})
