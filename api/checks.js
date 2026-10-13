import { runDetectionCheck } from '../src/detection-check.mjs';
import{runDecisionCheck}from'../src/decision-check.mjs';
import{collectOperationsReport}from'../src/operations-report.mjs';
import config from'../aleph.config.json'with{type:'json'};

// 고정 가상 탐지 사례의 상태만 공개합니다. 실제 사건 입력·로그 읽기·회수 기능은 없습니다.
export function createChecksHandler({config,collect=collectOperationsReport,env=()=>process.env}={}){
  let running;
  return function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed' });
  }
  const query=request.query??{};
  const receiptArray=Object.keys(query).join(',')==='case'&&query.case==='s12-requests';
  if((Object.keys(query).length===0||receiptArray)&&config.step>=12){
    // Coalesce concurrent public self-checks; do not store private records or claim judge results.
    running??=collect({config,commit:env().VERCEL_GIT_COMMIT_SHA}).finally(()=>{running=null;});
    return running.then(report=>receiptArray?(report.ready?response.status(200).json(report.rows)
      :response.status(503).json({error:'checks_unavailable'})):response.status(200).json(report))
      .catch(()=>response.status(503).json({error:'checks_unavailable'}));
  }
  if (Object.keys(query).join(',') !== 'case'||typeof query.case!=='string') {
    return response.status(400).json({ error: 'invalid_check_case' });
  }
  try {
    if(['s06-registered','s07-risk','s08-other-zone'].includes(query.case)){
      return runDecisionCheck(query.case).then(result=>response.status(200).json(result))
        .catch(()=>response.status(500).json({error:'check_unavailable'}));
    }
    const result = runDetectionCheck(request.query.case);
    return result ? response.status(200).json(result)
      : response.status(400).json({ error: 'invalid_check_case' });
  } catch {
    return response.status(500).json({ error: 'check_unavailable' });
  }
  };
}
export default createChecksHandler({config});
