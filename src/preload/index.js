import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  loadExcel:      (filePath)  => ipcRenderer.invoke('load-excel', filePath),
  generateDocs:   (opts)      => ipcRenderer.invoke('generate-docs', opts),
  generateSingle: (opts)      => ipcRenderer.invoke('generate-single', opts),
  computeDates:   (fecha)     => ipcRenderer.invoke('compute-dates', fecha),
  openFolder:     (path)      => ipcRenderer.invoke('open-folder', path),
  openManual:     ()          => ipcRenderer.invoke('open-manual'),
  getDownloads:   ()          => ipcRenderer.invoke('get-downloads'),
  pickFolder:     ()          => ipcRenderer.invoke('pick-folder'),
  pickExcel:      ()          => ipcRenderer.invoke('pick-excel'),
  copyFormat:     (dir)       => ipcRenderer.invoke('copy-format', dir),
  getSettings:    ()          => ipcRenderer.invoke('get-settings'),
  saveSettings:   (data)      => ipcRenderer.invoke('save-settings', data),
  checkPassword:  (pwd)       => ipcRenderer.invoke('check-password', pwd),
})
