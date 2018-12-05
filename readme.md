###Load Balance

This is a load balance tool write by nodejs which can proxy https/tls and http and websocket requests

It is fast

####How to use

```js

const loadBalance = require('fast_load_balance')

loadBalance.start({
    loadBalanceServers: {
        http: [{
            port: 80,
            host: '127.0.0.1'
        }]
    },
    backendServers: [{
        host: 'www.a.com',
        isHttp1: true,
        targets: [{
            host: '127.0.0.1',
            port: 3000
        }]
    }]
})
```