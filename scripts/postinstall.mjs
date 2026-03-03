#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  return typeof result.status === 'number' ? result.status : 1;
}

if (process.env.npm_config_global !== 'true') {
  process.exit(0);
}

const skillStatus = run('sh', ['./scripts/install-skills.sh']);
if (skillStatus !== 0) process.exit(skillStatus);

const initStatus = run(process.execPath, ['./scripts/maybe-init.mjs', '--require-global']);
if (initStatus !== 0) process.exit(initStatus);
