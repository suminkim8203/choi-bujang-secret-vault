import {assertOperationRecord} from './operation-record.mjs';
import {collectOperationsReport} from './operations-report.mjs';
export function createOperationStore({config,env=()=>process.env,send=globalThis.fetch}={}){
  function target(commit){
    const current=env();let base;try{base=new URL(current.SUPABASE_URL);}catch{throw Error('operation_store_unavailable');}
    if(!/^[a-f0-9]{40}$/u.test(commit??'')||base.protocol!=='https:'||base.username||base.password||base.port
      ||base.origin!==config.database?.url||base.pathname!=='/'||base.search||base.hash
      ||typeof current.SUPABASE_SECRET_KEY!=='string'||!current.SUPABASE_SECRET_KEY.startsWith('sb_secret_')
      ||current.SUPABASE_SECRET_KEY.length<24)throw Error('operation_store_unavailable');
    const url=new URL('/rest/v1/aleph_operations_reports',base);
    return{url,headers:{apikey:current.SUPABASE_SECRET_KEY,Accept:'application/json'}};
  }
  return{
    async read(commit){
      const {url,headers}=target(commit);url.search=`?select=report&commit=eq.${commit}&limit=1`;
      try{
        const response=await send(url,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw Error();const rows=await response.json();
        if(!Array.isArray(rows)||rows.length>1)throw Error();
        return rows.length?assertOperationRecord(rows[0].report,commit):null;
      }catch{throw Error('operation_store_unavailable');}
    },
    async insert(report){
      assertOperationRecord(report);const {url,headers}=target(report.commit);
      try{
        const response=await send(url,{method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},
          body:JSON.stringify({commit:report.commit,report}),redirect:'error',signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw Error();
      }catch{throw Error('operation_store_unavailable');}
    },
  };
}
export async function readOperationsReport({config,commit,store=createOperationStore({config}),collect=collectOperationsReport}={}){
  const existing=await store.read(commit);
  if(existing)return assertOperationRecord(existing,commit);
  const proposed=assertOperationRecord(await collect({config,commit}),commit);
  await store.insert(proposed);
  // A concurrent worker may have committed first. Always return the winning
  // database record, including its original request IDs and timestamps.
  const confirmed=await store.read(commit);
  if(!confirmed)throw Error('operation_record_not_confirmed');
  return assertOperationRecord(confirmed,commit);
}
