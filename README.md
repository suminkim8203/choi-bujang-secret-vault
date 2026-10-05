# BYTE BACK 방어전 · 2단계 비교본

현재 단계는 2단계이며 운영 주소는 https://choi-bujang-secret-vault.vercel.app 입니다. 기존 통과 버전은 Git 브랜치 `step2-score-baseline-a0a895c`에 보존했습니다. 기존 90점을 받던 구현과 비교하려고 API와 화면을 단순한 구성으로 다시 작성했습니다. DB 자료·권한·환경변수·로그인 없는 읽기 범위는 변경하지 않습니다. 이 비교본의 새 심판 판정은 아직 대기입니다.

## 공식 지시와 현재 구현

| 확인 항목 | 구현 및 확인 방법 |
|---|---|
| 학습용 Supabase에 가상 자료 이동 | 전용 테이블 public.aleph_defense_notes에 가상 자료4건. 실제 자료를 사용하지 않습니다. |
| owner_id uuid, auth.users 외래키 없음 | 공개 구조 SQL [db/step2-schema.sql](db/step2-schema.sql). 자료 행이 포함된 원본 생성 SQL은 Git 제외 artifacts/step2-db-setup.sql에 있습니다. |
| RLS 활성화, anon/authenticated 직접 읽기 거부 | 원래 운영 SQL에서 활성화와 두 역할 SELECT 권한 없음 확인. 공개용 키로 직접 DB 읽기는 권한 오류여야 합니다. |
| Vercel api 서버 함수에서 DB 읽기 | api/notes.js가 SUPABASE_URL과 SUPABASE_SECRET_KEY를 환경변수에서 직접 읽습니다. 키 값은 사용자만 Vercel Production Secret 입력란에 넣습니다. |
| 키를 화면·응답·로그에 넣지 않음 | 서버는 id/title/content만 반환하고 DB 오류는 일반 오류로 바꿉니다. 키 값이나 DB 오류를 로그로 출력하지 않습니다. |
| 화면에 가상 카드4개 표시 | public/index.html에서 GET /api/notes를 요청해 DOM textContent로 표시합니다. 정적 파일에는 메모 행이 없습니다. |
| 공개 data.json 비우기 | data.json과 public/data.json 모두 notes 빈 배열입니다. 빌드는 메모가 있으면 실패합니다. |
| 남은 공개 API 약점 기록 | 아직 로그인 없이 GET /api/notes에서 가상 메모4건을 읽을 수 있습니다. DB 이전만으로 자료 보호 완료라고 하지 않습니다. |
| 옛 공개 이력의 한계 설명 | 아래 문단과 실제 화면에 명시했습니다. |

## 옛 공개 이력과 남은 약점

이전 공개 Git 커밋과 옛 Vercel 배포에는 가상 자료가 남아 있습니다. 최신 파일에서 제거해도 이 변경으로 과거 공개 이력이 삭제되지는 않습니다. 과거 노출은 해소되지 않았습니다. 현재 서버 API도 누구나 가상 자료를 읽을 수 있습니다. 이 두 한계를 화면에서도 설명하며, 3단계 로그인이나 다른 단계 기능을 미리 구현하지 않습니다.

## 다시 확인하는 순서

1. `node --test test/r5.test.mjs test/step2.test.mjs`로 DB 요청 제한, 추가 필드 제외, 잘못된 DB 설정 거부와 일반 오류 처리를 확인합니다.
2. `npm run build -- --local`은 정적 파일만 확인합니다. 운영 DB나 Vercel 배포를 증명하지 않습니다.
3. `node scripts/check-public-notes.mjs`로 최신 Git 파일 전체, 로컬 public 파일, 운영 정적 경로 /·/data.json·/aleph.json·/database.json에 원본 메모 본문과 비밀값 패턴이 없는지 검색합니다. 값이나 본문을 출력하지 않습니다. 정상 결과는 passed:true, sourceFindings:[], 각 응답 noteBody:false/secretPattern:false입니다. 발견하거나 확인하지 못하면 종료 코드1로 중단합니다.
4. 운영 화면은 카드4개가 보여야 하고 /data.json에는 메모가 없어야 합니다. 공개 API에서 자료4건 읽기는 2단계의 의도된 남은 약점입니다. POST /api/notes는 HTTP405여야 합니다.
5. 공개 database.json에는 URL·Publishable key·테이블명만 있습니다. 공개용 키로 전용 DB 테이블을 직접 읽으면 HTTP401/403과 PostgreSQL42501 권한 거부가 함께 확인돼야 합니다. 잘못된 키 오류를 권한 거부 성공으로 세지 않습니다.
6. 「2단계 저장점」 커밋을 만든 뒤 `npm run bundle`을 실행합니다. Git 제외 artifacts/submission.json에는 실제 요청 점검 결과가 담깁니다. bundle-notes.json도 Git에 올리지 않습니다. 자기 점검은 심판 판정이 아닙니다.
7. 포털 https://aleph-omega.vercel.app/defense 의 2단계 「단계 창 열기」에서 실제 배포 주소를 제출합니다.

## 확인 기록

- 기존 버전: 최초 제출, 공개 DB 정보 보완, 구조 SQL 공개, 검색 재현성 보완에서 실제 심판90점·조건4개 충족·가점2개였습니다.
- 2026-10-06 API 환경변수 읽기 위치 비교 ebee766: 운영에서 해당 SHA와 점검4개를 확인해 새 접수 e4976301-4ea1-4d95-b5e3-4270e411f7f1을 만들었습니다. 대기 상태를 거친 뒤 실제 화면도90점·가점2개였습니다.
- 비교본: API와 화면을 새로 작성했습니다. 로컬 검사·운영 검사·새 심판 결과는 각각 확인 후 기록합니다. 정확한 누락10점 항목과 심판이 읽는 코드 경로는 공개된 정보로 확인되지 않았습니다.

---

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
