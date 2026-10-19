# 켈비 14단계 구현·검증

확인일: 2026-10-20. 현재 공식 안내: https://aleph-omega.vercel.app/defense

## 변경과 보존

시작 저장점은 `7e256c2db38057ec9d5499f35a8e8ccd8226d38e`입니다. 앱 변경은 `on-client/student/extension.mjs`의 `renderDecision` 하나입니다. 같은 파일의 13단계 `renderIdentity`와 나머지 함수는 원문 그대로 유지합니다. 제공 서버·public/app.js·메뉴·인증 설정과 기존 1~12단계/XDR·DB 설정을 변경하지 않습니다. 추가 파일은 14단계 단위 검사·이 문서·예제 화면 증빙이며 루트 README를 갱신합니다.

기존 루트 `aleph.config.json`은 기존 자료실의 12단계 기록으로 보존합니다. 새 14단계는 포털에서 저장소와 40자리 커밋으로 제출하므로 기존 제출 묶음을 다시 만들거나 덮어쓰지 않습니다.

## 필수 항목별 근거

| 항목 | 구현 | 확인 범위 |
|---|---|---|
| student-source-changed | 대기 문구 대신 renderDecision을 실제 입력에 연결 | 코드·제공 UI 호출부 대조 |
| server-decisions-distinct | allow/deny/challenge/unknown을 한국어와 원래 코드로 구분 | 예제 서버의 세 판정은 실제 화면, unknown은 단위 검사 |
| decision-reason-visible | 선택 앱 ID와 data.reason/data.checkedAt을 textContent로 표시 | 제공 판정과 학생 표시의 앱·이유·시각 대응 확인 |
| unknown-not-allow | unknown/알 수 없는 값은 확인 불가로 정규화하고 접근 허용으로 간주하지 말라고 표시 | unknown·잘못된 코드·constructor·누락 자료 모의 검사 |
| failure-not-allow | status error는 요청 실패와 서버 message를 표시하고 거부 판정과 구분 | 서버 종료 후 실제 UI 요청 실패, 이전 allow 결과·이유·시각 제거 |

idle과 loading에서는 과거 data를 표시하지 않습니다. 재조회는 제공 코드가 idle로 되돌리며 학생 함수는 매번 새 DOM을 반환합니다. demo/disconnected/unknown 모드는 각 상태에서도 안내합니다. allow는 정책 판정이지 실제 앱 접속 성공이 아니며 challenge는 추가 인증을 대신 수행했다는 의미가 아닙니다.

## 실행한 검증

- `node --test test/stage13-identity.test.mjs test/stage14-decision.test.mjs`: 14개 통과. 최소 DOM 대역의 단위 검사이며 실제 브라우저 검증과 구분합니다.
- `npm run check --prefix on-client`: 문법 통과.
- 기존259파일의 시작 해시와 대조하여 구현 수정 전후의 다른 코드·설정 보존을 확인합니다. 동일 파일의 renderIdentity 및 renderEvents 이후 원문도 일치합니다.
- 1280×720 실제 예제 브라우저: 요청 전 안내 → 학습 자료실 허용 → 개발 저장소 거부 → 확인할 업무 앱 추가 확인 표시를 확인했습니다. 각 결과에서 제공 UI와 학생 칸의 앱·이유·시각이 일치했습니다.
- Tab·Enter로 요청을 활성화했고, 별도의 Enter 요청에서는 학습 자료실 allow 완료까지 확인했습니다.
- 다시 불러오기 뒤 이전 deny 결과·이유·시각이 사라지고 idle 안내로 바뀌며 13단계 사용자 표시는 유지되는 것을 확인했습니다.
- 실제로 예제 서버를 종료한 뒤 기존 탭에서 개발 저장소 요청을 눌렀습니다. 제공 UI와 학생 칸 모두 요청 실패이며 학생 칸은 거부 판정과 다르다고 안내하고 이전 성공·이유·시각을 표시하지 않았습니다.
- HTML 문자열은 textContent로 표시하고 새 요청·유료 AI 호출·자동 재시도·인증 설정 변경을 학생 함수에 추가하지 않습니다.

## 재현과 한계

저장소 루트에서 macOS 셸로 `ON_PORT=5190 npm run demo --prefix on-client`를 실행하고 http://127.0.0.1:5190/ → 업무 앱으로 이동합니다. 요청 버튼으로 판정과 이유·시각을 확인하고 다시 불러오기로 초기화를 확인합니다. 실패 검증은 자신이 실행한 예제 서버만 종료한 뒤 기존 탭에서 요청합니다. 서버를 다시 실행하면 다시 요청할 수 있습니다.

실행 환경은 Node.js v24.10.0이며 제공 실행 안내의 22~24 범위 안입니다. 고정 검수 버전24.19.0에서는 실행하지 않았습니다. 예제 모드의 서버 판정은 실제 계정·회사 엔진 연결이 아닙니다. 현재 제공 예제는 allow/deny/challenge 세 종류를 반환하므로 unknown은 서버·정책을 바꾸지 않고 별도 단위 검사로 확인했습니다. 실제 업무 앱 접속 성공·추가 인증 완료·운영 엔진 연동은 주장하지 않습니다.

학생 직접 실행 확인은 받지 않았고 위 브라우저 검증은 에이전트가 수행했습니다. 공식 AI는 제출 커밋의 코드를 검토하며 실제 실행 인증이 아닙니다. 공식 제출·판정은 아직 전입니다.
