# Flutter Bridge JS

跟[flutter_bridge_webview](https://github.com/m430/flutter_bridge_webview)配套使用的JS-SDK。实现了和flutter应用的双向通信。

## Usage

1. 初始化JS-SDK

```js
import FlutterBridgeJS from 'flutter-bridge-js';

FlutterBridgeJS.init();
```

2. 注册Flutter调用H5的方法

```js
FlutterBridgeJS.registerHandler('action', async (params) => {
  // do something
});
```
> 注册之后，Flutter项目可以通过`_bridgeController.sendMessageToH5`来调用此`action`

3. 调用Flutter的方法

```js
FlutterBridgeJS.sendMessage('action', payload);
```

> 注意：发送的action需要在Flutter项目中通过[flutter_bridge_webview](https://github.com/m430/flutter_bridge_webview)的`messageHandler`中进行处理