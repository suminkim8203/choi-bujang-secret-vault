import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{collectOperationsReport}from'../src/operations-report.mjs';import{createChecksHandler}from'../api/checks.js';
import{runDecisionCheck}from'../src/decision-check.mjs';import{runDetectionCheck}from'../src/detection-check.mjs';
import{deploymentIdentity}from'../scripts/deployment-identity.mjs';
import{runAttackChecks}from'../src/attack-check.mjs';
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
test('failed body validation and unmatched deployments never become successful check counts',async()=>{
  const{send}=backend({invalidAnonymousBody:true});const report=await collectOperationsReport({config,send,commit,readPolicyBackup:async()=>policy});
  assert.equal(report.complete,false);assert.equal(report.counts.executed,2);assert.equal(report.counts.notRun,18);
  assert.equal(report.counts.failed,1);assert.equal(report.counts.blocked,0);
  assert.ok(!JSON.stringify(report).includes('fixture-response-not-exported'));
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
 assert.ok(html.includes('<dd id="ops-not-run">6</dd>'));assert.ok(html.includes('fixture_request_2'));
 assert.equal((html.match(/<tbody id="ops-rows">[\s\S]*?<\/tbody>/u)[0].match(/<tr>/gu)||[]).length,20);
 const bad=structuredClone(report);bad.counts.executed=41;assert.throws(()=>renderOperations(template,bad));
 const payload=structuredClone(report);payload.rows[0].path='</script><img src=x>';
 const escaped=renderOperations(template,payload);assert.ok(!escaped.includes('</script><img src=x>'));
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
