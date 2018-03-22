var pairs = []

const net = require('net')

function startProxy(name, listen, target_host, target_port) {
    const proxy = net.createServer({
        allowHalfOpen: true
    })

    proxy.on('connection', client => {
        var pair = {
            id: 0
        }
        while(pairs[pair.id])
            ++pair.id
        pairs.push(pair)

        pair.client = client
        pair.server = net.createConnection({
            host: target_host,
            port: target_port
        })

        console.debug('Pair', pair.id, '|', 'Client connected from', client.remoteAddress, 'to proxy', name)

        function client_data(data) {
            pair.server.write(data)
        }
        pair.client.on('data', client_data)

        function server_data(data) {
            pair.client.write(data)
        }
        pair.server.on('data', server_data)

        pair.client.once('end', () => {
            console.debug('Pair', pair.id, '|', 'Client send FIN to proxy')

            if (pair.server) {
                pair.server.end()
            }
        })
        pair.server.once('end', () => {
            console.debug('Pair', pair.id, '|', 'Server send FIN to proxy')

            if (pair.client) {
                pair.client.end()
            }
        })

        pair.client.once('error', error => {
            if (error.code === 'ECONNRESET') {
                console.debug('Pair', pair.id, '|', 'Client send RESET to proxy')
            } else {
                console.debug('Pair', pair.id, '|', 'Client send ERROR to proxy', "\n", error)
            }

            if (pair.server) {
                pair.server.end()
            }
        })
        pair.server.once('error', error => {
            if (error.code === 'ECONNRESET') {
                console.debug('Pair', pair.id, '|', 'Server send RESET to proxy')
            } else {
                console.debug('Pair', pair.id, '|', 'Server send ERROR to proxy', "\n", error)
            }

            if (pair.client) {
                pair.client.end()
            }
        })

        pair.client.once('close', _/*had_error*/ => {
            console.debug('Pair', pair.id, '|', 'Connection from client to proxy fully closed')

            delete pair.client

            if (pair.server) {
                pair.server.removeListener('data', server_data)
                pair.server.on('data', data => {
                    console.error('Pair', pair.id, '|', 'Lost data from Server to Client, because Client connection was unavailable')
                })
                pair.server.end()
            } else {
                console.debug('Pair', pair.id, '|', 'Disconnected')

                delete pairs[pair.id]
            }
        })
        pair.server.once('close', _/*had_error*/ => {
            console.debug('Pair', pair.id, '|', 'Connection from proxy to server fully closed')

            delete pair.server

            if (pair.client) {
                pair.client.removeListener('data', client_data)
                pair.client.on('data', data => {
                    console.error('Pair', pair.id, '|', 'Lost data from Client to Server, because Server connection was unavailable')
                })
                pair.client.end()
            } else {
                console.debug('Pair', pair.id, '|', 'Disconnected')

                delete pairs[pair.id]
            }
        })
    })
    proxy.listen(listen)
}

const ECO_Server_Configs_Network = {
    IPAddress: 'localhost',
    GameServerPort: 3000,
    WebServerPort: 3001
}

startProxy('GameServer', ECO_Server_Configs_Network.GameServerPort, ECO_Server_Configs_Network.IPAddress, ECO_Server_Configs_Network.GameServerPort)
startProxy('WebServer', ECO_Server_Configs_Network.WebServerPort, ECO_Server_Configs_Network.IPAddress, ECO_Server_Configs_Network.WebServerPort)