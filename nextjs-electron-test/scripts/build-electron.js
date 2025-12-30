const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const distDir = path.join(__dirname, '..', 'electron');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 对于这个测试项目，我们直接使用 main.js，不需要编译
console.log('✅ Electron main.js ready');












