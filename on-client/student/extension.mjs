// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
  return {
    renderIdentity({ me, devices, sessions } = {}) {
      // 호출마다 새 DOM을 반환해 재조회·실패 뒤 이전 사용자 정보를 남기지 않는다.
      const root = document.createElement('section');
      root.setAttribute('aria-label', '로그인 정보');
      const add = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.append(node);
        return node;
      };
      const value = input => typeof input === 'string' && input.trim() ? input : '확인 불가';
      const deviceStatus = input => {
        const labels = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
        return Object.hasOwn(labels, input) ? `${labels[input]} (${input})` : '확인 불가 (unknown)';
      };
      const sessionStatus = input => {
        const labels = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
        return Object.hasOwn(labels, input) ? `${labels[input]} (${input})` : '확인 불가 (unknown)';
      };
      const renderResource = (title, resource, renderData) => {
        const group = document.createElement('section');
        add(group, 'h3', title);
        // 모드 안내는 loading/error에서도 생략하지 않는다.
        const mode = { demo: '예제 자료 · 실제 연결 아님', disconnected: '연결 없음', unknown: '연결 상태 확인 불가' }[resource?.mode];
        if (mode) add(group, 'p', mode);
        else if (resource?.mode !== 'connected') add(group, 'p', '연결 상태 확인 불가');
        if (resource?.status === 'loading') add(group, 'p', '불러오는 중');
        else if (resource?.status === 'error') add(group, 'p', `연결 실패: ${value(resource.error?.message)}`);
        else if (resource?.status === 'ok' && resource.data != null) renderData(group, resource.data);
        else add(group, 'p', '확인 불가');
        root.append(group);
      };
      renderResource('현재 사용자·기기·세션', me, (group, data) => {
        add(group, 'p', `사용자: ${value(data.user?.label)} · ID: ${value(data.user?.id)}`);
        add(group, 'p', `현재 기기: ${value(data.device?.label)} · ID: ${value(data.device?.id)} · ${deviceStatus(data.device?.status)}`);
        add(group, 'p', `현재 세션: ${value(data.session?.id)} · ${sessionStatus(data.session?.status)}`);
      });
      renderResource('본인 기기 목록', devices, (group, rows) => {
        if (!Array.isArray(rows)) return void add(group, 'p', '기기 목록 확인 불가');
        if (!rows.length) return void add(group, 'p', '표시할 기기가 없습니다.');
        const list = document.createElement('ul');
        for (const row of rows) add(list, 'li', `${value(row?.label)} · ID: ${value(row?.id)} · ${deviceStatus(row?.status)}`);
        group.append(list);
      });
      renderResource('본인 세션 목록', sessions, (group, rows) => {
        if (!Array.isArray(rows)) return void add(group, 'p', '세션 목록 확인 불가');
        if (!rows.length) return void add(group, 'p', '표시할 세션이 없습니다.');
        const list = document.createElement('ul');
        for (const row of rows) add(list, 'li', `${value(row?.id)} · ${sessionStatus(row?.status)}`);
        group.append(list);
      });
      return root;
    },
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
