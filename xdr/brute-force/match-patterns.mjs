import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';

export const patternCatalog = JSON.parse(await readFile(new URL('./patterns.json', import.meta.url), 'utf8'));

// This accepts confirmed observations, not raw logs or a ZTNA request.
// The later decision module must establish each fact; never infer a time
// window from one timestamp or password equality from shared IP alone.
export function matchPatterns(observation) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)
      || typeof observation.sourceAddress !== 'string' || !isIP(observation.sourceAddress)
      || observation.sameSourceConfirmed !== true) return [];

  const matches = [];
  for (const pattern of patternCatalog.patterns) {
    const conditions = pattern.conditions;
    if (pattern.id === 'brute-force.same-source-burst') {
      if (observation.eventType === conditions.eventType
          && observation.sameAccountConfirmed === true
          && Number.isSafeInteger(observation.failureCount)
          && observation.failureCount >= conditions.minFailureCount
          && Number.isFinite(observation.windowSeconds)
          && observation.windowSeconds > 0
          && observation.windowSeconds <= conditions.maxWindowSeconds) matches.push(pattern.id);
    } else if (pattern.id === 'brute-force.password-spray') {
      if (conditions.eventTypes.includes(observation.eventType)
          && observation.samePasswordEvidence === true
          && Number.isSafeInteger(observation.distinctAccounts)
          && observation.distinctAccounts >= conditions.minDistinctAccounts) matches.push(pattern.id);
    } else if (pattern.id === 'brute-force.account-rotation-burst') {
      if (observation.eventType === 'login_failure' && observation.accountRotationEvidence === true
          && Number.isSafeInteger(observation.failureCount) && observation.failureCount >= conditions.minFailureCount
          && Number.isFinite(observation.windowSeconds) && observation.windowSeconds > 0
          && observation.windowSeconds <= conditions.maxWindowSeconds) matches.push(pattern.id);
    } else if (pattern.id === 'brute-force.password-variation') {
      if (observation.eventType === 'login_failure' && observation.passwordVariationEvidence === true
          && Number.isSafeInteger(observation.failureCount)
          && observation.failureCount >= conditions.minFailureCount) matches.push(pattern.id);
    }
  }
  // Return pattern identifiers only; no source, account, or credential values.
  return matches;
}
