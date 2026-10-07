# 보너스 XDR-02 웹 입력 조작

2026-10-07. 목적은 반복되는 웹 주입 시도를 가려내면서 정상 검색과 자료 조회를 보존하는 것입니다. 실제 WAF 설치나 자료실 입력 취약점 전반의 수정이 아닙니다.

## 요구사항과 검증

| 요구 | 구현·검증 | 범위 |
|---|---|---|
| 시각·출발 주소·계정·규칙 수준·설명 읽기 | read-alerts.mjs, 원본26건→출력26줄, 다섯 항목, 지정 비밀 패턴 가림 | 공식 가상 자료만 사용. 임의 로그의 모든 비밀 탐지 보장 없음 |
| 근거 있는 패턴 | patterns.json의 SQL·스크립트·경로·명령 삽입 반복4패턴, 조건·이름·근거·출처 | 반복5회는 로컬 정책 값. 경보 설명으로 확인하며 원시 URL 파서 아님 |
| 판단 | decide.mjs: 명확한 반복→block, 정상→record, 나머지→Jev 경로/미연결 alert | 고정0.95/0.05/0.5는 정책 값. 외부 모델의 실측 확신도 아님 |
| 알림·차단 규칙 | scripts/xdr-connect-web.mjs가 후보8건만15분 만료/경보ID와 내보냄. 알림과 후보는 xdr/alerts.log에 한 줄씩 기록 | 기존 다른 모듈 로그 보존. 과거 경보라 현재 활성 규칙0 |
| 정상 보존 | 자체 검토한 정상9건 차단0, 가상 기존 allow·deny 유지, 만료 시험 통과 | 실제 운영 엔진 접속 시험 아님 |
| 원본 시험·저장점 | 공식 실행기로 block8·alert9·record9. 전체62검사와 빌드 통과 | 실제 심판 판정은 별도 기록 |

공식 원본 출처: [고정 시작 틀](https://github.com/ChoiTimo/aleph-defense-starter/blob/8a0927400ec0d0a8ff08146db773fec80fb6d216/xdr/fixtures/web-injection.json). Git blob SHA `c1e6b7f2d226c5f85e09e026f726fdcb8fd7eff1` 그대로입니다. 원본 경보와 공식 실행기를 바꾸지 않습니다. ID·문서용 URL 표기·규칙 수준·기술 번호로 정답을 고정하지 않습니다. 자체 검토 정상 목록은 공개 심판 정답표가 아닙니다.

근거: [MITRE T1190](https://attack.mitre.org/techniques/T1190/), [OWASP SQL 주입](https://community.owasp.org/attacks/SQL_Injection), [XSS](https://community.owasp.org/attacks/xss/), [경로 조작](https://community.owasp.org/attacks/Path_Traversal), [명령 주입](https://community.owasp.org/attacks/Command_Injection). SQL/select/스크립트 같은 단어·따옴표 한 건을 반복 주입 증거로 보충하지 않습니다. 명령 구분자 패턴은 공식 경보의 해당 증거와 OWASP 근거를 함께 확인했습니다.

## 재현

```sh
node scripts/xdr-pack-web.mjs
node xdr/web-injection/read-alerts.mjs
XDR_JEV_ENABLED=false npm run xdr:run -- web-injection
node scripts/xdr-connect-web.mjs
node --test test/*.test.mjs
```

정상 결과: 경보26건·추출26줄, 분류8/9/9, 거부 규칙8개 내보내기, 같은 결과 재실행 시 새 로그0줄. 잘못된 형식·가려진 값·충돌한 집계는 알림 처리합니다. `node scripts/xdr-pack-web.mjs --check`는 읽기 쉬운 원본 모듈과 독립 실행 파일의 일치를 검사합니다. 환경변수·네트워크·파일 접근 없이 실행한 별도 문맥에서26건 모두 동일 결과를 확인했습니다.

## 연결 상태와 한계

Jev 웹 판단 어댑터를 구현했고 합성 응답으로 경계·오류·시간 초과를 검사했습니다. 비용/키 준비는 사용자 요청으로 유보했습니다. 실제 키를 열거나 요구하지 않았고 Jev 실서비스를 호출하지 않았습니다. 명시적 활성화와 서버 키가 없으면 알림으로 남습니다. 모델에는 숫자·불리언 신호만 전달하며 원문·URL·주소·계정·토큰은 보내지 않습니다.

ZTNA 연결 어댑터는 기존 판정과 정상 요청을 보존하는 가상 시험만 완료했습니다. 공식 요청 계약에 출발IP 매핑이 없고 사용자도 별도 안내 없음으로 확인했으므로 실제 운영 경로에는 연결하지 않았습니다. 현재 src/decider.mjs는 원본 전체 거부 시작점입니다. 테스트의 allow는 가상 기준이며 실운영 정상 통과로 주장하지 않습니다.

기존 자료실 인증·소유자 검사·DB 직접 권한 차단·nosniff와 보너스1 모듈은 보존합니다. 실습 심판 통과와 실제 서비스 연결 완료를 구분합니다. 최신 제출 판정은 확인 후 기록합니다.
