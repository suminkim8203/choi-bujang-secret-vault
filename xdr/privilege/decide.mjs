const PATTERNS = [
  {
    "name": "privilege.risky-admin-addition",
    "condition": "원격·다중 계정 관리자 그룹 추가 또는 즉시 관리자 명령 실행",
    "evidence": "MITRE T1078의 기법과 경보의 명시 신호를 비교하며 일반 활동과 구분합니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1078/"
  },
  {
    "name": "privilege.unexpected-privileged-use",
    "condition": "새 주소·업무 시간 밖·다른 계정 권한으로 관리자 실행/세션 전환",
    "evidence": "T1068은 취약점 악용을 통한 권한 상승입니다. 이 경보는 비정상 관리자 사용 신호를 제공하며 실제 취약점 악용 여부는 미확인입니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1068/"
  },
  {
    "name": "privilege.admin-readdition",
    "condition": "관리자 그룹에서 제거된 계정이 곧 재추가되는 경보",
    "evidence": "MITRE T1078의 기법과 경보의 명시 신호를 비교하며 일반 활동과 구분합니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1078/"
  },
  {
    "name": "privilege.evidence-review",
    "condition": "신호 일부만 있거나 증거가 누락·충돌해 차단 근거가 부족함",
    "evidence": "명확한 패턴과 단순 이름·심각도는 구분합니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1078/"
  },
  {
    "name": "privilege.normal-event",
    "condition": "확인된 정상 조회·로그인·기존 업무 활동",
    "evidence": "정상 행위는 기술명·경보 수준만으로 차단하지 않습니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1078/"
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

 const admin=/관리자 그룹/u.test(text)&&!/관리자 그룹은 아닙니다/u.test(text);
 const addition=admin&&/추가|들어가|들어왔/u.test(text);
 const command=/관리자 명령|권한 명령/u.test(text)&&/실행/u.test(text)&&!/실패|취소|명령은 없습니다/u.test(text);
 const risky=/원격 주소|처음 보는 주소|요청 주소는 처음|수업 시간 밖|업무처럼 보이지 않는|다른 계정의 권한|방금 관리자가/u.test(text);
 const readd=admin&&/빠진 계정.*다시 관리자로/u.test(text);
 const many=addition&&number(d.count)>=4;
 const escalation=/세션이 관리자 권한으로 바뀌/u.test(text)&&risky;
 if(isIP(d.srcip??'')&&((addition&&(risky||command))||(command&&risky)||readd||many||escalation))return output(readd?2:addition?0:1,0.95);
 const normal=/로그인했습니다|로그아웃했습니다|그룹 소속을 읽기만|비밀번호를 변경|세션 정보를 조회|자료실을 열|평소 예약 작업을 확인/u.test(text);
 if(normal)return output(4,0.05);
 if(/권한|관리자|그룹|계정 종류/u.test(text))return output(3,0.5);
 return output(4,0.05);
}
