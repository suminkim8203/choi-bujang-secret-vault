import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { createDecider } from '../xdr/web-injection/decision-core.mjs';
import { extractAlerts } from '../xdr/web-injection/read-alerts.mjs';
import { modelState, observe } from '../xdr/web-injection/observe.mjs';
import { matchPatterns, patternCatalog } from '../xdr/web-injection/match-patterns.mjs';
import { createWebJevAssessor } from '../xdr/web-injection/jev-client.mjs';
import { buildDenyRules, matchingDenyRules, withXdrGate } from '../xdr/web-injection/ztna-gate.mjs';
import { isDecision } from '../scripts/xdr-run.mjs';

const bytes = await readFile(new URL('../xdr/fixtures/web-injection.json', import.meta.url));
const fixture = JSON.parse(bytes);
const offline = createDecider({ assess: async () => null });
const sample = description => ({ id: 'synthetic-web', timestamp: '2026-01-01T00:00:00Z',
  rule: { level: 12, description }, data: { srcip: '192.0.2.5', count: '10' } });

test('official 26-row source stays unchanged; reader keeps five fields and redacts recognizable credentials', () => {
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), 'c1e6b7f2d226c5f85e09e026f726fdcb8fd7eff1');
  const rows = extractAlerts(fixture);
  assert.equal(rows.length, 26);
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['account','description','ruleLevel','sourceAddress','timestamp']);
  const fake = { ...fixture, alerts: [sample('password=' + 'synthetic')] };
  assert.equal(extractAlerts(fake)[0].description, '[REDACTED]');
  assert.throws(() => extractAlerts({ ...fixture, moduleKey: 'brute-force' }));
});

test('pattern catalog provides sources and independently requires repeated injection evidence', () => {
  assert.equal(patternCatalog.thresholdOrigin, 'project_policy');
  for (const pattern of patternCatalog.patterns) assert.ok(pattern.name && pattern.conditionText && pattern.evidence && pattern.sourceUrl);
  const before = sample('SQL 구문 표기가 한 주소에서 10번 들어왔습니다.');
  const copy = structuredClone(before);
  assert.deepEqual(matchPatterns(observe(before)), ['web-injection.repeated-sql']);
  assert.deepEqual(before, copy);
  assert.equal(matchPatterns(observe(sample('SQL 수업명이 한 주소에서 10번 조회되었습니다.'))).length, 0);
  assert.equal(matchPatterns(observe({ ...sample('스크립트 삽입 표기가 1건입니다.'), data: { srcip: '192.0.2.5', count:'1' } })).length, 0);
});

test('all original decisions are valid and independently reviewed ordinary browsing never blocks', async () => {
  const normals = new Set(['wi-18','wi-19','wi-20','wi-21','wi-22','wi-23','wi-24','wi-25','wi-26']);
  for (const alert of fixture.alerts) {
    const decision = await offline(alert);
    assert.equal(isDecision(decision), true);
    if (normals.has(alert.id)) assert.equal(decision.action, 'record');
  }
});

test('clear patterns and normal reads skip AI; ambiguous single input sends derived facts only', async () => {
  const states = [], classify = createDecider({ assess: async facts => { states.push(facts); return null; } });
  assert.equal((await classify(sample('SQL 구문 표기가 한 주소에서 10번 들어왔습니다.'))).action,'block');
  assert.equal((await classify({ ...sample('자료 목록을 조회했습니다.'), data: {srcip:'192.0.2.5'} })).action,'record');
  assert.equal(states.length, 0);
  assert.equal((await classify({ ...sample('주입처럼 보이는 표기가 1건입니다.'), data: {srcip:'192.0.2.5',count:'1'} })).action,'alert');
  assert.equal(states.length, 1);
  for (const field of ['sourceAddress','account','description','timestamp','url','id']) assert.equal(states[0][field], undefined);
  assert.deepEqual(states[0], modelState(observe({ ...sample('주입처럼 보이는 표기가 1건입니다.'), data: {srcip:'192.0.2.5',count:'1'} })));
});

test('malformed, contradictory and redacted alerts stay alert and never reach AI', async () => {
  let calls = 0;
  const classify = createDecider({ assess: async () => { calls++; return 1; } });
  for (const alert of [null,sample('SQL 구문 표기가 한 주소에서 20번 들어왔습니다.'),sample('token='+'synthetic')]) {
    assert.equal((await classify(alert)).action, 'alert');
  }
  assert.equal(calls, 0);
});

test('probability boundary, failure and timeout behavior preserve conservative fallback', async () => {
  const ambiguous = { ...sample('검색어에 따옴표가 한 번 있습니다.'),data:{srcip:'192.0.2.5',count:'1'} };
  for (const [value, action] of [[0.85,'block'],[0.849,'alert'],[0.5,'alert'],[0.499,'record'],[null,'alert'],[2,'alert']]) {
    assert.equal((await createDecider({assess:async()=>value})(ambiguous)).action, action);
  }
  assert.equal((await createDecider({assess:()=>new Promise(()=>{}),timeoutMs:10})(ambiguous)).action,'alert');
  assert.equal((await createDecider({assess:async()=>{throw Error('synthetic');}})(ambiguous)).action,'alert');
});

test('Jev opt-in and web-specific question do not expose identifiers or require a real key', async () => {
  let calls=0;
  const send=async(url, options)=>{calls++;const body=JSON.parse(options.body);
    assert.match(body.questions.attack.instructions,/web injection/u);
    assert.equal(body.questions.attack.type,'noul');
    assert.equal(body.state.sourceAddress,undefined);
    return new Response(JSON.stringify({answers:{attack:{type:'noul',noul:0.7}}}));};
  assert.equal(await createWebJevAssessor({env:{TYPESAFE_API_KEY:'synthetic'},send})({count:1}),null);
  assert.equal(calls,0);
  assert.equal(await createWebJevAssessor({env:{XDR_JEV_ENABLED:'true',TYPESAFE_API_KEY:'synthetic'},send})({count:1}),0.7);
  assert.equal(calls,1);
});

test('generated entry needs no imports or host credentials and matches original module on all fixtures', async () => {
  execFileSync(process.execPath,['scripts/xdr-pack-web.mjs','--check'],{stdio:'pipe'});
  const text=await readFile(new URL('../xdr/web-injection/decide.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(text,/^import /mu);
  const decide=runInNewContext(text.replace(/^export /gmu,'')+'\ndecide;',{setTimeout,clearTimeout});
  for(const alert of fixture.alerts) assert.deepEqual(JSON.parse(JSON.stringify(await decide(alert))),await offline(alert));
});

test('overlay expires and gate preserves normal requests and existing denies', async () => {
  const alert=sample('SQL 구문 표기가 한 주소에서 10번 들어왔습니다.');
  const decision=await offline(alert);
  const result={schema:'aleph.xdr.result.v1',moduleKey:'web-injection',decisions:[{alertId:alert.id,...decision}]};
  const rules=buildDenyRules([alert],result);
  const at=Date.parse(alert.timestamp)+1000;
  assert.equal(rules[0].alertId,alert.id);
  assert.equal(matchingDenyRules('192.0.2.5',rules,at).length,1);
  assert.equal(matchingDenyRules('192.0.2.6',rules,at).length,0);
  assert.equal(matchingDenyRules('192.0.2.5',rules,at+900000).length,0);
  const base={schema:'aleph.decision.v1',requestId:'synthetic-request',decision:'allow',reasonCode:'test_allow',ruleIds:['test.allow']};
  const denied={...base,decision:'deny',reasonCode:'test_xdr_deny',ruleIds:[rules[0].id]};
  const gate=withXdrGate({baseDecide:async()=>base,verifiedSourceFor:async r=>r.testSource,
    rules,makeDeny:async()=>denied,now:()=>at});
  assert.deepEqual(await gate({requestId:base.requestId,testSource:'192.0.2.5'}),denied);
  assert.deepEqual(await gate({requestId:base.requestId,testSource:'192.0.2.6'}),base);
  const blocked={...base,decision:'deny'};
  assert.deepEqual(await withXdrGate({baseDecide:async()=>blocked,verifiedSourceFor:async()=>{throw Error('must skip');},rules,makeDeny:async()=>denied,now:()=>at})({}),blocked);
});
