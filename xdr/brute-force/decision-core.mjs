import { createJevAssessor } from '../jev-client.mjs';
import { matchPatterns } from './match-patterns.mjs';
import { modelState, observe } from './observe.mjs';

export function createDecider({ assess = createJevAssessor(), timeoutMs = 1600 } = {}) {
  return async function decide(alert) {
    let facts;
    try { facts = observe(alert); }
    catch { return { action: 'alert', confidence: 0.5, reason: 'brute-force.evidence-review | 경보 형식 확인 필요' }; }
    if (!facts.readable || facts.contradictoryCount) {
      return { action: 'alert', confidence: 0.5, reason: 'brute-force.evidence-review | 누락·가림·충돌 증거' };
    }
    const patterns = matchPatterns(facts);
    if (patterns.length && !facts.hadSuccess) {
      // This is a local policy strength, not measured model calibration.
      return { action: 'block', confidence: 0.95, reason: `${patterns.join(',')} | 명시된 패턴 증거` };
    }
    if (facts.normal) return { action: 'record', confidence: 0.05, reason: 'brute-force.normal-authentication | 정상 동작' };
    let timer;
    let probability;
    try {
      probability = await Promise.race([
        Promise.resolve().then(() => assess(modelState(facts))),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
      ]);
    } catch { probability = null; }
    finally { clearTimeout(timer); }
    const reasonPattern = patterns.join(',') || 'brute-force.evidence-review';
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      return { action: 'alert', confidence: 0.5, reason: `${reasonPattern} | Jev 미연결·실패 시 알림` };
    }
    // confidence here means probability of attack (Noul), not Choice certainty.
    const action = probability >= 0.85 ? 'block' : probability >= 0.5 ? 'alert' : 'record';
    if (action === 'block' && !facts.sameSourceConfirmed) {
      return { action: 'alert', confidence: 0.5, reason: `${reasonPattern} | 차단할 주소 증거 없음` };
    }
    return { action, confidence: probability, reason: `${reasonPattern} | Jev 공격 가능성` };
  };
}

const defaultDecider = createDecider();
export async function decide(alert) {
  return defaultDecider(alert);
}
