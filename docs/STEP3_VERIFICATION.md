# 3단계 요구사항과 검증 기록

이 문서는3단계 당시의 검증 범위와 판정 기록입니다. 이후4·5단계 보호와 공통 보안 헤더 보완을 거쳐3단계도100/100으로 재판정됐습니다. 현재 상태와 증빙은 [방어전 기록과 포트폴리오 준비](DEFENSE_PORTFOLIO.md)를 참조하세요. 아래 당시90점 및 소유자 검사 미구현 설명은 현재 상태가 아닙니다.

2026-10-06에 로그인된 공식 방어전의 3단계 제작 1·2·3, 제출 전 확인, 직접 확인할 것을 다시 읽었습니다. 이 문서는 학생 검증 근거이며 운영 심판의 항목별 채점표가 아닙니다. 재확인 대상 기능은 기존 운영 저장점 `0b9b3dc4853fcf0f2411c8c0722dc147b2faad9f`와 같습니다. 이번 보완은 검사 범위 및 증빙이며 인증·DB·API·화면 동작을 변경하지 않습니다.

## 요구사항별 근거

| 공식 출처 / 요구 | 현재 코드·설정 | 운영 확인 또는 증빙 | 판정 범위 |
|---|---|---|---|
| 제작 1 / 실제 이메일·비밀번호 로그인과 로그아웃 | public/app.js의 공식 SDK signInWithPassword·signOut, public/index.html | 사용자가 기존 실습 계정 로그인 완료 보고. 이후 로그인된 화면과 정상 메모 작업, 로그아웃 뒤 목록·작성 화면 숨김을 직접 확인 | 정상 흐름 확인 |
| 제작 1 / 로그인 실패 이유 표시 | 공개 화면에 일반 실패 안내와 이메일 미확인 안내 분기 | 코드 분기 확인. 이번 재검증에서 실제 실패 로그인은 실행하지 않음 | 운영 실패 흐름 미실행 |
| 제작 2 / 틀의 검증 도우미를 고치지 않음 | src/verify-login.mjs와 src/notes-api.mjs | 2단계 최종 저장점 a4bdbf3에서 현재까지 도우미 diff 없음. 서버 handler가 도우미 호출 | 코드 확인 |
| 제작 2 / 브라우저 userId·role을 신뢰하지 않음 | 검증 도우미가 반환한 userId 사용 | 로컬 계약 시험에서 userId·role·owner_id 주입을 해도 검증된 ID로 저장. 실제 운영 사용자 흐름도 성공 | 코드·로컬 시험 및 정상 운영 확인; 운영 주입 시험은 미실행 |
| 제작 2 / 토큰 없거나 실패하면 자료 없이 거부 | 서버의 HTTP401·단일 error 응답, no-store | 실제 운영 익명 목록·개별 GET·POST·PUT·DELETE와 잘못된 토큰 요청 모두 자료 없는 HTTP401 | 실제 요청 확인 |
| 제작 2 / 정상 A 로그인 유지 | 공식 SDK 세션에서 Bearer 전달 | 실제 운영에서 빈 본인 목록 → 임시 가상 메모 추가 → 개별 조회 → 수정 → 삭제 → 빈 목록으로 복귀 | 브라우저 직접 확인 |
| 제작 2 / identityProvider 공개 정보 | aleph.config.json의 issuer·audience·jwksUrl, 운영 /aleph.json | 공개 운영 식별 정보와 설정 일치 확인. 서버 키 미포함 | 공개 정보 확인 |
| 제작 3 / 추가 시 검증된 ID를 owner_id로 저장 | src/notes-api.mjs의 POST row 구성 | 로컬 계약 시험에서 확인. 운영 추가와 본인 목록 조회 성공. 운영 DB owner_id 원문은 이번에 읽지 않음 | 코드·로컬 및 정상 운영 확인 |
| 제작 3 / 목록은 로그인 사용자의 메모 배열 | GET owner_id 필터, displayRow | 로그인 직후 빈 본인 목록, 작성 후 한 카드, 삭제 후 빈 목록 확인 | 브라우저 직접 확인 |
| 제작 3 / UUID 입력·생성, POST 응답 {id} | noteInput·randomUUID, POST HTTP201 | UUID 지정 계약은 로컬 시험. 실제 화면의 ID 생략 작성 성공 | 코드·로컬 및 정상 운영 확인 |
| 제작 3 / 개별 GET·PUT·DELETE, 삭제 후 GET404 | api/note.js, vercel.json rewrite, src/notes-api.mjs | 수정 버튼의 개별 GET 성공 후 PUT 수정 성공. 삭제 처리가 DELETE 후 같은 ID GET404를 확인한 경우에만 성공 메시지 표시; 실제 메시지 확인 | 브라우저 직접 확인, 응답 원문은 저장하지 않음 |
| 제작 3 / 실제 경로 allowedRoutes | /api/notes, /api/notes/:id | 실제 목록·작성·개별 조회·수정·삭제 경로 동작, 설정·운영 식별 정보 일치 | 실제 경로 확인 |
| 직접 확인 / 시크릿 창에서 무로그인 자료 숨김 | 로그인하지 않으면 workspace 숨김, API 인증 요구 | 사용자가 실제 시크릿 확인 완료 보고. 별도로 에이전트의 로그아웃 화면 확인과 쿠키 없는 익명 HTTP 요청 확인 | 사용자 직접 확인과 에이전트 검증을 구분 |
| 직접 확인 / 브라우저에 서버 전용 키 없음 | 서버 환경에서만 키 읽음; database.json에는 공개 정보만 포함 | 현재 Git·로컬 public 및 운영 /, /data.json, /aleph.json, /database.json, /app.js, /vendor/supabase.js에서 비밀·원본 메모 본문 패턴 미검출 | 해당 검사 범위에서 미검출; 모든 비밀 형식의 부재를 증명하지 않음 |
| 제출 전 확인 / 저장점과 npm run bundle | 공식 scripts/bundle.mjs·schema v2 보존 | 새 저장점 커밋 및 운영 배포 확인 후 제출 묶음 생성. JSON과 설명에는 비밀번호·토큰·계정 주소·메모 본문을 넣지 않음 | 생성 결과는 README 및 이번 제출 기록 참조 |

## 단계 전체 변경을 재현하는 방법

3단계 시작 직전의 2단계 저장점은 `a4bdbf3a4ddd2882e51aafe68006cd84d930076f`입니다.

```sh
git diff --name-only a4bdbf3a4ddd2882e51aafe68006cd84d930076f HEAD
git diff a4bdbf3a4ddd2882e51aafe68006cd84d930076f HEAD -- src/verify-login.mjs
node --test test/r5.test.mjs test/step2.test.mjs test/step3.test.mjs
npm run build -- --local
node scripts/check-public-notes.mjs
npm run bundle
```

첫 번째 명령은 단계 전체 변경 목록이며 두 번째는 원본 도우미의 무변경 확인입니다. 공식 bundler의 changedFiles는 마지막 커밋만 기록합니다. 단계 전체 목록과 혼동하지 않고 공식 제출 형식은 유지합니다. 제출 묶음의 attackAttempts는 그 실행에서 실제 보낸 자동 HTTP 요청만 기록하며, 사용자 시크릿 확인·브라우저 정상 흐름은 explanation과 이 문서에서 출처를 구분합니다.

## 남은 한계

- 공식 3단계 안내대로 개별 ID 소유자 검사는 4단계 대상이며 추가하지 않았습니다. 로그인한 B의 타인 메모 접근을 차단했다고 주장하지 않습니다.
- 옛 공개 Git 커밋·옛 배포 이력의 가상 메모는 제거되지 않았습니다.
- 이전 실제 심판은 90/100, 필수 조건 7개·완결성 가점 2개였습니다. 학생용 화면에는 가점 항목명·배점·누락 사유가 없으므로 이번 증빙 보완을 누락 10점 원인이라고 하지 않습니다.
- 이번 재검증 결과와 실제 재판정 결과는 구분합니다. 별도 지시 전 4단계 작업을 하지 않습니다.
