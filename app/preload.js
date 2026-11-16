const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  call: (name, ...args) => ipcRenderer.invoke('rpc', name, args),
  on: (event, cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on(event, h);
    return () => ipcRenderer.removeListener(event, h);
  },
  win: (action) => ipcRenderer.send('win', action),
});
