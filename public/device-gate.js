export function isDeviceApproved(status,body){
  return status===200&&body?.approved===true&&body.reason==='device_registered';
}
