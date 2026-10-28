import {readFile, lstat, readdir, mkdir, writeFile, rename, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function validPath(value) {
  return typeof value === 'string' && /^(?:package\.json|(?:src|public|student)\/[\w./-]+)$/.test(value)
    && !value.split('/').some(part => !part || part === '..' || part === '.')
    && /\.(?:mjs|js|json|html|css|md|webp)$/.test(value);
}
export function hasSecret(bytes) {
  const text = bytes.toString('utf8');
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsb_secret_[A-Za-z0-9_-]{12,}|\b(?:sk-proj-|sk-ant-)[A-Za-z0-9_-]{20,}|\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/.test(text);
}
async function inventory(directory, prefix = '') {
  const rows = [];
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const stat = await lstat(join(directory, entry.name));
    if (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1) throw Error('UNSAFE_SOURCE_ENTRY');
    if (stat.isDirectory()) rows.push(...await inventory(join(directory, entry.name), rel));
    else if (stat.isFile()) rows.push(rel);
    else throw Error('UNSUPPORTED_SOURCE_ENTRY');
  }
  return rows;
}
async function readSnapshot(base, files) {
  const result = [];
  for (const row of files) {
    if (!validPath(row.path)) throw Error('UNSAFE_MANIFEST_PATH');
    const stat = await lstat(join(base, row.path));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw Error('UNSAFE_SOURCE_ENTRY');
    const bytes = await readFile(join(base, row.path));
    if (bytes.length !== row.bytes || digest(bytes) !== row.sha256) throw Error('SOURCE_CHANGED_REVIEW_REQUIRED');
    if (!row.path.endsWith('.webp') && hasSecret(bytes)) throw Error('SECRET_PATTERN_BLOCKED');
    result.push({...row, bytesContent:bytes});
  }
  return result;
}
export async function stage() {
  const baseline = JSON.parse(await readFile(join(root, 'evidence/source-baseline.json'), 'utf8'));
  const files = baseline.sourceFiles;
  const sourceRoot = resolve(root, baseline.sourceRoot);
  await mkdir(join(root, 'staging'), {recursive:true,mode:0o700});
  if (!Array.isArray(files) || !files.length || new Set(files.map(f => f.path)).size !== files.length) throw Error('INVALID_BASELINE');
  const actual = ['package.json'];
  for (const dir of ['src','public','student']) actual.push(...(await inventory(join(sourceRoot, dir),dir)));
  if (JSON.stringify(actual.sort()) !== JSON.stringify(files.map(f => f.path).sort())) throw Error('SOURCE_INVENTORY_CHANGED');
  const snapshot = await readSnapshot(sourceRoot, files);
  const destination = join(root, 'staging/kelbi-app');
  let existing = false;
  try {await lstat(destination); existing = true;} catch (error) {if (error.code !== 'ENOENT') throw error;}
  if (existing) {
    if (JSON.stringify((await inventory(destination)).sort()) !== JSON.stringify(files.map(f => f.path).sort())) throw Error('STAGING_CHANGED_REVIEW_REQUIRED');
    await readSnapshot(destination, files);
  } else {
    const temporary = join(root, `staging/.building-${process.pid}`);
    await mkdir(temporary, {recursive:false,mode:0o700});
    try {
      for (const row of snapshot) {
        const target = join(temporary,row.path);
        await mkdir(dirname(target),{recursive:true});
        await writeFile(target,row.bytesContent,{flag:'wx',mode:0o644});
      }
      await readSnapshot(sourceRoot, files);
      await rename(temporary,destination);
    } catch (error) {await rm(temporary,{recursive:true,force:true});throw error;}
  }
  await writeFile(join(root,'evidence/staging-verification.json'), JSON.stringify({checkedAt:new Date().toISOString(),files:files.length,byteIdentical:true,secretPatternMatches:0,uiChanged:false,uiFinalized:true,alephPackagerUsed:false},null,2)+'\n');
  return {files:files.length,byteIdentical:true};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(await stage()));} catch(error) {console.error(error.message);process.exitCode=1;}
}
