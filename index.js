var electron = require('electron')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
var window

function createWindow () {
    // Create the browser window.
    window = new electron.BrowserWindow({width: 800, height: 600})

    // and load the index.html of the app.
    window.loadURL(`file://${__dirname}/index.html`)

    // Open the DevTools.
    window.webContents.openDevTools()

    // Emitted when the window is closed.
    window.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        window = null
    })
}

electron.app.on('ready', createWindow)

// Quit when all windows are closed.
electron.app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        electron.app.quit()
    }
})

electron.app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (window === null) {
        createWindow()
    }
})

var proxy = require('./proxy')

var proxies = []
var pairs = []
var tokens = []

var ipc = electron.ipcMain

function proxyAdd(event, p) {
    p.id = proxies.length
    proxies.push(new proxy.Proxy(p.name, p.source, p.target))
    event.sender.send('proxyAdd', p)

    proxies[p.id].on('connection', pair => {
        pair.id = pairs.length
        pairs.push(pair)
        event.sender.send('pairAdd', {
            id: pair.id,
            clientAddress: pair.client.remoteAddress,
            proxy: pair.proxy.name,
        })

        pair.on('token', (token, callback) => {
            var send = false
            var i = tokens.findIndex(t => t.token == token.token)
            if (i == -1) {
                i = tokens.length
                tokens.push(token)
                send = true
            } else if (tokens[i].username != token.username) {
                tokens[i].username = token.username
                send = true
            }
            if (send)
                event.sender.send('tokenAdd', tokens[i])
            callback(tokens[i].replaceWith)
        })
        pair.on('close', () => {
            delete pairs[pair.id]
            event.sender.send('pairDel', pair.id)
        })
    })
}

ipc.on('proxyGet', event => {
    proxies.forEach(p => event.sender.send('proxyAdd', p))
})

ipc.on('proxyAdd', proxyAdd)

ipc.on('proxyDel', (event, id) => {
    proxies[id].close(() => {
        delete proxies[id]
        event.sender.send('proxyDel', id)
    })
})

ipc.on('pairGet', event => {
    pairs.forEach(pair => event.sender.send('pairAdd', {
        id: pair.id,
        clientAddress: pair.client.remoteAddress,
        proxy: pair.proxy.name,
    }))
})

ipc.on('pairDel', (event, id) => {
    pairs[id].client.end()
    pairs[id].server.end()
})

ipc.on('tokenGet', event => {
    tokens.forEach(t => event.sender.send('tokenAdd', t))
})

ipc.on('tokenReplace', (_, token) => {
    var i = tokens.findIndex(t => t.token == token.token)
    tokens[i].replaceWith = token.replaceWith
})