export function isLocalUrl(value, origin) {
  try {const url = new URL(value);return url.protocol === 'http:' && url.origin === origin && !url.username && !url.password;} catch {return false;}
}
export async function startLocalServer(createServer, assetsRoot) {
  const server = createServer({engine:{evidenceMode:'disconnected'},aiEnv:{},assetsRoot});
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',() => {server.removeListener('error',reject);resolve();});});
  const address = server.address();
  if (!address || address.address !== '127.0.0.1') {server.close();throw Error('INVALID_LISTENER');}
  return {server,origin:`http://127.0.0.1:${address.port}`};
}
export async function stopLocalServer(server) {
  if (!server?.listening) return;
  await new Promise(resolve => {
    server.close(resolve);
    server.closeIdleConnections?.();
    // This instance owns this server only; never target processes or shared ports.
    server.closeAllConnections?.();
  });
}
