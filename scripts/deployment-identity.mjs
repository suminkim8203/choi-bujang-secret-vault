const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPO = /^[A-Za-z0-9._-]{1,100}$/u;
const SHA = /^[a-f0-9]{40}$/iu;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/iu;

export function deploymentIdentity(env, config) {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const repo = env.VERCEL_GIT_REPO_SLUG;
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const host = env.VERCEL_URL;
  // 2단계의 공개 주소는 보호된 개별 배포 주소와 다를 수 있습니다.
  const publicAppUrl = config?.step >= 2 ? config.publicAppUrl : `https://${host}`;
  const publicHost = typeof publicAppUrl === 'string'
    && /^https:\/\/([^/]+)\/?$/u.exec(publicAppUrl)?.[1];
  const allowedRoutes = config?.step >= 2 ? config.allowedRoutes : null;
  const identityProvider = config?.identityProvider;
  if (env.VERCEL_GIT_PROVIDER !== 'github' || !OWNER.test(owner || '')
      || !REPO.test(repo || '') || repo === '.' || repo === '..'
      || repo.toLowerCase().endsWith('.git') || !SHA.test(commit || '')
      || !HOST.test(host || '') || !HOST.test(publicHost || '') || ![1, 2, 3].includes(config?.step)
      || (config.step === 2 && (!Array.isArray(allowedRoutes)
        || allowedRoutes.length !== 1 || allowedRoutes[0] !== '/api/notes'))
      || (config.step === 3 && (!Array.isArray(allowedRoutes)
        || JSON.stringify(allowedRoutes) !== JSON.stringify(['/api/notes', '/api/notes/:id'])
        || !identityProvider || identityProvider.issuer !== `${config.database?.url}/auth/v1`
        || identityProvider.audience !== 'authenticated'
        || identityProvider.jwksUrl !== `${identityProvider.issuer}/.well-known/jwks.json`))
      || typeof config.judgeIssuer !== 'string'
      || !/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/defense\/judge$/iu.test(config.judgeIssuer)
      || typeof config.sampleMarker !== 'string'
      || !/^[A-Z0-9_]{1,80}$/u.test(config.sampleMarker)) {
    throw new Error('배포 식별 정보를 확인할 수 없습니다. Vercel 시스템 환경변수와 단계 설정을 확인하세요.');
  }
  return {
    schema: 'aleph.defense.deployment.v1',
    step: config.step,
    repoUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    commit: commit.toLowerCase(),
    publicAppUrl: `https://${publicHost.toLowerCase()}`,
    judgeIssuer: config.judgeIssuer,
    ...(config.step === 1 ? { sampleMarker: config.sampleMarker } : {}),
    ...(config.step >= 2 ? { allowedRoutes: [...allowedRoutes] } : {}),
    ...(config.step === 3 ? { identityProvider: {
      issuer: identityProvider.issuer, audience: identityProvider.audience, jwksUrl: identityProvider.jwksUrl,
    } } : {}),
  };
}
