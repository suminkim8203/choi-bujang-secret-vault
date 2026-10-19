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
    renderDecision({ status, mode, data, error, appId } = {}) {
      // 새 응답마다 새 DOM을 만들어 이전 앱의 판정·이유를 남기지 않는다.
      const root = document.createElement('section');
      root.setAttribute('aria-label', '업무 앱 접근 판정');
      const add = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        root.append(node);
      };
      const value = input => typeof input === 'string' && input.trim() ? input : '확인 불가';
      add('h3', '업무 앱 접근 판정');
      if (mode === 'demo') add('p', '예제 자료 (demo) · 실제 연결 아님');
      else if (mode === 'disconnected') add('p', '연결 없음 (disconnected)');
      else if (mode !== 'connected') add('p', '연결 상태 확인 불가 (unknown)');
      if (status === 'idle') {
        add('p', '앱을 골라 접속을 요청하세요 (idle).');
        return root;
      }
      add('p', `업무 앱: ${value(appId ?? (status === 'ok' ? data?.appId : undefined))}`);
      if (status === 'loading') {
        add('p', '판정 확인 중 (loading). 이전 판정은 현재 결과가 아닙니다.');
        return root;
      }
      if (status === 'error') {
        add('p', `요청 실패 (error): ${value(error?.message)}`);
        add('p', '판정 결과를 받지 못했습니다. 접근 거부 (deny) 판정과 다르며, 접근 허용으로 간주하지 마세요.');
        return root;
      }
      if (status !== 'ok' || !data || typeof data !== 'object') {
        add('p', '판정 확인 불가 (unknown). 접근 허용으로 간주하지 마세요.');
        return root;
      }
      const meanings = {
        allow: '접근 허용 (allow)',
        deny: '접근 거부 (deny)',
        challenge: '추가 인증 또는 확인 필요 (challenge)',
        unknown: '판정 확인 불가 (unknown)',
      };
      const decision = Object.hasOwn(meanings, data.decision) ? data.decision : 'unknown';
      add('p', meanings[decision]);
      add('p', `판정 이유: ${value(data.reason)}`);
      add('p', `판정 시각: ${value(data.checkedAt)}`);
      if (decision === 'allow') add('p', '정책상 접근 허용이며 실제 업무 앱 접속 성공을 보장하지 않습니다.');
      if (decision === 'challenge') add('p', '추가 확인이 필요합니다. 이 앱이 인증이나 확인 절차를 대신 수행하지 않습니다.');
      if (decision === 'unknown') add('p', '접근 허용으로 간주하지 마세요.');
      return root;
    },
    renderEvents({ status, mode, data, error } = {}) {
      // 조회마다 새 트리를 반환한다. 필터와 상세 선택은 이 조회의 DOM 안에만 둔다.
      const root = document.createElement('section');
      root.setAttribute('aria-label', '본인 보안 기록');
      const add = (parent, tag, text) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        parent.append(node);
        return node;
      };
      const value = input => typeof input === 'string' && input.trim() ? input : '확인 불가';
      const appLabel = input => typeof input === 'string' && input.trim() ? input : '앱 확인 불가';
      const kindLabel = input => input === 'access' ? '접속 기록(access)' : input === 'xdr' ? 'XDR 경보(xdr)' : `종류 확인 불가: ${value(input)}`;
      const stateLabel = (kind, input) => {
        const labels = {
          access: { allowed: '허용됨', denied: '거부됨', unknown: '확인 불가' },
          session: { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' },
          device: { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' },
        }[kind];
        return Object.hasOwn(labels, input) ? `${labels[input]}(${input})` : '확인 불가(unknown)';
      };
      add(root, 'h3', '본인의 접속 기록과 XDR 경보');
      add(root, 'p', '본인의 최근 기록 최대 40건을 표시합니다. 전체 직원의 이력이 아니며 저장된 XDR 경보를 새로 탐지하지 않습니다.');
      if (mode === 'demo') add(root, 'p', '예제 자료(demo) · 실제 연결 아님');
      else if (mode === 'disconnected') add(root, 'p', '연결 없음(disconnected)');
      else if (mode !== 'connected') add(root, 'p', '연결 상태 확인 불가(unknown)');
      if (status === 'loading') {
        add(root, 'p', '보안 기록을 불러오는 중(loading)');
        return root;
      }
      if (status === 'error') {
        add(root, 'p', `기록을 불러오지 못했습니다: ${value(error?.message)}`);
        if (['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED'].includes(error?.code)) add(root, 'p', '기록 응답 형식 확인 불가. 정상 또는 빈 목록으로 판단하지 마세요.');
        return root;
      }
      if (status !== 'ok' || !Array.isArray(data)) {
        add(root, 'p', '기록 확인 불가. 정상 또는 빈 목록으로 판단하지 마세요.');
        return root;
      }
      // 정렬은 복사본에서만 수행하며 원본 배열과 각 기록을 변경하지 않는다.
      const rows = [...data].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
      const filters = {};
      const makeFilter = (key, labelText, values, describe) => {
        const label = add(root, 'label', labelText);
        const select = add(label, 'select');
        select.setAttribute('aria-label', labelText);
        const option = add(select, 'option', '전체');
        option.value = 'all';
        for (const item of new Set(values.filter(item => typeof item === 'string' && item.trim()))) {
          const option = add(select, 'option', describe(item));
          option.value = item;
        }
        select.value = 'all';
        filters[key] = select;
        select.addEventListener('change', () => drawRows());
      };
      makeFilter('kind', '기록 종류', rows.map(row => row.kind), kindLabel);
      makeFilter('app', '업무 앱', rows.map(row => row.appId), appLabel);
      makeFilter('access', '접속 상태', rows.map(row => row.state?.access), input => stateLabel('access', input));
      const count = add(root, 'p');
      count.setAttribute('aria-live', 'polite');
      const result = add(root, 'div');
      const showDetail = (target, row) => {
        target.replaceChildren();
        target.setAttribute('data-student-event-detail', row.id);
        add(target, 'h4', `사건 ${value(row.id)} 상세`);
        add(target, 'p', `업무 앱: ${appLabel(row.appId)}`);
        for (const [title, entries] of [['근거', row.evidence], ['규칙', row.rules]]) {
          add(target, 'h4', title);
          if (!Array.isArray(entries) || !entries.length) add(target, 'p', `표시할 ${title}가 없습니다.`);
          else {
            const list = add(target, 'ul');
            for (const entry of entries) add(list, 'li', `${value(entry.id)}: ${value(entry.text)}`);
          }
        }
        add(target, 'p', `접속 상태: ${stateLabel('access', row.state?.access)}`);
        add(target, 'p', `세션 상태: ${stateLabel('session', row.state?.session)}`);
        add(target, 'p', `기기 상태: ${stateLabel('device', row.state?.device)}`);
      };
      const drawRows = () => {
        result.replaceChildren();
        const matches = rows.filter(row => (filters.kind.value === 'all' || row.kind === filters.kind.value)
          && (filters.app.value === 'all' || row.appId === filters.app.value)
          && (filters.access.value === 'all' || row.state?.access === filters.access.value));
        count.textContent = `표시 기록 ${matches.length}건 / 받은 기록 ${rows.length}건`;
        if (!matches.length) {
          add(result, 'p', rows.length ? '선택한 조건에 맞는 기록이 없습니다.' : '표시할 기록이 없습니다.');
          return;
        }
        const list = add(result, 'ul');
        for (const row of matches) {
          const item = add(list, 'li');
          item.setAttribute('data-student-event-id', row.id);
          add(item, 'h4', `사건 ID: ${value(row.id)}`);
          add(item, 'p', `시각: ${value(row.at)}`);
          add(item, 'p', `종류: ${kindLabel(row.kind)}`);
          add(item, 'p', `업무 앱: ${appLabel(row.appId)}`);
          add(item, 'p', `요약: ${value(row.summary)}`);
          const button = add(item, 'button', `${row.id} 상세`);
          button.setAttribute('type', 'button');
          button.setAttribute('aria-expanded', 'false');
          const detail = add(item, 'section');
          detail.hidden = true;
          button.addEventListener('click', () => {
            const opening = detail.hidden;
            detail.replaceChildren();
            detail.removeAttribute('data-student-event-detail');
            detail.hidden = !opening;
            button.setAttribute('aria-expanded', String(opening));
            if (opening) showDetail(detail, row);
          });
        }
      };
      drawRows();
      return root;
    },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
