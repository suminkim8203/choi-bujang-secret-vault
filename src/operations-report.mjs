import{runAttackChecks}from'./attack-check.mjs';import{RULE_IDS}from'./decider.mjs';
import{verifiedPolicyBackup}from'./policy-recovery.mjs';import{readFile}from'node:fs/promises';
const expected=row=>row.path.startsWith('/rest/v1/')?[401,403]:row.path.startsWith('/api/restore/')||row.path.startsWith('/api/notes')
  ||row.path.startsWith('/api/my/')||row.path.startsWith('/api/announcements/')?[401]:[200];
const stages=row=>row.caseId?[Number(row.caseId.slice(1,3))]:row.path==='/data.json'?[1,2]:
  row.path.startsWith('/api/restore/')||row.path.includes('aleph_note_backups')?[10]:
    row.path==='/manifest.json'||row.path==='/api/device/status'?[11]:row.path.startsWith('/rest/v1/')?[2,4,5]:[3,4,5,8];
export async function collectOperationsReport({config,send=globalThis.fetch,commit,
  readPolicyBackup=()=>readFile(new URL('../recovery/policy-v9.json',import.meta.url),'utf8')}={}){
  if(!/^[a-f0-9]{40}$/iu.test(commit??''))throw Error('check_commit_unavailable');
  const manifest=await send(new URL('/aleph.json',config.publicAppUrl),{redirect:'error',signal:AbortSignal.timeout(10000)});
  const identity=await manifest.json();
  if(!manifest.ok||identity.commit!==commit||identity.step!==config.step)throw Error('check_deployment_mismatch');
  const rows=[];let complete=true;
  try{await runAttackChecks(config,{send,onResponse:row=>rows.push({...row,stages:stages(row),expectedStatus:expected(row),
    source:row.caseId?'fixed_synthetic_api':'anonymous_api',result:expected(row).includes(row.status)?'matched':'mismatch'}),
    onSkip:row=>rows.push({...row,stages:stages(row),expectedStatus:expected(row),source:'write_not_run',result:'not_run'})});}
  catch{complete=false;if(rows.length)rows[rows.length-1].result='mismatch';}
  // No raw response, owner, username, note text, token or source address leaves this report.
  const count=rows.filter(r=>r.status!==null).length,blocked=rows.filter(r=>r.result==='matched'&&[401,403].includes(r.status)).length;
  const failed=rows.filter(r=>r.result==='mismatch').length;
  for(let i=rows.length;i<20;i++)rows.push({requestId:null,checkedAt:null,method:null,path:'remaining_check',
    stages:[],caseId:null,status:null,expectedStatus:[],source:'not_attempted_after_failure',result:'not_run'});
  let backup;try{backup=verifiedPolicyBackup(await readPolicyBackup());}catch{}
  return{schema:'aleph.operations.report.v1',checkedAt:new Date().toISOString(),commit,
    source:'student_actual_self_check',complete,ready:complete&&failed===0,
    counts:{total:rows.length,executed:count,blocked,matched:rows.filter(r=>r.result==='matched').length,
      failed,notRun:rows.filter(r=>r.result==='not_run').length},
    rules:[...RULE_IDS],detection:{source:'fixed_synthetic_api',cases:rows.filter(r=>r.caseId?.startsWith('s09-')).length},
    revocation:{status:'not_connected',executed:false},
    ownerVerification:{list:'not_run',noteRestore:'not_run',includedInRepresentativeCounts:false},
    recovery:{policyRevision:backup?.policyRevision??null,policyBackupVerified:!!backup,noteRestoreInThisRun:false},
    assault41:{total:41,localExecuted:0,localNotRun:41,judgeResult:'see_official_portal'},rows};
}
