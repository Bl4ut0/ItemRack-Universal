const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const endpoint = 'https://wow.curseforge.com/api';
const projectId = 1441253;
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function requireValue(condition, message) { if (!condition) throw new Error(message); }

// Read the central directory without extracting or rewriting the uploaded ZIP.
function zipFiles(bytes) {
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  requireValue(end >= 0 && bytes.readUInt32LE(end) === 0x06054b50, 'Invalid ZIP directory.');
  requireValue(bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0, 'Split ZIPs are unsupported.');
  const count = bytes.readUInt16LE(end + 10);
  requireValue(count > 0 && count < 65535, 'Empty/ZIP64 archive is unsupported.');
  let offset = bytes.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    requireValue(bytes.readUInt32LE(offset) === 0x02014b50, 'Invalid ZIP entry.');
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const size = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    requireValue(/^(ItemRack|ItemRackOptions)\//.test(name) && !name.includes('\\') &&
      !name.split('/').some((part) => part === '..'), 'Unexpected archive path.');
    requireValue(!(flags & 1) && (method === 0 || method === 8), 'Unsupported ZIP compression/encryption.');
    requireValue(bytes.readUInt32LE(local) === 0x04034b50, 'Invalid local ZIP entry.');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    requireValue(start + compressedSize <= bytes.length && size < 32 * 1024 * 1024, 'Invalid ZIP entry size.');
    if (!name.endsWith('/')) {
      requireValue(!files.has(name), 'Duplicate archive entry.');
      const compressed = bytes.subarray(start, start + compressedSize);
      const data = method === 0 ? compressed : zlib.inflateRawSync(compressed, { maxOutputLength: size + 1 });
      requireValue(data.length === size, 'ZIP content length mismatch.');
      files.set(name, data);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function verifyRelease({ tag, archive, checksum, notes, repo = process.cwd() }) {
  requireValue(/^v\d+\.\d+(?:\.\d+)?(?:-beta\d+)?$/.test(tag), 'An exact release tag is required.');
  const version = tag.slice(1);
  const filename = `ItemRack-universal-${version}.zip`;
  requireValue(path.basename(archive) === filename, 'Unexpected archive filename.');
  const bytes = fs.readFileSync(archive);
  const hash = sha256(bytes);
  requireValue(fs.readFileSync(checksum, 'utf8').trim() === `${hash}  ${filename}`, 'Release checksum mismatch.');
  requireValue(notes.startsWith(`# ItemRack Universal v${version}\n`) ||
    notes.startsWith(`# ItemRack Anniversary v${version}\n`), 'Release notes/version mismatch.');
  const git = (args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  const commit = git(['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]);
  const expected = new Map(git(['ls-tree', '-r', commit, '--', 'ItemRack', 'ItemRackOptions']).split('\n').map((line) => {
    const match = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(line);
    requireValue(match, 'Unsupported release tree entry.');
    return [match[3], match[2]];
  }));
  const files = zipFiles(bytes);
  requireValue(files.size === expected.size, 'Archive file count differs from its release tag.');
  for (const [name, data] of files) {
    const blob = crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
    requireValue(expected.get(name) === blob, `Archive differs from tag: ${name}`);
  }
  for (const name of ['ItemRack/ItemRack.toc', 'ItemRackOptions/ItemRackOptions.toc']) {
    requireValue(new RegExp(`^## Version: ${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm')
      .test(files.get(name)?.toString('utf8') || ''), 'Both addon TOCs must match the release tag.');
  }
  const toc = files.get('ItemRack/ItemRack.toc').toString('utf8');
  requireValue(/^## X-Curse-Project-ID: 1441253\s*$/m.test(toc), 'Wrong CurseForge project.');
  const interfaces = /^## Interface:\s*([^\r\n]+)/m.exec(toc)?.[1].split(',').map((value) => Number(value.trim())) || [];
  // 11601 is the legacy Camelot load alias; CurseForge lists this family as 1.60.1.
  const supported = new Map([[11508, '1.15.8'], [11509, '1.15.9'], [20505, '2.5.5'], [20506, '2.5.6'], [16001, '1.60.1']]);
  requireValue(interfaces.every((id) => supported.has(id) || id === 11601), 'Unmapped client Interface; update deployment mapping first.');
  const gameVersionNames = [...new Set(interfaces.filter((id) => supported.has(id)).map((id) => supported.get(id)))];
  requireValue(gameVersionNames.some((v) => v.startsWith('1.15.')) && gameVersionNames.some((v) => v.startsWith('2.5.')) &&
    gameVersionNames.includes('1.60.1'), 'Universal package must cover Era, TBC and Forever.');
  return { tag, version, commit, sha256: hash, filename, fileCount: files.size, gameVersionNames, releaseType: version.includes('-beta') ? 'beta' : 'release' };
}

async function preflight(plan, notes, token, fetchImpl = fetch) {
  requireValue(token && !/[\r\n]/.test(token), 'CF_API_TOKEN is missing or invalid. Add the shared account token to ItemRack Actions secrets.');
  const response = await fetchImpl(`${endpoint}/game/wow/versions`, {
    headers: { 'X-Api-Token': token }, signal: AbortSignal.timeout(60000)
  });
  requireValue(response.ok, `CurseForge setup check failed (HTTP ${response.status}).`);
  const versions = await response.json();
  requireValue(Array.isArray(versions), 'Unexpected game-version response.');
  const gameVersions = plan.gameVersionNames.map((name) => {
    const matches = versions.filter((v) => v.name === name);
    requireValue(matches.length === 1 && Number.isSafeInteger(matches[0].id) && matches[0].id > 0,
      `Expected exactly one CurseForge game version: ${name}`);
    return matches[0].id;
  });
  requireValue(new Set(gameVersions).size === gameVersions.length, 'Duplicate CurseForge game-version IDs.');
  return { ...plan, projectId, metadata: { displayName: `ItemRack Universal ${plan.version}`, gameVersions,
    releaseType: plan.releaseType, changelog: notes, changelogType: 'markdown' } };
}

async function upload(plan, archive, token, fetchImpl = fetch) {
  requireValue(plan.projectId === projectId && plan.metadata, 'Run the setup check before upload.');
  const bytes = fs.readFileSync(archive);
  requireValue(sha256(bytes) === plan.sha256, 'Archive changed after setup check.');
  const form = new FormData();
  form.append('metadata', JSON.stringify(plan.metadata));
  form.append('file', new Blob([bytes], { type: 'application/zip' }), plan.filename);
  // Never retry a POST automatically: a timeout may happen after server acceptance.
  const response = await fetchImpl(`${endpoint}/projects/${projectId}/upload-file`, {
    method: 'POST', headers: { 'X-Api-Token': token }, body: form, signal: AbortSignal.timeout(180000)
  });
  requireValue(response.ok, `CurseForge upload failed (HTTP ${response.status}); check for a created file before retrying.`);
  const result = await response.json();
  requireValue(Number.isSafeInteger(result.id) && result.id > 0, 'Upload response has no file ID; check CurseForge before retrying.');
  return { ...plan, fileId: result.id, uploadedAt: new Date().toISOString() };
}

async function main() {
  const [command, tag, directory] = process.argv.slice(2);
  requireValue(['check', 'upload'].includes(command) && directory, 'Usage: curseforge_upload.js check|upload TAG DIRECTORY');
  const archive = path.join(directory, `ItemRack-universal-${tag.slice(1)}.zip`);
  const notes = fs.readFileSync(path.join(directory, 'GITHUB_RELEASE.md'), 'utf8').replace(/\r\n/g, '\n');
  const verified = verifyRelease({ tag, archive, checksum: `${archive}.sha256`, notes });
  const plan = await preflight(verified, notes, process.env.CF_API_TOKEN);
  fs.writeFileSync(path.join(directory, 'curseforge-plan.json'), JSON.stringify(plan, null, 2) + '\n');
  if (command === 'upload') {
    const markerPath = path.join(directory, 'curseforge-upload-attempt.json');
    requireValue(fs.existsSync(markerPath), 'Persistent upload-attempt marker is required.');
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    requireValue(marker.tag === plan.tag && marker.commit === plan.commit && marker.sha256 === plan.sha256 &&
      marker.projectId === projectId && JSON.stringify(marker.metadata) === JSON.stringify(plan.metadata),
    'Upload plan differs from its reserved attempt; inspect deployment evidence before retrying.');
    const result = await upload(plan, archive, process.env.CF_API_TOKEN);
    fs.writeFileSync(path.join(directory, 'curseforge-upload.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(`Uploaded unchanged archive: CurseForge file ${result.fileId}, SHA-256 ${result.sha256}`);
  } else {
    console.log(`Setup check passed: ${plan.fileCount} tag-verified files; versions ${plan.gameVersionNames.join(', ')}; no upload performed.`);
  }
}

module.exports = { zipFiles, verifyRelease, preflight, upload };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
