import * as core from '@actions/core';

import { executeCommitMode } from './commit-mode.js';
import { parseActionConfig } from './config.js';

export async function run(): Promise<void> {
  const config = parseActionConfig(core);

  core.info(`Dry run: ${String(config.dryRun)}`);
  core.info(
    config.packageRoots.length === 0
      ? 'Package roots: auto-detect'
      : `Package roots: ${config.packageRoots.join(', ')}`,
  );

  if (config.skipLabel !== undefined) {
    core.info(`Skip label: ${config.skipLabel}`);
  }

  if (config.sshSigningKey !== '') {
    core.setSecret(config.sshSigningKey);
  }

  core.setOutput('changed', 'false');
  core.setOutput('committed', 'false');
  core.setOutput('pushed', 'false');

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
  core.setOutput('pushed', String(outcome.value.pushed));
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
});
