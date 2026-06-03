// WSD-014: `make init` produces build/meta-build.json describing service capabilities.
const fs = require('fs');
const path = require('path');

const meta = {
  service: 'daybridge',
  type: 'azure-static-web-app',
  capabilities: ['spa', 'managed-functions'],
  endpoints: ['/api/jira-tickets', '/api/summarize', '/api/health'],
  gitHash: process.env.GIT_HASH || 'dev',
  releaseVersion: process.env.RELEASE_VERSION || 'dev',
};

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'meta-build.json'), JSON.stringify(meta, null, 2) + '\n');
console.log('Wrote build/meta-build.json');
