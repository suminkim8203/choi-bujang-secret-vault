import{readFile}from'node:fs/promises';import config from'../aleph.config.json'with{type:'json'};
import{collectOperationsReport}from'../src/operations-report.mjs';import{renderOperations}from'../src/render-operations.mjs';
export function createHome({collect=collectOperationsReport,readTemplate=()=>readFile(new URL('../public/index.html',import.meta.url),'utf8'),env=()=>process.env}={}){
 return async function handler(request,response){
  response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Content-Type','text/html; charset=utf-8');
  if(!['GET','HEAD'].includes(request.method)){response.setHeader('Allow','GET, HEAD');return response.status(405).end();}
  if(request.method==='HEAD')return response.status(200).end();
  try{
   const report=await collect({config,commit:env().VERCEL_GIT_COMMIT_SHA});
   const html=renderOperations(await readTemplate(),report);return response.status(200).send(html);
  }catch{return response.status(503).send('<!doctype html><html lang="ko"><meta charset="utf-8"><title>점검 확인 필요</title><p>작전실 기록을 확인하지 못했습니다. 수치를 성공으로 채우지 않습니다.</p></html>');}
 };
}
export default createHome();
