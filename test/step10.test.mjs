import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRecoveryHandler,noteContentHash} from '../src/recovery-api.mjs';
import {previewTrialPolicy,restoreTrialPolicy,verifiedPolicyBackup} from '../src/policy-recovery.mjs';
import {deploymentIdentity} from '../scripts/deployment-identity.mjs';
import {decide} from '../src/decider.mjs';
import {fixtureRequests} from '../scripts/fixture-7.mjs';
import {detect} from '../src/detect.mjs';

const config=JSON.parse(await readFile(new URL('../aleph.config.json',import.meta.url),'utf8'));
const backupText=await readFile(new URL('../recovery/policy-v9.json',import.meta.url),'utf8');
const id='00000000-0000-4000-8000-000000000010',owner='00000000-0000-4000-8000-000000000020';
const other='00000000-0000-4000-8000-000000000030';
const backup={id,owner_id:owner,title:'fixture',content:'original disposable fixture',
  created_at:'2026-10-13T00:00:00.000Z',version:'note-v1'};
backup.content_hash=noteContentHash(backup.title,backup.content);
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(x){this.body=x;return this;}});
const request=(method='POST',body)=>({method,headers:{authorization:'Bearer test-only'},query:{noteId:id},body});
const env=()=>({SUPABASE_URL:config.database.url,SUPABASE_SECRET_KEY:'sb_'+'secret_'+'fixture_value_not_a_real_key'});
function handler({row=backup,identity={kind:'judge',identity:'b',userId:owner},rpcStatus=200,rpcResult}={}) {
  const calls=[];
  let auditReads=0;
  const run=createRecoveryHandler({config,env,verify:async()=>identity,send:async(url,options)=>{
    calls.push({url:new URL(url),options});
    if(new URL(url).pathname.endsWith('/aleph_note_backups'))return{ok:true,json:async()=>row?[row]:[]};
    if(new URL(url).pathname.endsWith('/aleph_recovery_audit')){
      auditReads++;return{ok:true,json:async()=>auditReads===1?[{audit_id:1}]:[{audit_id:1},{audit_id:2},{audit_id:3}]};
    }
    return{ok:rpcStatus===200,status:rpcStatus,json:async()=>rpcResult??{id,restored:true,ownerMatched:true,contentHash:backup.content_hash}};
  }});
  return{run,calls};
}

test('trial policy restores only verified notes fields while keeping other services and audit history',()=>{
  const trial={schema:'aleph.trial-policy.v1',services:{notes:{version:'altered',rules:[],settings:{ownerCheckRequired:false},extra:'keep'},
    announcements:{rules:['deny_student_write']}},audit:[{operation:'existing'}]};
  const before=structuredClone(trial),preview=previewTrialPolicy(trial,backupText);
  assert.equal(preview.targetService,'notes');assert.ok(preview.changes.length>0);
  const result=restoreTrialPolicy(trial,backupText,preview.expectedTrialSha256);
  assert.deepEqual(trial,before);assert.deepEqual(result.services.announcements,trial.services.announcements);
  assert.equal(result.services.notes.extra,'keep');assert.deepEqual(result.audit.slice(0,-1),trial.audit);
  assert.equal(result.services.notes.settings.ownerCheckRequired,true);
  assert.equal(previewTrialPolicy(result,backupText).changes.length,0);
});
test('missing or modified policy backup and stale previews cannot restore',()=>{
  assert.throws(()=>verifiedPolicyBackup(null));assert.throws(()=>verifiedPolicyBackup(backupText+' '));
  const trial={schema:'aleph.trial-policy.v1',services:{notes:{}},audit:[]};
  const preview=previewTrialPolicy(trial,backupText);trial.services.notes.version='newer';
  assert.throws(()=>restoreTrialPolicy(trial,backupText,preview.expectedTrialSha256));
});
test('normal and forbidden stage 6-9 decisions stay intact after the trial exercise',async()=>{
  const{normal,suspicious}=fixtureRequests();
  assert.equal((await decide(normal)).decision,'allow');
  assert.equal((await decide({...normal,deviceRegistered:false})).decision,'deny');
  assert.equal((await decide(suspicious)).decision,'step_up');
  assert.equal((await decide({...normal,subjectId:'different_fixture'})).decision,'deny');
  assert.equal((await decide({...normal,path:'/admin'})).decision,'deny');
  const events=Array.from({length:121},(_,i)=>({at:new Date(Date.UTC(2026,9,1)+i*1000).toISOString(),method:'GET',identity:{sub:'fixture'}}));
  assert.equal(detect(events).action,'propose_revocation');assert.equal(detect(events.slice(0,120)).action,'observe');
});
test('authenticated own recovery previews hash and uses server identity for a single RPC target',async()=>{
  const{run,calls}=handler();const preview=response();await run(request('GET'),preview);
  assert.equal(preview.code,200);assert.equal(preview.body.contentHash,backup.content_hash);
  assert.equal(calls.length,1);assert.equal(calls[0].url.searchParams.get('owner_id'),`eq.${owner}`);
  assert.equal(preview.body.title,undefined);assert.equal(preview.body.owner_id,undefined);
  const res=response();await run(request(),res);assert.equal(res.code,200);
  const rpc=calls.find(x=>x.url.pathname==='/rest/v1/rpc/aleph_restore_note');assert.ok(rpc);
  assert.deepEqual(JSON.parse(rpc.options.body),{p_id:id,p_owner:owner});
  assert.deepEqual(Object.keys(res.body).sort(),['auditPreserved','contentHash','id','ownerMatched','restored']);
  assert.equal(res.body.auditPreserved,true);
});
test('unverified, non-B judge, extra fields and malformed targets never invoke restoration',async()=>{
  for(const identity of[null,{kind:'judge',identity:'a',userId:owner},{kind:'student',userId:'invalid'}]){
    const{run,calls}=handler({identity});const res=response();await run(request(),res);
    assert.ok([401,404].includes(res.code));assert.equal(calls.length,0);
  }
  for(const req of[{...request(),headers:{}},{...request(),query:{noteId:[id]}},
    {...request(),query:{noteId:id,owner_id:owner}},request('POST',{owner_id:owner}),request('POST',{id:other}),request('DELETE')]){
    const{run,calls}=handler();const res=response();await run(req,res);
    assert.ok([400,401,405].includes(res.code));assert.equal(calls.length,0);assert.deepEqual(Object.keys(res.body),['error']);
  }
});
test('missing, altered or foreign-owner backups cannot modify a row or reveal content',async()=>{
  for(const row of[null,{...backup,owner_id:other},{...backup,id:other},{...backup,content:'altered'},
    {...backup,version:'unverified'},{...backup,created_at:'bad'}]){
    const{run,calls}=handler({row});const res=response();await run(request(),res);
    assert.ok([404,503].includes(res.code));assert.equal(calls.length,1);assert.deepEqual(Object.keys(res.body),['error']);
  }
});
test('DB conflicts or verification mismatch do not produce successful restore responses',async()=>{
  for(const options of[{rpcStatus:400,rpcResult:{code:'P0002'}},{rpcStatus:403,rpcResult:{code:'42501'}},
    {rpcStatus:500,rpcResult:{code:'other',message:'private database text'}},{rpcResult:{id,restored:true,ownerMatched:true,contentHash:'bad'}}]){
    const{run}=handler(options);const res=response();await run(request(),res);
    assert.ok([404,503].includes(res.code));assert.deepEqual(Object.keys(res.body),['error']);
  }
});
test('stage10 manifest declares the exact restore route and preserves preceding zones and issuer',()=>{
  const env={VERCEL_GIT_PROVIDER:'github',VERCEL_GIT_REPO_OWNER:'student',VERCEL_GIT_REPO_SLUG:'practice',
    VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),VERCEL_URL:'practice.vercel.app'};
  const result=deploymentIdentity(env,config);assert.equal(result.step,10);
  assert.equal(result.restoreRoute,'/api/restore/:noteId');assert.deepEqual(result.allowedRoutes,config.allowedRoutes);
  assert.equal(result.judgeIssuer,config.judgeIssuer);assert.equal(result.identityProvider.issuer,config.identityProvider.issuer);
  assert.throws(()=>deploymentIdentity(env,{...config,restoreRoute:'/api/restore'}));
});
