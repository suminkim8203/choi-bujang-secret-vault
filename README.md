# 켈비 · BYTE BACK 보안 Agent

기존 방어전 1~12단계와 XDR 결과를 보존하며, 공식 13~22단계 시작 틀0.2.13을 `on-client/`에서 이어 개발합니다. 과거 상세 기록은 [원래 main의 과거 기록](https://github.com/suminkim8203/choi-bujang-secret-vault/blob/bbe165687e747ef01e1e8e61c12c311245e5c6d3/DEFENSE_HISTORY.md)에 이전 README 원문 그대로 보존했습니다. 기존 자료실·DB·인증 설정은 변경하지 않습니다.

## 현재 상태

| 범위 | 확인된 결과 |
|---|---|
| 기존1~12단계/XDR6종 | 이전 실제 판정 모두100, 상세와 증빙은 과거 기록 참고 |
| 13단계 | 공식5항목 통과 · 95495bfef227a4cacfa40d01d047911b9e1e3ce5 |
| 14단계 | 공식5항목 통과 · 26272faec2e9a8dc5fee3fecbe5dad67b694cd2b |
| 15단계 | 공식7항목 통과 · 2d2f8c4ccaabded28200891fab32baad22e9c9fb |
| 16단계 | 구현·검증 완료, 첫 접수는 코드 크기로 확인 불가, 재제출 준비 |

## 실행·검증

macOS 저장소 루트에서 `ON_PORT=5190 npm run demo --prefix on-client`를 실행하고 http://127.0.0.1:5190/ 를 엽니다. 기본 연결 없음 확인은 `npm start --prefix on-client`와 http://127.0.0.1:5189/ 입니다. Windows 실행은 [공식 안내](on-client/docs/STUDENT_LAUNCH_GUIDE.md)를 따릅니다. 예제는 실제 계정·회사 엔진·AI 연결이 아닙니다.

검사: `node --test test/stage13-identity.test.mjs test/stage14-decision.test.mjs test/stage15-events.test.mjs test/stage16-status.test.mjs` 및 `npm run check --prefix on-client`. 현재29개 통과입니다. 코드 판정과 로컬 검사, 실제 브라우저 확인을 구분합니다.

## 구현과 증빙

학생 변경은 `on-client/student/extension.mjs`의 단계별 함수입니다. 제공 `public/app.js`·서버·인증·기존 DB는 보존합니다. 사용자/기기/세션, 앱 접근 판정, 기록 필터·상세, 오류·알림·진단 표시를 구현했습니다. 진단은 허용된6필드만 수동 복사하며 미지원 조치는 상세 안의 비활성 버튼으로만 안내합니다. 학생 코드가 새 API·자동 재시도·조치 요청을 보내지 않습니다.

- [13단계 기록](docs/STAGE13_VERIFICATION.md)
- [14단계 기록](docs/STAGE14_VERIFICATION.md)
- [15단계 기록](docs/STAGE15_VERIFICATION.md)
- [16단계 기록](docs/STAGE16_VERIFICATION.md)

현재 포털의 이 반 공개 상한은16단계이며17단계는10월26일 준비 중입니다. 아직 미개방 단계를 완료로 기록하지 않습니다. 실제 운영 엔진·Jev 연결과 옛 공개 Git/배포 이력의 한계도 유지합니다. 비밀번호·서버 키·실제 계정 정보는 요청·기록하지 않습니다.

## 제출용 브랜치

이 kelbi-product 브랜치는 현재 보안 Agent 전체를 별도로 묶은 배포·제출 범위입니다. on-client 전체57파일과13~16단계 검사·문서·증빙을 포함하며 앱 코드는 원래 main의 bbe165687e747ef01e1e8e61c12c311245e5c6d3와 동일합니다. 이전 방어전 코드·과거 증빙은 원래 main과 Git 이력에 보존되어 있고 이 작업에서 삭제하지 않았습니다. 제공 서버나 필요한 런타임 파일을 생략하지 않습니다.
