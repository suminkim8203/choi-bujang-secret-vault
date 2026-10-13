const escape=value=>String(value).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function renderOperations(template,report){
  if(report?.schema!=='aleph.operations.report.v1'||!Array.isArray(report.rows)||report.rows.length>50
    ||report.counts.total!==report.rows.length||report.counts.executed!==report.rows.filter(r=>r.status!==null).length
    ||report.counts.notRun!==report.rows.filter(r=>r.result==='not_run').length
    ||report.total!==report.counts.total||report.blocked!==report.counts.matched
    ||report.failed!==report.counts.failed||report.notRun!==report.counts.notRun)throw Error('operations_counts_mismatch');
  const text={
    'ops-record-total':report.total,'ops-matched':report.blocked,'ops-total':report.counts.executed,'ops-blocked':report.counts.blocked,'ops-failed':report.failed,'ops-not-run':report.notRun,
    'ops-meta':`확인 시각 ${report.checkedAt} · 검사한 커밋 ${report.commit} · ${report.complete?'대표 점검 완료':'점검 중단'}`,
    'ops-rules':report.rules.join(', '),'ops-detect':`고정 가상 사건 API ${report.detection.cases}건 · 실제 사건 전달 미연결`,
    'ops-revoke':'실제 운영 접속 회수 미실행·미연결',
    'ops-restore':`정책 사본 ${report.recovery.policyRevision??'확인 불가'} · 검증 ${report.recovery.policyBackupVerified?'확인':'실패'} · 이번 점검의 로그인 메모 복구 미실행`,
    'ops-assault':`41종 총공세 로컬 실행 ${report.assault41.localExecuted}건 / 미실행 ${report.assault41.localNotRun}건. 공식 판정은 포털에서 따로 확인합니다.`,
  };
  let html=template;
  for(const[id,value]of Object.entries(text))html=html.replace(new RegExp(`(<(?:dd|p) id="${id}"[^>]*>)[\\s\\S]*?(</(?:dd|p)>)`,'u'),(_,a,b)=>a+escape(value)+b);
  const rows=report.rows.map(row=>'<tr>'+[row.stages.join('·')||'—',row.method??'—',row.path,
    row.expectedStatus.length?row.expectedStatus.map(s=>`HTTP${s}`).join(' / '):'확인 필요',row.status===null?'미실행':`HTTP${row.status}`,
    row.requestId??'미실행',row.checkedAt??'미실행',row.source==='fixed_synthetic_api'?'실제 HTTP · 고정 가상 사건':row.result==='not_run'?'미실행':'실제 익명 HTTP']
    .map(v=>`<td>${escape(v)}</td>`).join('')+'</tr>').join('');
  html=html.replace('<tbody id="ops-rows"></tbody>',`<tbody id="ops-rows">${rows}</tbody>`);
  // Structured public receipts are the same data that generated the visible table.
  return html.replace('</main>',`<script type="application/json" id="ops-record">${JSON.stringify(report).replace(/</gu,'\\u003c')}</script></main>`);
}
