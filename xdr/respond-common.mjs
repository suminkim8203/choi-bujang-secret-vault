import{isIP}from'node:net';import{readFile,writeFile,appendFile}from'node:fs/promises';
const modules=['known-cve','persistence','privilege','exfiltration'];
export function buildResponse(fixture,result,{ttlSeconds=900}={}){
  if(!modules.includes(fixture?.moduleKey)||fixture.schema!=='aleph.xdr.fixture.v1'||result?.schema!=='aleph.xdr.result.v1'
    ||fixture.moduleKey!==result.moduleKey||!Array.isArray(fixture.alerts)||fixture.alerts.length!==result.decisions?.length
    ||!Number.isInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>900)throw Error('XDR_RESPONSE_INVALID');
  const rules=[],alerts=[],seen=new Set();
  for(let i=0;i<fixture.alerts.length;i++){
    const a=fixture.alerts[i],d=result.decisions[i];
    if(!/^[a-z0-9_-]{1,64}$/iu.test(a.id??'')||seen.has(a.id)||d.alertId!==a.id
      ||!Number.isFinite(d.confidence)||d.confidence<0||d.confidence>1
      ||d.action!==(d.confidence>=0.85?'block':d.confidence>=0.5?'alert':'record'))throw Error('XDR_RESPONSE_INVALID');
    seen.add(a.id);
    if(d.action==='record')continue;
    const at=Date.parse(a.timestamp);if(!Number.isFinite(at))throw Error('XDR_TIME_INVALID');
    if(d.action==='alert')alerts.push({moduleKey:fixture.moduleKey,alertId:a.id,observedAt:new Date(at).toISOString(),action:'alert'});
    else{
      if(!isIP(a.data?.srcip??''))throw Error('XDR_SOURCE_INVALID');
      const targetKind=fixture.moduleKey==='privilege'?'account':fixture.moduleKey==='persistence'?'agentName':fixture.moduleKey==='exfiltration'?'destination':'sourceAddress';
      const targetValue=targetKind==='account'?a.data.srcuser:targetKind==='agentName'?a.agent?.name:targetKind==='destination'?a.data.dstip:a.data.srcip;
      if(typeof targetValue!=='string'||(targetKind==='destination'&&!isIP(targetValue))
        ||(['account','agentName'].includes(targetKind)&&!/^[a-zA-Z0-9_.-]{1,64}$/u.test(targetValue)))throw Error('XDR_TARGET_INVALID');
      rules.push({id:`xdr.${fixture.moduleKey}.${a.id}`,moduleKey:fixture.moduleKey,alertId:a.id,targetKind,targetValue,sourceAddress:a.data.srcip,
        observedAt:new Date(at).toISOString(),expiresAt:new Date(at+ttlSeconds*1000).toISOString()});
    }
  }
  return{rules,alerts,engineConnected:false};
}
// An offline deny overlay only. Existing decisions and unrelated sources stay intact.
export function overlay(base,verifiedContext,rules,at){
  if(base!=='allow'||!verifiedContext||typeof verifiedContext!=='object'||!Array.isArray(rules)||!Number.isFinite(at))return base;
  return rules.some(r=>['account','agentName','destination','sourceAddress'].includes(r.targetKind)&&r.targetValue===verifiedContext[r.targetKind]
    &&at>=Date.parse(r.observedAt)&&at<Date.parse(r.expiresAt)&&Date.parse(r.expiresAt)-Date.parse(r.observedAt)<=900000)?'deny':base;
}
export async function respond(moduleKey){
  if(!modules.includes(moduleKey))throw Error('XDR_MODULE_INVALID');
  const fixture=JSON.parse(await readFile(new URL(`fixtures/${moduleKey}.json`,import.meta.url),'utf8'));
  const result=JSON.parse(await readFile(new URL(`${moduleKey}/result.json`,import.meta.url),'utf8'));
  const response=buildResponse(fixture,result);
  await writeFile(new URL(`${moduleKey}/deny-rules.json`,import.meta.url),JSON.stringify({schema:'aleph.student.xdr.overlay.v1',...response},null,2)+'\n');
  // Append only derived alert metadata. Do not print or copy raw events, users or credentials.
  const log=new URL('alerts.log',import.meta.url);let prior='';try{prior=await readFile(log,'utf8');}catch{}
  const additions=response.alerts.map(a=>JSON.stringify(a)).filter(line=>!prior.split('\n').includes(line));
  if(additions.length)await appendFile(log,additions.join('\n')+'\n');
  return{moduleKey,blockRules:response.rules.length,alerts:response.alerts.length,engineConnected:false};
}
