"use strict;"

const cluster = require('cluster')
const net = require('net')
const util = require('util')
const debug = util.debuglog('load_balance')

const cpuNumber = require('os').cpus().length
const SocketParser = require('./lb_socket_parser')
const TLSSocketParser = require('./lb_tls_socket_parser')

const OCSPRequestBuffer = new Buffer('1')

function clearSocket(socket) {
    if (socket) {
        socket.destroySoon()
    }
}

function send404(socket) {
    if (socket) {
        const random = 'Load Balance can not find resource ' + Math.random().toString()
        socket.write('HTTP/1.1 404 Not Found\r\nconnection: close\r\ncontent-length: ' + random.length.toString(16) + '\r\n\r\n' + random)
    }
}

function getHash(text) {
    let hash = 0
    for (let i = 0, j = text.length; i < j; i++) {
        hash += text[i].charCodeAt(0)
    }
    return hash
}

function proxyRequest(server, socket, bytesRead, header, requestLine, config) {
    const targets = server.targets.filter(function(target) {
        return !target.isDown
    })
    if (!targets.length) {
        send404(socket)
        clearSocket(socket)
        return
    }
    const target = targets[getHash(socket.remoteAddress || '') % targets.length]
    const proxy = net.connect(target, function() {
        this.setNoDelay(false)
        for (let i = 0; i < bytesRead.length; i++) {
            this.write(bytesRead[i])
        }
        this.setNoDelay(true)
    })
    const isWebsocket = header.hasOwnProperty('connection') && header.connection.toLowerCase() == 'upgrade' &&
        header.hasOwnProperty('upgrade') && header.upgrade == 'websocket'

    proxy.setTimeout(isWebsocket ? config.websocketTimeout : config.socketTimeout)

    proxy.on('data', function(data) {
        socket.setTimeout(isWebsocket ? config.websocketTimeoutIncrease : config.socketTimeoutIncrease)
    })
    proxy.on('error', function(e) {
        debug('proxy error', e)
        clearSocket(socket)
        clearSocket(proxy)
    })
    socket.on('error', function(e) {
        debug('req error', e)
        clearSocket(proxy)
        clearSocket(socket)
    })
    socket.on('close', function(e) {
        debug('req close', e)
        clearSocket(proxy)
    })
    proxy.on('close', function(e) {
        debug('proxy close', e)
        clearSocket(socket)
    })
    socket.on('end', function(e) {
        debug('req end', e)
        clearSocket(proxy)
    })
    proxy.on('end', function(e) {
        debug('proxy end', e)
        clearSocket(socket)
    })
    socket.on('timeout', function(e) {
        //manual close
        debug('req timeout', e)
        clearSocket(socket)
        clearSocket(proxy)
    })
    proxy.on('timeout', function(e) {
        //manual close
        debug('proxy timeout', e)
        clearSocket(socket)
        clearSocket(proxy)
    })
    proxy.pipe(socket)
    socket.pipe(proxy)
}

function start(config) {
    if (cluster.isMaster) {
        const workers = []
        for (let i = 0; i < cpuNumber; i++) {
            workers.push(cluster.fork())
        }

        cluster.on('exit', (worker, code, signal) => {
            workers.forEach(function(existed, index, workers) {
                if (existed === worker) {
                    workers[index] = cluster.fork()
                }
            })
            debug('worker', worker.process.pid, 'exit')
        })
        config.loadBalanceServers.https && config.loadBalanceServers.https.forEach(function(https) {
            net.createServer({
                pauseOnConnect: true,
                allowHalfOpen: false
            }, function(socket) {
                socket.setTimeout(config.socketTimeout)
                debug('new tls socket')
                const hash = getHash(socket.remoteAddress || '')
                workers[hash % cpuNumber].send('https', socket)
            }).listen(https.port, https.host)
            debug('https listen to', https.port, https.host)
        })

        config.loadBalanceServers.http && config.loadBalanceServers.http.forEach(function(http) {
            net.createServer({
                pauseOnConnect: true,
                allowHalfOpen: false
            }, function(socket) {
                socket.setTimeout(config.socketTimeout)
                debug('new socket')
                const hash = getHash(socket.remoteAddress || '')
                workers[hash % cpuNumber].send('http', socket)
            }).listen(http.port, http.host)
            debug('http listen to', http.port, http.host)
        })
    } else {
        process.on('request', function(socket, header, requestLine, bytesRead) {
            for (let i = 0, j = config.backendServers.length; i < j; i++) {
                const server = config.backendServers[i]
                if (server.isDown) {
                    continue
                }
                const isUpgrade = header.hasOwnProperty('connection') && header.connection.toLowerCase() == 'upgrade'
                const isWebsocket = isUpgrade && header.hasOwnProperty('upgrade') && header.upgrade == 'websocket'
                const isHttp1 = !isUpgrade
                if (
                    ((server.host === header.host) && (server.isWebsocket == isWebsocket)) ||
                    ((server.host instanceof RegExp) && server.host.test(header.host))
                ) {
                    proxyRequest(server, socket, bytesRead, header, requestLine, config)
                    return
                }
            }

            send404(socket)
            clearSocket(socket)
        })
        process.on('OCSPRequest', function(cert, issuer, callback) {
            /*debug('OCSP Request made.')
            debug("CERT: ", cert)
            debug("ISSUER: ", issuer)*/
            callback(null, OCSPRequestBuffer)
        })
        process.on('https-message', function(message, socket) {
            SocketParser.get(socket, this, config)
        })
        process.on('message', function(message, socket) {
            let parser
            switch (message) {
                case 'http':
                    parser = SocketParser
                    break
                case 'https':
                    parser = TLSSocketParser
                    break
                default:
                    break
            }
            if (parser) {
                parser.get(socket, this, config)
            }
        })
    }
}
module.exports = {
    start
}