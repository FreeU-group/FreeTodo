const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__electronConfirm", () => {
	ipcRenderer.send("confirm-clicked");
});

contextBridge.exposeInMainWorld("__openExternal", (url) => {
	ipcRenderer.send("open-external", url);
});

contextBridge.exposeInMainWorld("__electronDismiss", () => {
	ipcRenderer.send("dismiss-clicked");
});

contextBridge.exposeInMainWorld("__copyToClipboard", (text) => {
	ipcRenderer.send("copy-to-clipboard", text);
});
