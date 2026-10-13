import {createHash} from 'node:crypto';
const sha=/^[a-f0-9]{40}$/u;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const digest=report=>createHash('sha256').update(JSON.stringify(stable(report))).digest('hex');
const secrets=/sb_secret_[A-Za-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]{16,}|\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const privateKeys=value=>value&&typeof value==='object'&&Object.entries(value).some(([key,item])=>
  /^(?:token|password|apikey|authorization|owner_id|email|srcip|userId|title|body|content)$/iu.test(key)||privateKeys(item));
export function assertOperationRecord(report,commit=report?.commit){
  if(!sha.test(commit??'')||report?.schema!=='aleph.operations.report.v1'||report.commit!==commit
    ||report.recordId!==commit||report.source!=='student_actual_self_check'||report.complete!==true||report.ready!==true
    ||!Number.isFinite(Date.parse(report.checkedAt))||!Array.isArray(report.rows)||report.rows.length<1||report.rows.length>20
    ||!Array.isArray(report.attackAttempts)||report.attackAttempts.length!==report.rows.length)throw Error('invalid_operation_record');
  const allowed=new Set(['schema','checkedAt','commit','recordId','recordHash','source','complete','ready','total','blocked','failed','notRun',
    'counts','rules','detection','revocation','ownerVerification','recovery','assault41','rows','attackAttempts']);
  if(Object.keys(report).some(k=>!allowed.has(k))||privateKeys(report)||secrets.test(JSON.stringify(report))
    ||JSON.stringify(report).length>100000)throw Error('invalid_operation_record');
  const executed=report.rows.filter(r=>r.status!==null),notRun=report.rows.filter(r=>r.result==='not_run');
  const blocked=report.rows.filter(r=>r.result==='blocked'),failed=report.rows.filter(r=>r.result==='breached');
  const denied=blocked.filter(r=>[401,403,404].includes(r.status));
  const expected={total:report.rows.length,executed:executed.length,blocked:blocked.length,denied:denied.length,
    matched:blocked.length,failed:failed.length,notRun:notRun.length};
  if(JSON.stringify(stable(report.counts))!==JSON.stringify(stable(expected))||report.total!==expected.total
    ||report.blocked!==expected.blocked||report.failed!==expected.failed||report.notRun!==expected.notRun
    ||expected.failed!==0||expected.total!==expected.blocked+expected.notRun)throw Error('operation_counts_mismatch');
  const rowKeys=new Set(['attackId','requestId','checkedAt','method','path','caseId','status','stages','expectedStatus','source','result']);
  const ids=new Set();
  for(let i=0;i<report.rows.length;i++){
    const row=report.rows[i],attempt=report.attackAttempts[i];
    if(Object.keys(row).some(k=>!rowKeys.has(k))||!/^[-a-z0-9_.]{1,80}$/u.test(row.attackId??'')||ids.has(row.attackId)
      ||Object.keys(attempt).sort().join(',')!=='attackId,expected,observed'||attempt.attackId!==row.attackId
      ||typeof attempt.expected!=='string'||attempt.expected.length>300||typeof row.path!=='string'||row.path.length>160
      ||!Array.isArray(row.stages)||!Array.isArray(row.expectedStatus))throw Error('invalid_operation_record');
    ids.add(row.attackId);
    if(row.result==='not_run'){
      if(attempt.observed!=='not_run'||row.status!==null||row.requestId!==null||row.checkedAt!==null)throw Error('invalid_unrun_record');
    }else{
      const observed=/^HTTP (\d{3})(?:; jsonReady=(true|false))?$/u.exec(attempt.observed);
      if(row.result!=='blocked'||!observed||Number(observed[1])!==row.status||!row.expectedStatus.includes(row.status)
        ||typeof row.requestId!=='string'||row.requestId.length>200||!Number.isFinite(Date.parse(row.checkedAt)))throw Error('invalid_http_record');
    }
  }
  const {recordHash,...body}=report;
  if(!/^[a-f0-9]{64}$/u.test(recordHash??'')||digest(body)!==recordHash)throw Error('operation_hash_mismatch');
  return report;
}
export function sealOperationRecord(report){
  const {recordHash:previousHash,recordId:previousId,...data}=report;
  const body={...data,recordId:report.commit};
  const record={...body,recordHash:digest(body)};
  return assertOperationRecord(record);
}
