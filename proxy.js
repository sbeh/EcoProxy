const EventEmitter = require('events')
const net = require('net')

class Pair extends EventEmitter {
    constructor(proxy, client, server) {
        super()

        this.id = Pair.id++
        this.client = client
        this.server = server
        this.proxy = proxy

        var pair = this

        function cd(data) {
            pair.client_data(data)
        }
        function sd(data) {
            pair.server_data(data)
        }
        this.client.on('data', cd)
        this.server.on('data', sd)

        this.client.once('end', () => {
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
                pair.server.removeListener('data', sd)
                pair.server.on('data', data => {
                    console.error('Pair', pair.id, '|', 'Lost data from Server to Client, because Client connection was unavailable')
                })
                pair.server.end()
            } else {
                console.debug('Pair', pair.id, '|', 'Disconnected')

                pair.emit('close')
            }
        })
        pair.server.once('close', _/*had_error*/ => {
            console.debug('Pair', pair.id, '|', 'Connection from proxy to server fully closed')

            delete pair.server

            if (pair.client) {
                pair.client.removeListener('data', cd)
                pair.client.on('data', data => {
                    console.error('Pair', pair.id, '|', 'Lost data from Client to Server, because Server connection was unavailable')
                })
                pair.client.end()
            } else {
                console.debug('Pair', pair.id, '|', 'Disconnected')

                pair.emit('close')
            }
        })
    }

    client_data(data) {
        console.debug('Pair', this.id, '>', data.toString().replace(/[^\w\n ]/gi, '.'))

        if (this.proxy.name == 'GameServer' && data.indexOf('\x0c' + 'method' + '\x02\x12' + 'Authorize' + '\x08' + 'args') >= 0) {
            console.debug('Found auth paket')

            function replace(find, put) {
                var i = data.indexOf(find)
                if (i == -1)
                    console.log('Could not find the following in Authorization paket from Client to GameServer:', find.replace(/[^\w\n ]/gi))
                else
                    data = Buffer.concat([
                        data.slice(0, i),
                        Buffer.from(put),
                        data.slice(i + find.length)
                    ])
            }

            function value(find) {
                var i = data.indexOf(find)
                if (i == -1) {
                    console.log('Could not find the following in Authorization paket from Client to GameServer:', find.replace(/[^\w\n ]/gi))
                    return null
                } else {
                    i += find.length
                    var l = data[i] / 2
                    ++i
                    return data.toString('utf8', i, i + l)
                }
            }
            var token = value('\x0atoken\x02')

            this.emit('token', {
                token: token,
                username: value('\x10username\x02')
            }, replaceWith => {
                if (replaceWith) {
                    var tl = token.length
                    var rl = replaceWith.length

                    replace('\x0atoken\x02' + String.fromCharCode(tl * 2) + token,
                            '\x0atoken\x02' + String.fromCharCode(rl * 2) + replaceWith)

                    replace('\x10steam_id\x02' + String.fromCharCode(tl * 2) + token,
                            '\x10steam_id\x02' + String.fromCharCode(rl * 2) + replaceWith)

                    data[2] -= 2 * tl
                    data[2] += 2 * rl
                } else
                    console.log('Not replacing token')
                this.server.write(data)
            })
        } else
            this.server.write(data)
    }

    server_data(data) {
        console.debug('Pair', this.id, '<', data.toString().replace(/[^\w\n ]/gi, '.'))

        this.client.write(data)
    }
}
Pair.id = 0

class Proxy extends EventEmitter {
    constructor(name, source, target) {
        super()

        this.name = name
        this.source = source
        this.target = target

        this.socket = net.createServer({
            allowHalfOpen: true
        }, client => {
            this.connection(client)
        })
        this.socket.listen(source)
    }

    close(callback) {
        this.socket.close(callback)
    }

    connection(client) {
        var pair = new Pair(this, client, net.createConnection(this.target))

        console.debug('Pair', pair.id, '|', 'Client connected from', client.remoteAddress, 'to', this.name)

        this.emit('connection', pair)
    }
}

exports.Proxy = Proxy