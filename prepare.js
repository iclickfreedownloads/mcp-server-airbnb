#!/usr/bin/env node
import { existsSync } from 'fs';
import { spawnSync } from 'child_process';

// Only run build if TypeScript source files exist (development environment)
if (existsSync('index.ts')) {
  console.log('Development environment detected, building...');
  const result = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
  process.exit(result.status || 0);
} else {
  console.log('Production install, skipping build (using pre-built files)');
  process.exit(0);
}
