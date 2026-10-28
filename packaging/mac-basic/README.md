# 켈비 기본 Mac 포장 소스

승인된 로컬 PC UI를 Electron/Forge 기본 `.app`과 ZIP으로 만드는 소스입니다. 설치 마법사·DMG·publisher·공식 ALEPH 포장 도구는 사용하지 않습니다. 자세한 실제 시험 결과는 [Mac 기본 앱 검증](../../docs/MAC_BASIC_PACKAGE.md)을 봅니다.

## 재현

현재 폴더(`packaging/mac-basic`)에서 아래를 순서대로 실행합니다. macOS arm64와 검토한 Node 환경을 사용합니다. 의존성 버전은 package-lock.json으로 고정했습니다.

```sh
npm ci --no-audit --no-fund
npm exec -- install-electron
npm test
npm run make:zip
```

`out/` 아래 `.app`과 `out/make/zip/darwin/arm64/` ZIP이 생깁니다. 원본 on-client는 읽기만 합니다. `evidence/source-baseline.json`은 저장소 안의 상대 경로와45파일 지문만 담으며 키·계정·개인 경로는 포함하지 않습니다. 원본이 달라지면 staging은 멈춥니다. 소스 변경을 검토하지 않고 기준 해시를 무조건 갱신하지 않습니다.

소스 재현에서는 먼저 staging/evidence 작업 폴더가 없어도 준비됩니다. 실제 배포 파일은 Git에 넣지 않고 별도 보관합니다. 이 폴더의 검사 결과가 공식 과제 판정을 뜻하지 않습니다.

이번 고정 소스로 별도 포장 공간에서 Electron45.0.0/Forge8.0.1/내장 Node24.22.0 앱의 ZIP 추출·UI·PC 조회·기록·메뉴·종료·재실행을 확인했습니다. 여기로 옮긴 상대 경로 staging과 기존4검사는 추가로 확인합니다. 기본 wrapper 두 파일과 설정·lock은 실제 포장본과 동일합니다.

로컬 자체 서명만 사용하며 Developer ID·공증·외부 배포는 하지 않습니다. 현재 Apple Silicon Mac만 검증했습니다. 기존 켈비가 실행 중이면 본인이 종료한 뒤 새 앱을 엽니다. 기존 앱과 개발 서버를 찾아 종료하지 않습니다.

실행 시 본인이 만든 loopback 임시 포트만 사용하고, 브라우저 Node 권한·외부 이동·팝업·장치 권한은 제한합니다. 운영 보안 엔진·계정·AI·조치 집행을 연결하지 않으며 현재 탭 기록은 영구 보관하지 않습니다. 제출은 별도 사용자 지시가 있을 때만 합니다.
