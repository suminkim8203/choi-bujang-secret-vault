# 켈비 15단계 구현·검증 기록

확인일: 2026-10-20. 현재 공식 안내: https://aleph-omega.vercel.app/defense

## 변경과 보존

시작 저장점은 `d6fd5d889692e12db43b271e428bf78b344ed533`입니다. 앱 변경은 `on-client/student/extension.mjs`의 `renderEvents` 하나이며 앞쪽의 renderIdentity/renderDecision과 뒤쪽의 renderStatus 이후 함수는 바이트 단위로 보존합니다. 제공 public/app.js·서버·인증·기존 1~12단계/XDR·DB 설정은 변경하지 않습니다. 추가 문서·검사·화면 증빙과 루트 README만 기록합니다.

새 포털은 저장소 주소와 40자리 커밋으로 제출합니다. 옛 자료실 설정의 단계12나 기존 제출 묶음을 단계15로 바꾸지 않습니다. 제공 서버가 본인 범위 최근40건을 전달하며 학생 함수는 받은 자료만 표시하고 새 조회·탐지·조치 요청을 보내지 않습니다.

## 필수 항목별 근거

| 공식 항목 | 구현 | 확인 범위 |
|---|---|---|
| student-source-changed | 기본 대기 문구를 실제 renderEvents DOM으로 교체 | 입력 계약·제공 호출부 대조 |
| event_scope | 받은 배열만 사용, 원본을 변경하지 않고 복사본 정렬, 본인 최근40건과 예제 범위 명시 | 동결한 모의 원본 보존 검사·실제 예제 표시 |
| event_time | at 최신순, 행마다 원래 시각·ID·종류·앱·요약 | 서로 다른 시각3건 모의 검사·예제1건 UI |
| event_filter | 접근 가능한 이름이 기록 종류/업무 앱/접속 상태인 select3개, all 및 받은 원래 값, AND 조건 | 복합 적용·0건·전체 복귀 모의 검사, 실제1건 필터 적용·해제 |
| event_detail | 행의 data-student-event-id, 정확한 `<id> 상세` 버튼, 상세의 data-student-event-detail, 근거·규칙·세 상태 | 모의 상세/닫기, 실제 키보드로 event-01 상세 열고 제공 기록과 대조 |
| events-refresh-replaces | 매 조회 새 DOM, 필터 재그리기와 새 자료에서 상세 초기화, 오류에서 이전 data 미사용 | 모의 새 목록·loading·실패, 실제 재조회 상세0 및 필터all 확인 |
| events-empty-error-distinct | 빈 배열·필터 불일치·통신 실패·형식 확인 불가를 각각 표시 | 빈/형식 오류는 모의 검사, 실제 서버 종료 후 실패·행0/상세0 확인 |

상세는 access의 allowed/denied/unknown, session의 active/expired/revoked/unknown, device의 compliant/noncompliant/unknown을 독립적으로 한국어와 원래 코드로 표시합니다. unknown은 확인 불가이며 정상·안전으로 바꾸지 않습니다. 앱 ID가 없으면 앱 확인 불가로 표시하고 임의 ID를 만들지 않습니다. 실제 조치 버튼은 만들지 않습니다.

## 실행한 검사

1. `node --test test/stage13-identity.test.mjs test/stage14-decision.test.mjs test/stage15-events.test.mjs`: 22개 통과. 신규8개는 정렬/원본 보존, 필터 이름·원래 값, AND 필터/해제, 상세 내용과 토글, unknown/앱 누락, 재조회·필터 변경·오류에서 상세 제거, 빈/형식 오류/loading 구분, HTML 문자열의 안전한 텍스트 표시입니다. 최소 DOM 대역을 사용하는 단위 검사이며 실제 브라우저 검증과 다릅니다.
2. `npm run check --prefix on-client`: 문법 통과. `git diff --check`도 통과했습니다.
3. 1280×720 실제 예제 브라우저: 보안 기록의 제공 기록과 학생 표시1건을 대조하고 Enter로 event-01 상세를 열었습니다. e-01/서버 예제 판정, rule-01/기기 확인 필요, denied/active/unknown 세 상태를 확인했습니다.
4. 실제 세 필터를 access/repository/denied로 선택해1건을 유지하고, 모두 all로 되돌렸습니다. 필터 변경 시 열린 상세가 사라졌습니다. 다시 상세를 연 뒤 다시 불러오기를 눌러 새 목록1건·상세0·필터all을 확인했습니다.
5. 자신이 실행한 예제 서버만 종료한 뒤 다시 불러오기를 눌렀습니다. 학생 칸이 연결 없음과 `기록을 불러오지 못했습니다: 로컬 서버에 연결할 수 없습니다.`를 표시했고 행과 상세는 모두0이었습니다. 이후 예제 서버를 재실행합니다.

## 재현과 한계

macOS 셸의 저장소 루트에서 `ON_PORT=5190 npm run demo --prefix on-client` → http://127.0.0.1:5190/ → 보안 기록 → 필터 적용/해제 → event-01 상세 → 다시 불러오기를 확인합니다. 실패 확인은 자신이 켠 예제 서버만 종료하고 기존 탭에서 다시 불러오기를 누릅니다. 별도 모의 상태는 위 단위 검사로 재현합니다.

Node.js v24.10.0에서 실행했습니다. 제공 실행 안내의22~24 범위 안이지만 고정 검수 버전24.19.0에서는 실행하지 않았습니다. 실제 엔진·ALEPH 계정의 기록 연동은 미연결입니다. 제공 예제1건의 접속 기록과 모의 XDR 자료를 실제 운영 경보·실시간 탐지로 보고하지 않습니다. 빈 목록·다중 기록을 보기 위해 운영 정책이나 제공 서버를 바꾸지 않았습니다. 학생 직접 조작 확인은 받지 않았으며 브라우저 검증은 에이전트 수행입니다.

증빙: [예제 상세](evidence/stage15-detail.png), [실제 연결 실패 후 목록·상세 제거](evidence/stage15-failure.png). 공식 AI는 제출 커밋의 코드 검토이며 실제 앱 실행 인증이 아닙니다. 공식 판정 결과는 아래에 기록합니다.

## 실제 공식 판정

`2d2f8c4ccaabded28200891fab32baad22e9c9fb`를 한 번 제출해 접수·확인 중을 거친 뒤 공식 통과를 확인했습니다. 같은 커밋의 AI 판정 설명에서도 필수7항목 모두 통과이며 필수 수정 사항은 없다고 안내합니다. 새 과정 진도3/10과16단계 제출 가능을 확인했습니다. 숫자 점수는 이 화면에 표시되지 않으므로 과거100점 체계를 임의 적용하지 않습니다. 후속 기록 커밋은 앱을 바꾸지 않으며 다시 제출하지 않습니다. [공식 통과 증빙](evidence/stage15-passed.png).
