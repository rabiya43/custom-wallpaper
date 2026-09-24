// Bridge between the dashboard pages and the main process. Only for app:// pages.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
    closeEditor: () => ipcRenderer.send('editor:close'),
    openWebSearch: (query, engine) => ipcRenderer.send('web:open', { query, engine }),
    webBack: () => ipcRenderer.send('web:back'),
    onApplyImage: cb => ipcRenderer.on('apply-image', (_e, data) => cb(data)),
    onWebState: cb => ipcRenderer.on('web:state', (_e, data) => cb(data)),
    onWebNav: cb => ipcRenderer.on('web:nav', (_e, data) => cb(data)),
    onWebToast: cb => ipcRenderer.on('web:toast', (_e, msg) => cb(msg)),
});
