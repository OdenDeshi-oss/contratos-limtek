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
  djLoadExcel:    (opts)      => ipcRenderer.invoke('dj-load-excel', opts),
  djGenerate:     (opts)      => ipcRenderer.invoke('dj-generate', opts),
  openPath:       (path)      => ipcRenderer.invoke('open-folder', path),
  // sesión y usuarios
  sesionEstado:      ()      => ipcRenderer.invoke('sesion-estado'),
  sesionCrearAdmin:  (d)     => ipcRenderer.invoke('sesion-crear-admin', d),
  sesionEntrar:      (d)     => ipcRenderer.invoke('sesion-entrar', d),
  sesionSalir:       ()      => ipcRenderer.invoke('sesion-salir'),
  sesionCambiarClave:(d)     => ipcRenderer.invoke('sesion-cambiar-clave', d),
  usuariosListar:    ()      => ipcRenderer.invoke('usuarios-listar'),
  usuariosCrear:     (d)     => ipcRenderer.invoke('usuarios-crear', d),
  usuariosEditar:    (d)     => ipcRenderer.invoke('usuarios-editar', d),
  usuariosRestablecerClave: (d) => ipcRenderer.invoke('usuarios-restablecer-clave', d),
  // buscar
  buscarEjecutar:   (opts)    => ipcRenderer.invoke('buscar-ejecutar', opts),
  onBuscarProgreso: (fn) => {
    const h = (_e, msg) => fn(msg)
    ipcRenderer.on('buscar-progreso', h)
    return () => ipcRenderer.removeListener('buscar-progreso', h)
  },
  onedriveEstado:   ()        => ipcRenderer.invoke('onedrive-estado'),
  onedriveConectar: (enlace)  => ipcRenderer.invoke('onedrive-conectar', enlace),
  // renombrar
  renombrarListar:  (carpeta) => ipcRenderer.invoke('renombrar-listar', carpeta),
  leerArchivo:      (ruta)    => ipcRenderer.invoke('leer-archivo', ruta),
  ocrImagen:        (bytes)   => ipcRenderer.invoke('ocr-imagen', bytes),
  renombrarAplicar: (opts)    => ipcRenderer.invoke('renombrar-aplicar', opts),
})
