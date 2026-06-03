// WSD-014: `make container` produces build/meta-artefacts.json describing the
// deployable artefact set. DayBridge is not containerised (Azure Static Web App
// with managed Functions) — see README "Standards Compliance & Deviations".
const fs = require('fs');
const path = require('path');

const gitHash = process.env.GIT_HASH || 'dev';
const releaseVersion = process.env.RELEASE_VERSION || 'dev';

const meta = {
  service: 'daybridge',
  packaging: 'azure-static-web-app',
  containerised: false,
  artefacts: [
    { name: 'daybridge-web', kind: 'static-spa', source: '/', gitHash, releaseVersion },
    { name: 'daybridge-app', kind: 'azure-functions', source: 'api/', gitHash, releaseVersion },
  ],
  note: 'No container images — SWA managed hosting. WSD-008/012 K8s deviation documented in README.',
};

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'meta-artefacts.json'), JSON.stringify(meta, null, 2) + '\n');
console.log('Wrote build/meta-artefacts.json');
