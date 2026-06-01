#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const [readmePath = 'README.md', releaseTag = '', releaseSha = ''] = process.argv.slice(2);
const actionName = 'lreading/dependabot-npm-force-overrides';

if (!/^v\d+\.\d+\.\d+$/.test(releaseTag)) {
  throw new Error(`Release tag must match vMAJOR.MINOR.PATCH, got ${JSON.stringify(releaseTag)}.`);
}

if (!/^[0-9a-f]{40}$/i.test(releaseSha)) {
  throw new Error(
    `Release SHA must be a 40-character commit SHA, got ${JSON.stringify(releaseSha)}.`,
  );
}

const readme = readFileSync(readmePath, 'utf8');
const actionUsePattern = new RegExp(
  `(\\s*- uses: ${escapeRegExp(actionName)}@)(\\S+)(\\s+#\\s*)v\\d+\\.\\d+\\.\\d+`,
  'm',
);

if (!actionUsePattern.test(readme)) {
  throw new Error(
    `Could not find a pinned ${actionName} README example with a release tag comment.`,
  );
}

const updated = readme.replace(actionUsePattern, `$1${releaseSha}$3${releaseTag}`);
writeFileSync(readmePath, updated, 'utf8');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
