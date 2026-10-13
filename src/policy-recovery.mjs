import { createHash } from 'node:crypto';
export const POLICY_BACKUP_SHA256 = 'ad36ef93efb451444d71af8221b795afaf64baf28d9a50271aeab6d7ae3631bb';
const digest = text => createHash('sha256').update(text).digest('hex');
const invalid = () => { throw new Error('trial_policy_verification_failed'); };
export function verifiedPolicyBackup(text) {
  if (typeof text !== 'string' || digest(text) !== POLICY_BACKUP_SHA256) return invalid();
  const backup = JSON.parse(text);
  if (backup.schema !== 'aleph.trial-policy-backup.v1' || backup.service !== 'notes'
    || backup.version !== 'safe-stage9') return invalid();
  return backup;
}
export function previewTrialPolicy(trial, backupText) {
  const backup = verifiedPolicyBackup(backupText);
  if (!trial || trial.schema !== 'aleph.trial-policy.v1' || !trial.services?.notes
    || !Array.isArray(trial.audit)) return invalid();
  const desired = { version: backup.version, rules: backup.rules,
    settings: backup.settings, allowedRoutes: backup.allowedRoutes };
  const current = trial.services.notes;
  const changes = Object.keys(desired).filter(key => JSON.stringify(current[key]) !== JSON.stringify(desired[key]))
    .map(key => ({ service: 'notes', field: key, before: current[key] ?? null, after: desired[key] }));
  return { synthetic: true, targetService: 'notes', version: backup.version,
    backupSha256: POLICY_BACKUP_SHA256, expectedTrialSha256: digest(JSON.stringify(trial)), changes };
}
export function restoreTrialPolicy(trial, backupText, expectedTrialSha256) {
  const preview = previewTrialPolicy(trial, backupText);
  if (preview.expectedTrialSha256 !== expectedTrialSha256) return invalid();
  const backup = verifiedPolicyBackup(backupText);
  const restored = structuredClone(trial);
  // Only replace the verified notes fields; unrelated settings/services/history survive.
  Object.assign(restored.services.notes, { version: backup.version, rules: backup.rules,
    settings: backup.settings, allowedRoutes: backup.allowedRoutes });
  restored.audit.push({ operation: 'restore_trial_policy', service: 'notes',
    version: backup.version, backupSha256: POLICY_BACKUP_SHA256 });
  return restored;
}
