# 켈비 17단계 · AI 연결 점검과 사건 설명

확인일: 2026-10-23. 기준은 현재 [공식 단계 안내](https://aleph-omega.vercel.app/defense)입니다. 공개 상한은20단계이며17단계부터 순차 제출합니다. 기존13~16단계 통과와1~12단계/XDR 기록은 보존합니다.

## 공식 시작 틀 업데이트

시작 main은 `9176e80`이며 학생 확장 원본과 전체 추적 파일의 해시를 기록했습니다. 공식0.2.14 안내의 ZIP SHA-256 `88294d21948386e7be2b01cb895e69722a1401e88a51183e55a326bd4700d66b`와 도구 SHA-256 `a02bc018ef39989cfb7745edcc66aa9065cb0accad7c00b0aa06e965201beb7a`를 대조했습니다.

공식 업데이트 스크립트는 Windows 경로·ACL API 전용이므로 Mac에서 실행했다고 주장하지 않습니다. 도구의17개 제공 파일 고정 해시와 기존0.2.13 파일을 먼저 대조한 뒤 공식 ZIP의 지정6파일만 교체했습니다: `.on-starter-manifest.json`, `README.md`, `package.json`, `public/ai-connect.mjs`, `src/connection/manager.mjs`, `src/connection/native-login.mjs`(모두 on-client 아래). 학생 폴더와271개 다른 추적 파일은 이 업데이트 직후 바이트가 일치했습니다. 원래6파일과 전체 추적 해시는 저장소 밖 프로젝트 백업 폴더에 보관했습니다. 기존 계정 설정·비밀·환경 파일은 열거나 바꾸지 않았습니다.

제공 서버·public/app.js·인증 로직을 임의 수정하지 않았으며 공식 업데이트 이후 학생 함수만 구현했습니다. 실제 공식 원본 파일 해시는 업데이트 완료 상태와 일치합니다.

## 구현·검사

| 필수 항목 | 구현 및 확인 범위 |
|---|---|
| student-source-changed | renderAiConnection과 renderExplanation 기본 표시만 추가. 앞 단계 함수 보존 |
| ai_transport_checked | idle/loading/error/ok, test/verified·modelCount·checkedAt. 연결 점검과 사건 설명 실행을 명시적으로 구분 |
| ai_model_called | 제공 사건 설명 요청의 성공 입력에만 사건ID 속성·요약을 표시. 실제 생성 모델 호출은 현재 환경에서 미확인 |
| ai_auth_error | 권한 준비·인증·접근 제한·권한 변경을 안전한 code/message와 복구 방향으로 표시 |
| ai_limits | 반 사용량·이용 한도·이용 시간·요청 제한을 구분 |
| ai_manual_recovery | 학생 코드의 요청·타이머0, 제공 버튼으로만 다시 점검. 새 DOM에 이전 결과 없음 |
| ai_generation_reset | idle/loading/error에서 과거 data·시각 미표시. 제공 코드의 세대 검사·취소는 변경하지 않음 |
| secret_absence | 허용된 안전한 문자열만 textContent, 여분 credential 필드 미접근, 비밀 형태 합성 입력 차단 |
| ai_timeout_cancel | timeout/network/cancel을 구분하고 이전 응답이 현재 결과가 아님을 표시. 실제 지연 모델 취소는 미확인 |

`node --test test/stage13-identity.test.mjs test/stage14-decision.test.mjs test/stage15-events.test.mjs test/stage16-status.test.mjs test/stage17-ai.test.mjs`:37개 통과. 합성 DOM·합성 입력·요청 금지 대역의 결과이며 실제 계정/유료 모델 성공을 뜻하지 않습니다. `npm run check --prefix on-client`와 diff 검사도 따로 확인합니다.

## 실제 화면과 남은 연결 경계

현재 Mac에서 `ON_PORT=5192 npm start --prefix on-client`로 기본 앱 실행을 확인했습니다. 실제 AI 점검은 `AI_REQUEST_UNVERIFIED`이고 계정 연결 시작은 `NATIVE_HOST_DISABLED`입니다. 제공 native-context는 win32·Windows 자격 저장소를 요구하며 공식 준비 도구도 Windows 전용입니다. 이를 우회하거나 임의 설정·모델·키를 추가하지 않았습니다. 현재 계정·앱 승인·실제 모델 호출은 미연결입니다. [실제 미연결 표시 증빙](evidence/stage17-disconnected.png).

`ON_PORT=5193 npm run demo --prefix on-client`에서는 기존 기기·세션·기록 예제가 유지됐습니다. 학생 AI 영역은 idle→직접 AI 연결 점검→`ON_AI_PROVISIONING_PENDING`→다시 불러오기→idle로 바뀌고 이전 권한 오류가 사라졌습니다. 예제 실행은 실제 계정·운영 엔진·AI 연결 성공이 아닙니다.

권한 연결은 계정 확인과 AI 앱 승인을 분리해 사용자 화면에서 진행해야 합니다. Workbench 개발용 AI, 앱의 사건 설명 AI, 과제 코드 판정 AI는 서로 다른 역할입니다. 코드 판정 결과와 실제 연결·사건 설명 실행 증거를 따로 기록합니다.

## 제출

기존 main과 과거 이력을 보존하고 이전16단계와 같은 `kelbi-product` 브랜치에 전체 현재 앱·검사·문서를 동기화해 공개 GitHub 주소와 실제40자리 커밋으로 제출합니다. 로컬 원문 JSON 업로드를 사용하지 않습니다. 아직 새 공식 판정 전이며 통과로 기록하지 않습니다.
