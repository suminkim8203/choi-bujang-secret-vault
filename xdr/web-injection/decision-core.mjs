import { createWebJevAssessor } from './jev-client.mjs';
import { matchPatterns } from './match-patterns.mjs';
import { modelState, observe } from './observe.mjs';

export function createDecider({ assess = createWebJevAssessor(), timeoutMs = 1600 } = {}) {
  return async function decide(alert) {
    let facts;
    try { facts = observe(alert); }
    catch { return { action: 'alert', confidence: 0.5, reason: 'web-injection.evidence-review | 경보 형식 확인 필요' }; }
    if (!facts.readable || facts.contradictoryCount) {
      return { action: 'alert', confidence: 0.5, reason: 'web-injection.evidence-review | 누락·가림·충돌 증거' };
    }
    const patterns = matchPatterns(facts);
    if (patterns.length) return { action: 'block', confidence: 0.95, reason: `${patterns.join(',')} | 명시된 반복 주입 증거` };
    if (facts.normal) return { action: 'record', confidence: 0.05, reason: 'web-injection.normal-web-request | 정상 조회' };
    let timer, probability;
    try {
      probability = await Promise.race([
        Promise.resolve().then(() => assess(modelState(facts))),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
      ]);
    } catch { probability = null; }
    finally { clearTimeout(timer); }
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      return { action: 'alert', confidence: 0.5, reason: 'web-injection.evidence-review | Jev 미연결·실패 시 알림' };
    }
    const action = probability >= 0.85 ? 'block' : probability >= 0.5 ? 'alert' : 'record';
    if (action === 'block' && !facts.sameSourceConfirmed) return { action: 'alert', confidence: 0.5, reason: 'web-injection.evidence-review | 주소 증거 없음' };
    return { action, confidence: probability, reason: 'web-injection.evidence-review | Jev 공격 가능성' };
  };
}

const defaultDecider = createDecider();
export async function decide(alert) { return defaultDecider(alert); }
