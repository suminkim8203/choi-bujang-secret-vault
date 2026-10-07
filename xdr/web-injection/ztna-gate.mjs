import { isIP } from 'node:net';

const RESPONSE_KEYS = 'decision,reasonCode,requestId,ruleIds,schema';

export function buildDenyRules(alerts, result, { ttlSeconds = 900 } = {}) {
  if (!Array.isArray(alerts) || result?.schema !== 'aleph.xdr.result.v1'
      || result.moduleKey !== 'web-injection' || !Array.isArray(result.decisions)
      || alerts.length !== result.decisions.length || !Number.isInteger(ttlSeconds)
      || ttlSeconds < 1 || ttlSeconds > 900) throw new Error('XDR_RULE_INPUT_INVALID');
  const seen = new Set();
  return result.decisions.flatMap((decision, index) => {
    const alert = alerts[index];
    if (decision.alertId !== alert.id || !/^[a-zA-Z0-9_-]{1,64}$/u.test(alert.id)
        || seen.has(alert.id) || !['block', 'alert', 'record'].includes(decision.action)
        || !Number.isFinite(decision.confidence) || decision.confidence < 0 || decision.confidence > 1) {
      throw new Error('XDR_RULE_INPUT_INVALID');
    }
    seen.add(alert.id);
    if (decision.action !== 'block') return [];
    const sourceAddress = alert.data?.srcip;
    const observed = Date.parse(alert.timestamp);
    if (!Number.isFinite(decision.confidence) || decision.confidence < 0.85 || decision.confidence > 1
        || typeof sourceAddress !== 'string' || !isIP(sourceAddress) || !Number.isFinite(observed)) {
      throw new Error('XDR_BLOCK_EVIDENCE_INVALID');
    }
    return [{ id: `xdr.web-injection.${alert.id}`, moduleKey: 'web-injection',
      sourceAddress, alertId: alert.id, observedAt: new Date(observed).toISOString(),
      expiresAt: new Date(observed + ttlSeconds * 1000).toISOString() }];
  });
}

export function matchingDenyRules(sourceAddress, rules, at) {
  if (typeof sourceAddress !== 'string' || !isIP(sourceAddress)
      || !Array.isArray(rules) || !Number.isFinite(at)) return [];
  return rules.filter(rule => {
    const observed = Date.parse(rule?.observedAt);
    const expires = Date.parse(rule?.expiresAt);
    return rule?.moduleKey === 'web-injection' && typeof rule.id === 'string'
      && /^xdr\.web-injection\.[a-zA-Z0-9_-]{1,64}$/u.test(rule.id)
      && typeof rule.sourceAddress === 'string' && isIP(rule.sourceAddress)
      && rule.sourceAddress.toLowerCase() === sourceAddress.toLowerCase()
      && Number.isFinite(observed) && Number.isFinite(expires)
      && expires > observed && expires - observed <= 900000 && at >= observed && at < expires;
  });
}

// Adapter only: the caller must be the trusted engine, supply a verified source
// outside the 18-field request, and supply its registered deny response.
// No live route calls this adapter yet. Browser fields are never trusted here.
export function withXdrGate({ baseDecide, verifiedSourceFor, rules, makeDeny,
  now = Date.now } = {}) {
  if ([baseDecide, verifiedSourceFor, makeDeny, now].some(value => typeof value !== 'function')
      || !Array.isArray(rules)) throw new Error('XDR_ENGINE_ADAPTER_REQUIRED');
  return async function decide(request) {
    const base = await baseDecide(request);
    if (base?.decision !== 'allow') return base;
    const matches = matchingDenyRules(await verifiedSourceFor(request), rules, now());
    if (matches.length === 0) return base;
    const denied = await makeDeny(request, matches.map(rule => rule.id));
    if (!denied || Object.keys(denied).sort().join(',') !== RESPONSE_KEYS
        || denied.schema !== 'aleph.decision.v1' || denied.requestId !== request.requestId
        || denied.decision !== 'deny' || typeof denied.reasonCode !== 'string'
        || !/^[a-z][a-z0-9_]{0,63}$/u.test(denied.reasonCode)
        || !Array.isArray(denied.ruleIds) || denied.ruleIds.length === 0
        || denied.ruleIds.some(id => typeof id !== 'string' || !matches.some(rule => rule.id === id))) {
      throw new Error('XDR_ENGINE_DENY_RESPONSE_INVALID');
    }
    return denied;
  };
}
