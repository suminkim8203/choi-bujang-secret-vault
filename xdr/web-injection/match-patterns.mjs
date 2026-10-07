import { readFile } from 'node:fs/promises';
import { isIP } from '../brute-force/address.mjs';
export const patternCatalog = JSON.parse(await readFile(new URL('./patterns.json', import.meta.url), 'utf8'));

// This accepts confirmed observations; no raw payload is executed or returned.
export function matchPatterns(facts) {
  if (!facts || facts.readable !== true || facts.sameSourceConfirmed !== true
      || !isIP(facts.sourceAddress) || facts.contradictoryCount || facts.repetitionDenied
      || !Number.isSafeInteger(facts.count)) return [];
  return patternCatalog.patterns.filter(pattern => facts[pattern.signal] === true
    && facts.count >= pattern.minCount).map(pattern => pattern.id);
}
