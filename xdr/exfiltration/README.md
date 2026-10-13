# XDR · 자료 유출

공식 가상 경보를 원본 그대로 읽습니다. 원본 출처는 [공식 시작 틀 고정 버전](https://github.com/ChoiTimo/aleph-defense-starter/tree/2cd777b452525b95e29f12f2c76d9190a594ec23)입니다.

read-alerts.mjs는 시각·출발 주소·계정·규칙 수준·설명 다섯 항목과 건수만 정리하며 의심 비밀값은 필드 전체를 가립니다. decide.mjs는 이 읽기 모듈을 부르지 않습니다. patterns.json의 이름·조건·근거는 파일 맨 위 PATTERNS 상수에 들어 있으며 외부 import·파일·패키지·인터넷·AI 호출 없이 decide(alert)만 내보냅니다. 0.85 이상 block, 0.5 이상 alert, 그 아래 record입니다. 확신도는 패턴 일치의 실습 정책이며 보정된 통계 확률이 아닙니다. 경보 ID·규칙 수준만으로 답을 정하지 않습니다.

실행: npm run xdr:run -- exfiltration → node xdr/exfiltration/read-alerts.mjs → node xdr/exfiltration/respond.mjs. 결과 counts는 result.json이고 reader의 가린 보고서는 Git 제외 artifacts에 저장합니다. respond는 차단 후보에 원본 경보 ID와 15분 만료 시각을 붙여 deny-rules.json에 기록하고 알림 메타데이터만 xdr/alerts.log에 한 줄씩 추가합니다. 기존 판정기·방어 규칙은 변경하지 않습니다.

이 연결은 로컬 거부 오버레이와 엔진 경계의 시험입니다. 실제 운영 엔진의 검증된 주소·계정·기기 매핑, 적용 승인·등록 API는 연결되지 않았습니다. 과거 시험 경보 시각을 오늘로 바꾸어 새 차단이라고 하지 않습니다. 로컬 판정과 실제 포털 심판 결과는 별도로 기록합니다. 정상 요청·이미 거부된 요청과 만료 후 동작을 검사합니다. 원시 경보·본문·토큰·개인키·실제 개인정보를 로그와 제출에 넣지 않습니다.
