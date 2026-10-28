# 켈비 · BYTE BACK 보안 Agent

**2026-10-27 최신 운영 안내 정정:** 현재 마무리 과제는 GitHub 저장소 주소와 40자리 커밋으로 제출하며, 포장·업데이트·파일 첨부는 제출 필수가 아닙니다. 이전의 Windows 실행 환경 대기를 정규 과제 제출의 필수 장애물로 취급하지 않습니다. [최신 제출 경로와 공식 R7 조사](docs/FINISH_SUBMISSION_ROUTE.md)를 먼저 봅니다. 실제 제출은 사용자 지시로 계속 보류합니다.

**2026-10-28 현재 상태:** 새 UI의 사용자 승인·원본 적용과 기본 Mac 앱0.1.1/ZIP 재포장·실제 실행 검증을 완료했습니다. 현재 작업은 이 소스와 문서를 최종 저장점으로 정리해 작업 브랜치에 반영하는 단계이며 포털 제출은 계속 보류합니다. [현재 진행 기록](docs/FINISH_PROGRESS.md)·[Mac 사용 안내](docs/MAC_QUICKSTART.md)·[기본 앱 검증](docs/MAC_BASIC_PACKAGE.md)을 봅니다.

2026-10-27의 [새 폴더 재현·공식 포장 사전 점검](docs/FINISH_NON_UI_VERIFICATION.md)과 [Windows 인수인계](docs/WINDOWS_FINISH_HANDOFF.md)는 당시의 별도 경로 조사로 보존합니다. 현재 선택은 기본 Mac `.app`/ZIP이며, Windows 설치형 실행 환경을 제출의 필수 장애물로 취급하지 않습니다.

기존 방어전 1~22단계와 XDR 결과를 보존하며 `on-client/`에서 Mac 완성본을 이어 개발합니다. 22단계 완료본은 시작 틀0.2.14이며, 현재 `finish/kelbi-mac-20261026` 브랜치는 공식0.2.19와 PC 대시보드를 사용합니다. 과거 상세 기록은 [DEFENSE_HISTORY.md](DEFENSE_HISTORY.md)에 보존했습니다. 기존 자료실·DB·인증 설정은 변경하지 않습니다.

## 현재 상태

| 범위 | 확인된 결과 |
|---|---|
| 기존1~12단계/XDR6종 | 이전 실제 판정 모두100, 상세와 증빙은 과거 기록 참고 |
| 13단계 | 공식5항목 통과 · 95495bfef227a4cacfa40d01d047911b9e1e3ce5 |
| 14단계 | 공식5항목 통과 · 26272faec2e9a8dc5fee3fecbe5dad67b694cd2b |
| 15단계 | 공식7항목 통과 · 2d2f8c4ccaabded28200891fab32baad22e9c9fb |
| 16단계 | 공식7항목 통과 · 41736be3e31c398a89f72f7a8bffef8c8507d1fa (kelbi-product) |
| 17단계 | 공식9항목 통과 · 354fbf6fc00128a8758acc02e0e6be1470e87e87 |
| 18단계 | 공식8항목 통과 · 6024c4fb031b8529852424e2691ca3ee5e197931 |
| 19단계 | 공식8항목 통과 · f10e19f9cb88fa4e24fbfeba8059e0f98e395d6e |
| 20단계 | 공식9항목 통과 · 0ccd6e1fc2a68a3830581f2bea4c37048457f725 |
| 21단계 | 공식6항목 통과 · cd662cd29ef72ea769753b9cd8ff39bd0e598800 |
| 22단계 | 공식6항목 통과 · 464acd33ffe812eeb9a120cb511a2d531dfae644 |
| Mac 완성본 개발 | 공식0.2.19 제공본 업데이트 · 학생 PC 대시보드 · 로컬73검사 통과. 추가 심판·제출 결과가 아님 |

## Mac 완성본 사용하기 — 2026-10-26

1. 저장소 루트에서 `ON_PORT=5197 npm start --prefix on-client`를 실행하고 http://127.0.0.1:5197/ 를 엽니다. 종료는 실행 창의 Ctrl+C입니다. 실제 검증 환경은 Node24.10.0/npm11.6.0이며 Windows 공식 실행 환경을 검증한 결과는 아닙니다.
2. **보호 현황 → 리소스 현황**의 **PC 상태 다시 조회**를 누릅니다. 제공된 `/api/pc/status`를 읽으며, CPU·메모리·앱이 있는 디스크와 네트워크 구성은 Mac에서 실제 조회했습니다. Windows 방화벽·기록은 이 OS 미지원으로 표시됩니다. PC 조회 성공과 상단의 보안 엔진 **연결 없음**은 별개입니다.
3. 수동 조회가 쌓이면 CPU·메모리 사용률 추이와 최신순 기록을 비교합니다. 4회 전에는 기록표만, 4회부터 그래프를 표시합니다. 최근20회만 현재 탭 메모리에 보관하며 새로고침·**이 탭의 조회 기록 지우기**로 초기화됩니다. 별도로 제공된 **내 PC 확인** 버튼의 조회는 학생 대시보드 기록에 합치지 않습니다.
4. 실패하면 현재 수치를 비우고 실패 이유를 표시하며, 과거 기록과 그래프는 과거로만 남습니다. 서버를 중단한 실제 실패와 재시작 후 수동 복구, 기록 지우기·새로고침, 키보드 조작을 검증했습니다. CPU85% 이상·메모리90% 이상·디스크 여유10% 미만은 편의상 참고 기준이며 공격·감염·안전 점수가 아닙니다. Mac 메모리는 전체·여유 기준이며 캐시·압축·메모리 압력을 대신하지 않습니다.

제공 PC 조회 자체와 학생이 추가한 비교 기록·참고 기준·근거 요약·화면 꾸밈을 구분합니다. 기존 업무 앱·보안 기록·AI·조치 표시 함수는 유지합니다. 신규 계정 연결·외부 서비스 가입·OS 설정 변경·자동 조회·영구 저장은 추가하지 않았습니다.

공식0.2.19 ZIP SHA-256은 `8ac6fbca48aa13905c2f2e73e3b06ae748dabd7e004a9acc158360ef7f1bd634`입니다. [공식 배포 안내](https://aleph-workbench-downloads.vercel.app/alekov-connect-0.2.19.html)의45개 고정 경로를 대조해 충돌0, 교체19·추가19개만 반영했습니다. 기존 제공 파일은 프로젝트 밖에 백업했으며 Windows 업데이트 도구를 실행한 것으로 기록하지 않습니다. 학생 기능 변경은 그 뒤 별도로 추가했습니다.

이후 사용자의 디자인 수정 요청에 따라 Mac 웹 화면의 `public/index.html`·`public/style.css`를 로컬 수정했습니다. 두 파일은 이제 공식 원본 해시와 다르므로 업데이트 시 학생 UI 변경으로 보존·병합해야 합니다. 그 외43개 고정 경로와 조회·인증·판정 실행 코드는 공식 원본을 유지합니다. 이 웹 화면 디자인이 Windows의 별도 승인 설치 화면에도 적용됐다고 주장하지 않습니다. 첫 화면은 수치·추이·근거 요약을 먼저 표시하고, 기본 PC 조회·계정·AI·취약점·연결 오류와 구현 구분은 키보드로 펼칠 수 있습니다. 기존94개 UI ID·보안 정책·기능은 보존했습니다. 2026-10-28 승인 UI는 화이트·회색과 선명한 파란 포인트, 박스 없는 상단 메뉴와 수치 배치, 가로 막대·파란 실선/회색 점선 그래프입니다. 연결 없음은 회색으로 표시하며, 클릭 가능한 글자 버튼과 구분합니다.

검사 명령은 아래 기존62검사에 `test/finish-mac-dashboard.test.mjs`를 더하면 총73개입니다. 실제 브라우저1280×720에서 카드·그래프·동일 기록표·실패/복구·가로 넘침 없음·키보드 초점을 확인했습니다. 후속 UI 작업에서 웹1280×720/390×844 및 실제 기본 앱 화면을 검증했습니다. 200% 확대·화면 낭독기·다른 사람의 따라 하기 검수는 아직 미실시입니다. 공식 설치 패키지는 Windows 승인 실행 환경이 필요하므로 이번 Mac 개발 실행을 설치형 패키지 완료나 최종 접수로 표시하지 않습니다.

## 실행·검증

macOS 저장소 루트에서 `ON_PORT=5190 npm run demo --prefix on-client`를 실행하고 http://127.0.0.1:5190/ 를 엽니다. 기본 연결 없음 확인은 `npm start --prefix on-client`와 http://127.0.0.1:5189/ 입니다. Windows 실행은 [공식 안내](on-client/docs/STUDENT_LAUNCH_GUIDE.md)를 따릅니다. 예제는 실제 계정·회사 엔진·AI 연결이 아닙니다.

검사: `node --test test/stage13-identity.test.mjs test/stage14-decision.test.mjs test/stage15-events.test.mjs test/stage16-status.test.mjs` 및 `npm run check --prefix on-client`. 17단계 검사는 `test/stage17-ai.test.mjs`를 더하며 18단계는 `test/stage18-explanation.test.mjs`도 더하며 19단계는 `test/stage19-action.test.mjs`도 더하며 20단계는 `test/stage20-vulnerabilities.test.mjs`도 더하며 현재62개 통과입니다. 코드 판정과 로컬 검사, 실제 브라우저 확인을 구분합니다.

## 구현과 증빙

13~22단계 학생 변경은 `on-client/student/extension.mjs`의 단계별 함수입니다. 사용자/기기/세션, 앱 접근 판정, 기록 필터·상세, 오류·알림·진단 표시를 구현했습니다. 진단은 허용된6필드만 수동 복사하며 미지원 조치는 상세 안의 비활성 버튼으로만 안내합니다. 해당 단계의 표시 함수는 새 API·자동 재시도·조치 요청을 보내지 않습니다. 이후 Mac 대시보드는 공식 업데이트로 허용된 PC 읽기 API 하나를 명시적 버튼으로 사용합니다.

- [13단계 기록](docs/STAGE13_VERIFICATION.md)
- [14단계 기록](docs/STAGE14_VERIFICATION.md)
- [15단계 기록](docs/STAGE15_VERIFICATION.md)
- [16단계 기록](docs/STAGE16_VERIFICATION.md)
- [17단계·공식 업데이트 기록](docs/STAGE17_VERIFICATION.md)
- [18단계 기록](docs/STAGE18_VERIFICATION.md)
- [19단계 기록](docs/STAGE19_VERIFICATION.md)
- [20단계 기록](docs/STAGE20_VERIFICATION.md)
- [학생 실행 설명서·구성도](docs/STUDENT_RUNBOOK.md)
- [21단계 기록](docs/STAGE21_VERIFICATION.md)
- [최종 재현·보존 계획](docs/FINAL_REPRODUCTION.md)
- [버전·지원 범위](docs/RELEASE_NOTES.md)
- [22단계 최종 검증·공식 통과](docs/STAGE22_VERIFICATION.md)

2026-10-23 현재13~22단계가 모두 공식 코드·문서 기준 통과됐으며 포털 진도는10/10입니다. 이 버전은 학습 검증 중이며 운영 v1.0이 아닙니다. 공식0.2.14의6파일만 확인값 대조·백업 후 교체했습니다. 실제 계정 연결 준비는 Windows 전용이며 현재 Mac의 NATIVE_HOST_DISABLED를 연결 성공으로 표시하지 않습니다. 아직 미개방 단계를 완료로 기록하지 않습니다. 실제 운영 엔진·Jev 연결과 옛 공개 Git/배포 이력의 한계도 유지합니다. 비밀번호·서버 키·실제 계정 정보는 요청·기록하지 않습니다.


## 새 UI·기본 Mac 앱 갱신 — 2026-10-28

사용자 승인 시안을 기존 미커밋 작업을 보존해 원본 UI2파일에 적용했고, 별도 Electron/Forge 기본 Mac 앱0.1.1과 ZIP으로 다시 포장했습니다. 이전 앱/ZIP은 덮어쓰지 않았습니다. 새 ZIP에서 푼 앱의 실제 PC 조회·그래프·동일 기록·메뉴·초기화·종료·재실행을 확인했고, 소스73검사·wrapper4검사·로컬 요청14개가 통과했습니다. 상세는 [기본 앱 검증](docs/MAC_BASIC_PACKAGE.md), 사용법은 [Mac 사용 안내](docs/MAC_QUICKSTART.md)를 봅니다.

이는 로컬 Mac PC 조회 제품의 기능 검증입니다. 운영 보안 서버·계정·AI·조치 집행 연결, 다른 OS, Developer ID·공증, 실제 처음 사용자 검수를 완료한 것으로 표시하지 않습니다. 재포장 작업 당시에는 최종 커밋·push·접수를 하지 않았습니다. 이 저장점은 승인된 후속 소스 정리를 포함하며, 현재 저장점의 커밋 번호는 GitHub의 해당 커밋으로 식별합니다. 포털 제출 보류는 유지합니다. 정규 과제 제출은 저장소 URL·40자리 커밋이고 포장은 선택입니다. [현재 진행 상태](docs/FINISH_PROGRESS.md)와 [제출 경로](docs/FINISH_SUBMISSION_ROUTE.md)를 우선합니다.

기본 Mac 포장도 [재현 가능한 포장 소스](packaging/mac-basic/README.md)와 고정 lock·45파일 목록을 함께 보관합니다. 앱/ZIP·개인 경로가 담긴 시험 자료·실제 실행 프로필은 Git에서 제외합니다.
