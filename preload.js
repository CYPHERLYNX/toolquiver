'use strict';

/**
 * ToolQuiver preload — safe bridge between renderer and main.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tv', {
  analyze: (input, opts) => ipcRenderer.invoke('tv:analyze', input, opts || {}),
  list: (filters) => ipcRenderer.invoke('tv:list', filters || {}),
  categories: () => ipcRenderer.invoke('tv:categories'),
  count: () => ipcRenderer.invoke('tv:count'),
  remove: (id) => ipcRenderer.invoke('tv:delete', id),
  favorite: (id) => ipcRenderer.invoke('tv:favorite', id),
  saveNote: (id, note) => ipcRenderer.invoke('tv:note', id, note),
  recategorize: (id, categoryId, label) => ipcRenderer.invoke('tv:recategorize', id, categoryId, label),
  pickApk: () => ipcRenderer.invoke('tv:pick-apk'),
  openExternal: (url) => ipcRenderer.invoke('tv:open-external', url),
  lookupName: (name) => ipcRenderer.invoke('tv:lookup-name', name),
  settingGet: (key, fallback) => ipcRenderer.invoke('tv:setting-get', key, fallback),
  settingSet: (key, value) => ipcRenderer.invoke('tv:setting-set', key, value),
  exportLib: (format) => ipcRenderer.invoke('tv:export', format),
});
