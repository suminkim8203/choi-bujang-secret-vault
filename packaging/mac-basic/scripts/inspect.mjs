import {readdir,readFile,lstat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {listPackage,extractFile} from '@electron/asar';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const delivery = resolve(process.argv[2] ?? 'delivery-final');
const entries = await readdir(delivery);
const apps = entries.filter(path => path.endsWith('.app'));
if(apps.length !== 1) throw Error('EXPECTED_SINGLE_APP');
const app = join(delivery,apps[0]);
const resources = join(app,'Contents/Resources');
const archivePath = join(resources,'app.asar');
const archive = listPackage(archivePath).sort();
const expected = ['/package.json','/src','/src/main.mjs','/src/lifecycle.mjs'].sort();
if(JSON.stringify(archive) !== JSON.stringify(expected)) throw Error('UNEXPECTED_WRAPPER_FILE');
for(const path of ['src/main.mjs','src/lifecycle.mjs']) {
  if(sha(extractFile(archivePath,path)) !== sha(await readFile(path))) throw Error('WRAPPER_CHANGED');
}
const baseline = JSON.parse(await readFile('evidence/source-baseline.json','utf8'));
async function walk(base,prefix='') {
  const found=[];
  for(const e of await readdir(base,{withFileTypes:true})){
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    const stat = await lstat(join(base,e.name));
    if(stat.isDirectory())found.push(...await walk(join(base,e.name),path));
    else if(stat.isFile()&&!stat.isSymbolicLink())found.push(path);
    else throw Error('UNEXPECTED_PAYLOAD_ENTRY');
  }
  return found;
}
const runtimeRoot = join(resources,'kelbi-app');
const found = (await walk(runtimeRoot)).sort();
if(JSON.stringify(found) !== JSON.stringify(baseline.sourceFiles.map(f=>f.path).sort())) throw Error('UNEXPECTED_RUNTIME_FILE');
for(const row of baseline.sourceFiles){
  const bytes = await readFile(join(runtimeRoot,row.path));
  if(bytes.length !== row.bytes || sha(bytes) !== row.sha256) throw Error('PAYLOAD_CHANGED');
  if(sha(await readFile(resolve(baseline.sourceRoot,row.path))) !== row.sha256) throw Error('ORIGINAL_CHANGED');
}
const result = {checkedAt:new Date().toISOString(),app,wrapperFiles:archive,runtimeFiles:found.length,
  byteIdentical:true,originalUnchanged:true,installerCreated:false,alephPackagerUsed:false,
  uiFinalized:true,submitted:false};
await writeFile('evidence/package-inspection.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
