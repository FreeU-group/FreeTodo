// 修复 Electron 安装问题
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🔧 Fixing Electron installation...');

try {
  // 检查 Electron 是否已正确安装
  const electronPath = path.join(__dirname, '..', 'node_modules', '.pnpm', 'electron@28.3.3', 'node_modules', 'electron');
  
  if (!fs.existsSync(electronPath)) {
    console.log('❌ Electron not found, reinstalling...');
    execSync('pnpm install electron --force', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  }

  // 尝试运行 Electron 的 postinstall 脚本
  console.log('🔧 Running Electron postinstall...');
  const electronCli = path.join(electronPath, 'cli.js');
  if (fs.existsSync(electronCli)) {
    console.log('✅ Electron CLI found');
  } else {
    console.log('❌ Electron CLI not found');
    console.log('💡 Try: pnpm rebuild electron');
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('💡 Try running: pnpm rebuild electron');
}










