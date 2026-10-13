import {createLoginVerifier} from './verify-login.mjs';
// Registration must be checked by a trusted server adapter, never by a browser field.
// No registration authority is configured in this deployment; it stays unapproved.
export function createDeviceHandler({config,action='status',env=()=>process.env,verify,
  verifyRegisteredDevice,requestRegistration}={}) {
  let verifier;
  return async function handler(request,response){
    response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
    const pending=reason=>response.status(200).json({approved:false,reason});
    const method=action==='status'?'GET':'POST';
    if(request.method!==method){response.setHeader('Allow',method);return response.status(405).json({error:'method_not_allowed'});}
    const body=request.body;
    if(Object.keys(request.query??{}).length||(body!==undefined&&body!==null&&body!==''
      &&(typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)))
      return response.status(400).json({error:'device_input_not_allowed'});
    const authorization=request.headers?.authorization;
    if(typeof authorization!=='string'||!authorization.startsWith('Bearer '))
      return action==='status'?pending('device_not_registered'):response.status(401).json({error:'login_required'});
    try{
      verifier ??= verify??createLoginVerifier({config,supabaseSecretKey:env().SUPABASE_SECRET_KEY});
      const identity=await verifier(authorization);
      if(!identity)return response.status(401).json({error:'login_required'});
      if(action==='request'){
        if(typeof requestRegistration!=='function')return response.status(503).json({error:'registration_authority_unavailable'});
        const result=await requestRegistration({identity,request});
        if(result?.accepted!==true)return response.status(503).json({error:'registration_request_failed'});
        // An accepted request never grants permission. A separate verified status is needed.
        return response.status(202).json({approved:false,reason:'approval_pending'});
      }
      if(typeof verifyRegisteredDevice!=='function')return pending('registration_authority_unavailable');
      const approved=await verifyRegisteredDevice({identity,request});
      return response.status(200).json({approved:approved===true,reason:approved===true?'device_registered':'device_not_registered'});
    }catch{return response.status(503).json({error:'device_status_unavailable'});}
  };
}
