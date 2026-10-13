const PATTERNS = [
  {
    "name": "persistence.unsigned-service",
    "condition": "미서명 서비스의 새 등록/파일 변경 또는 비정상 재시작 지속성",
    "evidence": "MITRE T1543의 기법과 경보의 명시 신호를 비교하며 일반 활동과 구분합니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1543/"
  },
  {
    "name": "persistence.suspicious-task",
    "condition": "임시 파일을 실행하는 낯선·업무 시간 밖·임의 이름 예약 작업",
    "evidence": "MITRE T1053의 기법과 경보의 명시 신호를 비교하며 일반 활동과 구분합니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1053/"
  },
  {
    "name": "persistence.startup-change",
    "condition": "평소 없는 시작 폴더 항목 추가 또는 시작 프로그램/작업의 임시 파일 결합",
    "evidence": "T1547.001은 Run 키와 Startup 폴더를 통한 자동 실행을 다룹니다. 서비스/예약 작업 신호는 별도의 T1543/T1053으로 구분합니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1547/001/"
  },
  {
    "name": "persistence.evidence-review",
    "condition": "신호 일부만 있거나 증거가 누락·충돌해 차단 근거가 부족함",
    "evidence": "명확한 패턴과 단순 이름·심각도는 구분합니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1543/"
  },
  {
    "name": "persistence.normal-event",
    "condition": "확인된 정상 조회·로그인·기존 업무 활동",
    "evidence": "정상 행위는 기술명·경보 수준만으로 차단하지 않습니다.",
    "sourceUrl": "https://attack.mitre.org/techniques/T1543/"
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

 const path=typeof d.path==='string'?d.path:'';
 if(sensitive.test(path)||path.length>8192)return output(3,0.5);
 const temp=/[\\/]Temp[\\/]/iu.test(path)||/임시 (?:폴더|파일)/u.test(text);
 const unsigned=/서명 없는|서명이 없습니다/u.test(text);
 const service=/서비스/u.test(text)&&(/등록|추가|실행 파일이 바뀌|새 서비스/u.test(text))
   &&(unsigned||/평소 목록에 없는.*다시 켜도 남/u.test(text));
 const task=/예약 작업/u.test(text)&&temp&&/처음 보는|임의 문자열|수업 시간 밖|시작 프로그램.*함께/u.test(text);
 const startup=/시작 폴더.*평소 목록에 없는.*추가|시작 프로그램과 예약 작업.*같은 임시 파일/u.test(text);
 if(isIP(d.srcip??'')&&(service||task||startup))return output(service?0:task?1:2,0.95);
 const normal=/로그인했습니다|로그아웃했습니다|업데이트.*평소|기존.*서명된|목록을 읽기만|기존 예약 작업.*마쳤|자료실 화면/u.test(text);
 if(normal)return output(4,0.05);
 if(/서비스|예약 작업|시작|임시 폴더|서명/u.test(text))return output(3,0.5);
 return output(4,0.05);
}
