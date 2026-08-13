import { spawn, spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const commands = process.argv.includes('--with-server')
  ? ['dev:server', 'dev:ai-bot', 'dev:web', 'dev:retro-rush', 'dev:spin-the-bottle']
  : ['dev:web', 'dev:retro-rush', 'dev:spin-the-bottle'];
const children = commands.map((script) =>
  spawn(npmCommand, ['run', script], {
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32',
  }),
);

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
  for (const child of children) stopChild(child);
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 0));
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
