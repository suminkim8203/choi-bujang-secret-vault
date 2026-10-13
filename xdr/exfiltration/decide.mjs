const PATTERNS = [
  {
    "name": "exfiltration.large-novel-destination",
    "condition": "처음 보는 외부 목적지에 실제50MB 이상 자료 전송",
    "evidence": "MITRE T1048의 기법과 경보의 명시 신호를 비교하며 일반 활동과 구분합니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1048/"
  },
  {
    "name": "exfiltration.offhours-archive-transfer",
    "condition": "업무 시간 밖 대용량 압축 파일/반복 전송",
    "evidence": "MITRE T1048의 기법과 경보의 명시 신호를 비교하며 일반 활동과 구분합니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1048/"
  },
  {
    "name": "exfiltration.repeated-channel-transfer",
    "condition": "명령 통로·낯선 포트와 대용량 반복 전송의 결합",
    "evidence": "MITRE T1041의 기법과 경보의 명시 신호를 비교하며 일반 활동과 구분합니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1041/"
  },
  {
    "name": "exfiltration.evidence-review",
    "condition": "신호 일부만 있거나 증거가 누락·충돌해 차단 근거가 부족함",
    "evidence": "명확한 패턴과 단순 이름·심각도는 구분합니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1048/"
  },
  {
    "name": "exfiltration.normal-event",
    "condition": "확인된 정상 조회·로그인·기존 업무 활동",
    "evidence": "정상 행위는 기술명·경보 수준만으로 차단하지 않습니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1048/"
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

const sensitive=/Bearer\s+\S+|sb_secret_|-----BEGIN.*PRIVATE KEY|\b(?:password|access_token|refresh_token|authorization)\s*[:=]/iu;
const output=(i,confidence)=>({action:confidence>=0.85?'block':confidence>=0.5?'alert':'record',confidence,reason:PATTERNS[i].name});
const number=v=>{const n=typeof v==='string'&&/^\d{1,16}$/u.test(v)?Number(v):v;return typeof n==='number'&&Number.isSafeInteger(n)&&n>=0?n:null;};
export function decide(alert){
 const d=alert?.data,text=alert?.rule?.description;
 if(!d||typeof d!=='object'||typeof text!=='string'||text.length>4000||sensitive.test(text))return output(3,0.5);

 const bytes=number(d.bytes),count=number(d.count),files=number(d.files);
 const novel=/처음 보는 (?:목적지|주소)|외부 주소/u.test(text);
 const outbound=/나갔|전송|반출|올라갔|복사됐/u.test(text)&&!/전송은 아직 없습니다|전송은 없습니다|전송이 실패/u.test(text);
 const outside=/수업 시간 밖|업무 시간 밖/u.test(text);
 const channel=/명령 통로|평소에 쓰지 않던 포트/u.test(text);
 const repeated=count>=5||files>=3||/연속|반복|자료실 전체/u.test(text);
 const large=bytes!==null&&bytes>=50000000;
 if(isIP(d.srcip??'')&&isIP(d.dstip??'')&&outbound&&large&&(novel||(repeated&&(outside||channel))||/같은 목적지.*대용량.*반복/u.test(text)))return output(channel?2:outside?1:0,0.95);
 const normal=/내 메모 한 건|반 공지를 읽|작은 동기화가 끝|검색 결과 한 페이지|화면 새로고침|내 메모를 저장|첨부 그림 한 장|세션 확인|로그아웃|다음 수업 공지/u.test(text);
 if(normal)return output(4,0.05);
 if(/전송|압축|파일 수|자료.*읽힌|명령 통로|나갔/u.test(text))return output(3,0.5);
 return output(4,0.05);
}
