import * as core from '@actions/core';

import { executeCommitMode } from './commit-mode.js';
import { createModePlan, parseActionConfig } from './config.js';

export async function run(): Promise<void> {
  const config = parseActionConfig(core);
  const modePlan = createModePlan(config);

  core.info(`Mode: ${modePlan.mode}`);
  core.info(`Dry run: ${String(modePlan.dryRun)}`);
  core.info(`Override strategy: ${config.overrideStrategy}`);
  core.info(`Security only: ${String(config.securityOnly)}`);
  core.info(`Fail on direct lockfile-only updates: ${String(config.failOnDirectLockfileOnly)}`);
  core.info(`Allowed bot logins: ${config.allowedBotLogins.join(', ')}`);
  core.info(
    config.packageRoots.length === 0
      ? 'Package roots: auto-detect'
      : `Package roots: ${config.packageRoots.join(', ')}`,
  );

  if (config.skipLabel !== undefined) {
    core.info(`Skip label: ${config.skipLabel}`);
  }

  core.info(modePlan.summary);
  core.setOutput('changed', 'false');
  core.setOutput('mode', modePlan.mode);
  core.setOutput('dry-run', String(modePlan.dryRun));
  core.setOutput('would-write', String(modePlan.mayWriteFiles));
  core.setOutput('would-comment', String(modePlan.mayComment));
  core.setOutput('would-commit', String(modePlan.mayCommit));

  if (modePlan.mayCommit) {
    const outcome = await executeCommitMode({
      config,
      logger: core,
    });

    if (!outcome.ok) {
      core.setFailed(outcome.reason);
      return;
    }

    core.info(outcome.value.message);
    core.setOutput('changed', String(outcome.value.changed));
    core.setOutput('committed', String(outcome.value.committed));
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
});
