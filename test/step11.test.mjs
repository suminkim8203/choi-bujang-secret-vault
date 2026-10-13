import{test}from'node:test';import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';import vm from'node:vm';
import{createDeviceHandler}from'../src/device-status.mjs';
import{isDeviceApproved}from'../public/device-gate.js';
import{deploymentIdentity}from'../scripts/deployment-identity.mjs';
const config=JSON.parse(await readFile(new URL('../aleph.config.json',import.meta.url),'utf8'));
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(x){this.body=x;return this;}});
const identity={kind:'student',userId:'00000000-0000-4000-8000-000000000001'};
const req=method=>({method,headers:{authorization:'Bearer fixture-only'},query:{}});
test('without an operator registration adapter or session the server never approves',async()=>{
  const run=createDeviceHandler({config,verify:async()=>identity});
  for(const request of[{method:'GET',headers:{}},req('GET')]){
    const res=response();await run(request,res);assert.equal(res.code,200);assert.equal(res.body.approved,false);
    assert.deepEqual(Object.keys(res.body).sort(),['approved','reason']);assert.equal(res.headers['Cache-Control'],'no-store');
  }
  const res=response();await run({...req('GET'),headers:{authorization:'Bearer fixture-only','x-device-approved':'true'}},res);
  assert.equal(res.body.approved,false);
});
test('registration requests stay pending and cannot grant permission or accept browser identity fields',async()=>{
  let requested=0;const run=createDeviceHandler({config,action:'request',verify:async()=>identity,
    requestRegistration:async()=>{requested++;return{accepted:true};}});
  const pending=response();await run(req('POST'),pending);assert.equal(pending.code,202);assert.equal(pending.body.approved,false);
  for(const body of[{approved:true},{deviceRegistered:true},true,[]]){
    const res=response();await run({...req('POST'),body},res);assert.equal(res.code,400);
  }
  assert.equal(requested,1);
  const unavailable=response();await createDeviceHandler({config,action:'request',verify:async()=>identity})(req('POST'),unavailable);
  assert.equal(unavailable.code,503);
});
test('approved status requires a true result from a server adapter after login verification',async()=>{
  for(const result of[false,'true',{},true]){
    const res=response();await createDeviceHandler({config,verify:async()=>identity,
      verifyRegisteredDevice:async({identity:verified})=>{assert.equal(verified,identity);return result;}})(req('GET'),res);
    assert.equal(isDeviceApproved(res.code,res.body),result===true);
  }
  for(const [status,body]of[[503,{approved:true,reason:'device_registered'}],[200,{approved:'true',reason:'device_registered'}],
    [200,{approved:true,reason:'approval_pending'}],[200,{approved:false,reason:'device_registered'}]])assert.equal(isDeviceApproved(status,body),false);
});
test('actual app code never reads notes before server approval; approved fixture keeps the existing list flow',async()=>{
  const source=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace("import{isDeviceApproved}from'./device-gate.js';",'');
  for(const approved of[false,true]){
    const nodes=new Map(),calls=[];const element=()=>({hidden:false,textContent:'',disabled:false,value:'',elements:{email:{value:''},password:{value:''}},
      reset(){},addEventListener(){},replaceChildren(){},append(){}});
    const document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);},createElement:element};
    const session={access_token:'fixture-only-not-a-token',user:{id:identity.userId}};
    const context=vm.createContext({document,isDeviceApproved,setTimeout,window:{addEventListener(){},supabase:{createClient(_url,_key,options){
      assert.equal(options.auth.persistSession,false);return{auth:{onAuthStateChange(){},getSession:async()=>({data:{session},error:null})}};}}},
      navigator:{},fetch:async path=>{calls.push(path);return{ok:true,status:200,json:async()=>
        path==='/database.json'?{url:config.database.url,publishableKey:'public-fixture'}:
          path==='/api/device/status'?{approved,reason:approved?'device_registered':'device_not_registered'}:[]};}});
    await vm.runInContext(`(async()=>{${source}\n})()`,context);
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(calls.includes('/api/my/notes'),approved);assert.equal(nodes.get('#workspace').hidden,!approved);
  }
});
test('offline cache excludes private routes; browser SDK instances persist no tokens',async()=>{
  const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
  assert.match(sw,/cache\.add\('\/offline\.html'\)/u);assert.doesNotMatch(sw,/cache\.(?:put|addAll)\(/u);
  for(const file of['app.js','verify-access.js','verify-recovery.js']){
    const source=await readFile(new URL(`../public/${file}`,import.meta.url),'utf8');
    assert.match(source,/persistSession:\s*false/u);assert.doesNotMatch(source,/\b(?:localStorage|sessionStorage|indexedDB)\b/u);
  }
  const manifest=JSON.parse(await readFile(new URL('../public/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.start_url,'/');assert.equal(manifest.display,'standalone');assert.ok(manifest.icons.length);
});
test('stage11 deployment retains the original API, recovery route, issuer and notes zones',()=>{
  const env={VERCEL_GIT_PROVIDER:'github',VERCEL_GIT_REPO_OWNER:'student',VERCEL_GIT_REPO_SLUG:'practice',
    VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),VERCEL_URL:'practice.vercel.app'};
  const result=deploymentIdentity(env,{...config,step:11});assert.equal(result.step,11);assert.equal(result.restoreRoute,'/api/restore/:noteId');
  assert.deepEqual(result.allowedRoutes,config.allowedRoutes);assert.equal(result.judgeIssuer,config.judgeIssuer);
});
