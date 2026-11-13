const fs = require('fs');

// Distribution is part of the immutable addon source, not an editable release
// title/body. Both automatic and manual CurseForge paths honor this policy.
function distributionFromToc(toc) {
  const entries = [...toc.matchAll(/^## X-ItemRack-Distribution:\s*([^\r\n]*)/gm)];
  if (!entries.length) return 'curseforge';
  if (entries.length !== 1 || entries[0][1].trim() !== 'github-only') {
    throw new Error('Unknown/duplicate release distribution policy; refusing publication.');
  }
  return 'github-only';
}

function tocWithDistribution(toc, githubOnly) {
  const cleaned = toc.replace(/^## X-ItemRack-Distribution:[^\r\n]*\r?\n/gm, '');
  return githubOnly ? cleaned.replace(/^(## Version:[^\r\n]*\r?\n)/m, '$1## X-ItemRack-Distribution: github-only\n') : cleaned;
}

module.exports = { distributionFromToc, tocWithDistribution };
if (require.main === module) {
  const distribution = distributionFromToc(fs.readFileSync('ItemRack/ItemRack.toc', 'utf8'));
  console.log(`Immutable release distribution: ${distribution}`);
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `curseforge=${distribution === 'curseforge'}\n`);
}
