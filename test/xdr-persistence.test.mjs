import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import vm from'node:vm';
import{buildResponse,overlay}from'../xdr/respond-common.mjs';
for(const key of['persistence']){
 const{decide}=await import(`../xdr/${key}/decide.mjs`);const{extractAlerts}=await import(`../xdr/${key}/read-alerts.mjs`);
 const raw=await readFile(new URL(`../xdr/fixtures/${key}.json`,import.meta.url),'utf8'),f=JSON.parse(raw);
 const source=await readFile(new URL(`../xdr/${key}/decide.mjs`,import.meta.url),'utf8');
 test(`${key}: portable one-file decisions preserve input and survive identifier/severity changes`,()=>{
  assert.ok(!/^\s*import\b/mu.test(source));assert.equal((source.match(/export function/g)||[]).length,1);
  const ctx=vm.createContext({});new vm.Script(source.replace('export function decide','function decide')+';this.run=decide;').runInContext(ctx);
  const before=JSON.stringify(f),rows=f.alerts.map(a=>decide(a));
  for(let i=0;i<f.alerts.length;i++){
   const a=f.alerts[i],r=rows[i];assert.ok(['block','alert','record'].includes(r.action));assert.ok(Number.isFinite(r.confidence)&&r.confidence>=0&&r.confidence<=1);
   assert.equal(r.action,r.confidence>=.85?'block':r.confidence>=.5?'alert':'record');assert.deepEqual(JSON.parse(JSON.stringify(ctx.run(a))),r);
   assert.equal(decide({...a,id:'random-id',timestamp:'2000-01-01T00:00:00Z',rule:{...a.rule,level:99}}).action,r.action);
  }
  assert.equal(JSON.stringify(f),before);
  const normal={id:'unseen-normal',timestamp:'2026-10-13T00:00:00Z',data:{srcip:'192.0.2.1',srcuser:'user01',dstip:'192.0.2.2'},rule:{level:99,description:'로그아웃했습니다.'}};
  assert.equal(decide(normal).action,'record');assert.notEqual(decide({}).action,'block');
 });
 test(`${key}: reader retains five fields/count and redacts suspicious input`,()=>{
  assert.equal(extractAlerts(f).length,f.alerts.length);assert.deepEqual(Object.keys(extractAlerts(f)[0]).sort(),['account','description','ruleLevel','sourceAddress','timestamp']);
  const a=structuredClone(f.alerts[0]);a.rule.description='Bearer redacted';assert.equal(extractAlerts({...f,alerts:[a]})[0].description,'[REDACTED]');
  assert.equal(decide(a).action,'alert');
 });
 test(`${key}: response overlay targets only confident blocks, expires and preserves existing denies`,()=>{
  const decisions=f.alerts.map(a=>({alertId:a.id,...decide(a)})),result={schema:'aleph.xdr.result.v1',moduleKey:key,decisions};
  const out=buildResponse(f,result);assert.equal(out.engineConnected,false);assert.equal(out.rules.length,decisions.filter(d=>d.action==='block').length);
  assert.equal(out.alerts.length,decisions.filter(d=>d.action==='alert').length);
  for(const r of out.rules){const at=Date.parse(r.observedAt),context={[r.targetKind]:r.targetValue};
   assert.equal(overlay('allow',context,[r],at),'deny');assert.equal(overlay('allow',context,[r],Date.parse(r.expiresAt)),'allow');
   assert.equal(overlay('deny',{},[r],at),'deny');assert.equal(overlay('allow',{[r.targetKind]:'unrelated'},[r],at),'allow');
  }
  const bad=structuredClone(result);bad.decisions[0].alertId='wrong';assert.throws(()=>buildResponse(f,bad));
 });
}
