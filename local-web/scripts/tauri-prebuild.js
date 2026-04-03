const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const distDir = path.join(__dirname, "..", "src-tauri", "dist");
const indexPath = path.join(distDir, "index.html");

fs.mkdirSync(distDir, { recursive: true });

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FreeTodo</title>
    <style>
      body {
        margin: 0;
        font-family: "Segoe UI", Arial, sans-serif;
        background: #0b0e11;
        color: #e6e9ef;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
      .card {
        text-align: center;
        max-width: 420px;
        padding: 24px;
        border-radius: 16px;
        background: radial-gradient(circle at top, #1c2230 0%, #0f141a 60%);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
      }
      h1 {
        margin: 0 0 8px 0;
        font-size: 22px;
        font-weight: 600;
      }
      p {
        margin: 0;
        font-size: 14px;
        opacity: 0.7;
      }
      .spinner {
        width: 28px;
        height: 28px;
        margin: 16px auto 0;
        border-radius: 50%;
        border: 3px solid rgba(230, 233, 239, 0.2);
        border-top-color: #e6e9ef;
        animation: spin 0.9s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Starting FreeTodo...</h1>
      <p>Waiting for the local web server.</p>
      <div class="spinner"></div>
    </div>
    <script>
      const startPort = 3100;
      const maxAttempts = 50;
      const retryDelayMs = 600;
      const maxWaitMs = 30000;

      const startTime = Date.now();

      async function isServerUp(url) {
        try {
          await fetch(url, { mode: "no-cors", cache: "no-store" });
          return true;
        } catch {
          return false;
        }
      }

      async function tryPort(port) {
        const url = "http://localhost:" + port;
        const ok = await isServerUp(url);
        if (ok) {
          window.location.replace(url);
          return true;
        }
        return false;
      }

      async function poll() {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const port = startPort + attempt;
          const ready = await tryPort(port);
          if (ready) {
            return;
          }
        }
      }

      async function loop() {
        while (Date.now() - startTime < maxWaitMs) {
          await poll();
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }

      void loop();
    </script>
  </body>
</html>
`;

fs.writeFileSync(indexPath, html, "utf8");
console.log(`Wrote ${indexPath}`);

function copyDir(src, dest) {
	if (!fs.existsSync(src)) {
		return;
	}
	fs.mkdirSync(dest, { recursive: true });
	fs.cpSync(src, dest, { recursive: true, force: true });
}

const rootDir = path.join(__dirname, "..");
const nextDir = path.join(rootDir, ".next");
const standaloneDir = path.join(nextDir, "standalone");

if (fs.existsSync(standaloneDir)) {
	const staticSrc = path.join(nextDir, "static");
	const staticDest = path.join(standaloneDir, ".next", "static");
	const publicSrc = path.join(rootDir, "public");
	const publicDest = path.join(standaloneDir, "public");

	copyDir(staticSrc, staticDest);
	copyDir(publicSrc, publicDest);

	try {
		execSync("node scripts/resolve-symlinks.js", { cwd: rootDir, stdio: "inherit" });
	} catch (error) {
		console.warn(`Failed to resolve symlinks: ${error.message}`);
	}

	try {
		execSync("node scripts/copy-missing-deps.js", { cwd: rootDir, stdio: "inherit" });
	} catch (error) {
		console.warn(`Failed to copy missing deps: ${error.message}`);
	}
} else {
	console.warn(`Standalone output not found at: ${standaloneDir}`);
}
