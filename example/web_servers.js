const TCPServer = require('fast_tcp_server')
const serverConfig = [{
    port: 20000
}, {
    port: 20001
}, {
    port: 20002
}]
serverConfig.forEach(config => {
    new TCPServer.server()
        .use(async function(ctx, next) {
            ctx.body = {
                domain: ctx.reqHeader.host,
                port: config.port,
                date: new Date
            }
        })
        .listen(config.port)
    console.log('server listen to', config.port)
})