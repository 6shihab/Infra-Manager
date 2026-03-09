#!/usr/bin/env node
// Launch Electron without ELECTRON_RUN_AS_NODE (which VSCode sets to 1)
const { spawn } = require('child_process');
const path = require('path');

const electronPath = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const proc = spawn(electronPath, ['.'], {
  cwd: __dirname,
  env,
  stdio: 'inherit',
});

proc.on('exit', (code) => process.exit(code || 0));
