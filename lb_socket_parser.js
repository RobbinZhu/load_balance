"use strict;"

const util = require('util')
const debug = util.debuglog('load_balance')

const START_GET_LINE = 0

const PRE_END_GET_LINE = 9
const END_GET_LINE = 10

const PRE_END_HEADER_LINE = 19
const END_HEADER_LINE = 20

const PRE_END_HEADER = 99
const END_NORMAL_HEADER = 100

const END_UPGRADE_HEADER = 200

class SocketRequest {
    constructor() {}
    init(socket, process, config) {
        this.socket = socket
        this.process = process
        this.header = {}
        this.bytesRead = []
        this.requestLine = null

        this.requestState = 0
        this.maxHeaderCount = 20

        this._requestLineBytes = []
        this._headerLineBytes = []
        this._currentHeaderLine = null

        socket.on('data', this.parse.bind(this))
        socket.on('error', this.onSocketError.bind(this))
        socket.on('close', this.onSocketClose.bind(this))
        socket.on('timeout', this.onSocketTimeout.bind(this))
        socket.setTimeout(config.socketTimeout)

        return this
    }
    clear() {
        this.process =
            this.socket =
            this.header =
            this.bytesRead =
            this.requestLine =
            this._requestLineBytes =
            this._headerLineBytes =
            this._currentHeaderLine = null
        SocketRequest.collect(this)
    }
    remove() {
        this.close()
    }
    close() {
        if (this.socket) {
            this.socket.removeAllListeners()
            if (!this.socket.destroyed) {
                debug('destroy socket')
                this.socket.destroy()
            }
        }
        this.clear()
    }
    onSocketError() {
        this.remove()
    }
    onSocketClose() {
        this.remove()
    }
    onSocketTimeout() {
        this.remove()
    }
    parse(data) {
        this.bytesRead.push(data)
        let total = data.length
        let index = 0
        while (index < total) {
            const byte = data[index]
            switch (this.requestState) {
                case 200:
                    break
                case 0: //START_GET_LINE
                    if (byte == 13 /*\r*/ ) { //PRE_END_GET_LINE
                        this.requestState = 9
                        break
                    }
                    this._requestLineBytes.push(byte)
                    break
                case 9: //PRE_END_GET_LINE
                    if (byte == 10 /*\n*/ ) { //END_GET_LINE
                        this.requestState = 10
                        if (!this.generateRequestLine()) {
                            return this.error('parser.request_line_error')
                        }
                        break
                    }
                    return this.error('parser.end_line_char_error')
                    break
                case 10: //END_GET_LINE,START_HEADR_LINE
                    if (byte == 13) { //will end current line || end header
                        this.requestState = this._currentHeaderLine ? 19 : 99
                        break
                    }
                    if (!this._currentHeaderLine) {
                        if (this._headerLineBytes.length > this.maxHeaderCount) {
                            //error handler
                            return this.error('parser.max_header_overflow')
                            break
                        }
                        this._currentHeaderLine = []
                    }
                    this._currentHeaderLine.push(byte)
                    break
                case 19: //PRE_END_HEADER_LINE
                    if (byte == 10) {
                        this._headerLineBytes.push(this._currentHeaderLine)
                        this._currentHeaderLine = null
                        this.requestState = 20
                        break
                    }
                    return this.error('parser.end_line_char_error')

                    break
                case 20: //END_HEADER_LINE
                    if (byte == 13) {
                        this.requestState = 99
                        break
                    }
                    this.requestState = 10
                    index--
                    break
                case 99: //PRE_END_HEADER
                    if (byte == 10) {
                        if (this.generateRequestHeaders(this._headerLineBytes)) {
                            this.requestState = 200

                            const last = this.bytesRead.pop()

                            this.bytesRead.push(last.slice(0, index - 1))
                            this.bytesRead.push(Buffer.from('real-client-ip: ' + this.socket.remoteAddress + '\r\n'))
                            this.bytesRead.push(last.slice(index - 1))
                            return this.handleRequestHeaders()
                        }
                    }
                    return this.error('parser.end_header_char_error')
                    break
            }
            index++
        }
    }
    handleRequestHeaders() {
        this.socket.removeAllListeners()
        this.process.emit('request', this.socket, this.header, this.requestLine, this.bytesRead)
        this.clear()
    }
    resetAllStatus() {}
    error(msg, code) {
        this.process.emit('requestError', msg)
        this.remove()
    }
    generateRequestLine() {
        const line = this._requestLineBytes.map(function(code) {
            return String.fromCharCode(code)
        }).join('').split(' ')
        this._requestLineBytes = null
        if (line.length == 3) {
            const [method, path, version] = line
            this.requestLine = {
                method,
                path,
                version
            }
            debug('request line got', method, path, version)
            return true
        }
        return false
    }
    generateRequestHeaders(headerBytesList) {
        const header = {}

        headerBytesList
            .map(function(bytes) {
                return bytes.map(function(code) {
                    return String.fromCharCode(code)
                }).join('')
            })
            .forEach(function(line) {
                const keyIndex = line.indexOf(': ')
                if (keyIndex > 0) {
                    header[line.slice(0, keyIndex).toLowerCase()] = line.slice(keyIndex + 2)
                }
            })
        this.header = header
        return true
    }
}

SocketRequest.MAX_CACHE_NUM = 1000

const cache = []
SocketRequest.get = function(socket, process, config) {
    return (cache.length ? cache.pop() : new SocketRequest).init(socket, process, config)
}

SocketRequest.collect = function(req) {
    if (cache.length < this.MAX_CACHE_NUM) {
        cache.push(req)
    }
}
module.exports = SocketRequest