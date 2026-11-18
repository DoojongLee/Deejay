'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cal', {
  hide: () => ipcRenderer.send('win:hide'),
  quit: () => ipcRenderer.send('win:quit'),
  setOpacity: (v) => ipcRenderer.send('win:opacity', v),
  setPin: (pinned) => ipcRenderer.send('win:pin', pinned),
  getState: () => ipcRenderer.invoke('win:getState'),
  onReload: (fn) => ipcRenderer.on('cmd:reload', fn),
});
