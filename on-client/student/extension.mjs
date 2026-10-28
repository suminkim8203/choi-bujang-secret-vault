// 학생 PC 대시보드: 제공 조회를 재사용하고, 비교 기록은 이 탭의 메모리에만 둡니다.
const PC_KEYS = ['cpu', 'memory', 'disk', 'network', 'firewall', 'events'];
const PC_LABELS = ['CPU', '메모리', '디스크', '네트워크 구성', 'Windows 방화벽', 'Windows 기록'];
const PC_REASONS = Object.freeze({
  unsupported: '이 운영체제에서 제공하지 않는 항목입니다.',
  permission_denied: '현재 읽기 권한으로 확인할 수 없습니다. 권한을 임의로 높이지 않습니다.',
  timeout: '조회 시간을 초과했습니다. 직접 다시 조회하세요.',
  cancelled: '조회가 취소됐습니다.',
  query_failed: '이 항목을 읽지 못했습니다.',
  invalid_response: '값이나 단위를 확인할 수 없습니다.',
  invalid_sample: 'CPU 측정 구간을 확인할 수 없습니다.',
});
const validCount = n => Number.isSafeInteger(n) && n >= 0;
const validBytes = n => validCount(n) && n > 0;
const percent = n => `${n.toFixed(1)}%`;
const gib = n => `${(n / 2 ** 30).toFixed(1)} GiB`;
const pcTime = iso => new Date(iso).toLocaleTimeString('ko-KR', {hour12: false});

export function normalizePcSnapshot(data, now = Date.now()) {
  const at = typeof data?.measuredAt === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(data.measuredAt) ? Date.parse(data.measuredAt) : NaN;
  if (data?.schema !== 'aleph.on.pc-status.v1' || data.source !== 'local-pc'
      || !Number.isFinite(at) || now - at > 60000 || at - now > 5000) return null;
  const values = {};
  for (const key of PC_KEYS) {
    const m = data.metrics?.[key];
    const unavailable = reason => ({state: 'unavailable', reason, note: PC_REASONS[reason]});
    let v = unavailable(m?.state === 'unavailable' && Object.hasOwn(PC_REASONS, m.reason) ? m.reason : 'invalid_response');
    if (m?.state === 'ok') {
      if (key === 'cpu' && typeof m.usagePercent === 'number' && Number.isFinite(m.usagePercent) && m.usagePercent >= 0 && m.usagePercent <= 100
          && validBytes(m.sampleMs) && m.sampleMs <= 10000) {
        v = {state: 'ok', ratio: m.usagePercent, text: percent(m.usagePercent), note: `${m.sampleMs}ms 구간의 사용률입니다. 지속 부하나 감염 판정이 아닙니다.`};
      } else if (key === 'memory' && validBytes(m.totalBytes) && validCount(m.usedBytes) && m.usedBytes <= m.totalBytes) {
        v = {state: 'ok', ratio: 100 * m.usedBytes / m.totalBytes, text: `${gib(m.usedBytes)} / ${gib(m.totalBytes)}`,
          note: 'OS의 전체·여유 메모리 기준입니다. Mac의 캐시·압축·메모리 압력과 같은 수치는 아닙니다.'};
      } else if (key === 'disk' && validBytes(m.totalBytes) && validCount(m.freeBytes) && m.freeBytes <= m.totalBytes) {
        v = {state: 'ok', ratio: 100 * m.freeBytes / m.totalBytes, freeGiB: m.freeBytes / 2 ** 30, text: `${gib(m.freeBytes)} 여유`, note: '이 앱이 있는 디스크 기준입니다. 전체 디스크나 모든 볼륨의 합계가 아닙니다.'};
      } else if (key === 'network' && validCount(m.interfaceCount) && validCount(m.ipv4Count)) {
        v = {state: 'ok', text: `인터페이스 ${m.interfaceCount}개 · IPv4 구성 ${m.ipv4Count}개`, note: '로컬 구성 개수이며 인터넷 접속·VPN·ZTNA 연결 성공을 뜻하지 않습니다.'};
      } else if (key === 'firewall' && Array.isArray(m.profiles) && m.profiles.length === 3
          && ['Domain', 'Private', 'Public'].every(name => m.profiles.some(p => p?.name === name && typeof p.enabled === 'boolean'))) {
        v = {state: 'ok', text: m.profiles.map(p => `${p.name} ${p.enabled ? '켜짐' : '꺼짐'}`).join(' · '), note: 'Windows 설정을 읽은 결과입니다. 앱이 설정을 바꾸지 않습니다.'};
      } else if (key === 'events' && validCount(m.warningCount) && validCount(m.errorCount) && m.warningCount + m.errorCount <= 5000
          && m.sampleLimit === 5000 && typeof m.truncated === 'boolean' && typeof m.since === 'string' && Number.isFinite(Date.parse(m.since))) {
        v = {state: 'ok', text: `경고 ${m.warningCount}건 · 오류 ${m.errorCount}건${m.truncated ? ' · 일부 집계' : ''}`,
          note: '최근 24시간 System·Application 기록, 최대 5,000건입니다. 침해 사고 건수가 아닙니다.'};
      }
    }
    values[key] = Object.freeze(v);
  }
  return Object.freeze({measuredAt: new Date(at).toISOString(), values: Object.freeze(values)});
}

export function pcObservations(snapshot) {
  const v = snapshot.values, observations = [];
  if (v.cpu.state === 'ok' && v.cpu.ratio >= 85) observations.push(`CPU ${percent(v.cpu.ratio)}: 참고 기준 85% 이상입니다. 다른 시각에 다시 조회해 지속되는지 확인하세요.`);
  if (v.memory.state === 'ok' && v.memory.ratio >= 90) observations.push(`메모리 사용 비율 ${percent(v.memory.ratio)}: 참고 기준 90% 이상입니다. Mac 활성 상태 보기에서 메모리 압력과 캐시를 함께 확인하세요.`);
  if (v.disk.state === 'ok' && v.disk.ratio < 10) observations.push(`디스크 여유 ${percent(v.disk.ratio)}: 참고 기준 10% 미만입니다. 저장할 공간을 확인하세요. 파일을 자동 삭제하지 않습니다.`);
  if (!observations.length) observations.push(['cpu', 'memory', 'disk'].some(key => v[key].state === 'ok')
    ? '이번에 읽은 수치 중 참고 기준에 해당하는 항목은 없습니다. 읽지 못한 항목이나 PC 전체의 안전 판정은 아닙니다.'
    : 'CPU·메모리·디스크 수치를 확인하지 못해 참고 기준을 적용하지 않았습니다.');
  return observations;
}

export function createPcDashboard({api, now = Date.now} = {}) {
  let status = 'idle', snapshot = null, history = [], message = '', mount = null, historyOpen = false;
  const make = (parent, tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    if (parent) parent.append(node);
    return node;
  };
  const historyValues = row => row.snapshot ? [row.snapshot.values.cpu, row.snapshot.values.memory, row.snapshot.values.disk] : [];
  function drawChart(parent) {
    make(parent, 'h4', '사용량의 변화', 'panel-title');
    make(parent, 'p', 'CPU 실선 · 메모리 점선 · 단위 %', 'chart-legend');
    if (Math.max(...['cpu', 'memory'].map(key => history.filter(row => row.snapshot?.values[key]?.state === 'ok').length)) < 4) {
      const empty = make(parent, 'div', undefined, 'kelbi-chart-empty');
      make(empty, 'strong', '추이 데이터 대기');
      make(empty, 'p', '실측이 4회 이상 쌓이면 추이 그래프가 나타납니다. 그전에는 아래 조회 기록에서 값을 확인하세요.');
      return;
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({viewBox: '0 0 640 190', width: '100%', height: '190', role: 'img', 'aria-label': '수동 조회한 CPU·메모리 사용률 추이. 같은 값은 아래 기록표에서도 확인할 수 있습니다.'})) svg.setAttribute(key, value);
    const svgNode = (tag, attrs, text) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      if (text !== undefined) node.textContent = text;
      svg.append(node);
    };
    const first = Date.parse(history[0].at), span = Math.max(1, Date.parse(history.at(-1).at) - first);
    const x = row => 42 + 560 * (Date.parse(row.at) - first) / span;
    for (const value of [0, 50, 100]) {
      const y = 154 - value * 1.3;
      svgNode('line', {x1: 42, x2: 602, y1: y, y2: y, stroke: '#d9dde3'});
      svgNode('text', {x: 4, y: y + 5, fill: 'currentColor', 'font-size': 14}, `${value}%`);
    }
    for (const [key, color, dash] of [['cpu', '#2785bc', 'none'], ['memory', '#66768b', '7 5']]) {
      let segment = [];
      const flush = () => {
        if (segment.length > 1) svgNode('polyline', {points: segment.join(' '), fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-dasharray': dash});
        segment = [];
      };
      for (const row of history) {
        const value = row.snapshot?.values[key];
        if (value?.state !== 'ok') {flush(); continue;}
        const y = 154 - value.ratio * 1.3;
        segment.push(`${x(row).toFixed(1)},${y.toFixed(1)}`);
        svgNode('circle', {cx: x(row), cy: y, r: 3, fill: color});
      }
      flush();
    }
    svgNode('text', {x: 42, y: 183, fill: 'currentColor', 'font-size': 14}, pcTime(history[0].at));
    svgNode('text', {x: 602, y: 183, fill: 'currentColor', 'font-size': 14, 'text-anchor': 'end'}, pcTime(history.at(-1).at));
    parent.append(svg);
  }
  function draw() {
    if (!mount) return;
    const {root, refresh, clear, live, body} = mount;
    const busy = status === 'loading';
    root.setAttribute('aria-busy', String(busy));
    // native disabled로 초점을 BODY로 잃지 않도록 의미·실행 가드를 함께 사용합니다.
    refresh.setAttribute('aria-disabled', String(busy));
    clear.setAttribute('aria-disabled', String(busy || !history.length));
    refresh.textContent = busy ? 'PC를 읽는 중…' : 'PC 상태 다시 조회';
    live.textContent = status === 'ok' ? `마지막 수동 조회: ${new Date(snapshot.measuredAt).toLocaleString('ko-KR')} · 이 시점의 실측입니다.`
      : busy ? '이 PC에서 읽는 중입니다. 이전 값을 이번 결과로 표시하지 않습니다.'
      : status === 'error' ? message : '아직 조회하지 않았습니다. 버튼을 누르면 한 번 읽습니다.';
    body.replaceChildren();
    const grid = make(body, 'div', undefined, 'kelbi-metrics');
    const current = status === 'ok' ? snapshot : null;
    const available = current ? PC_KEYS.filter(key => current.values[key].state === 'ok').length : null;
    for (const [index, key] of ['cpu', 'memory', 'disk', 'scope'].entries()) {
      const card = make(grid, 'section', undefined, `kelbi-metric kelbi-metric-${key}`);
      make(card, 'h4', key === 'scope' ? '확인 범위' : PC_LABELS[PC_KEYS.indexOf(key)]);
      const value = key === 'scope' ? available === null ? null : `${available} / 6항목 실측` : current?.values[key];
      make(card, 'strong', key === 'scope' && value ? `${available} / 6` : value?.state === 'ok' ? key === 'memory' ? percent(value.ratio) : value.text : busy ? '조회 중' : status === 'idle' ? '조회 전' : '확인 불가');
      if (key !== 'scope') {
        if (value?.state === 'ok') {
          const meter = make(card, 'meter', undefined, 'kelbi-meter');
          meter.setAttribute('min', '0'); meter.setAttribute('max', '100');
          meter.setAttribute('value', String(value.ratio));
          meter.setAttribute('aria-label', PC_LABELS[PC_KEYS.indexOf(key)] + (key === 'disk' ? ' \uc5ec\uc720 \ube44\uc728' : ' \uc0ac\uc6a9\ub960'));
          meter.textContent = percent(value.ratio);
        } else {
          const empty = make(card, 'div', undefined, 'kelbi-meter-empty');
          empty.setAttribute('aria-hidden', 'true');
        }
      }
      make(card, 'p', key === 'scope' ? available === null ? '항목 실측 · 확인 전' : `항목 실측 · ${6 - available}항목 확인 불가` : value?.state === 'ok' ? key === 'memory' ? value.text : key === 'disk' ? `여유 비율 ${percent(value.ratio)}` : '짧은 구간의 사용률' : value?.note ?? '이전 조회값으로 채우지 않습니다.', 'muted');
    }
    const panels = make(body, 'div', undefined, 'kelbi-panels');
    const past = make(panels, 'section', undefined, 'kelbi-panel kelbi-trend');
    drawChart(past);
    make(past, 'p', '수동 조회 시각을 기준으로 비교합니다. 실패·확인 불가 구간은 잇지 않습니다.', 'muted chart-footnote');
    const insights = make(panels, 'section', undefined, 'kelbi-panel kelbi-insights');
    make(insights, 'h4', '측정 상태와 제한', 'panel-title');
    if (current) {
      const list = make(insights, 'ul', undefined, 'observation-list');
      for (const item of pcObservations(current)) make(list, 'li', item);
      for (const [index, key] of PC_KEYS.entries()) {
        const value = current.values[key];
        if (value.state !== 'ok') make(list, 'li', `${PC_LABELS[index]} · 확인 불가: ${value.note}`);
      }
      make(insights, 'p', '참고 기준은 사용량을 살펴보기 위한 편의 기준입니다. 공격·감염 탐지나 보안 점수가 아닙니다.', 'muted');
      const evidence = make(insights, 'details', undefined, 'evidence-details');
      make(evidence, 'summary', '측정 근거와 제한');
      for (const [index, key] of PC_KEYS.entries()) make(evidence, 'p', `${PC_LABELS[index]}: ${current.values[key].state === 'ok' ? current.values[key].text : '확인 불가'} · ${current.values[key].note}`);
    } else make(insights, 'p', status === 'error' ? '앱 실행 상태를 확인하고 직접 다시 조회하세요. 과거 기록은 아래에 남아 있지만 이번 결과가 아닙니다.' : '조회 후 실제 값과 확인하지 못한 항목을 함께 정리합니다.', 'insights-empty');
    const details = make(body, 'details', undefined, 'kelbi-history'); details.open = historyOpen;
    make(details, 'summary', `최근 조회 기록 · ${history.length} / 20회`);
    details.addEventListener('toggle', () => {historyOpen = details.open;});
    if (!history.length) make(details, 'p', '기록이 없습니다.');
    else {
      const wrap = make(details, 'div', undefined, 'vulnerabilities-result'), table = make(wrap, 'table');
      make(table, 'caption', '현재 탭의 수동 조회 기록 · 최신순 · 실패는 수치 없이 표시');
      const header = make(make(table, 'thead'), 'tr');
      for (const title of ['조회 시각', '결과', 'CPU %', '메모리 %', '디스크 여유 GiB']) {const th = make(header, 'th', title); th.setAttribute('scope', 'col');}
      const tbody = make(table, 'tbody');
      for (const row of [...history].reverse()) {
        const tr = make(tbody, 'tr'), values = historyValues(row);
        for (const value of [pcTime(row.at), row.snapshot ? '실측' : '실패',
          values[0]?.state === 'ok' ? values[0].ratio.toFixed(1) : '—', values[1]?.state === 'ok' ? values[1].ratio.toFixed(1) : '—',
          values[2]?.state === 'ok' ? values[2].freeGiB.toFixed(1) : '—']) make(tr, 'td', value);
      }
    }
  }
  async function read() {
    if (status === 'loading') return;
    status = 'loading'; snapshot = null; draw();
    try {
      const result = await api.get('/api/pc/status');
      if (result?.ok !== true) throw Error(['NOT_ALLOWED', 'REQUEST_TIMEOUT'].includes(result?.error?.code) ? result.error.code : 'PC_QUERY_FAILED');
      const next = normalizePcSnapshot(result.data, now());
      const previous = [...history].reverse().find(row => row.snapshot);
      if (!next || previous && Date.parse(next.measuredAt) <= Date.parse(previous.at)) throw Error('PC_RESPONSE_UNVERIFIED');
      snapshot = next; status = 'ok';
      history = [...history, {at: next.measuredAt, snapshot: next}].slice(-20);
    } catch (error) {
      status = 'error'; snapshot = null;
      message = error?.message === 'NOT_ALLOWED' ? '이 제공본에서는 PC 조회를 지원하지 않습니다. 제공본 업데이트를 확인하세요.'
        : error?.message === 'REQUEST_TIMEOUT' ? 'PC 조회 시간을 초과했습니다. 직접 다시 조회하세요.'
        : error?.message === 'PC_RESPONSE_UNVERIFIED' ? '이번 응답의 출처·측정 시각·순서를 확인할 수 없습니다. 이전 값으로 채우지 않습니다.'
        : '이번 PC 조회를 완료하지 못했습니다. 앱 실행 상태를 확인하세요.';
      history = [...history, {at: new Date(now()).toISOString(), snapshot: null}].slice(-20);
    }
    draw();
  }
  return function render() {
    const root = make(null, 'section', undefined, 'kelbi-dashboard'); root.setAttribute('aria-label', '켈비 PC 대시보드');
    const toolbar = make(root, 'div', undefined, 'kelbi-toolbar');
    const intro = make(toolbar, 'div', undefined, 'kelbi-intro');
    make(intro, 'h3', '리소스 현황');
    make(intro, 'p', '이 Mac에서 직접 읽은 값입니다. 보안 서버 연결과는 별도입니다.', 'muted');
    const controls = make(toolbar, 'div', undefined, 'row');
    const refresh = make(controls, 'button', 'PC 상태 다시 조회', 'btn btn-primary'); refresh.type = 'button'; refresh.addEventListener('click', read);
    const clear = make(controls, 'button', '이 탭의 조회 기록 지우기', 'btn btn-quiet'); clear.type = 'button';
    clear.addEventListener('click', () => {if (status === 'loading' || !history.length) return; history = []; status = 'idle'; snapshot = null; message = ''; draw();});
    const live = make(root, 'p', undefined, 'kelbi-live'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    const body = make(root, 'div'); mount = {root, refresh, clear, live, body}; draw();
    make(root, 'p', '현재 탭에서 최근 20회만 보관합니다. 새로고침하면 지워지며 영구 저장·외부 전송·자동 조회하지 않습니다.', 'muted kelbi-privacy');
    return root;
  };
}

// 기존 13~22단계 표시 함수를 보존하고 학생 상태 칸 안에서 확장합니다.
export function createStudentView({api} = {}) {
  const renderPcDashboard = typeof api?.get === 'function' ? createPcDashboard({api}) : null;
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
      const outer = document.createElement('section');
      outer.setAttribute('aria-label', '기기·세션·알림과 진단 정보');
      let root = outer;
      if (renderPcDashboard) {
        outer.append(renderPcDashboard());
        const details = document.createElement('details'); details.className = 'legacy-status-details';
        const summary = document.createElement('summary'); summary.textContent = '보안 기기·세션·알림 상세 · PC 실측과 별도';
        root = document.createElement('section'); details.append(summary, root); outer.append(details);
      }
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
      return outer;
    },
    renderVulnerabilities({ status = 'idle', mode, data, error } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '학생 설치 패키지 취약점 조회');
      root.setAttribute('aria-live', 'polite');
      aiAdd(root, 'h3', '설치 패키지와 알려진 취약점 정보');
      if (mode === 'demo') aiAdd(root, 'p', '예제(demo) · 실제 OSV 조회 성공을 뜻하지 않습니다.');
      const finish = () => {
        aiAdd(root, 'p', '조회 결과는 해당 버전·조회 범위·조회 시각의 알려진 정보입니다. 알려진 항목이 없다는 결과가 패키지나 앱 전체의 안전 또는 침해 없음을 보장하지 않습니다.');
        aiAdd(root, 'p', '다시 조회는 제공 화면의 설치 패키지 조회 버튼을 직접 누르세요. 자동으로 재요청하거나 패키지를 설치·변경하지 않습니다.');
        return root;
      };
      if (status === 'idle') { aiAdd(root, 'p', '패키지 조회 전(idle)'); return finish(); }
      if (status === 'loading') { aiAdd(root, 'p', '패키지 조회 중(loading) · 이전 표는 현재 결과가 아닙니다.'); return finish(); }
      if (status === 'error') {
        const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(error.code) ? error.code : 'LOOKUP_UNVERIFIED';
        aiAdd(root, 'p', `조회 실패(error): ${code} · ${aiText(error?.message)}`);
        if (code.includes('CANCEL')) aiAdd(root, 'p', '조회를 취소했습니다. 늦게 도착한 응답이나 이전 표를 현재 결과로 표시하지 않습니다.');
        if (code.includes('TIMEOUT')) aiAdd(root, 'p', '조회 시간이 초과됐습니다. 연결 상태를 확인한 뒤 직접 다시 조회하세요.');
        aiAdd(root, 'p', '조회 실패는 알려진 취약점 항목 없음이 아닙니다.');
        return finish();
      }
      const scanLabels = { complete: '모두 조회(complete)', partial: '일부 조회 실패(partial)', not_checked: '아직 조회 안 함(not_checked)',
        not_configured: '조회 대상 프로젝트 설정 필요(not_configured)', unverifiable: 'lock 파일 확인 불가(unverifiable)' };
      if (status !== 'ok' || !data || !Object.hasOwn(scanLabels, data.status)) {
        aiAdd(root, 'p', '조회 결과 확인 불가 · 응답 형식이나 상태를 확인할 수 없습니다.');
        return finish();
      }
      aiAdd(root, 'p', scanLabels[data.status]);
      if (data.lockfileVersion != null) aiAdd(root, 'p', `lockfileVersion: ${[2, 3].includes(data.lockfileVersion) ? data.lockfileVersion : '확인 불가'}`);
      if (data.lockfileHash != null) aiAdd(root, 'p', `lockfileHash: ${aiText(data.lockfileHash)}`);
      if (data.checkedAt != null) aiAdd(root, 'p', `조회 시각(checkedAt): ${aiText(data.checkedAt)}`);
      if (data.status === 'not_configured') aiAdd(root, 'p', '운영자에게 조회 대상 프로젝트 설정을 확인하세요. 학생이 경로나 공개 조회 허용 목록을 임의로 변경하지 않습니다. 아직 조회한 결과가 아닙니다.');
      if (data.status === 'not_checked') aiAdd(root, 'p', '승인된 공개 조회 대상 없음 등으로 아직 조회하지 않았습니다. 알려진 항목 없음과 구분합니다.');
      if (data.status === 'unverifiable') aiAdd(root, 'p', '설치 버전과 lock 파일을 확인할 수 없습니다. 알려진 항목 없음으로 판단하지 마세요.');
      if (!Array.isArray(data.packages)) { aiAdd(root, 'p', '패키지 결과 형식 확인 불가'); return finish(); }
      if (!data.packages.length) aiAdd(root, 'p', '표시할 패키지 결과가 없습니다. 이 화면만으로 앱 전체의 취약점 유무를 판단하지 마세요.');
      const packageLabels = { known_vulnerabilities: '알려진 항목 있음(known_vulnerabilities)', none_found: '조회 범위에서 알려진 항목 없음(none_found)', unverifiable: '조회 확인 불가(unverifiable)' };
      const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
      const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
      for (const pkg of data.packages) {
        const row = document.createElement('section');
        const name = aiText(pkg?.name, '', 214), version = aiText(pkg?.version, '', 100);
        const coordinatesValid = packageName.test(name) && exactVersion.test(version);
        if (coordinatesValid) {
          row.setAttribute('data-student-package-name', name);
          row.setAttribute('data-student-package-version', version);
          aiAdd(row, 'h4', `${name} · 설치 버전: ${version}`);
        } else aiAdd(row, 'h4', '패키지 좌표 확인 불가 · 버전 범위나 태그를 실제 설치 버전으로 표시하지 않습니다.');
        const findings = Array.isArray(pkg?.vulnerabilities) ? pkg.vulnerabilities : [];
        const consistent = coordinatesValid && Object.hasOwn(packageLabels, pkg?.status)
          && Array.isArray(pkg.vulnerabilities) && !(pkg.status === 'none_found' && findings.length) && !(pkg.status === 'known_vulnerabilities' && !findings.length);
        const rowStatus = consistent ? pkg.status : 'unverifiable';
        aiAdd(row, 'p', packageLabels[rowStatus]);
        aiAdd(row, 'p', `출처(source): ${aiText(pkg?.source)}`);
        aiAdd(row, 'p', `패키지 조회 시각(checkedAt): ${aiText(pkg?.checkedAt)}`);
        if (rowStatus === 'unverifiable') aiAdd(row, 'p', findings.length ? '일부 확인·전체 조회 확인 불가 · 이미 받은 취약점 ID는 유지합니다.' : '조회를 확인할 수 없습니다. 알려진 항목 없음이 아닙니다.');
        if (rowStatus === 'none_found') aiAdd(row, 'p', '이 버전을 조회한 시각·범위에서 알려진 항목이 없다는 뜻입니다. 안전 보장이 아닙니다.');
        for (const finding of findings) aiAdd(row, 'p', `취약점 ID: ${aiText(finding?.id, '확인 불가', 160)} · 수정 시각(modified): ${aiText(finding?.modified)}`);
        root.append(row);
      }
      return finish();
    },
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
