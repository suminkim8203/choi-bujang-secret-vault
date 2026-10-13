const $=id=>document.getElementById(id);
function empty(){for(const id of['ops-record-total','ops-matched','ops-total','ops-blocked','ops-failed','ops-not-run'])$(id).textContent='—';$('ops-rows').replaceChildren();}
async function refresh(){const button=$('ops-refresh');button.disabled=true;empty();$('ops-meta').textContent='서버 점검 결과를 확인하고 있습니다.';
  try{const response=await fetch('/api/checks',{cache:'no-store',credentials:'omit'});const report=await response.json();
    if(!response.ok||report.schema!=='aleph.operations.report.v1'||!Array.isArray(report.rows)
      ||Object.values(report.counts).some(v=>!Number.isInteger(v)||v<0))throw Error('invalid_report');
    if(report.total!==report.counts.total||report.blocked!==report.counts.matched||report.failed!==report.counts.failed||report.notRun!==report.counts.notRun)throw Error('summary_mismatch');
    $('ops-record-total').textContent=String(report.total);$('ops-matched').textContent=String(report.blocked);$('ops-total').textContent=String(report.counts.executed);$('ops-blocked').textContent=String(report.counts.blocked);
    $('ops-failed').textContent=String(report.failed);$('ops-not-run').textContent=String(report.notRun);
    $('ops-meta').textContent=`확인 시각 ${report.checkedAt} · 검사한 커밋 ${report.commit} · ${report.complete?'대표 점검 완료':'점검 중단, 미실행 항목 확인'}`;
    $('ops-rules').textContent=report.rules.join(', ');
    $('ops-detect').textContent=`고정 가상 사건 API ${report.detection.cases}건 · 실제 사용자의 사건 전달은 미연결`;
    $('ops-revoke').textContent=report.revocation.executed?'실행 기록 확인':'실제 운영 접속 회수 미실행·미연결';
    $('ops-restore').textContent=`정책 사본 ${report.recovery.policyRevision??'확인 불가'} · 검증 ${report.recovery.policyBackupVerified?'확인':'실패'} · 이번 점검의 로그인 메모 복구는 미실행`;
    $('ops-assault').textContent=`41종 총공세 로컬 실행 ${report.assault41.localExecuted}건 / 미실행 ${report.assault41.localNotRun}건. 공식 심판 판정은 방어전 포털에서 따로 확인합니다.`;
    for(const row of report.rows){const tr=document.createElement('tr');const values=[row.stages.join('·')||'—',row.method??'—',row.path,
      row.expectedStatus.length?row.expectedStatus.map(v=>`HTTP${v}`).join(' / '):'확인 필요',
      row.status===null?'미실행':`HTTP${row.status}`,row.requestId??'미실행',row.checkedAt??'미실행',
      row.source==='fixed_synthetic_api'?'실제 HTTP · 고정 가상 사건':row.source==='authenticated_owner_api'?'로그인 본인 요청 · 미실행':row.source==='write_not_run'?'쓰기 요청 · 격리 환경 제한으로 미실행':row.source==='not_attempted_after_failure'?'중단 뒤 미실행':'실제 익명 HTTP'];
      for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('ops-rows').append(tr);}
  }catch{empty();$('ops-meta').textContent='서버 기록을 확인하지 못했습니다. 수치를 채우거나 성공으로 처리하지 않습니다.';}
  finally{button.disabled=false;}
}
$('ops-refresh').addEventListener('click',refresh);if(!$('ops-record'))refresh();
