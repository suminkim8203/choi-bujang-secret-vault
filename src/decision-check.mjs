import{decide}from'./decider.mjs';import{fixtureRequests}from'../scripts/fixture-7.mjs';
// Only fixed synthetic fixtures. No client identities, paths, tokens or code are accepted.
export async function runDecisionCheck(caseId){
  const{normal,suspicious}=fixtureRequests();let input,expected,ready;
  if(caseId==='s06-registered'){
    input=normal;expected='allow';const denied=await decide({...normal,deviceRegistered:false});
    ready=denied.decision==='deny'&&denied.reasonCode==='device_not_registered';
  }else if(caseId==='s07-risk'){
    input=suspicious;expected='step_up';const after=await decide({...suspicious,stepUp:{verified:true,authAgeSeconds:60}});
    ready=after.decision==='allow';
  }else if(caseId==='s08-other-zone'){
    input={...normal,path:'/admin'};expected='deny';ready=(await decide(normal)).decision==='allow';
  }else return null;
  const result=await decide(input);
  return{synthetic:true,ready:ready&&result.decision===expected&&result.requestId===input.requestId,
    decision:result.decision,reasonCode:result.reasonCode};
}
