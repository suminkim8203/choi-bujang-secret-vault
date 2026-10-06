import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';
import { publicDatabase } from '../src/public-db-config.mjs';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'data.json');
const output = resolve(root, 'public', 'data.json');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
if (![1, 2, 3, 4].includes(config.step)) {
  throw new Error('현재 단계에 맞게 빌드 흐름을 확인하세요.');
}
const data = JSON.parse(await readFile(source, 'utf8'));
if (!Array.isArray(data.notes)) {
  throw new Error('실습용 공개 자료 형식을 확인하세요. 실제 학생 자료를 넣으면 안 됩니다.');
}
if (config.step >= 2 && data.notes.length !== 0) {
  throw new Error('2단계부터 공개 data.json에 메모를 넣을 수 없습니다.');
}
const database = config.step >= 2 ? publicDatabase(config.database) : null;
await mkdir(resolve(root, 'public'), { recursive: true });
if (database) await writeFile(resolve(root, 'public', 'database.json'), `${JSON.stringify(database, null, 2)}\n`, 'utf8');
if (config.step >= 3) {
  await mkdir(resolve(root, 'public', 'vendor'), { recursive: true });
  await copyFile(resolve(root, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
    resolve(root, 'public', 'vendor', 'supabase.js'));
}
await copyFile(source, output);
console.log(config.step === 1 ? '실습용 공개 자료를 public/data.json에 복사했습니다.' : '공개 data.json에 메모가 없는지 확인했습니다.');
if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  if (database) identity.database = database;
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}
