const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const releaseTools = require('./create_release');
const curseForge = require('./curseforge_upload');
const deploymentLedger = require('./curseforge_deployment');

const read = (filePath) => fs.readFileSync(filePath, 'utf8');
const createRelease = read('.tools/create_release.js');
const buildScript = read('.tools/build_release_dev.ps1');
const installScript = read('.tools/install_local.ps1');
const workflow = read('.agents/workflows/release.md');
const packageJson = JSON.parse(read('package.json'));

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

// User's Universal/Anniversary naming complaint: both publication channels
// must use the same product title without changing archive/module identifiers.
for (const mode of ['beta', 'stable']) {
  const version = mode === 'beta' ? '4.54-beta1' : '4.54';
  const posts = releaseTools.renderReleasePosts(mode, version, '  - Example change  ');
  for (const post of [posts.github, posts.curseForge]) {
    check(post.startsWith(`# ItemRack Universal v${version}\n`) &&
      !post.includes('ItemRack Anniversary') && post.includes('- Example change'),
    `Universal naming complaint: ${mode} generated release posts must identify ItemRack Universal.`);
  }
  check(posts.curseForge.includes(mode === 'beta' ? '**Beta test release**' : '**Stable release**'),
    'Universal release naming must preserve the publication channel.');
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notStrictEqual(startIndex, -1, `Missing start marker: ${start}`);
  assert.notStrictEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

check(
  createRelease.includes("command === 'prepare'") && createRelease.includes("command === 'build'"),
  'Release tooling must separate metadata preparation from exact-ref building.'
);
const prepareFunction = between(createRelease, 'function prepare(', 'function resetDevelopmentMetadata');
const preparationValidationIndex = prepareFunction.indexOf(
  'runValidationSuite({ allowVersionMismatch: true });'
);
const metadataWriteIndex = prepareFunction.indexOf('writeMetadataTransaction(files);');
check(
  preparationValidationIndex >= 0 &&
    metadataWriteIndex >= 0 &&
    preparationValidationIndex < metadataWriteIndex,
  'Preparation validation must finish before release metadata is replaced.'
);
check(
  createRelease.includes("'-Version', version, '-Ref', commit"),
  'The Node release driver must pass a resolved commit to the packager.'
);

check(
  buildScript.includes("'-c', 'core.autocrlf=false'") &&
    buildScript.includes("'archive', '--format=zip'") &&
    buildScript.includes("'ls-tree', '-r'") &&
    buildScript.includes("'hash-object', '--no-filters'") &&
    buildScript.includes('SOURCE_COMMIT.txt') &&
    buildScript.includes('SOURCE_TREE.txt') &&
    buildScript.includes('SOURCE_FILES.sha256'),
  'The packager must archive and verify an immutable commit tree with provenance manifests.'
);
check(
  !buildScript.includes('Copy-Item -LiteralPath $itemRackSource'),
  'The packager must not copy addon files from the mutable checkout.'
);
check(
  buildScript.includes('ItemRack-universal-$Version.zip') &&
    createRelease.includes('ItemRack-universal-${version}.zip') &&
    !buildScript.includes('ItemRack-anniversary-$Version.zip'),
  'Release tooling must produce one universal archive for all supported clients.'
);

check(
  installScript.includes('if ($destinations.Count -eq 0)') &&
    installScript.includes('No supported local WoW AddOns folders were found.'),
  'Local installation must fail when no supported client folder exists.'
);
check(
  installScript.includes("'_classic_beta_'") &&
    installScript.includes("'_anniversary_'") &&
    installScript.includes("'_classic_'") &&
    installScript.includes("'_classic_era_'"),
  'The local installer must discover Forever/Camelot and official Classic client folders.'
);
check(
  installScript.includes('$completedDestinations += $addOnsPath') &&
    installScript.includes('foreach ($destinationPath in $reportedDestinations)') &&
    installScript.includes('Assert-ReleaseSourceManifest -Root $sourceRootFull') &&
    installScript.includes('Assert-DirectoryMirror -Source $entry.Source -Target $target'),
  'Local installation must verify and report every deterministic destination it handled.'
);

const betaTrack = between(workflow, '## Track A: Beta', '## Track B: Primary');
check(
  !betaTrack.includes('git switch {ReleaseBranch}') && !betaTrack.includes('git push origin {ReleaseBranch}'),
  'The beta track must never touch the production branch.'
);
check(
  betaTrack.includes('build beta {Version} --ref "v{Version}"') && betaTrack.includes('--prerelease'),
  'The beta track must build its exact tag and publish a GitHub prerelease.'
);

const candidatePhase = between(workflow, '### Phase 1: Create and test a candidate', '### Candidate correction loop');
check(
  candidatePhase.includes('git push origin {ReleaseBranch}') &&
    candidatePhase.includes('build stable {Version} --ref {CandidateCommit}') &&
    candidatePhase.includes('install_local.ps1'),
  'A primary candidate must be pushed, built from its recorded commit, and installed locally.'
);
check(
  !candidatePhase.includes('git tag -a') && !candidatePhase.includes('gh release create'),
  'A primary candidate must not create a tag or public GitHub release.'
);

const correctionPhase = between(
  workflow,
  '### Candidate correction loop',
  '### Phase 2: Finalize an accepted candidate'
);
check(
  correctionPhase.includes('$currentCandidate -ne "{CandidateCommit}"') &&
    correctionPhase.includes('git merge --no-ff {CandidateCommit}') &&
    correctionPhase.indexOf('git merge --no-ff {CandidateCommit}') <
      correctionPhase.indexOf('node .tools/create_release.js reset') &&
    correctionPhase.indexOf('node .tools/create_release.js reset') <
      correctionPhase.indexOf('add only a fresh Development'),
  'A rejected candidate must synchronize its exact stable metadata into dev and reset only the TOCs before new correction notes are added.'
);

const finalizePhase = between(workflow, '### Phase 2: Finalize an accepted candidate', '## Failure handling');
check(
  finalizePhase.indexOf('git tag -a') < finalizePhase.indexOf('gh release create') &&
    finalizePhase.indexOf('gh release create') < finalizePhase.indexOf('git switch dev'),
  'Primary finalization must tag and publish before merging back and resetting dev.'
);
check(
  finalizePhase.includes('$testedHash = "{TestedSHA256}".ToLowerInvariant()') &&
    finalizePhase.includes('$finalHash -ne $testedHash'),
  'Finalization must compare the tagged archive with the locally accepted candidate hash.'
);
check(
  !workflow.includes('powershell.exe -NoProfile -ExecutionPolicy Bypass -File .tools/install_local.ps1') &&
    workflow.includes('& .\\.tools\\install_local.ps1'),
  'Workflow examples must preserve the Confirm switch value on Windows PowerShell 5.1.'
);

const originalDevMarkdown = `# Changelog

## [Development]

- Original development note

## [4.43-beta2] - 2026-08-20
### Bug Fixes & Improvements
- Beta two

## [4.43-beta1] - 2026-08-19
### Bug Fixes & Improvements
- Beta one

## [4.42] - 2026-07-25
- Previous stable
`;
const firstCandidateMarkdown = releaseTools.consolidateStableMarkdown(
  originalDevMarkdown,
  '4.43',
  '2026-08-21'
).text;
const synchronizedDevMarkdown = firstCandidateMarkdown.replace(
  '## [Development]\n',
  '## [Development]\n\n- Candidate correction\n'
);
const correctedMarkdown = releaseTools.consolidateStableMarkdown(
  synchronizedDevMarkdown,
  '4.43',
  '2026-08-22'
).text;
check(
    (correctedMarkdown.match(/## \[4\.43\]/g) || []).length === 1 &&
    !correctedMarkdown.includes('4.43-beta') &&
    correctedMarkdown.includes('## [4.43] - 2026-08-22') &&
    correctedMarkdown.indexOf('- Candidate correction') < correctedMarkdown.indexOf('- Original development note') &&
    (correctedMarkdown.match(/- Original development note/g) || []).length === 1 &&
    (correctedMarkdown.match(/- Beta two/g) || []).length === 1 &&
    (correctedMarkdown.match(/- Beta one/g) || []).length === 1 &&
    (correctedMarkdown.match(/- Candidate correction/g) || []).length === 1 &&
    releaseTools.parseMarkdownSections(correctedMarkdown).find((section) => section.version === 'Development').body === '',
  'A corrected primary candidate must fold only fresh Development notes into the synchronized stable section without restoring or duplicating consumed notes.'
);

const originalDevAddon = `__ Development __

- Original development note

__ New in 4.43-beta2 - By Bl4ut0 __
- Beta two

__ New in 4.43-beta1 - By Bl4ut0 __
- Beta one

__ New in 4.42 - By Bl4ut0 __
- Previous stable
`;
const firstCandidateAddon = releaseTools.consolidateStableAddon(originalDevAddon, '4.43');
const synchronizedDevAddon = firstCandidateAddon.replace(
  '__ Development __\n',
  '__ Development __\n\n- Candidate correction\n'
);
const correctedAddon = releaseTools.consolidateStableAddon(synchronizedDevAddon, '4.43');
check(
  (correctedAddon.match(/__ New in 4\.43 /g) || []).length === 1 &&
    !correctedAddon.includes('4.43-beta') &&
    (correctedAddon.match(/- Original development note/g) || []).length === 1 &&
    (correctedAddon.match(/- Beta two/g) || []).length === 1 &&
    (correctedAddon.match(/- Beta one/g) || []).length === 1 &&
    (correctedAddon.match(/- Candidate correction/g) || []).length === 1,
  'The synchronized in-addon changelog must support a corrected candidate without duplicated notes or stable headers.'
);

const cumulativeBetaPost = releaseTools.releasePostBody(
  'beta',
  '4.45-beta2',
  `# Changelog

## [Development]

## [4.45-beta2] - 2026-09-03
- Beta two correction

## [4.45-beta1] - 2026-09-02
### Bug Fixes & Improvements
- Primary overhaul

## [4.44-beta9] - 2026-08-01
- Unrelated line
`,
  '- Beta two correction'
);
check(
  cumulativeBetaPost.indexOf('### 4.45-beta2') < cumulativeBetaPost.indexOf('### 4.45-beta1') &&
    (cumulativeBetaPost.match(/Beta two correction/g) || []).length === 1 &&
    (cumulativeBetaPost.match(/Primary overhaul/g) || []).length === 1 &&
    !cumulativeBetaPost.includes('Bug Fixes & Improvements') &&
    !cumulativeBetaPost.includes('Unrelated line'),
  'Generated beta posts must include this version and prior betas from the same line without duplicating changelog history.'
);

check(
  packageJson.scripts['validate:structure'] && packageJson.scripts['test:release'],
  'The default test stack must expose structure and release-flow checks.'
);

async function checkCurseForgeDeployment() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'itemrack-deploy-'));
  try {
    const git = (args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
    git(['init', '--quiet']);
    const toc = '## Version: 4.53\n## Interface: 11601, 16001, 11509, 11508, 20505, 20506\n## X-Curse-Project-ID: 1441253\n';
    for (const folder of ['ItemRack', 'ItemRackOptions']) {
      fs.mkdirSync(path.join(root, folder));
      fs.writeFileSync(path.join(root, folder, `${folder}.toc`), toc);
      fs.writeFileSync(path.join(root, folder, `${folder}.lua`), '-- Original addon bytes\n');
    }
    git(['-c', 'core.autocrlf=false', 'add', 'ItemRack', 'ItemRackOptions']);
    git(['-c', 'user.name=Deployment Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Fixture']);
    git(['tag', 'v4.53']);
    const archive = path.join(root, 'ItemRack-universal-4.53.zip');
    git(['-c', 'core.autocrlf=false', 'archive', '--format=zip', `--output=${archive}`, 'v4.53', '--', 'ItemRack', 'ItemRackOptions']);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    const checksum = `${archive}.sha256`;
    fs.writeFileSync(checksum, `${hash}  ItemRack-universal-4.53.zip\n`);
    const notes = '# ItemRack Universal v4.53\n\n- Test change\n';
    const args = { tag: 'v4.53', archive, checksum, notes, repo: root };
    const plan = curseForge.verifyRelease(args);
    check(curseForge.verifyRelease({ ...args, notes: notes.replace('Universal', 'Anniversary') }).sha256 === plan.sha256,
      'Existing immutable releases with historical Anniversary notes must remain usable for a read-only setup check.');
    check(plan.fileCount === 4 && plan.releaseType === 'release' && plan.sha256 === hash &&
      plan.gameVersionNames.join(',') === '1.60.1,1.15.9,1.15.8,2.5.5,2.5.6',
    'CurseForge deployment must preserve both addon folders and every exact-tag byte with mapped Universal clients.');
    assert.throws(() => curseForge.verifyRelease({ ...args, tag: 'dev' }), /exact release tag/); checks++;
    assert.throws(() => curseForge.verifyRelease({ ...args, notes: '# Wrong release\n' }), /notes\/version/); checks++;
    fs.writeFileSync(checksum, `${'0'.repeat(64)}  ItemRack-universal-4.53.zip\n`);
    assert.throws(() => curseForge.verifyRelease(args), /checksum mismatch/); checks++;
    fs.writeFileSync(checksum, `${hash}  ItemRack-universal-4.53.zip\n`);
    const itemOnly = path.join(root, 'single-folder.zip');
    git(['-c', 'core.autocrlf=false', 'archive', '--format=zip', `--output=${itemOnly}`, 'v4.53', '--', 'ItemRack']);
    fs.writeFileSync(archive, fs.readFileSync(itemOnly));
    fs.writeFileSync(checksum, `${crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')}  ItemRack-universal-4.53.zip\n`);
    assert.throws(() => curseForge.verifyRelease(args), /file count/); checks++;
    git(['-c', 'core.autocrlf=false', 'archive', '--format=zip', `--output=${archive}`, 'v4.53', '--', 'ItemRack', 'ItemRackOptions']);
    fs.writeFileSync(checksum, `${hash}  ItemRack-universal-4.53.zip\n`);
    const versions = plan.gameVersionNames.map((name, i) => ({ name, id: 100 + i }));
    let requests = 0;
    const fakeFetch = async (url, request) => {
      requests++;
      check(url.endsWith('/game/wow/versions') && request.headers['X-Api-Token'] === 'fixture-token',
        'Setup must authenticate without uploading a file.');
      return { ok: true, json: async () => versions };
    };
    await assert.rejects(curseForge.preflight(plan, notes, '', fakeFetch), /CF_API_TOKEN/); checks++;
    check(requests === 0, 'Missing credential must stop before network calls.');
    const checked = await curseForge.preflight(plan, notes, 'fixture-token', fakeFetch);
    check(checked.projectId === 1441253 && checked.metadata.gameVersions.length === 5 &&
      checked.metadata.releaseType === 'release' && checked.metadata.changelog === notes,
    'Deployment metadata must select ItemRack project, exact client IDs, channel and notes.');
    await assert.rejects(curseForge.preflight(plan, notes, 'fixture-token', async () => ({ ok: true, json: async () => versions.slice(1) })), /exactly one/); checks++;
    await assert.rejects(curseForge.preflight(plan, notes, 'fixture-token', async () => ({ ok: true, json: async () => [...versions, versions[0]] })), /exactly one/); checks++;
    await assert.rejects(curseForge.preflight(plan, notes, 'fixture-token', async () => ({ ok: false, status: 401 })), /HTTP 401/); checks++;
    // Report: v4.54-beta1's release job was skipped. Exercise a real tagged beta
    // through the same provenance, channel and all-client mapping as stable.
    for (const folder of ['ItemRack', 'ItemRackOptions']) {
      fs.writeFileSync(path.join(root, folder, `${folder}.toc`), toc.replace('4.53', '4.54-beta1'));
    }
    git(['-c', 'core.autocrlf=false', 'add', 'ItemRack', 'ItemRackOptions']);
    git(['-c', 'user.name=Deployment Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Beta fixture']);
    git(['tag', 'v4.54-beta1']);
    const betaArchive = path.join(root, 'ItemRack-universal-4.54-beta1.zip');
    git(['-c', 'core.autocrlf=false', 'archive', '--format=zip', `--output=${betaArchive}`, 'v4.54-beta1', '--', 'ItemRack', 'ItemRackOptions']);
    const betaHash = crypto.createHash('sha256').update(fs.readFileSync(betaArchive)).digest('hex');
    fs.writeFileSync(`${betaArchive}.sha256`, `${betaHash}  ItemRack-universal-4.54-beta1.zip\n`);
    const betaNotes = '# ItemRack Universal v4.54-beta1\n\n- Beta fix\n';
    const betaPlan = curseForge.verifyRelease({ tag: 'v4.54-beta1', archive: betaArchive,
      checksum: `${betaArchive}.sha256`, notes: betaNotes, repo: root });
    const beta = await curseForge.preflight(betaPlan, betaNotes, 'fixture-token', fakeFetch);
    check(beta.metadata.releaseType === 'beta' && beta.metadata.displayName === 'ItemRack Universal 4.54-beta1' &&
      JSON.stringify(beta.metadata.gameVersions) === JSON.stringify(checked.metadata.gameVersions),
    'curseforge-auto-beta-all-flavors: exact tagged beta must retain Beta classification and all Era/TBC/Forever game IDs.');
    const betaReceipt = await curseForge.upload(beta, betaArchive, 'fixture-token', async (url, request) => {
      const metadata = JSON.parse(request.body.get('metadata'));
      check(metadata.releaseType === 'beta' && metadata.gameVersions.length === 5 &&
        Buffer.from(await request.body.get('file').arrayBuffer()).equals(fs.readFileSync(betaArchive)),
      'Beta POST must carry all client tags and unchanged verified two-folder ZIP.');
      return { ok: true, json: async () => ({ id: 54321 }) };
    });
    check(betaReceipt.fileId === 54321 && betaReceipt.sha256 === betaHash, 'Beta receipt must retain exact published hash.');
    let uploads = 0;
    const receipt = await curseForge.upload(checked, archive, 'fixture-token', async (url, request) => {
      uploads++;
      check(url.endsWith('/projects/1441253/upload-file') && request.method === 'POST', 'Upload must target the ItemRack project.');
      check(JSON.parse(request.body.get('metadata')).gameVersions.length === 5 &&
        Buffer.from(await request.body.get('file').arrayBuffer()).equals(fs.readFileSync(archive)),
      'Multipart upload must carry both folders in the identical published ZIP, without flattening/rebuilding.');
      return { ok: true, json: async () => ({ id: 12345 }) };
    });
    check(receipt.fileId === 12345 && receipt.sha256 === hash && uploads === 1, 'Successful deployment must retain a file-ID/hash receipt.');
    await assert.rejects(curseForge.upload(checked, archive, 'fixture-token', async () => {
      uploads++; throw new Error('connection lost');
    }), /connection lost/); checks++;
    check(uploads === 2, 'Ambiguous upload failures must never automatically retry the POST.');
    fs.appendFileSync(archive, 'changed');
    await assert.rejects(curseForge.upload(checked, archive, 'fixture-token', async () => { throw new Error('Network must not run'); }), /changed after/); checks++;
    const automation = read('.github/workflows/curseforge-release.yml');
    const releaseJob = between(automation, '  verify-and-deploy:', '    runs-on:');
    check(automation.includes('types: [published]') && !/^\s+if:/m.test(releaseJob) &&
      automation.includes("if: github.event_name == 'release' || inputs.upload == true"),
    'curseforge-auto-beta-published: both stable and prerelease published events must reach verification/upload without a stable-only job filter.');
    check(automation.includes('default: false') && automation.includes('types: [published]') &&
      automation.includes('npm test') && automation.includes('curseforge_deployment.js reserve') &&
      automation.includes('curseforge_deployment.js success') && automation.includes('deployments: write') &&
      automation.includes('actions/upload-artifact@v4') && automation.includes('secrets.CF_UPLOAD_TOKEN') &&
      !automation.includes('gh release upload') && !automation.includes('contents: write'),
    'curseforge-clean-release-assets: retain upload history and retry guards without adding JSON to release downloads.');

    // User's release-assets screenshot: moving JSON off the public downloads
    // must retain the completed 4.53 upload and block duplicate/ambiguous runs.
    const history = [];
    const statuses = [];
    let legacyAssets = [];
    let creates = 0;
    const ledgerApi = (method, url, body) => {
      if (method === 'GET' && url.includes('/deployments?')) return history;
      if (method === 'GET' && url.includes('/releases/tags/')) return { assets: legacyAssets };
      if (method === 'POST' && url.endsWith('/deployments')) {
        creates++;
        check(body.ref === checked.tag && body.auto_merge === false && body.required_contexts.length === 0 &&
          body.environment === 'curseforge' && body.payload.sha256 === hash,
        'Deployment reservation must record the checked tag/hash without merging or altering release source.');
        const deployment = { id: 4321, sha: checked.commit, payload: body.payload, environment: body.environment };
        history.push(deployment); return deployment;
      }
      if (method === 'GET' && url.endsWith('/deployments/4321')) return history[0];
      if (method === 'POST' && url.endsWith('/statuses')) { statuses.push(body); return { id: 999 }; }
      throw new Error('Unexpected ledger request');
    };
    legacyAssets = [{ name: 'curseforge-upload-attempt.json' }];
    assert.throws(() => deploymentLedger.reserve('Bl4ut0/ItemRack-Universal', checked, ledgerApi), /legacy upload record/); checks++;
    check(creates === 0, 'Legacy reservation must block before creating a new deployment or uploading again.');
    legacyAssets = [];
    const marker = deploymentLedger.reserve('Bl4ut0/ItemRack-Universal', checked, ledgerApi);
    check(marker.deploymentId === 4321 && statuses[0].state === 'in_progress', 'Upload reservation must persist before the CurseForge POST.');
    assert.throws(() => deploymentLedger.reserve('Bl4ut0/ItemRack-Universal', checked, ledgerApi), /already attempted/); checks++;
    deploymentLedger.recordSuccess('Bl4ut0/ItemRack-Universal', { ...receipt, deploymentId: marker.deploymentId }, ledgerApi);
    check(statuses[1].state === 'success' && statuses[1].environment_url.endsWith('/12345') &&
      statuses[1].description.includes(hash), 'Deployment receipt must preserve CurseForge file ID and accepted archive hash.');
    assert.throws(() => deploymentLedger.recordSuccess('Bl4ut0/ItemRack-Universal', {
      ...receipt, deploymentId: marker.deploymentId, sha256: '0'.repeat(64)
    }, ledgerApi), /differs from its reservation/); checks++;
    for (const state of ['success', 'failure', 'in_progress', 'inactive']) {
      assert.throws(() => deploymentLedger.reserve('Bl4ut0/ItemRack-Universal', checked, () => [{ id: 4321, state }]), /already attempted/); checks++;
    }
    assert.throws(() => deploymentLedger.reserve('Bl4ut0/ItemRack-Universal', checked, () => { throw new Error('history unavailable'); }), /history unavailable/); checks++;
    history.length = 0; statuses.length = 0; creates = 0;
    const migrated = deploymentLedger.migrate('Bl4ut0/ItemRack-Universal', receipt, ledgerApi);
    check(migrated.fileId === 12345 && creates === 1 && statuses[0].state === 'success',
      'Existing successful upload must migrate to durable deployment history without any new CurseForge request.');
    deploymentLedger.migrate('Bl4ut0/ItemRack-Universal', receipt, ledgerApi);
    check(creates === 1, 'Legacy receipt migration must be idempotent.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
checkCurseForgeDeployment().then(() => {
  console.log(`[RELEASE FLOW] ${checks} candidate, packaging, installation, finalization and CurseForge deployment guards passed.`);
}).catch((error) => { console.error(error); process.exitCode = 1; });
