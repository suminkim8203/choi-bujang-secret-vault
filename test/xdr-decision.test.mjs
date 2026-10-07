import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createDecider } from '../xdr/brute-force/decide.mjs';
import { createJevAssessor } from '../xdr/jev-client.mjs';
import { modelState, observe } from '../xdr/brute-force/observe.mjs';
import { isDecision } from '../scripts/xdr-run.mjs';

const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/brute-force.json', import.meta.url)));
const get = id => fixture.alerts.find(alert => alert.id === id);
const offline = createDecider({ assess: async () => null });

test('all original alerts have valid results; independently reviewed normal events never block', async () => {
  // Manual review of the original descriptions; these are not published judge answers.
  const reviewedNormal = new Set(['bf-20','bf-21','bf-22','bf-23','bf-24','bf-25','bf-26','bf-27','bf-28']);
  for (const alert of fixture.alerts) {
    const result = await offline(alert);
    assert.equal(isDecision(result), true);
    if (reviewedNormal.has(alert.id)) assert.equal(result.action, 'record');
  }
});

test('clear evidence and normal activity skip AI; ambiguous evidence invokes it with no raw identifiers', async () => {
  const states = [];
  const classify = createDecider({ assess: async state => { states.push(state); return null; } });
  assert.equal((await classify(get('bf-01'))).action, 'block');
  assert.equal((await classify(get('bf-20'))).action, 'record');
  assert.equal(states.length, 0);
  assert.equal((await classify(get('bf-11'))).action, 'alert');
  assert.equal(states.length, 1);
  assert.equal(states[0].sourceAddress, undefined);
  assert.equal(states[0].account, undefined);
  assert.equal(states[0].description, undefined);
  assert.equal(states[0].timestamp, undefined);
});

test('attack probability thresholds are inclusive at 0.85 and 0.5', async () => {
  for (const [probability, action] of [[0.85,'block'],[0.849,'alert'],[0.5,'alert'],[0.499,'record']]) {
    assert.equal((await createDecider({ assess: async () => probability })(get('bf-11'))).action, action);
  }
});

test('missing windows and password equality stay unknown; high count or rule level alone does not block', async () => {
  const facts = observe(get('bf-08'));
  assert.equal(facts.windowSeconds, null);
  assert.equal(observe(get('bf-05')).samePasswordEvidence, false);
  assert.equal((await offline(get('bf-08'))).action, 'alert');
  assert.equal((await offline(get('bf-10'))).action, 'alert');
  assert.equal((await offline({ ...get('bf-13'), rule: { level: 15, description: '확인 정보 없음' } })).action, 'alert');
});

test('redacted, contradictory and malformed alerts never expose contents or invoke AI', async () => {
  let calls = 0;
  const classify = createDecider({ assess: async () => { calls++; return 1; } });
  const secretText = 'password=' + 'synthetic';
  for (const alert of [null, { ...get('bf-01'), rule: { level: 12, description: secretText } },
    { ...get('bf-01'), data: { ...get('bf-01').data, count: '99' } }]) {
    const result = await classify(alert);
    assert.equal(result.action, 'alert');
    assert.equal(result.reason.includes(secretText), false);
  }
  assert.equal(calls, 0);
});

test('timeouts, rejected promises and invalid probabilities reliably alert', async () => {
  for (const value of [null, NaN, Infinity, -1, 2, '0.99']) {
    assert.equal((await createDecider({ assess: async () => value })(get('bf-11'))).action, 'alert');
  }
  assert.equal((await createDecider({ assess: async () => { throw new Error('synthetic upstream error'); } })(get('bf-11'))).action, 'alert');
  const classify = createDecider({ assess: () => new Promise(() => {}), timeoutMs: 10 });
  assert.equal((await classify(get('bf-11'))).action, 'alert');
});

test('Jev opt-in is required and official Noul response is validated', async () => {
  let calls = 0;
  const state = modelState(observe(get('bf-11')));
  const send = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'jev-latest');
    assert.equal(body.questions.attack.type, 'noul');
    assert.deepEqual(body.state, state);
    assert.equal(body.state.sourceAddress, undefined);
    return new Response(JSON.stringify({ answers: { attack: { type: 'noul', noul: 0.7 } } }));
  };
  const env = { TYPESAFE_API_KEY: 'synthetic' };
  assert.equal(await createJevAssessor({ env, send })(state), null);
  assert.equal(calls, 0);
  assert.equal(await createJevAssessor({ env: { ...env, XDR_JEV_ENABLED: 'true' }, send })(state), 0.7);
  assert.equal(calls, 1);
  for (const answer of [{ type:'choice',confidence:1 },{ type:'noul',noul:2 },{ type:'noul',noul:'0.7' }]) {
    assert.equal(await createJevAssessor({ env:{ ...env,XDR_JEV_ENABLED:'true' },
      send: async () => new Response(JSON.stringify({ answers:{ attack:answer } })) })(state), null);
  }
});
