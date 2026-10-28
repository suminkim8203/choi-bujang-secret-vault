import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {isLocalUrl,startLocalServer,stopLocalServer} from '../src/lifecycle.mjs';
import {validPath,hasSecret,stage} from '../scripts/stage.mjs';

test('navigation admits only the owned exact origin, rejects deceptive authorities',() => {
  const origin='http://127.0.0.1:47123';
  assert.equal(isLocalUrl(`${origin}/api/pc/status`,origin),true);
  for(const url of ['https://example.org/','file:///etc/passwd','http://127.0.0.1:47124/','http://127.0.0.1:47123.evil.test/','http://user:pass@127.0.0.1:47123/','javascript:alert(1)','http://localhost:47123/']) assert.equal(isLocalUrl(url,origin),false);
});
test('only the app-owned ephemeral listener is stopped; another server survives',async() => {
  let options;
  const make = () => http.createServer((_req,res) => res.end('ok'));
  const other=await startLocalServer(make,'unused');
  const own=await startLocalServer(value => {options=value;return make();},'assets');
  try {
    assert.deepEqual(options,{engine:{evidenceMode:'disconnected'},aiEnv:{},assetsRoot:'assets'});
    assert.equal(await (await fetch(own.origin)).text(),'ok');
    await stopLocalServer(own.server);
    await assert.rejects(fetch(own.origin));
    assert.equal(await (await fetch(other.origin)).text(),'ok');
    await stopLocalServer(own.server);
  } finally {await stopLocalServer(own.server);await stopLocalServer(other.server);}
});
test('invalid source paths and known credential formats are blocked',() => {
  for(const path of ['../.env','public/../secret.json','public//a.js','tools/package-app.mjs','public/key.pem']) assert.equal(validPath(path),false);
  assert.equal(validPath('public/assets/alekov/alekov-app-icon.webp'),true);
  assert.equal(hasSecret(Buffer.from('-----BEGIN PRIVATE KEY-----')),true);
  assert.equal(hasSecret(Buffer.from('const state = "disconnected";')),false);
});
test('runtime projection is repeatable and byte-identical to the reviewed source',async() => {
  assert.deepEqual(await stage(),{files:45,byteIdentical:true});
  assert.deepEqual(await stage(),{files:45,byteIdentical:true});
});
