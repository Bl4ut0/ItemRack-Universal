const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const environment = 'curseforge';
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function api(method, endpoint, body) {
  const args = ['api', '--method', method, endpoint];
  if (body !== undefined) args.push('--input', '-');
  return JSON.parse(execFileSync('gh', args, {
    input: body === undefined ? undefined : JSON.stringify(body), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
  }));
}
function validatePlan(repo, plan) {
  requireValue(/^[\w.-]+\/[\w.-]+$/.test(repo), 'A GitHub repository is required.');
  requireValue(/^v\d+\.\d+(?:\.\d+)?(?:-beta\d+)?$/.test(plan.tag) &&
    /^[a-f0-9]{40}$/.test(plan.commit) && /^[a-f0-9]{64}$/.test(plan.sha256) && plan.projectId === 1441253,
  'Invalid checked deployment plan.');
}
function findDeployments(repo, plan, request = api) {
  validatePlan(repo, plan);
  const deployments = request('GET', `repos/${repo}/deployments?ref=${encodeURIComponent(plan.tag)}&environment=${environment}&per_page=100`);
  requireValue(Array.isArray(deployments), 'Cannot read deployment history; upload stopped.');
  return deployments;
}
function createDeployment(repo, plan, request = api) {
  const deployment = request('POST', `repos/${repo}/deployments`, {
    ref: plan.tag, environment, auto_merge: false, required_contexts: [],
    production_environment: plan.releaseType === 'release', transient_environment: false,
    description: `ItemRack Universal ${plan.version} CurseForge submission`, payload: plan
  });
  requireValue(Number.isSafeInteger(deployment.id) && deployment.id > 0 && deployment.sha === plan.commit,
    'Deployment reservation did not match the checked commit; upload stopped.');
  return { ...plan, deploymentId: deployment.id };
}
function reserve(repo, plan, request = api) {
  requireValue(findDeployments(repo, plan, request).length === 0,
    'A CurseForge deployment was already attempted for this tag. Inspect deployment history before retrying.');
  const release = request('GET', `repos/${repo}/releases/tags/${plan.tag}`);
  requireValue(Array.isArray(release.assets), 'Cannot inspect legacy upload records; upload stopped.');
  requireValue(!release.assets.some((asset) => /^curseforge-upload(-attempt)?\.json$/.test(asset.name)),
    'A legacy upload record exists. Inspect it before retrying.');
  const marker = createDeployment(repo, plan, request);
  request('POST', `repos/${repo}/deployments/${marker.deploymentId}/statuses`, {
    state: 'in_progress', auto_inactive: false, description: 'Reserved before CurseForge upload; do not repeat an ambiguous attempt.',
    log_url: process.env.GITHUB_RUN_ID ? `https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined
  });
  return marker;
}
function recordSuccess(repo, receipt, request = api) {
  validatePlan(repo, receipt);
  requireValue(Number.isSafeInteger(receipt.deploymentId) && receipt.deploymentId > 0 &&
    Number.isSafeInteger(receipt.fileId) && receipt.fileId > 0, 'Invalid deployment receipt.');
  const deployment = request('GET', `repos/${repo}/deployments/${receipt.deploymentId}`);
  requireValue(deployment.sha === receipt.commit && deployment.payload?.sha256 === receipt.sha256 &&
    deployment.payload?.tag === receipt.tag && deployment.environment === environment, 'Receipt differs from its reservation.');
  request('POST', `repos/${repo}/deployments/${receipt.deploymentId}/statuses`, {
    state: 'success', auto_inactive: false,
    description: `CurseForge file ${receipt.fileId}; SHA-256 ${receipt.sha256}`,
    environment_url: `https://www.curseforge.com/wow/addons/itemrack-universal/files/${receipt.fileId}`
  });
}
function migrate(repo, receipt, request = api) {
  requireValue(Number.isSafeInteger(receipt.fileId) && receipt.fileId > 0, 'A successful legacy receipt is required.');
  const existing = findDeployments(repo, receipt, request);
  requireValue(existing.length <= 1, 'Multiple deployment records require inspection.');
  const marker = existing.length ? { ...receipt, deploymentId: existing[0].id } : createDeployment(repo, receipt, request);
  recordSuccess(repo, marker, request);
  return marker;
}
function main() {
  const [command, directory] = process.argv.slice(2);
  requireValue(['reserve', 'success', 'migrate'].includes(command) && directory, 'Usage: curseforge_deployment.js reserve|success|migrate DIRECTORY');
  const repo = process.env.GITHUB_REPOSITORY;
  const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  if (command === 'reserve') {
    fs.writeFileSync(path.join(directory, 'curseforge-upload-attempt.json'), JSON.stringify(reserve(repo, read('curseforge-plan.json')), null, 2) + '\n');
  } else if (command === 'success') {
    recordSuccess(repo, { ...read('curseforge-upload.json'), deploymentId: read('curseforge-upload-attempt.json').deploymentId });
  } else {
    const receipt = migrate(repo, read('curseforge-upload.json'));
    fs.writeFileSync(path.join(directory, 'curseforge-deployment.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(`Preserved CurseForge file ${receipt.fileId} in deployment ${receipt.deploymentId}; no upload performed.`);
  }
}
module.exports = { reserve, recordSuccess, migrate };
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
