const $=id=>document.getElementById(id);
let session,client,busy=false,temporaryId=null,preparedOwner=null;
const original={title:'복구 확인용 '+'임시 자료',body:'폐기 가능한 '+'가상 복구 연습 항목'};
const modified={title:'변조된 '+'임시 자료',body:'복원 대상 '+'가상 변경 항목'};
const foreignId='00000000-0000-4000-8000-000000000001';
const report=(label,value)=>{$('results').textContent+=`${label}: ${value}\n`;};
function assert(value){if(!value)throw Error('verification_failed');}
function controls(){const changed=preparedOwner&&preparedOwner!==session?.user?.id;
  $('run').disabled=busy||!session||changed||!!temporaryId;$('cleanup').disabled=busy||!session||changed||!temporaryId;
  $('state').textContent=session?'로그인됨 — B 계정임을 확인한 뒤 실행합니다.':'로그인이 필요합니다.';}
async function hash(note){const title=new TextEncoder().encode(note.title),body=new TextEncoder().encode(note.body);
  const bytes=new TextEncoder().encode(`${title.length}:${note.title}:${body.length}:${note.body}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
async function request(path,method='GET',body){assert(session?.access_token);
  const res=await fetch(path,{method,credentials:'omit',cache:'no-store',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data;try{data=await res.json();}catch{}return{status:res.status,data};}
const item=id=>`/api/notes/${encodeURIComponent(id)}`,restore=id=>`/api/restore/${encodeURIComponent(id)}`;
async function action(fn){if(busy)return;busy=true;controls();$('message').textContent='확인 중입니다.';
  try{await fn();$('message').textContent='복구 확인을 완료했습니다.';}
  catch{$('message').textContent='확인이 중단됐습니다. 마지막 결과와 임시 메모 정리 버튼을 확인해 주세요.';}
  finally{busy=false;controls();}}
$('run').addEventListener('click',()=>action(async()=>{
  $('results').textContent='';const list=await request('/api/my/notes');
  report('시작 본인 목록',`HTTP${list.status}; ${Array.isArray(list.data)?list.data.length:'확인 불가'}건`);assert(list.status===200&&Array.isArray(list.data));
  // 기존 B 연습 목록은 1건입니다. A(3건)에서 잘못 실행되기 전에 중단합니다.
  assert(list.data.length===1&&!list.data.some(row=>row.id===foreignId));
  const id=crypto.randomUUID(),expected=await hash(original);
  temporaryId=id;preparedOwner=session.user.id;
  const added=await request('/api/notes','POST',{id,...original});report('가상 임시 메모 추가',`HTTP${added.status}`);
  assert(added.status===201&&added.data.id===id);
  const preview=await request(restore(id));report('사전 사본 재검증',`HTTP${preview.status}; 해시 일치 ${preview.data?.contentHash===expected}`);
  assert(preview.status===200&&preview.data.id===id&&preview.data.ownerMatched===true&&preview.data.contentHash===expected);
  const altered=await request(item(id),'PUT',modified);report('임시 메모 변조 연습',`HTTP${altered.status}`);assert(altered.status===200);
  const repaired=await request(restore(id),'POST');report('변조 후 한 건 복원',`HTTP${repaired.status}; 해시 일치 ${repaired.data?.contentHash===expected}`);
  assert(repaired.status===200&&repaired.data.contentHash===expected&&repaired.data.ownerMatched===true&&repaired.data.auditPreserved===true);
  report('변조 복구 감사 기록','기존 기록 보존 확인');
  const read=await request(item(id));assert(read.status===200&&await hash(read.data)===expected);report('복원 본문 대조','HTTP200; 사전 해시와 일치');
  const deleted=await request(item(id),'DELETE');report('임시 메모 삭제 연습',`HTTP${deleted.status}`);assert(deleted.status===200);
  const absent=await request(item(id));report('삭제 확인',`HTTP${absent.status}`);assert(absent.status===404);
  const recovered=await request(restore(id),'POST');report('삭제 후 한 건 복원',`HTTP${recovered.status}; 해시 일치 ${recovered.data?.contentHash===expected}`);
  assert(recovered.status===200&&recovered.data.contentHash===expected&&recovered.data.auditPreserved===true);
  report('삭제 복구 감사 기록','기존 기록 보존 확인');
  const again=await request(item(id));assert(again.status===200&&await hash(again.data)===expected);report('삭제 복구 본문 대조','HTTP200; 사전 해시와 일치');
  const injection=await request(restore(id),'POST',{owner_id:'99999999-9999-4999-8999-999999999999'});
  report('복구 소유자 주입 거부',`HTTP${injection.status}`);assert(injection.status===400);
  for(const method of['GET','POST']){const denied=await request(restore(foreignId),method);
    report(`A 자료 복구 ${method} 거부`,`HTTP${denied.status}`);assert(denied.status===404);}
  const foreign=await request(item(foreignId));report('복구 후 A 자료 조회 거부',`HTTP${foreign.status}`);assert(foreign.status===404);
  const finalDelete=await request(item(id),'DELETE');report('임시 메모 정리',`HTTP${finalDelete.status}`);assert(finalDelete.status===200);
  const finalRead=await request(item(id));report('정리 후 임시 조회',`HTTP${finalRead.status}`);assert(finalRead.status===404);
  const finalList=await request('/api/my/notes');report('정리 후 본인 목록',`HTTP${finalList.status}; ${Array.isArray(finalList.data)?finalList.data.length:'확인 불가'}건`);
  assert(finalList.status===200&&finalList.data.length===list.data.length&&!finalList.data.some(x=>x.id===id));temporaryId=null;preparedOwner=null;
}));
$('cleanup').addEventListener('click',()=>action(async()=>{assert(temporaryId&&preparedOwner===session.user.id);
  const result=await request(item(temporaryId),'DELETE');report('중단된 임시 메모 정리',`HTTP${result.status}`);
  assert([200,404].includes(result.status));temporaryId=null;preparedOwner=null;}));
try{const[metadata,descriptor]=await Promise.all([fetch('/aleph.json',{cache:'no-store'}),fetch('/database.json',{cache:'no-store'})]);
  assert(metadata.ok&&descriptor.ok);const deployed=await metadata.json(),database=await descriptor.json();assert(deployed.step===10);
  $('identity').textContent=`10단계 운영 저장점 ${deployed.commit}`;
  client=window.supabase.createClient(database.url,database.publishableKey);
  client.auth.onAuthStateChange((_event,next)=>{session=next;controls();});
  const{data,error}=await client.auth.getSession();assert(!error);session=data.session;controls();
}catch{$('state').textContent='운영 배포나 로그인 상태를 확인할 수 없습니다.';}
