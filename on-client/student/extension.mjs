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
        if (Array.isArray(row.supportedActions) && row.supportedActions.length) {
          add(target, 'p', '조치 실행 연결은 준비 중입니다. 아직 지원하지 않으며 요청을 보내지 않습니다.');
          for (const action of new Set(row.supportedActions)) {
            const button = add(target, 'button', `${action} 미지원`);
            button.setAttribute('type', 'button');
            button.disabled = true;
          }
        }
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
    renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '기기·세션·알림과 진단 정보');
      const add = (parent, tag, text) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        parent.append(node);
        return node;
      };
      // 진단의 여분 필드는 읽지 않고, 허용 필드도 비밀값 형태이면 표시·복사하지 않는다.
      const safe = input => typeof input === 'string' && input.trim() && input.length <= 1500
        && !/(?:Bearer\s+\S+|sb_secret_|sk-(?:on-|proj-|ant-)?[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(input)
        ? input : '확인 불가';
      const modeNotice = (parent, input) => {
        if (input === 'demo') add(parent, 'p', '예제 자료(demo) · 실제 연결 아님');
        else if (input === 'disconnected') add(parent, 'p', '연결 없음(disconnected)');
        else if (input !== 'connected') add(parent, 'p', '연결 상태 확인 불가(unknown)');
      };
      const statusLabel = (kind, input) => {
        const map = kind === 'device'
          ? { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' }
          : { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
        return Object.hasOwn(map, input) ? `${map[input]}(${input})` : '확인 불가(unknown)';
      };
      const failure = (parent, label, resource, retry) => {
        add(parent, 'p', `${label}를 불러오지 못했습니다: ${safe(resource.error?.message)}`);
        if (typeof resource.error?.code === 'string' && resource.error.code.includes('TIMEOUT')) add(parent, 'p', '시간 초과: 응답을 확인하지 못했습니다. 성공이나 빈 목록으로 판단하지 마세요.');
        add(parent, 'p', retry);
      };
      add(root, 'h3', '기기·세션·알림과 진단 정보');
      modeNotice(root, mode);
      add(root, 'p', '기기는 본인 등록 기기 최대 100개, 세션은 현재 검증된 연결 한 개 범위입니다. 과거 세션 전체 목록이 아닙니다.');
      for (const [title, resource, kind, empty] of [
        ['기기 정보', devices, 'device', '등록된 기기가 없습니다.'],
        ['세션 정보', sessions, 'session', '현재 연결이 없습니다.'],
      ]) {
        const group = add(root, 'section');
        add(group, 'h4', title);
        modeNotice(group, resource?.mode);
        if (resource?.status === 'loading') add(group, 'p', `${title}를 불러오는 중(loading)`);
        else if (resource?.status === 'error') failure(group, title, resource, '다시 시도는 위쪽 다시 불러오기 버튼을 직접 누르세요. 자동 재요청하지 않습니다.');
        else if (resource?.status === 'ok' && Array.isArray(resource.data)) {
          if (!resource.data.length) add(group, 'p', empty);
          else {
            const list = add(group, 'ul');
            for (const row of resource.data) add(list, 'li', kind === 'device'
              ? `${safe(row?.label)} · ID: ${safe(row?.id)} · ${statusLabel(kind, row?.status)}`
              : `${safe(row?.id)} · ${statusLabel(kind, row?.status)}`);
          }
        } else add(group, 'p', `${title} 확인 불가. 빈 목록이나 정상으로 판단하지 마세요.`);
      }
      add(root, 'h4', '알림');
      if (!Array.isArray(notifications)) add(root, 'p', '알림 확인 불가');
      else if (!notifications.length) add(root, 'p', '주의할 알림이 없습니다.');
      else {
        const list = add(root, 'ul');
        for (const notification of notifications) add(list, 'li', `자료: ${safe(notification?.resource)} · 코드: ${safe(notification?.code)} · ${safe(notification?.message)}`);
      }
      const diagnosticGroup = add(root, 'section');
      add(diagnosticGroup, 'h4', '도움 요청용 진단 정보');
      add(diagnosticGroup, 'p', '제공 화면에서 받은 진단 정보 중 허용된 항목만 표시하고 복사합니다. 도움 요청에 사용하세요.');
      modeNotice(diagnosticGroup, diagnostics?.mode);
      let publicDiagnostics = null;
      if (diagnostics?.status === 'loading') add(diagnosticGroup, 'p', '진단 정보를 불러오는 중(loading)');
      else if (diagnostics?.status === 'error') failure(diagnosticGroup, '진단 정보', diagnostics, '도움정보 불러오기 버튼을 직접 눌러 다시 확인하세요. 자동으로 요청하지 않습니다.');
      else if (diagnostics?.status === 'ok' && diagnostics.data && typeof diagnostics.data === 'object') {
        const data = diagnostics.data;
        publicDiagnostics = {
          requestId: safe(data.requestId), component: safe(data.component), version: safe(data.version),
          checkedAt: safe(data.checkedAt), engine: { mode: safe(data.engine?.mode), code: safe(data.engine?.code) },
        };
        for (const [field, text] of [
          ['requestId', publicDiagnostics.requestId], ['component', publicDiagnostics.component],
          ['version', publicDiagnostics.version], ['checkedAt', publicDiagnostics.checkedAt],
          ['engine.mode', publicDiagnostics.engine.mode], ['engine.code', publicDiagnostics.engine.code],
        ]) add(diagnosticGroup, 'p', `${field}: ${text}`);
      } else add(diagnosticGroup, 'p', '진단 정보 점검 전 또는 확인 불가. 제공 화면의 도움정보 불러오기 버튼을 직접 누르세요.');
      const button = add(diagnosticGroup, 'button', '도움정보 복사');
      button.setAttribute('type', 'button');
      button.disabled = !publicDiagnostics;
      const copied = add(diagnosticGroup, 'p');
      copied.setAttribute('aria-live', 'polite');
      button.addEventListener('click', async () => {
        if (!publicDiagnostics) return;
        try {
          await navigator.clipboard.writeText(JSON.stringify(publicDiagnostics, null, 2));
          copied.textContent = '허용된 진단 정보를 복사했습니다.';
        } catch {
          copied.textContent = '복사하지 못했습니다. 표시된 안전한 진단 항목만 직접 선택해 도움을 요청하세요.';
        }
      });
      return root;
    },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
