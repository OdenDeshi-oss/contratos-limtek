const { app, BrowserWindow } = require('electron')
console.log('app type:', typeof app)
console.log('isPackaged:', app && app.isPackaged)
app.whenReady().then(() => {
  console.log('ready!')
  const w = new BrowserWindow({ width: 400, height: 300 })
  w.loadURL('data:text/html,<h1>OK</h1>')
  setTimeout(() => { app.quit() }, 3000)
})
