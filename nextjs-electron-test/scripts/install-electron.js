// 手动运行 Electron 的 postinstall 脚本
const { spawn } = require('child_process');
const path = require('path');

const electronPath = path.join(__dirname, '..', 'node_modules', '.pnpm', 'electron@39.2.7', 'node_modules', 'electron');
const installScript = path.join(electronPath, 'install.js');

console.log('🔧 Running Electron postinstall script...');
console.log('Electron path:', electronPath);
console.log('Install script:', installScript);

const installProcess = spawn('node', [installScript], {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(__dirname, '..'),
});

installProcess.on('close', (code) => {
  if (code === 0) {
    console.log('✅ Electron postinstall completed successfully');
  } else {
    console.error('❌ Electron postinstall failed with code:', code);
    console.log('💡 This might be a network issue. Try again later or use npm instead of pnpm.');
  }
  process.exit(code);
});

installProcess.on('error', (err) => {
  console.error('❌ Error running Electron postinstall:', err);
  process.exit(1);
});










