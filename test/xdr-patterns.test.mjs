import assert from 'node:assert/strict';
import test from 'node:test';
import { matchPatterns, patternCatalog } from '../xdr/brute-force/match-patterns.mjs';

const burst = {
  eventType: 'login_failure', sourceAddress: '192.0.2.1', sameSourceConfirmed: true,
  sameAccountConfirmed: true, failureCount: 48, windowSeconds: 120,
};
const spray = {
  eventType: 'login_attempt', sourceAddress: '192.0.2.2', sameSourceConfirmed: true,
  samePasswordEvidence: true, distinctAccounts: 8,
};

test('every pattern has a condition, a source and an explicitly local threshold', () => {
  assert.equal(patternCatalog.thresholdOrigin, 'project_policy');
  assert.equal(patternCatalog.handling.automaticBlocking, false);
  for (const pattern of patternCatalog.patterns) {
    assert.ok(pattern.name && pattern.conditionText && pattern.evidence);
    assert.equal(new URL(pattern.sourceUrl).hostname, 'attack.mitre.org');
  }
});

test('confirmed repeated failure and spraying observations match independently without changing input', () => {
  const before = structuredClone([burst, spray]);
  assert.deepEqual(matchPatterns(burst), ['brute-force.same-source-burst']);
  assert.deepEqual(matchPatterns(spray), ['brute-force.password-spray']);
  assert.deepEqual([burst, spray], before);
});

test('successful login, logout and session checks cannot match even with high counts or rule levels', () => {
  for (const eventType of ['login_success', 'logout', 'session_check']) {
    assert.deepEqual(matchPatterns({ ...burst, ...spray, eventType, ruleLevel: 15 }), []);
  }
});

test('a few failures, a long interval, or one account do not satisfy attack thresholds', () => {
  assert.deepEqual(matchPatterns({ ...burst, failureCount: 4 }), []);
  assert.deepEqual(matchPatterns({ ...burst, windowSeconds: 600 }), []);
  assert.deepEqual(matchPatterns({ ...spray, distinctAccounts: 1 }), []);
});

test('missing correlation or password evidence cannot be filled in from an IP or rule label', () => {
  for (const key of ['sameAccountConfirmed', 'windowSeconds', 'failureCount']) {
    const incomplete = { ...burst, ruleLevel: 15, technique: 'T1110' };
    delete incomplete[key];
    assert.deepEqual(matchPatterns(incomplete), []);
  }
  assert.deepEqual(matchPatterns({ ...burst, sameSourceConfirmed: false }), []);
  assert.deepEqual(matchPatterns({ ...spray, samePasswordEvidence: false }), []);
});

test('invalid numbers and addresses fail closed without coercing strings', () => {
  for (const failureCount of [NaN, Infinity, '48', -1]) {
    assert.deepEqual(matchPatterns({ ...burst, failureCount }), []);
  }
  for (const sourceAddress of ['', '[REDACTED]', 'not-an-address']) {
    assert.deepEqual(matchPatterns({ ...burst, sourceAddress }), []);
  }
  assert.deepEqual(matchPatterns({ ...burst, windowSeconds: -1 }), []);
  assert.deepEqual(matchPatterns({ ...spray, distinctAccounts: '8' }), []);
});

test('high-volume and multi-account failures need independent repetition evidence', () => {
  const high = { ...burst, failureCount: 70, windowSeconds: null };
  assert.deepEqual(matchPatterns(high), []);
  assert.deepEqual(matchPatterns({ ...high, continuedFailureEvidence: true }), ['brute-force.sustained-account-failures']);
  const many = { eventType:'login_failure',sourceAddress:'192.0.2.1',sameSourceConfirmed:true,
    distinctAccounts:20,failureCount:20 };
  assert.deepEqual(matchPatterns(many), []);
  assert.deepEqual(matchPatterns({ ...many, uniformIntervalEvidence:true }), ['brute-force.uniform-account-rotation']);
  assert.deepEqual(matchPatterns({ ...many, uniformIntervalEvidence:true,eventType:'login_success' }), []);
});
