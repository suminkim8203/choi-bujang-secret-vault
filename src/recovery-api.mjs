import { createHash } from 'node:crypto';
import {readFile} from 'node:fs/promises';
import { createLoginVerifier } from './verify-login.mjs';
import {verifyNoteRestorePlan,SAFE_POLICY_REVISION} from './policy-recovery.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export function noteContentHash(title, content) {
  if (typeof title !== 'string' || typeof content !== 'string') throw Error('invalid_backup');
  return createHash('sha256').update(`${Buffer.byteLength(title,'utf8')}:${title}:${Buffer.byteLength(content,'utf8')}:${content}`).digest('hex');
}
function databaseConfig(env,config) {
  const base = new URL(env.SUPABASE_URL);
  if (base.origin !== config.database?.url || base.protocol !== 'https:'
    || !/^[a-z0-9-]+\.supabase\.co$/u.test(base.hostname) || base.pathname !== '/'
    || base.username || base.password || base.port || base.search || base.hash
    || config.database.table !== 'aleph_defense_notes'
    || typeof env.SUPABASE_SECRET_KEY !== 'string' || !env.SUPABASE_SECRET_KEY.startsWith('sb_secret_')
    || env.SUPABASE_SECRET_KEY.length<24) throw Error('invalid_recovery_config');
  return { base, key:env.SUPABASE_SECRET_KEY };
}
export function createRecoveryHandler({ config, env=()=>process.env, send=(...args)=>fetch(...args), verify,
  readPolicyBackup=()=>readFile(new URL('../recovery/policy-v9.json',import.meta.url),'utf8') }={}) {
  let verifier;
  return async function handler(request,response) {
    response.setHeader('Cache-Control','no-store'); response.setHeader('X-Content-Type-Options','nosniff');
    const fail = status=>response.status(status).json({error:status===401?'login_required':status===404?'verified_backup_not_found':status===400?'invalid_restore_request':status===405?'method_not_allowed':'restore_unavailable'});
    const authorization=request.headers?.authorization;
    if(typeof authorization!=='string'||!authorization.startsWith('Bearer ')) return fail(401);
    try {
      const current=env(),db=databaseConfig(current,config);
      verifier ??= verify ?? createLoginVerifier({config,supabaseSecretKey:db.key});
      const identity=await verifier(authorization);
      if(!identity||!UUID.test(identity.userId??'')) return fail(401);
      // Operator-issued fixture identities are limited to B for this stage's recovery test.
      if(identity.kind==='judge'&&identity.identity!=='b') return fail(404);
      if(!['GET','POST'].includes(request.method)){response.setHeader('Allow','GET, POST');return fail(405);}
      const query=request.query??{},body=request.body;
      if(Object.keys(query).join(',')!=='noteId'||typeof query.noteId!=='string'||!UUID.test(query.noteId)
        ||(body!==undefined&&body!==null&&body!==''
          &&(typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)))return fail(400);
      const owner=identity.userId.toLowerCase(),id=query.noteId.toLowerCase();
      // Re-read the pinned pre-incident policy before any private DB access or restoration.
      // Missing/corrupt/wrong-revision/multi-note/widened-route plans cannot reach the RPC.
      const plan=verifyNoteRestorePlan({backupText:await readPolicyBackup(),expectedPolicyRevision:SAFE_POLICY_REVISION,
        scope:{service:'notes',noteIds:[id]},currentRoutes:config.allowedRoutes});
      const backupURL=new URL('/rest/v1/aleph_note_backups',db.base);
      backupURL.searchParams.set('id',`eq.${id}`);backupURL.searchParams.set('owner_id',`eq.${owner}`);
      backupURL.searchParams.set('select','id,owner_id,title,content,created_at,content_hash,version');backupURL.searchParams.set('limit','2');
      const options={headers:{apikey:db.key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)};
      const read=await send(backupURL,options);if(!read.ok)return fail(503);
      const rows=await read.json();if(!Array.isArray(rows))return fail(503);if(rows.length===0)return fail(404);
      const b=rows[0];
      if(rows.length!==1||b.id!==id||typeof b.owner_id!=='string'||b.owner_id.toLowerCase()!==owner
        ||b.version!=='note-v1'||typeof b.created_at!=='string'||!Number.isFinite(Date.parse(b.created_at))
        ||b.content_hash!==noteContentHash(b.title,b.content))return fail(503);
      if(request.method==='GET')return response.status(200).json({id,version:b.version,
        contentHash:b.content_hash,ownerMatched:true,backupVerified:plan.backupVerified,
        policyRevision:plan.policyRevision,scopeCount:plan.scopeCount,fields:['title','content','created_at']});
      const auditURL=new URL('/rest/v1/aleph_recovery_audit',db.base);
      auditURL.searchParams.set('note_id',`eq.${id}`);auditURL.searchParams.set('select','audit_id');
      auditURL.searchParams.set('order','audit_id.asc');auditURL.searchParams.set('limit','1000');
      async function auditIds(){const r=await send(auditURL,options);if(!r.ok)throw Error('audit_unavailable');
        const rows=await r.json();if(!Array.isArray(rows)||rows.length>=1000
          ||rows.some(row=>!Number.isSafeInteger(row.audit_id)))throw Error('audit_unavailable');
        return rows.map(row=>row.audit_id);}
      const before=await auditIds();
      const restored=await send(new URL('/rest/v1/rpc/aleph_restore_note',db.base),{
        ...options,method:'POST',headers:{...options.headers,'Content-Type':'application/json'},
        body:JSON.stringify({p_id:id,p_owner:owner})});
      if(!restored.ok){let code;try{code=(await restored.json())?.code;}catch{}
        return fail(['P0002','42501'].includes(code)?404:503);}
      const result=await restored.json();
      if(result?.id!==id||result.restored!==true||result.ownerMatched!==true||result.contentHash!==b.content_hash)return fail(503);
      const after=await auditIds();
      if(after.length<=before.length||!before.every(value=>after.includes(value)))return fail(503);
      // Return the verification summary only, never backup text, owner ID or DB diagnostics.
      return response.status(200).json({id,restored:true,contentHash:b.content_hash,ownerMatched:true,auditPreserved:true,
        backupVerified:plan.backupVerified,policyRevision:plan.policyRevision,scopeCount:plan.scopeCount});
    }catch{return fail(503);}
  };
}
