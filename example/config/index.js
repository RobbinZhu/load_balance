const fs = require('fs')

function read(file) {
    return fs.readFileSync(__dirname + '/' + file)
}
module.exports = {
    socketTimeout: 10000, //socket活动过期时间，超出时间后自动断开
    socketTimeoutIncrease: 30000, //socket在活动时，每当接收到数据时，更新活动时长
    httpsHandshakeTimeout: 60000, //HTTPS握手过期时间
    websocketTimeout: 0, //WebSocket过期时间,因为websocket为长连接，建议设为0
    websocketTimeoutIncrease: 0,
    httpsOptions: [{
        domain: /^.+\\.kum\\.im$/,
        key: read('*.kum.im.key'),
        cert: read('fullchain.kum.im.cer')
    }],
    loadBalanceServers: {
        http: [{
            port: 80,
            host: '127.0.0.1'
        }],
        https: [{
            port: 443,
            host: '127.0.0.1'
        }]
    },
    backendServers: [{
        host: 'test1.kum.im',
        isHttp1: true,
        isWebsocket: false,
        targets: [{
            host: '127.0.0.1',
            port: 20000
        }]
    }, {
        host: 'test2.kum.im',
        isHttp1: true,
        isWebsocket: false,
        targets: [{
            host: '127.0.0.1',
            port: 20001
        }]
    }, {
        host: 'test3.kum.im',
        isHttp1: true,
        isWebsocket: false,
        targets: [{
            host: '127.0.0.1',
            port: 20002
        }]
    }]
}