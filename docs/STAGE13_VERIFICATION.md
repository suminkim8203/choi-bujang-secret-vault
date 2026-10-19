# 켈비 13단계 구현·검증 기록

작성일: 2026-10-20. 공식 안내: https://aleph-omega.vercel.app/defense
시작 틀: https://aleph-workbench-downloads.vercel.app/alekov-starter-0.2.13.zip

## 보존 범위

- 시작 전 저장점: `67bb20d2a39e868eb0c160217906030081a302d8`.
- 기존 프로젝트 루트가 계속 Git 저장소 루트입니다. 공식 ZIP의 `on-client` 57개 파일을 없는 경로에만 추가했습니다. 기존 DB·정책·API·Vercel 설정을 변경하지 않았습니다.
- 공식 ZIP 대비 수정은 `on-client/student/extension.mjs`의 `renderIdentity` 하나입니다. 나머지 7개 학생 함수의 대기 문구와 제공 `src/`, `public/app.js`는 보존합니다.
- 추가 문서는 이 파일과 루트 README이며, 별도 단위 검사는 `test/stage13-identity.test.mjs`입니다. 기존 제출 묶음은 생성하거나 덮어쓰지 않습니다.
- ZIP의 CURRICULUM/IMPLEMENTATION_CONTRACT에는 로컬 제안·과거 판정 방식 설명도 있으므로, 현재 운영 포털의 공식 과제 안내와 통과 조건을 우선했습니다.

## 요구사항별 증거

| 공식 항목 | 구현·검증 | 범위 |
|---|---|---|
| student-source-changed | 기존 대기 함수 대신 새 DOM 반환, 입력 계약 유지 | 코드 대조 |
| three-menus | 공식 UI의 보호 현황·업무 앱·보안 기록 유지 | 1280×720 브라우저에서 마우스 3메뉴, Tab·Enter 진입 및 방향키·Enter 이동 확인 |
| student-identity-updates | me/devices/sessions를 독립 처리하고 입력 label/id/status 표시 | 예제 화면과 제공 표시 대조, 다른 사용자·상태는 모의 입력 단위 검사 |
| student-failure-visible | error.message를 텍스트로 표시하고 error의 data는 표시하지 않음 | 예제 서버를 종료한 뒤 재조회, 연결 실패·이전 practice-user 제거 확인 |
| identity-after-reload | 호출마다 새 DOM을 반환하고 제공 UI가 교체 | 예제 서버가 켜진 상태에서 재조회 시각 갱신, 새 값/오류는 단위 검사 |

기기 상태는 compliant=보안 기준 충족, noncompliant=보안 기준 미충족, unknown=확인 불가입니다. 세션은 active=활성, expired=만료, revoked=철회됨, unknown=확인 불가로 표시하며 한국어 설명 옆에 전달받은 원래 코드도 병기합니다. loading과 error에서도 demo/disconnected/unknown 안내를 유지합니다. DOM은 createElement/textContent로 만들며 HTML 문자열을 실행하지 않습니다.

## 실행한 검사

1. `node --test test/stage13-identity.test.mjs`: 7개 통과. 상태 조합, 독립 자원 실패, 사용자 교체와 실패 뒤 이전 값 제거, 빈/잘못된 목록, HTML 문자열의 텍스트 표시를 검사했습니다. 최소 DOM 대역을 쓰는 단위 검사이며 실제 브라우저 검증과 다릅니다.
2. `npm run check --prefix on-client`: 문법 통과.
3. 기존 r5·step2~step12 회귀 검사: 71개 통과. 운영 심판 재판정이 아닙니다.
4. `npm run build -- --local`: 기존 자료실 빌드 통과. 새 앱의 배포나 실제 엔진 연결을 의미하지 않습니다.
5. 공식 예제 실행 → 화면 표시·세 메뉴 이동·성공 재조회 → 예제 서버 종료 → 재조회 실패와 이전 정보 제거 → 기본 실행 → 연결 없음/원천 연결 확인 실패 표시를 실제 브라우저에서 확인했습니다.

실행 Node.js는 v24.10.0입니다. 공식 실행 안내의 지원 범위 22~24에 포함되지만 제공 package.json의 고정 검수 버전 24.19.0과는 다릅니다. 고정 검수 버전에서는 실행하지 않았습니다. 외부 패키지나 워크벤치를 새로 설치하지 않았습니다.

## 재현

저장소 루트에서 `npm run demo --prefix on-client`를 실행하고 http://127.0.0.1:5189/ 를 엽니다. 세 메뉴와 학생 로그인 표시를 확인하고 다시 불러오기를 누릅니다. 서버를 종료한 뒤 기존 브라우저 탭에서 다시 불러오기를 눌러 이전 사용자 대신 연결 실패가 표시되는지 봅니다. 이후 `npm start --prefix on-client`로 기본 연결 없음 상태를 확인합니다. 두 서버를 같은 포트에서 동시에 실행하지 않습니다.

기본 제목 케셰브는 제공 UI 원본입니다. 포털 이름 켈비와 다르다고 해서 학생 담당 밖의 제공 파일을 변경하지 않았습니다.

## 미확인·한계

- 실제 ALEPH 계정·기기·세션 엔진 연동은 하지 않았습니다. 예제는 실제 연결이 아닙니다.
- 학생이 직접 같은 화면을 조작한 결과는 아직 받지 않았으며 에이전트의 브라우저 검증과 구분합니다.
- 기기 상태 표시는 악성코드 검사·치료 기능이 아닙니다.
- 14단계 이후 학생 함수는 미구현입니다.
- 공식 판정·진도는 포털 제출 후의 서버 결과로만 기록합니다.

## 첫 판정과 보완

첫 제출 `0a0c470d77042d5e132592ade7a898a7a7373622`는 AI 검토에서 5개 중 4개 충족, student-identity-updates 미충족이었습니다. 상태 번역은 있지만 공통 규칙의 원래 상태 코드 병기가 빠졌다는 구체적인 피드백을 받았습니다. 같은 renderIdentity 안에서 현재 기기·세션과 두 목록 모두 한국어와 원래 코드를 함께 표시하도록 보완하고, 상태 검사에도 원래 코드 병기를 추가했습니다. 보완 재판정은 아직 확인 전입니다.
