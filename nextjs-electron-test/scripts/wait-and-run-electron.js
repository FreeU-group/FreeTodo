// 等待 Next.js 服务器启动，然后运行 Electron
const { spawn } = require('child_process');
const waitOn = require('wait-on');

const options = {
  resources: ['http://localhost:3000'],
  timeout: 60000, // 60 秒超时
  interval: 500, // 每 500ms 检查一次
};

waitOn(options)
  .then(() => {
    console.log('✅ Next.js server is ready');
    // 先构建 Electron
    const buildProcess = spawn('node', ['scripts/build-electron.js'], {
      stdio: 'inherit',
      shell: true,
    });

    buildProcess.on('close', (code) => {
      if (code === 0) {
        // 构建成功，运行 Electron
        console.log('✅ Electron build complete, starting Electron...');
        const electronProcess = spawn('electron', ['.'], {
          stdio: 'inherit',
          shell: true,
        });

        electronProcess.on('close', (code) => {
          process.exit(code);
        });

        electronProcess.on('error', (err) => {
          console.error('❌ Electron process error:', err);
          console.error('💡 Try running: pnpm rebuild electron');
          process.exit(1);
        });
      } else {
        console.error('❌ Electron build failed');
        process.exit(code);
      }
    });
  })
  .catch((err) => {
    console.error('❌ Wait for Next.js server failed:', err);
    process.exit(1);
  });

