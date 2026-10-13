import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{collectOperationsReport}from'../src/operations-report.mjs';import{createChecksHandler}from'../api/checks.js';
import{runDecisionCheck}from'../src/decision-check.mjs';import{runDetectionCheck}from'../src/detection-check.mjs';
import{deploymentIdentity}from'../scripts/deployment-identity.mjs';
const config=JSON.parse(await readFile(new URL('../aleph.config.json',import.meta.url),'utf8'));
const commit='a'.repeat(40),policy=await readFile(new URL('../recovery/policy-v9.json',import.meta.url),'utf8');
function backend({invalidAnonymousBody=false,wrongCommit=false}={}){
  let count=0;const calls=[];
  const send=async(target,options={})=>{const url=new URL(target);calls.push({path:url.pathname,options});count++;
    let body,status=200;
    if(url.pathname==='/aleph.json')body={step:12,commit:wrongCommit?'b'.repeat(40):commit};
    else if(url.pathname==='/data.json')body={notes:[]};
    else if(url.pathname==='/manifest.json')body={display:'standalone',start_url:'/',name:'fixture',icons:[{}]};
    else if(url.pathname==='/api/device/status')body={approved:false,reason:'device_not_registered'};
    else if(url.pathname==='/api/checks')body=runDetectionCheck(url.searchParams.get('case'))??await runDecisionCheck(url.searchParams.get('case'));
    else if(url.pathname.startsWith('/rest/v1/')){status=401;body={code:'42501'};}
    else{status=401;body=invalidAnonymousBody?{private:'fixture-response-not-exported'}:{error:'login_required'};}
    return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','x-vercel-id':`fixture_request_${count}`}});
  };return{send,calls};
}
test('ops report counts executed HTTP observations and separately leaves owner requests and all 41 full trials unrun',async()=>{
  const{send,calls}=backend();const report=await collectOperationsReport({config,send,commit,readPolicyBackup:async()=>policy});
  assert.equal(report.complete,true);assert.equal(report.counts.executed,20);assert.equal(report.counts.notRun,2);
  assert.equal(report.rows.length,22);assert.equal(calls.length,21);assert.equal(report.counts.failed,0);
  assert.equal(report.assault41.localExecuted,0);assert.equal(report.assault41.localNotRun,41);
  assert.equal(report.revocation.executed,false);assert.equal(report.recovery.policyBackupVerified,true);
  assert.equal(report.rows.filter(r=>r.source==='fixed_synthetic_api').length,4);
  assert.ok(report.rows.slice(0,20).every(r=>r.requestId&&Number.isFinite(Date.parse(r.checkedAt))));
  assert.ok(report.rows.slice(20).every(r=>r.requestId===null&&r.status===null&&r.checkedAt===null));
  for(const key of['title','body','owner_id','token','apikey','srcip'])assert.ok(!report.rows.some(r=>Object.hasOwn(r,key)));
});
test('failed body validation and unmatched deployments never become successful check counts',async()=>{
  const{send}=backend({invalidAnonymousBody:true});const report=await collectOperationsReport({config,send,commit,readPolicyBackup:async()=>policy});
  assert.equal(report.complete,false);assert.equal(report.counts.executed,2);assert.equal(report.counts.notRun,20);
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
