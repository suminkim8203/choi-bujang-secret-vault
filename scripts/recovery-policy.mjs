import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { previewTrialPolicy, restoreTrialPolicy } from '../src/policy-recovery.mjs';
const file = new URL('../artifacts/step10-trial-policy.json', import.meta.url);
const backup = await readFile(new URL('../recovery/policy-v9.json', import.meta.url), 'utf8');
const args = process.argv.slice(2);
if (args.some(x => !['--demo','--apply'].includes(x) && !/^[a-f0-9]{64}$/u.test(x))) throw Error('invalid_trial_arguments');
if (args.includes('--demo')) {
  // A local disposable policy exercise only. No production engine or DB is touched.
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  try { await readFile(file); throw Error('trial_already_exists'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(file, JSON.stringify({ schema: 'aleph.trial-policy.v1', services: {
      notes: { version: 'compromised-fixture', rules: [], settings: { ownerCheckRequired: false }, allowedRoutes: [] },
      announcements: { version: 'preserved-fixture', rules: ['deny_student_write'] },
    }, audit: [{ operation: 'existing_fixture_history' }] }, null, 2)+'\n', { flag: 'wx' });
  }
}
const trial = JSON.parse(await readFile(file, 'utf8'));
const preview = previewTrialPolicy(trial, backup);
console.log(JSON.stringify(preview, null, 2));
if (args.includes('--apply')) {
  const expected = args[args.indexOf('--apply')+1];
  // A fresh compare immediately before atomic replacement prevents stale previews.
  const latest = JSON.parse(await readFile(file, 'utf8'));
  const restored = restoreTrialPolicy(latest, backup, expected);
  const temporary = new URL('../artifacts/step10-trial-policy.pending.json', import.meta.url);
  await writeFile(temporary, JSON.stringify(restored,null,2)+'\n'); await rename(temporary,file);
  console.log(JSON.stringify({ trialRestored: true, productionPolicyChanged: false,
    remainingChanges: previewTrialPolicy(restored,backup).changes.length,
    auditPreserved: restored.audit.length === latest.audit.length+1 }));
}
