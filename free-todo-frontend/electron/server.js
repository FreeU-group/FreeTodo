// Next.js standalone 服务器启动器
const { app } = require("electron");
const path = require("path");

function startStandaloneServer(port = 3000) {
	return new Promise((resolve, reject) => {
		try {
			// standalone 模式下的服务器文件路径：
			// - 打包后：必须从 app.asar.unpacked 加载（standalone/server.js 内部会 chdir 到自身目录，
			//   asar 内路径无法 chdir，会导致 ENOENT）
			// - 开发态：直接从项目根目录加载
			const baseDir = app.isPackaged
				? path.join(process.resourcesPath, "app.asar.unpacked")
				: path.join(__dirname, "..");
			const serverPath = path.join(baseDir, ".next", "standalone", "server.js");

			// 设置环境变量
			process.env.PORT = port.toString();
			process.env.HOSTNAME = "127.0.0.1";

			// 启动 standalone 服务器
			console.log("启动 Next.js standalone 服务器...");
			console.log("服务器路径:", serverPath);

			// 动态 require standalone 服务器
			require(serverPath);

			// 等待服务器启动
			setTimeout(() => {
				console.log(`Next.js standalone 服务器已启动在端口 ${port}`);
				resolve();
			}, 2000);
		} catch (error) {
			console.error("启动 standalone 服务器失败:", error);
			reject(error);
		}
	});
}

module.exports = { startStandaloneServer };
