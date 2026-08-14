import { spawn, spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const commands = process.argv.includes('--with-server')
  ? [
      { script: 'dev:server', required: true },
      { script: 'dev:ai-bot', required: false },
      { script: 'dev:web', required: true },
      { script: 'dev:retro-rush', required: true },
      { script: 'dev:spin-the-bottle', required: true },
      { script: 'dev:rus-ruleti', required: true },
    ]
  : [
      { script: 'dev:web', required: true },
      { script: 'dev:retro-rush', required: true },
      { script: 'dev:spin-the-bottle', required: true },
      { script: 'dev:rus-ruleti', required: true },
    ];
const children = commands.map(({ script, required }) => ({
  script,
  required,
  child: spawn(npmCommand, ['run', script], {
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32',
  }),
}));

let stopping = false;
function stopChild(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    child.kill('SIGTERM');
  }
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const { child } of children) stopChild(child);
  process.exitCode = exitCode;
}

for (const { child, script, required } of children) {
  child.on('error', (error) => {
    if (required) {
      console.error(error.message);
      stop(1);
    } else console.warn(`[dev] Optional ${script} failed to start: ${error.message}. Core services will continue.`);
  });
  child.on('exit', (code) => {
    if (stopping) return;
    if (required) stop(code ?? 0);
    else console.warn(`[dev] Optional ${script} exited with code ${code ?? 0}. Core services will continue.`);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
