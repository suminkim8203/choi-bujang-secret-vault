# 켈비 · BYTE BACK 보안 Agent

기존 방어전 1~12단계와 XDR 결과를 보존하며, 공식 13~22단계 시작 틀0.2.14을 `on-client/`에서 이어 개발합니다. 과거 상세 기록은 [원래 main의 과거 기록](https://github.com/suminkim8203/choi-bujang-secret-vault/blob/bbe165687e747ef01e1e8e61c12c311245e5c6d3/DEFENSE_HISTORY.md)에 이전 README 원문 그대로 보존했습니다. 기존 자료실·DB·인증 설정은 변경하지 않습니다.

## 현재 상태

| 범위 | 확인된 결과 |
|---|---|
| 기존1~12단계/XDR6종 | 이전 실제 판정 모두100, 상세와 증빙은 과거 기록 참고 |
| 13단계 | 공식5항목 통과 · 95495bfef227a4cacfa40d01d047911b9e1e3ce5 |
| 14단계 | 공식5항목 통과 · 26272faec2e9a8dc5fee3fecbe5dad67b694cd2b |
| 15단계 | 공식7항목 통과 · 2d2f8c4ccaabded28200891fab32baad22e9c9fb |
| 16단계 | 공식7항목 통과 · 41736be3e31c398a89f72f7a8bffef8c8507d1fa (kelbi-product) |
| 17단계 | 구현·로컬37검사 완료, 실제 계정·AI 연결은 미확인, 코드 판정 준비 |

## 실행·검증

macOS 저장소 루트에서 `ON_PORT=5190 npm run demo --prefix on-client`를 실행하고 http://127.0.0.1:5190/ 를 엽니다. 기본 연결 없음 확인은 `npm start --prefix on-client`와 http://127.0.0.1:5189/ 입니다. Windows 실행은 [공식 안내](on-client/docs/STUDENT_LAUNCH_GUIDE.md)를 따릅니다. 예제는 실제 계정·회사 엔진·AI 연결이 아닙니다.

검사: `node --test test/stage13-identity.test.mjs test/stage14-decision.test.mjs test/stage15-events.test.mjs test/stage16-status.test.mjs` 및 `npm run check --prefix on-client`. 17단계 검사는 `test/stage17-ai.test.mjs`를 더하며 현재37개 통과입니다. 코드 판정과 로컬 검사, 실제 브라우저 확인을 구분합니다.

## 구현과 증빙

학생 변경은 `on-client/student/extension.mjs`의 단계별 함수입니다. 제공 `public/app.js`·서버·인증·기존 DB는 보존합니다. 사용자/기기/세션, 앱 접근 판정, 기록 필터·상세, 오류·알림·진단 표시를 구현했습니다. 진단은 허용된6필드만 수동 복사하며 미지원 조치는 상세 안의 비활성 버튼으로만 안내합니다. 학생 코드가 새 API·자동 재시도·조치 요청을 보내지 않습니다.

- [13단계 기록](docs/STAGE13_VERIFICATION.md)
- [14단계 기록](docs/STAGE14_VERIFICATION.md)
- [15단계 기록](docs/STAGE15_VERIFICATION.md)
- [16단계 기록](docs/STAGE16_VERIFICATION.md)
- [17단계·공식 업데이트 기록](docs/STAGE17_VERIFICATION.md)

2026-10-23 실제 포털은20단계까지 공개됐고17단계부터 순차 제출 가능합니다. 공식0.2.14의6파일만 확인값 대조·백업 후 교체했습니다. 실제 계정 연결 준비는 Windows 전용이며 현재 Mac의 NATIVE_HOST_DISABLED를 연결 성공으로 표시하지 않습니다. 아직 미개방 단계를 완료로 기록하지 않습니다. 실제 운영 엔진·Jev 연결과 옛 공개 Git/배포 이력의 한계도 유지합니다. 비밀번호·서버 키·실제 계정 정보는 요청·기록하지 않습니다.

## 제출용 브랜치

kelbi-product는 전체 on-client 앱과13~17단계 검사·문서·증빙을 담은 제출 사본입니다. 현재 앱은 main 구현 저장점 `6ca7a8d7c7e0c3a1da9c5b838005102ceec9785a`와 바이트가 일치합니다. 기존1~12단계와XDR 파일·과거 기록은 원래 main과 Git 이력에 보존합니다. 제공 서버·런타임 파일을 생략하지 않으며 실제 계정 연결은 현재 Mac에서 미확인입니다.
