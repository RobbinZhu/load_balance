const tls = require('tls')
const util = require('util')
const debug = util.debuglog('load_balance')

const contexts = []
let isContextInit = false

function onSocketSecure() {
    debug('onSocketSecure')
    if (!this.destroyed && this._releaseControl())
        this.server.emit('https-message', 'https', this)
}

function SNICallback(servername, callback) {
    let i = 0
    const j = contexts.length
    while (i < j) {
        const domain = contexts[i++]
        const context = contexts[i++]
        if (
            ((typeof domain == 'string') && domain == servername) ||
            ((domain instanceof RegExp) && domain.test(servername))
        ) {
            callback(null, context)
            return
        }
    }
    callback(null, contexts[1])
}

function get(rawSocket, server, config) {
    if (!isContextInit) {
        isContextInit = true
        config.httpsOptions.forEach(function(httpsOption) {
            const options = Object.assign({
                pauseOnConnect: true,
                allowHalfOpen: false,
                honorCipherOrder: true
            }, httpsOption)
            if (!options.sessionIdContext) {
                options.sessionIdContext = Math.random().toString()
            }
            contexts.push(httpsOption.domain, tls.createSecureContext(options))
        })
    }
    const socket = new tls.TLSSocket(rawSocket, {
        secureContext: null,
        isServer: true,
        server: server,
        requestCert: false,
        rejectUnauthorized: true,
        handshakeTimeout: config.httpsHandshakeTimeout,
        ALPNProtocols: undefined,
        SNICallback: SNICallback
    })
    socket.on('secure', onSocketSecure)
}
module.exports = {
    get
}