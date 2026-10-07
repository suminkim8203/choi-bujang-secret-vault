import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDenyRules, matchingDenyRules, withXdrGate } from '../xdr/ztna-gate.mjs';
import { decide as starterDecide } from '../src/decider.mjs';

const at = Date.parse('2026-09-27T00:00:00Z');
const alerts = [{ id:'test-attack', timestamp:new Date(at).toISOString(),data:{srcip:'192.0.2.1'} },
  { id:'test-review',timestamp:new Date(at).toISOString(),data:{srcip:'192.0.2.2'} }];
const result = { schema:'aleph.xdr.result.v1',moduleKey:'brute-force',decisions:[
  { alertId:'test-attack',action:'block',confidence:0.95 },
  { alertId:'test-review',action:'alert',confidence:0.5 },
] };
const rules = buildDenyRules(alerts,result);
// This allow response and deny reason are test-only, not a registered live policy.
const request = { requestId:'test-request' };
const allow = { schema:'aleph.decision.v1',requestId:request.requestId,decision:'allow',reasonCode:'approved',ruleIds:['test.baseline'] };
const deny = (req,ids) => ({schema:'aleph.decision.v1',requestId:req.requestId,decision:'deny',reasonCode:'test_xdr_deny',ruleIds:ids});

test('only block candidates produce rules with source alert and bounded expiry', () => {
  assert.equal(rules.length,1);
  assert.equal(rules[0].alertId,'test-attack');
  assert.equal(Date.parse(rules[0].expiresAt)-at,900000);
  assert.equal(matchingDenyRules('192.0.2.1',rules,at).length,1);
  assert.equal(matchingDenyRules('192.0.2.2',rules,at).length,0);
  assert.equal(matchingDenyRules('192.0.2.1',rules,at-1).length,0);
  assert.equal(matchingDenyRules('192.0.2.1',rules,at+900000).length,0);
});

test('invalid result alignment, duplicates, weak block and missing address are rejected', () => {
  assert.throws(()=>buildDenyRules(alerts,{...result,decisions:result.decisions.slice(0,1)}));
  assert.throws(()=>buildDenyRules(alerts,{...result,decisions:[{...result.decisions[0],confidence:0.7},result.decisions[1]]}));
  assert.throws(()=>buildDenyRules([{...alerts[0],data:{}},alerts[1]],result));
  assert.throws(()=>buildDenyRules(alerts,result,{ttlSeconds:901}));
});

test('overlay denies an attack at replay time while preserving other sources and expired-rule baseline', async () => {
  const original = structuredClone(request);
  let source='192.0.2.1';
  let clock=at;
  const decide=withXdrGate({baseDecide:async()=>allow,verifiedSourceFor:async()=>source,
    rules,makeDeny:deny,now:()=>clock});
  assert.equal((await decide(request)).decision,'deny');
  source='192.0.2.2';
  assert.deepEqual(await decide(request),allow);
  source='192.0.2.1';clock=at+900000;
  assert.deepEqual(await decide(request),allow);
  assert.deepEqual(request,original);
});

test('actual starter denial is preserved and is never reported as a normal allow', async () => {
  let sourceCalls=0;
  const decide=withXdrGate({baseDecide:starterDecide,verifiedSourceFor:async()=>{sourceCalls++;return '192.0.2.1';},
    rules,makeDeny:deny,now:()=>at});
  assert.deepEqual(await decide(request),await starterDecide(request));
  assert.equal(sourceCalls,0);
});

test('engine adapter cannot start without verified-source and registered-deny callbacks', async () => {
  assert.throws(()=>withXdrGate({baseDecide:starterDecide,rules}),{message:'XDR_ENGINE_ADAPTER_REQUIRED'});
  const decide=withXdrGate({baseDecide:async()=>allow,verifiedSourceFor:async()=> '192.0.2.1',rules,
    makeDeny:async()=>({...allow,decision:'deny',extra:'bad'}),now:()=>at});
  await assert.rejects(()=>decide(request),{message:'XDR_ENGINE_DENY_RESPONSE_INVALID'});
});
