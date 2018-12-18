### Load Balance

This is a load balance tool write by nodejs which can proxy https/tls and http and websocket requests

It is fast

example文件夹为使用load_balance模块的范例

0.安装依赖

    npm install

1.使用

    sudo node load_balance

启动load balance服务器，监听80与443端口

配置了3个转发的后端服务器及端口

    test1.kum.im 20000
    test2.kum.im 20001
    test3.kum.im 20002

配置了域名*.kum.im的HTTPS证书，HTTPS证书由let's encrypt 生成

详细配置参见config/index.js文件

2.使用

    node web_servers.js

启动三个web server，分别监听20000,20001,20002端口

启动浏览器，分别访问以下网址并验证结果

    http://test1.kum.im    正常返回 {"domain":"test1.kum.im","port":20000}
    http://test2.kum.im    正常返回 {"domain":"test2.kum.im","port":20001}
    http://test3.kum.im    正常返回 {"domain":"test2.kum.im","port":20002}
    http://blog.kum.im     返回 404 Load Balance can not find resource
    https://test1.kum.im    正常返回 {"domain":"test1.kum.im","port":20000}
    https://test2.kum.im    正常返回 {"domain":"test1.kum.im","port":20000}
    https://test3.kum.im    正常返回 {"domain":"test1.kum.im","port":20000}
    https://blog.kum.im     返回 404 Load Balance can not find resource

