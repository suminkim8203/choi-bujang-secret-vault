import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{collectOperationsReport}from'../src/operations-report.mjs';import{createChecksHandler}from'../api/checks.js';
import{runDecisionCheck}from'../src/decision-check.mjs';import{runDetectionCheck}from'../src/detection-check.mjs';
import{deploymentIdentity}from'../scripts/deployment-identity.mjs';
import{runAttackChecks}from'../src/attack-check.mjs';
import{assertOperationRecord,sealOperationRecord}from'../src/operation-record.mjs';
import{readOperationsReport,createOperationStore}from'../src/operation-store.mjs';
import{createHome}from'../api/home.js';
const config=JSON.parse(await readFile(new URL('../aleph.config.json',import.meta.url),'utf8'));
const commit='a'.repeat(40),policy=await readFile(new URL('../recovery/policy-v9.json',import.meta.url),'utf8');
function backend({invalidAnonymousBody=false,wrongCommit=false}={}){
  const ParsedURL=URL;
  let count=0;const calls=[];
  const send=async(target,options={})=>{const url=new ParsedURL(target);calls.push({path:url.pathname,options});count++;
    let body,status=200;
    if(url.pathname==='/aleph.json')body={step:12,commit:wrongCommit?'b'.repeat(40):commit};
    else if(url.pathname==='/data.json')body={notes:[]};
    else if(url.pathname==='/manifest.json')body={display:'standalone',start_url:'/',name:'fixture',icons:[{}]};
    else if(url.pathname==='/api/device/status')body={approved:false,reason:'device_not_registered'};
    else if(url.pathname==='/api/checks')body=url.searchParams.get('case')==='s12-requests'?Array.from({length:20},(_,i)=>i<14?{status:200,requestId:`receipt_${i}`,checkedAt:'2026-10-13T00:00:00Z'}:{status:null,requestId:null,checkedAt:null,result:'not_run'}):url.search?runDetectionCheck(url.searchParams.get('case'))??await runDecisionCheck(url.searchParams.get('case'))
      :{schema:'aleph.operations.report.v1',ready:true,counts:{failed:0}};
    else if(url.pathname.startsWith('/rest/v1/')){status=401;body={code:'42501'};}
    else{status=401;body=invalidAnonymousBody?{private:'fixture-response-not-exported'}:{error:'login_required'};}
    return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','x-vercel-id':`fixture_request_${count}`}});
  };return{send,calls};
}
test('ops report counts executed HTTP observations and separately leaves owner requests and all 41 full trials unrun',async()=>{
  const{send,calls}=backend();const report=await collectOperationsReport({config,send,commit,readPolicyBackup:async()=>policy});
  assert.equal(report.complete,true);assert.equal(report.counts.executed,14);assert.equal(report.counts.notRun,6);
  assert.equal(report.rows.length,20);assert.equal(calls.length,15);assert.equal(report.counts.failed,0);
  assert.ok(calls.every(c=>['GET','HEAD'].includes(c.options.method??'GET')));
  assert.ok(calls.slice(1).every(c=>typeof c.options.alephEvidence.caseId==='string'&&c.options.alephEvidence.requestKey==='read'));
  assert.equal(report.rows.filter(r=>r.source==='write_not_run').length,6);
  assert.equal(report.assault41.localExecuted,0);assert.equal(report.assault41.localNotRun,41);
  assert.equal(report.revocation.executed,false);assert.equal(report.recovery.policyBackupVerified,true);
  assert.equal(report.rows.filter(r=>r.source==='fixed_synthetic_api').length,4);
  assert.ok(report.rows.filter(r=>r.status!==null).every(r=>r.requestId&&Number.isFinite(Date.parse(r.checkedAt))));
  assert.ok(report.rows.filter(r=>r.status===null).every(r=>r.requestId===null&&r.checkedAt===null));
  for(const key of['title','body','owner_id','token','apikey','srcip'])assert.ok(!report.rows.some(r=>Object.hasOwn(r,key)));
});
test('bundle and screen share one plan while checker uses GET only and stays runnable when the sandbox URL omits searchParams',async()=>{
 const NativeURL=URL,{send,calls}=backend();class LimitedURL extends NativeURL{get searchParams(){return undefined;}}
 let checks;try{globalThis.URL=LimitedURL;checks=await runAttackChecks(config,{send});}finally{globalThis.URL=NativeURL;}
 assert.equal(calls.length,14);assert.ok(calls.every(c=>(c.options.method??'GET')==='GET'));
 assert.equal(checks.filter(c=>c.observed==='not_run').length,6);
 assert.equal(checks.length,20);assert.ok(checks.every(c=>c.observed==='not_run'||/^HTTP (?:200|401|403)(?:; jsonReady=true|)?$/u.test(c.observed)));
 assert.ok(calls.every(c=>checks.some(x=>x.attackId===c.options.alephEvidence.caseId)));
 const screen=await collectOperationsReport({config,send:backend().send,commit,readPolicyBackup:async()=>policy});
 assert.deepEqual(screen.rows.map(r=>r.attackId),checks.map(c=>c.attackId));
 assert.equal(screen.counts.executed,checks.filter(c=>c.observed!=='not_run').length);
 assert.equal(screen.counts.notRun,checks.filter(c=>c.observed==='not_run').length);
 assert.deepEqual(screen.ownerVerification,{list:'not_run',noteRestore:'not_run',includedInRepresentativeCounts:false});
});
test('failed body validation and unmatched deployments cannot create a confirmed success record',async()=>{
 const{send}=backend({invalidAnonymousBody:true});
 await assert.rejects(collectOperationsReport({config,send,commit,readPolicyBackup:async()=>policy}),/operation_checks_incomplete/u);
 const wrong=backend({wrongCommit:true});await assert.rejects(collectOperationsReport({config,send:wrong.send,commit}));
});
test('fixed decision API cases stay synthetic and preserve normal, risk and other-zone expectations',async()=>{
  for(const[name,expected]of[['s06-registered','allow'],['s07-risk','step_up'],['s08-other-zone','deny']]){
    const result=await runDecisionCheck(name);assert.equal(result.synthetic,true);assert.equal(result.ready,true);assert.equal(result.decision,expected);
    assert.deepEqual(Object.keys(result).sort(),['decision','ready','reasonCode','synthetic']);
  }
  assert.equal(await runDecisionCheck('unknown'),null);
});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(x){this.body=x;return this;}});
test('public operations endpoint coalesces concurrent checks and refuses arbitrary query and write inputs',async()=>{
  let calls=0,release;const wait=new Promise(resolve=>release=resolve);
  const handler=createChecksHandler({config,env:()=>({VERCEL_GIT_COMMIT_SHA:commit}),collect:async()=>{calls++;await wait;return{fixture:true};}});
  const a=response(),b=response();const first=handler({method:'GET',query:{}},a),second=handler({method:'GET',query:{}},b);
  assert.equal(calls,1);release();await Promise.all([first,second]);assert.equal(a.code,200);assert.equal(b.code,200);
  for(const req of[{method:'POST',query:{}},{method:'GET',query:{events:'arbitrary'}},{method:'GET',query:{case:'s06-registered',role:'teacher'}}]){
    const res=response();await handler(req,res);assert.ok([400,405].includes(res.code));assert.deepEqual(Object.keys(res.body),['error']);
  }
});
test('stage12 published identity still binds protected routes, policy recovery and the original issuer',()=>{
  const result=deploymentIdentity({VERCEL_GIT_PROVIDER:'github',VERCEL_GIT_REPO_OWNER:'student',VERCEL_GIT_REPO_SLUG:'practice',
    VERCEL_GIT_COMMIT_SHA:commit,VERCEL_URL:'practice.vercel.app'},config);
  assert.equal(result.step,12);assert.deepEqual(result.allowedRoutes,config.allowedRoutes);
  assert.equal(result.restoreRoute,config.restoreRoute);assert.equal(result.judgeIssuer,config.judgeIssuer);
});

test('server-rendered root displays the same real report without script execution and rejects fabricated counts',async()=>{
 const{renderOperations}=await import('../src/render-operations.mjs');const{send}=backend();
 const report=await collectOperationsReport({config,send,commit,readPolicyBackup:async()=>policy});
 const template=await readFile(new URL('../views/index.html',import.meta.url),'utf8');
 const html=renderOperations(template,report);assert.ok(html.includes('<dd id="ops-total">14</dd>'));
 assert.ok(html.includes('<dd id="ops-not-run" data-k="notRun">6</dd>'));assert.ok(html.includes('fixture_request_2'));
 assert.equal((html.match(/<tbody id="ops-rows">[\s\S]*?<\/tbody>/u)[0].match(/<tr>/gu)||[]).length,20);
 const bad=structuredClone(report);bad.counts.executed=41;assert.throws(()=>renderOperations(template,bad));
 const payload=structuredClone(report);payload.rows[0].path='</script><img src=x>';
 const escaped=renderOperations(template,sealOperationRecord(payload));assert.ok(!escaped.includes('</script><img src=x>'));
 assert.ok(escaped.includes('&lt;/script&gt;'));assert.ok(escaped.includes('\\u003c/script>'));
});

test('receipt-array API matches the full table, preserves unrun rows and rejects incomplete success',async()=>{
 const{send}=backend();const report=await collectOperationsReport({config,send,commit,readPolicyBackup:async()=>policy});
 const handler=createChecksHandler({config,collect:async()=>report,env:()=>({VERCEL_GIT_COMMIT_SHA:commit})});
 const res=response();await handler({method:'GET',query:{case:'s12-requests'}},res);
 assert.equal(res.code,200);assert.equal(res.body.length,20);assert.equal(res.body.filter(r=>r.status!==null).length,14);assert.ok(res.body.filter(r=>r.status!==null).every(r=>r.requestId&&r.checkedAt));
 const bad=createChecksHandler({config,collect:async()=>({...report,ready:false})});const failed=response();
 await bad({method:'GET',query:{case:'s12-requests'}},failed);assert.equal(failed.code,503);assert.deepEqual(Object.keys(failed.body),['error']);
});

 test('official sample summary and visible data-k metrics use the same real check results',async()=>{
 const{renderOperations}=await import('../src/render-operations.mjs');const{send}=backend();
 const report=await collectOperationsReport({config,send,commit,readPolicyBackup:async()=>policy});
 assert.deepEqual([report.total,report.blocked,report.failed,report.notRun],[20,14,0,6]);
 assert.equal(report.total,report.blocked+report.failed+report.notRun);
 assert.equal(report.counts.denied,7);
 const html=renderOperations(await readFile(new URL('../views/index.html',import.meta.url),'utf8'),report);
 for(const[k,v]of Object.entries({total:20,blocked:14,failed:0,notRun:6}))assert.ok(html.includes(`data-k="${k}">${v}</dd>`));
 const bad=structuredClone(report);bad.blocked=99;assert.throws(()=>renderOperations('',bad));
 });

function memoryStore(){let saved=null;return{read:async()=>saved&&structuredClone(saved),insert:async report=>{saved??=structuredClone(report);}};}
test('independent API and HTML handlers repeatedly read identical confirmed IDs, times, hash and summary',async()=>{
 const store=memoryStore();let runs=0;const collect=async()=>{runs++;return collectOperationsReport({config,send:backend().send,commit,readPolicyBackup:async()=>policy});};
 const read=()=>readOperationsReport({config,commit,store,collect});
 const api=createChecksHandler({config,collect:read,env:()=>({VERCEL_GIT_COMMIT_SHA:commit})});
 const first=response();await api({method:'GET',query:{}},first);
 const independent=createChecksHandler({config,collect:read,env:()=>({VERCEL_GIT_COMMIT_SHA:commit})});
 const second=response();await independent({method:'GET',query:{}},second);
 const home=createHome({collect:read,env:()=>({VERCEL_GIT_COMMIT_SHA:commit})});
 const html={...response(),send(value){this.html=value;return this;}};await home({method:'GET'},html);
 const embedded=JSON.parse(html.html.match(/id="ops-record">([\s\S]*?)<\/script>/u)[1]);
 assert.equal(runs,1);assert.deepEqual(first.body,second.body);assert.deepEqual(first.body,embedded);
 assert.equal(first.body.blocked,first.body.counts.blocked);assert.equal(first.body.counts.denied,7);
 assert.deepEqual(first.body.attackAttempts,await runAttackChecks(config,{send:backend().send}));
 assert.ok(first.body.attackAttempts.every(a=>Object.keys(a).sort().join(',')==='attackId,expected,observed'));
});
test('concurrent workers return the winning immutable database record rather than their own rejected candidate',async()=>{
 const store=memoryStore();let arrive=0,release;const barrier=new Promise(resolve=>release=resolve);
 const collect=async()=>{const report=await collectOperationsReport({config,send:backend().send,commit,readPolicyBackup:async()=>policy});
 const candidate=sealOperationRecord({...report,checkedAt:arrive===0?'2026-10-13T01:00:00Z':'2026-10-13T01:01:00Z'});
 if(++arrive===2)release();await barrier;return candidate;};
 const[a,b]=await Promise.all([readOperationsReport({config,commit,store,collect}),readOperationsReport({config,commit,store,collect})]);
 assert.equal(arrive,2);assert.deepEqual(a,b);assert.deepEqual(a,await store.read(commit));
});
test('record tampering, private fields and unavailable storage fail closed without fallback counters',async()=>{
 const report=await collectOperationsReport({config,send:backend().send,commit,readPolicyBackup:async()=>policy});
 const changed=structuredClone(report);changed.rows[0].requestId='different';assert.throws(()=>assertOperationRecord(changed),/operation_hash_mismatch/u);
 const privateData=structuredClone(report);privateData.rows[0].body='fictional-private-response';assert.throws(()=>sealOperationRecord(privateData));
 let runs=0;await assert.rejects(readOperationsReport({config,commit,store:{read:async()=>{throw Error('unavailable');}},collect:async()=>{runs++;return report;}}));assert.equal(runs,0);
});
test('REST store only reads and insert-if-absent, scopes the table and never returns upstream errors or key values',async()=>{
 let saved,requests=[];const fakeKey='sb_'+'secret_'+'fixture-not-real';const env=()=>({SUPABASE_URL:config.database.url,SUPABASE_SECRET_KEY:fakeKey});
 const send=async(target,options)=>{const url=new URL(target);requests.push({path:url.pathname,method:options.method??'GET',prefer:options.headers.Prefer});
 if(options.method==='POST'){const candidate=JSON.parse(options.body);saved??=candidate;return new Response(null,{status:201});}
 return new Response(JSON.stringify(saved?[{report:saved.report}]:[]));};
 const store=createOperationStore({config,env,send});assert.equal(await store.read(commit),null);
 const record=await collectOperationsReport({config,send:backend().send,commit,readPolicyBackup:async()=>policy});
 await store.insert(record);const loser=sealOperationRecord({...record,checkedAt:'2026-10-13T02:00:00Z'});await store.insert(loser);
 assert.deepEqual(await store.read(commit),record);assert.ok(requests.every(r=>r.path==='/rest/v1/aleph_operations_reports'));
 assert.ok(requests.filter(r=>r.method==='POST').every(r=>r.prefer==='resolution=ignore-duplicates,return=minimal'));
 const bad=createOperationStore({config,env,send:async()=>new Response('fictional-private-upstream-error',{status:403})});
 await assert.rejects(bad.read(commit),error=>error.message==='operation_store_unavailable'&&!error.message.includes(fakeKey));
});
