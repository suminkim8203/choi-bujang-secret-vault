const PATTERNS = [
  {
    "name": "known-cve.remote-jndi-lookup",
    "condition": "실제 url/useragent에 완결된 원격 JNDI 조회 형태, 유효 출발 주소, 악용 부정 설명 없음",
    "evidence": "CVE-2021-44228은 로그 메시지·인자에 포함된 공격자 제어 JNDI 대상과 관련됩니다. 입력 문자열은 실행하지 않습니다.",
    "sourceUrl": "https://logging.apache.org/security.html"
  },
  {
    "name": "known-cve.partial-or-context-only",
    "condition": "취약점 이름·교육 문맥·잘린 조회 형태만 있으며 완결된 악용 증거가 부족함",
    "evidence": "T1190 공개 앱 악용과 단순 조회/검색은 다르므로 추가 확인 알림으로 남깁니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1190/"
  },
  {
    "name": "known-cve.normal-event",
    "condition": "완결된 악용 형태와 의심 흔적 없는 정상 조회·로그인·정적 자료 활동",
    "evidence": "T1190은 공개 앱 악용 기법이며 정상 활동의 단순 규칙 수준은 악용 증거가 아닙니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1190/"
  },
  {
    "name": "known-cve.evidence-review",
    "condition": "필수 경보 형식 누락·과도한 길이·비밀값 의심으로 판단 증거를 안전하게 읽을 수 없음",
    "evidence": "증거 누락을 악용의 확정 증거로 채우지 않고 확인 알림으로 둡니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1190/"
  }
];
// Portable address validation; no filesystem, environment or external imports.
function isIP(value) {
  if (typeof value !== 'string' || value.length > 64) return 0;
  const ipv4 = text => {
    const octets = text.split('.');
    return octets.length === 4 && octets.every(part => /^(?:0|[1-9]\d{0,2})$/u.test(part) && Number(part) <= 255);
  };
  if (ipv4(value)) return 4;
  if (!value.includes(':') || value.includes('%') || /[^\da-f:.]/iu.test(value)) return 0;
  const compression = value.split('::');
  if (compression.length > 2) return 0;
  const groups = compression.flatMap(part => part ? part.split(':') : []);
  let count = 0;
  for (let i = 0; i < groups.length; i++) {
    const part = groups[i];
    if (part.includes('.')) {
      if (i !== groups.length - 1 || !ipv4(part)) return 0;
      count += 2;
    } else {
      if (!/^[\da-f]{1,4}$/iu.test(part)) return 0;
      count++;
    }
  }
  return compression.length === 2 ? (count < 8 ? 6 : 0) : (count === 8 ? 6 : 0);
}

// Standalone classroom classifier. No imports, runtime reads, AI or network.
const sensitive=/Bearer\s+\S+|sb_secret_|-----BEGIN.*PRIVATE KEY|\b(?:password|access_token|refresh_token|authorization)\s*[:=]/iu;
export function decide(alert){
 const d=alert?.data,description=alert?.rule?.description;
 if(!d||typeof d!=='object'||typeof description!=='string'||description.length>4000)
  return{action:'alert',confidence:0.5,reason:'known-cve.evidence-review'};
 const values=[description,d.url,d.useragent].filter(v=>typeof v==='string');
 if(values.some(v=>v.length>8192||sensitive.test(v)))return{action:'alert',confidence:0.5,reason:'known-cve.evidence-review'};
 // A complete remote lookup in an actual request field is stronger than a CVE name or severity.
 const payload=[d.url,d.useragent].filter(v=>typeof v==='string').some(v=>/\$\{jndi:(?:ldap|ldaps|rmi|dns):\/\/[^\s{}]+\}/iu.test(v));
 const denied=/조회 구문은 없습니다|원격 조회 구문은 없습니다|악용 구문은 없습니다|완전한 구문은 아닙니다/iu.test(description);
 if(payload&&!denied&&isIP(d.srcip??''))return{action:'block',confidence:0.95,reason:PATTERNS[0].name};
 const hints=values.some(v=>/CVE-2021-44228|jndi|취약점|조회 형태|중괄호|점검 도구|라이브러리 이름|lookup-fragment/iu.test(v));
 if(payload||hints)return{action:'alert',confidence:0.5,reason:PATTERNS[1].name};
 return{action:'record',confidence:0.05,reason:PATTERNS[2].name};
}
