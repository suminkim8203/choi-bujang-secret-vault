// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
  const aiText = (value, fallback = '확인 불가', max = 1500) => typeof value === 'string' && value.trim() && value.length <= max
    && !/(?:Bearer\s|sb_secret_|sk-[A-Za-z0-9]|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(value) ? value : fallback;
  const aiId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value) && aiText(value, '') === value;
  const aiAdd = (parent, tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    parent.append(node);
    return node;
  };
  const aiErrorGuide = Object.freeze({
    ON_AI_PROVISIONING_PENDING: '권한 준비 중입니다. 담당자에게 계정 연결과 앱 권한 준비를 확인해 주세요. 학생 코드의 오류로 단정하지 않습니다.',
    AI_REQUEST_UNVERIFIED: '연결·응답 확인 불가입니다. 담당자에게 계정 연결과 앱 권한을 확인해 주세요.',
    WB_CLCO_AUTH_REQUIRED: '인증 실패입니다. 계정 연결·AI 앱 승인을 다시 확인하고 담당자에게 문의하세요.',
    WB_CLCO_ACCESS_BLOCKED: '접근 제한입니다. 담당자에게 현재 이용 권한을 확인하세요.',
    ON_AI_AUTHORIZATION_CHANGED: '점검 도중 권한이 변경됐습니다. 담당자에게 현재 권한을 확인한 뒤 직접 다시 점검하세요.',
    WB_CLCO_COHORT_BUDGET_EXHAUSTED: '반 사용량이 소진됐습니다. 담당자에게 확인하세요.',
    WB_CLCO_LIMIT_REACHED: '이용 한도에 도달했습니다. 담당자에게 확인하세요.',
    WB_CLCO_SESSION_CLOSED: '현재 이용 시간이 아닙니다. 수업 이용 시간을 확인하세요.',
    WB_CLCO_RATE_LIMITED: '요청 제한입니다. 잠시 뒤 직접 다시 점검하세요.',
    WB_CLCO_TIMEOUT: '시간 초과입니다. 연결 상태를 확인하고 직접 다시 점검하세요.',
    REQUEST_TIMEOUT: '시간 초과입니다. 연결 상태를 확인하고 직접 다시 점검하세요.',
    ENGINE_TIMEOUT: '시간 초과입니다. 연결 상태를 확인하고 직접 다시 점검하세요.',
    TIMEOUT: '시간 초과입니다. 연결 상태를 확인하고 직접 다시 점검하세요.',
    WB_CLCO_NETWORK_ERROR: '네트워크 오류입니다. 연결 상태를 확인하고 직접 다시 점검하세요.',
    WB_CLCO_CANCELLED: '취소됐습니다. 이전 응답은 현재 결과가 아닙니다.',
    REQUEST_CANCELLED: '취소됐습니다. 이전 응답은 현재 결과가 아닙니다.',
    CANCELLED: '취소됐습니다. 이전 응답은 현재 결과가 아닙니다.',
    MODEL_NOT_CONFIGURED: '사용할 모델을 확인할 수 없습니다. 담당자에게 모델 허용 설정을 확인하세요.',
    ON_AI_MODEL_LIST_EMPTY: '쓸 수 있는 모델이 없습니다. 담당자에게 모델 허용 설정을 확인하세요.',
    SUBJECT_SCOPE_UNVERIFIED: '현재 계정과 사건·프로젝트의 연결을 확인할 수 없습니다. 담당자에게 확인하세요.',
    ON_AI_INVALID_INPUT: '사건 근거·규칙을 확인할 수 없습니다. 현재 기록을 다시 확인하세요.',
    ON_AI_INVALID_OUTPUT: 'AI 응답의 근거·형식을 확인할 수 없습니다. 원래 기록을 확인하세요.',
  });
  const aiFailure = (root, error) => {
    const code = Object.hasOwn(aiErrorGuide, error?.code) ? error.code : 'AI_REQUEST_UNVERIFIED';
    aiAdd(root, 'p', `${code}: ${aiText(error?.message, aiErrorGuide[code])}`);
    aiAdd(root, 'p', aiErrorGuide[code]);
  };
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
    renderAiConnection({ status = 'idle', mode, data, error, checkedAt } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '학생 AI 연결 점검');
      root.setAttribute('aria-live', 'polite');
      aiAdd(root, 'h3', 'AI 연결 점검');
      if (mode === 'demo') aiAdd(root, 'p', '예제(demo) · 실제 계정·AI 연결이 아닙니다.');
      else if (mode === 'disconnected') aiAdd(root, 'p', '연결 없음(disconnected)');
      if (status === 'idle') aiAdd(root, 'p', 'AI 연결 점검 전(idle)');
      else if (status === 'loading') aiAdd(root, 'p', 'AI 연결 점검 중(loading)');
      else if (status === 'error') aiFailure(root, error);
      else if (status === 'ok' && data?.transportChecked === true && ['test', 'verified'].includes(data.audienceAuthorization)
        && Number.isInteger(data.modelCount) && data.modelCount > 0) {
        aiAdd(root, 'p', data.audienceAuthorization === 'test' ? '시험 연결 점검(test)' : '앱 권한 확인 후 점검(verified)');
        aiAdd(root, 'p', `응답 모델 수(modelCount): ${data.modelCount}`);
        aiAdd(root, 'p', `점검 시각(checkedAt): ${aiText(checkedAt)}`);
        aiAdd(root, 'p', '연결만 점검했습니다. 사건 설명은 아직 실행하지 않았습니다.');
      } else if (status === 'ok' && data?.modelCount === 0) aiFailure(root, { code: 'ON_AI_MODEL_LIST_EMPTY' });
      else aiFailure(root, { code: 'AI_REQUEST_UNVERIFIED' });
      aiAdd(root, 'p', '다시 점검은 위쪽 AI 연결 점검(현재 API 연결 점검) 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.');
      aiAdd(root, 'p', '워크벤치 수업용 AI는 개발을 돕고, 앱의 AI 설명은 사건 근거를 해석하며, ALEPH 과제 판정 AI는 제출 코드를 검토합니다. 서로 다른 역할입니다.');
      return root;
    },
    renderExplanation({ event, explanation, checkedAt } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '학생 AI 사건 설명');
      root.setAttribute('aria-live', 'polite');
      aiAdd(root, 'h3', 'AI 사건 설명 · 참고용');
      const finish = () => {
        aiAdd(root, 'p', '기존 접속 판정과 원래 기록은 그대로 유지됩니다. AI 설명 실패가 과제 실패를 뜻하지 않습니다. 제안은 자동 실행하지 않습니다.');
        return root;
      };
      // 제공 화면이 근거 부족으로 event=null을 전달해도 오류를 선택 안내로 가리지 않는다.
      if (explanation?.status === 'error') {
        aiAdd(root, 'p', 'AI 설명 실패');
        aiFailure(root, explanation.error);
        return finish();
      }
      if (!event) {
        aiAdd(root, 'p', '보안 기록에서 기록을 먼저 고르세요.');
        return finish();
      }
      if (explanation?.status === 'loading') {
        aiAdd(root, 'p', '사건 설명 요청 중(loading) · 아직 설명되지 않았습니다.');
        return finish();
      }
      if (explanation?.status !== 'ok') {
        aiAdd(root, 'p', '사건 설명 전(idle) · 보안 기록에서 사건을 선택하고 직접 요청하세요.');
        return finish();
      }
      const data = explanation.data;
      const rowsValid = rows => Array.isArray(rows) && rows.length > 0 && rows.length <= 20
        && rows.every(row => aiId(row?.id) && aiText(row?.text, '', 2000)) && new Set(rows.map(row => row.id)).size === rows.length;
      const evidence = new Map(Array.isArray(event.evidence) ? event.evidence.map(row => [row?.id, row?.text]) : []);
      const validRefs = refs => Array.isArray(refs) && refs.length > 0 && new Set(refs).size === refs.length
        && refs.every(id => aiId(id) && evidence.has(id));
      const valid = aiId(event.id) && rowsValid(event.evidence) && rowsValid(event.rules)
        && aiText(data?.summary, '') && validRefs(data.evidenceIds) && data.evidenceIds.length === evidence.size
        && data.executed === false && data.requiresHumanConfirmation === true
        && Array.isArray(event.supportedActions) && event.supportedActions.every(aiId)
        && Array.isArray(data.proposals) && data.proposals.length <= 3
        && data.proposals.every(p => aiId(p?.action) && event.supportedActions.includes(p.action)
          && validRefs(p.evidenceIds) && aiText(p.reason, '', 500));
      if (!valid) {
        aiFailure(root, { code: 'ON_AI_INVALID_OUTPUT' });
        aiAdd(root, 'p', '이 설명을 사용할 수 없습니다. 근거 부족·현재 기록과 근거 불일치·잘못된 실행 주장 또는 응답 형식을 확인하세요. 내용을 만들어 맞추지 않습니다.');
        return finish();
      }
      root.setAttribute('data-student-explanation-event', event.id);
      aiAdd(root, 'p', `사건 ID: ${event.id}`);
      aiAdd(root, 'p', aiText(data.summary));
      aiAdd(root, 'p', `설명 시각: ${aiText(checkedAt)}`);
      if (explanation.mode === 'demo') aiAdd(root, 'p', '예제(demo) · 실제 모델 호출 결과가 아닙니다.');
      aiAdd(root, 'p', 'AI 요약은 참고용 해석입니다. 사실 판단은 인용 근거와 연동 시스템의 현재 상태를 기준으로 하세요.');
      aiAdd(root, 'h4', '인용한 근거');
      for (const id of data.evidenceIds) aiAdd(root, 'p', `${id} — ${aiText(evidence.get(id), '', 2000)}`);
      aiAdd(root, 'h4', '현재 규칙');
      for (const rule of event.rules) aiAdd(root, 'p', `${rule.id} — ${aiText(rule.text, '', 2000)}`);
      aiAdd(root, 'h4', '확인되지 않은 현재 상태');
      const unknown = Object.entries({ access: '접속', session: '세션', device: '기기' }).filter(([key]) => !event.state || event.state[key] === 'unknown' || event.state[key] == null);
      if (!unknown.length) aiAdd(root, 'p', '없음');
      for (const [key, name] of unknown) aiAdd(root, 'p', `${name}: 확인 불가(${event.state?.[key] === 'unknown' ? 'unknown' : '값 없음'})`);
      aiAdd(root, 'h4', '조치 제안');
      if (!data.proposals.length) aiAdd(root, 'p', !event.supportedActions.length
        ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).'
        : 'AI가 이 기록에 제안한 조치가 없습니다. 근거를 확인해 담당자와 판단하세요.');
      for (const proposal of data.proposals) aiAdd(root, 'p', `${proposal.action} — ${aiText(proposal.reason, '', 500)} · 근거: ${proposal.evidenceIds.join(', ')} · 사람 확인이 필요하며 실행되지 않았습니다.`);
      aiAdd(root, 'p', 'AI는 조치를 실행하지 않았습니다.');
      finish();
      return root;
    },
    renderAction({ status = 'idle', event, actionId, target, receipt, observation, message, confirmationExpiresAt, error } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '학생 보안 조치 상태');
      root.setAttribute('aria-live', 'polite');
      aiAdd(root, 'h3', '조치 제안과 서버 처리 결과');
      const labels = {
        idle: '아직 미실행(idle)',
        loading: '조치 준비 또는 결과 조회 중(loading) · 실행 결과는 아직 확인되지 않았습니다.',
        prepared: '준비됨·미실행(prepared) · 사건·근거·조치·실제 대상·확인 기한을 읽고 사람이 확인해야 합니다.',
        executing: '서버에 전달 중(executing) · 실행 결과는 아직 확인되지 않았습니다.',
        pending: '서버 접수·처리 중(pending) · 접수 응답(ACK)은 실제 효과 확인이 아닙니다. 실행 결과는 아직 확인되지 않았습니다.',
        succeeded: '효과 확인(succeeded)',
        denied: '연동 시스템이 거절했습니다(denied).',
        failed: '연동 시스템의 조치 처리가 실패했습니다(failed).',
        unknown: '결과 불명(unknown) · 성공이나 효과 없음으로 판단하지 마세요. 이미 전달된 요청을 다시 집행하지 말고 결과만 직접 재조회하세요.',
        error: '요청이 처리되지 않았습니다(error). 안전한 오류와 현재 상태를 확인하세요.',
        expired: '확인 기한 지남(expired) · 이번 준비로 집행할 수 없습니다. 현재 사건과 대상을 다시 확인해 준비하세요.',
      };
      const mismatch = receipt && ((receipt.eventId != null && receipt.eventId !== event?.id)
        || (receipt.actionId != null && receipt.actionId !== actionId));
      const effectConfirmed = observation?.effectApplied === true && aiText(observation.observedAt, '')
        && Number.isFinite(Date.parse(observation.observedAt)) && aiId(receipt?.receiptId);
      const currentStatus = !Object.hasOwn(labels, status) || mismatch || (status === 'succeeded' && !effectConfirmed) ? 'unknown' : status;
      aiAdd(root, 'p', labels[currentStatus]);
      if (mismatch) aiAdd(root, 'p', '현재 사건·조치와 서버 응답이 맞지 않습니다. 다른 요청의 결과를 현재 결과로 붙이지 않습니다.');
      if (currentStatus !== 'idle') {
        if (aiId(event?.id)) {
          root.setAttribute('data-student-action-event', event.id);
          aiAdd(root, 'p', `사건 ID: ${event.id}`);
        }
        if (Array.isArray(event?.evidence)) for (const row of event.evidence) if (aiId(row?.id)) aiAdd(root, 'p', `근거 ID: ${row.id}`);
        if (aiId(actionId)) aiAdd(root, 'p', `조치(actionId): ${actionId}`);
        if (aiId(target?.id)) aiAdd(root, 'p', `실제 대상(target.id): ${target.id}`);
        if (Number.isSafeInteger(target?.generation) && target.generation > 0) aiAdd(root, 'p', `대상 세대(target.generation): ${target.generation}`);
        if (!mismatch && receipt) {
          if (aiId(receipt.requestId)) {
            root.setAttribute('data-student-action-request', receipt.requestId);
            aiAdd(root, 'p', `요청(requestId): ${receipt.requestId}`);
          }
          if (aiId(receipt.receiptId)) aiAdd(root, 'p', `접수 기록(receiptId): ${receipt.receiptId}`);
          if (Number.isSafeInteger(receipt.version) && receipt.version > 0) aiAdd(root, 'p', `기록 버전(version): ${receipt.version}`);
          if (receipt.replayed === true) aiAdd(root, 'p', '같은 요청의 기존 결과입니다(replayed). 새 집행을 요청하거나 자동 재집행하지 않습니다.');
          if (receipt.superseded === true) aiAdd(root, 'p', '이전 조회 결과입니다(superseded). 최신 효과를 대신하지 않습니다.');
        }
      }
      if (currentStatus === 'prepared') {
        aiAdd(root, 'p', `사람 확인 기한(confirmationExpiresAt): ${aiText(confirmationExpiresAt)}`);
        aiAdd(root, 'p', '제공 화면에서 대상과 조치를 읽고 직접 확인해야 서버에 전달됩니다. 학생 화면에는 확인 티켓을 보관하지 않습니다.');
      }
      if (currentStatus === 'succeeded') {
        aiAdd(root, 'p', `관측 시각(observedAt): ${aiText(observation.observedAt)}`);
        aiAdd(root, 'p', 'effectApplied: true · 연동 시스템이 보고한 효과를 확인했습니다.');
      }
      if (['denied', 'failed', 'error', 'expired', 'unknown'].includes(currentStatus)) {
        if (message) aiAdd(root, 'p', aiText(message));
        if (error) {
          const safeCode = typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(error.code) ? error.code : 'ACTION_RESULT_UNVERIFIED';
          aiAdd(root, 'p', `${safeCode}: ${aiText(error.message)}`);
        }
      }
      if (currentStatus === 'idle') {
        if (message) aiAdd(root, 'p', aiText(message));
        aiAdd(root, 'p', '현재 기록에 지원하는 조치가 없으면 조치 준비 버튼이 표시되지 않는 것이 정상입니다.');
      }
      aiAdd(root, 'p', 'AI 제안은 실행이 아닙니다. 조치 준비·사람 확인·결과 재조회는 제공 화면의 버튼을 사용하세요. 자동 집행·자동 재요청은 없습니다.');
      aiAdd(root, 'p', '조치 화면 취소는 이미 서버에 전달된 조치 효과를 되돌리지 않습니다.');
      return root;
    },
  };
}
