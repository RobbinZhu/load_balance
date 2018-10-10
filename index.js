const cluster = require('cluster')
const net = require('net')
const util = require('util')
const debug = util.debuglog('load_balance')

const cpuNumber = require('os').cpus().length
const SocketParser = require('./lb_socket_parser')
const TLSSocketParser = require('./lb_tls_socket_parser')

function start(config) {
    function getHash(text) {
        let hash = 0
        for (let i = 0, j = text.length; i < j; i++) {
            hash += text[i].charCodeAt(0)
        }
        return hash
    }
    if (cluster.isMaster) {
        const workers = []
        for (let i = 0; i < cpuNumber; i++) {
            workers.push(cluster.fork())
        }

        cluster.on('exit', (worker, code, signal) => {
            debug('工作进程', worker.process.pid, '已退出')
        })
        config.loadBalanceServers.https.forEach(function(https) {
            net.createServer({
                pauseOnConnect: true,
                allowHalfOpen: false
            }, function(socket) {
                socket.setTimeout(config.socketTimeout)
                debug('new tls socket')
                const hash = getHash(socket.remoteAddress)
                workers[hash % cpuNumber].send('https', socket)
            }).listen(https.port, https.host)
            debug('listen to', https.port, https.host)
        })

        config.loadBalanceServers.http.forEach(function(http) {
            net.createServer({
                pauseOnConnect: true,
                allowHalfOpen: false
            }, function(socket) {
                socket.setTimeout(config.socketTimeout)
                debug('new socket')
                const hash = getHash(socket.remoteAddress)
                workers[hash % cpuNumber].send('http', socket)
            }).listen(http.port, http.host)
            debug('listen to', http.port, http.host)
        })
    } else {
        process.on('request', function(socket, header, requestLine, bytesRead) {

            function clearSocket(socket) {
                if (socket) {
                    socket.destroySoon()
                }
            }

            function proxyRequest(server, socket) {
                const proxy = net.connect(server.target, function() {
                    this.setNoDelay(false)
                    for (let i = 0; i < bytesRead.length; i++) {
                        this.write(bytesRead[i])
                    }
                    this.setNoDelay(true)
                })
                proxy.on('error', function(e) {
                    debug('error', e)
                    const random = 'SLB Error ' + Math.random().toString()
                    socket.write('HTTP/1.1 500 Server Error\r\nconnection: close\r\ncontent-length: ' + random.length.toString(16) + '\r\n\r\n' + random)
                    clearSocket(socket)
                })
                socket.on('error', function(e) {
                    debug('req error', e)
                    clearSocket(proxy)
                })
                socket.on('close', function(e) {
                    debug('req close', e)
                    clearSocket(proxy)
                })
                proxy.on('data', function(data) {
                    socket.setTimeout(config.socketTimeoutIncrease)
                })
                proxy.on('end', function(e) {
                    debug('end', e)
                    clearSocket(socket)
                })
                proxy.on('timeout', function(e) {
                    debug('timeout', e)
                    clearSocket(socket)
                })
                proxy.on('close', function(e) {
                    debug('close', e)
                    clearSocket(socket)
                })
                proxy.pipe(socket)
                socket.pipe(proxy)
            }
            for (let i = 0; i < config.backendServers.length; i++) {
                const server = config.backendServers[i]
                if (
                    ((server.host === header.host) && (server.isHttp == !header.upgrade)) ||
                    ((server.host instanceof RegExp) && server.host.test(header.host))
                ) {
                    proxyRequest(server, socket)
                    return
                }
            }

            const random = 'SLB Error ' + Math.random().toString()
            socket.write('HTTP/1.1 500 Server Error\r\nconnection: close\r\ncontent-length: ' + random.length.toString(16) + '\r\n\r\n' + random)
            clearSocket(socket)
        })
        const OCSPRequestBuffer = new Buffer('1')
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
                case 'websocket':
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