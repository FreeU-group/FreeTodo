const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__electronConfirm", () => {
	ipcRenderer.send("confirm-clicked");
});

contextBridge.exposeInMainWorld("__openExternal", (url) => {
	ipcRenderer.send("open-external", url);
});
