// Runs only against the separately configured synthetic PostgreSQL fixture.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto')
async function checkDiscussionConcurrency(Client,config){
 assert.equal(config.host,'127.0.0.1');assert.equal(config.database,'institutions_test')
 const a=new Client(config),b=new Client(config);await a.connect();await b.connect()
 try{
  const row=(await a.query("select t.id,t.project_id,p.owner_id actor,(select m.user_id from project_members m where m.project_id=p.id and m.status='active' and m.user_id<>p.owner_id and m.user_id=any(t.assignees) limit 1) reader from activity_tasks t join projects p on p.id=t.project_id join activity_stages s on s.id=t.stage_id where p.status in ('open','in_progress') and s.kind in ('todo','doing') and exists(select from project_members m where m.project_id=p.id and m.status='active' and m.user_id<>p.owner_id and m.user_id=any(t.assignees)) limit 1")).rows[0]
  assert(row,'Controlled fixture must contain an assigned task')
  const sender=row.actor,reader=row.reader,first=randomUUID(),later=randomUUID()
  async function role(client,user){await client.query('set local role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,true)",[user])}
  await a.query('begin');await role(a,sender);await a.query('select send_activity_discussion($1,$2,$3,null,false)',[row.id,'Concurrent baseline',first]);await a.query('commit')
  const watermark=(await a.query('select discussion_sequence from activity_comments where id=$1',[first])).rows[0].discussion_sequence
  await a.query('begin');await role(a,reader);await a.query('select mark_activity_discussion_read($1,$2)',[row.id,watermark])
  await b.query('begin');await role(b,sender);let completed=false;const pending=b.query('select send_activity_discussion($1,$2,$3,null,false)',[row.id,'Concurrent new arrival',later]).then(()=>{completed=true})
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(completed,false,'message must wait for the read snapshot lock')
  await a.query('commit');await pending;await b.query('commit')
  await a.query('begin');await role(a,reader)
  const directory=(await a.query('select get_my_chat_directory() items')).rows[0].items,project=directory.find(p=>p.project_id===row.project_id),discussion=project.activities.find(t=>t.id===row.id)
  assert.equal(discussion.unread_count,1);assert.equal(discussion.preview,'Concurrent new arrival')
  assert.equal(project.search_terms.some(term=>term.includes(discussion.title)),true)
  const stored=(await a.query('select last_read_sequence from activity_discussion_reads where task_id=$1 and user_id=$2',[row.id,reader])).rows[0].last_read_sequence
  assert.equal(stored,watermark);await a.query('commit')
 }finally{await a.query('rollback').catch(()=>{});await b.query('rollback').catch(()=>{});await a.end();await b.end()}
}
module.exports={checkDiscussionConcurrency}
