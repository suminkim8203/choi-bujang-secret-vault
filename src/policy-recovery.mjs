import { createHash } from 'node:crypto';
export const POLICY_BACKUP_SHA256 = '9064dbac17717105dc4ba19cccdb526b441feb0a9cad4f1bcf94286bd1e0efa2';
const digest = text => createHash('sha256').update(text).digest('hex');
const invalid = () => { throw new Error('trial_policy_verification_failed'); };
export const SAFE_POLICY_REVISION = 'safe-stage9';
export function verifiedPolicyBackup(text, expectedPolicyRevision = SAFE_POLICY_REVISION) {
  if (typeof text !== 'string' || digest(text) !== POLICY_BACKUP_SHA256) return invalid();
  const backup = JSON.parse(text);
  if (backup.schema !== 'aleph.trial-policy-backup.v1' || backup.service !== 'notes'
    || backup.version !== SAFE_POLICY_REVISION || backup.policyRevision !== expectedPolicyRevision
    || backup.restoreScope?.service !== 'notes' || backup.restoreScope.maxNotes !== 1) return invalid();
  return backup;
}
export function verifyNoteRestorePlan({backupText,expectedPolicyRevision,scope,currentRoutes}) {
  const backup = verifiedPolicyBackup(backupText,expectedPolicyRevision);
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
  if(expectedPolicyRevision!==SAFE_POLICY_REVISION || scope?.service!=='notes'
    || !Array.isArray(scope.noteIds) || scope.noteIds.length!==1 || !UUID.test(scope.noteIds[0]??'')
    || !Array.isArray(currentRoutes)
    || JSON.stringify(currentRoutes.filter(row=>row.service==='notes'))!==JSON.stringify(backup.allowedRoutes)) return invalid();
  return {backupVerified:true,policyRevision:backup.policyRevision,
    service:'notes',noteId:scope.noteIds[0],scopeCount:1};
}
export function previewTrialPolicy(trial, backupText) {
  const backup = verifiedPolicyBackup(backupText);
  if (!trial || trial.schema !== 'aleph.trial-policy.v1' || !trial.services?.notes
    || !Array.isArray(trial.audit)) return invalid();
  const desired = { version: backup.version, policyRevision:backup.policyRevision, rules: backup.rules,
    settings: backup.settings, allowedRoutes: backup.allowedRoutes };
  const current = trial.services.notes;
  const changes = Object.keys(desired).filter(key => JSON.stringify(current[key]) !== JSON.stringify(desired[key]))
    .map(key => ({ service: 'notes', field: key, before: current[key] ?? null, after: desired[key] }));
  return { synthetic: true, targetService: 'notes', version: backup.version,policyRevision:backup.policyRevision,
    backupSha256: POLICY_BACKUP_SHA256, expectedTrialSha256: digest(JSON.stringify(trial)), changes };
}
export function restoreTrialPolicy(trial, backupText, expectedTrialSha256) {
  const preview = previewTrialPolicy(trial, backupText);
  if (preview.expectedTrialSha256 !== expectedTrialSha256) return invalid();
  const backup = verifiedPolicyBackup(backupText);
  const restored = structuredClone(trial);
  // Only replace the verified notes fields; unrelated settings/services/history survive.
  Object.assign(restored.services.notes, { version: backup.version,policyRevision:backup.policyRevision, rules: backup.rules,
    settings: backup.settings, allowedRoutes: backup.allowedRoutes });
  restored.audit.push({ operation: 'restore_trial_policy', service: 'notes',
    version: backup.version, backupSha256: POLICY_BACKUP_SHA256 });
  return restored;
}
