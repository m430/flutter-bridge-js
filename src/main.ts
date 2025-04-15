import type { FlutterChannel, PendingCallback } from "./types";

const FlutterBridgeJS = {
  _channelName: "FlutterBridge",
  _messageHandlers: {} as Record<string, (payload: any) => Promise<any> | any>,
  _pendingCallbacks: {} as Record<string, PendingCallback>,
  _isFlutterReady: false,
  _readyCallbacks: [] as Array<() => void>,

  init(channelName?: string) {
    this._channelName = channelName || "FlutterBridge";
    console.log(`FlutterBridge SDK 初始化成功，通道名称: ${this._channelName}`);
  },

  // 注册处理器
  registerHandler(
    action: string,
    handler: (payload: any) => Promise<any> | any
  ) {
    console.log(`FlutterBridge: 注册 action "${action}" 的处理器`);
    this._messageHandlers[action] = handler;
  },

  // 发送消息给 Flutter
  sendMessage(action: string, payload?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // 检查Flutter Channel是否可用
      let flutterChannel = window[this._channelName] as FlutterChannel;
      if (
        !flutterChannel ||
        typeof flutterChannel?.postMessage !== "function"
      ) {
        console.error(
          `FlutterBridge: Flutter 通道 "${this._channelName}" 不可用。无法发送 action "${action}"。`
        );
        return reject(
          new Error(
            `FlutterBridge: Flutter 通道 "${this._channelName}" 不可用。`
          )
        );
      }
      // 检查 Flutter 是否已经准备就绪
      if (!this._isFlutterReady) {
        console.warn(
          `FlutterBridge: Flutter 尚未准备就绪。将 action "${action}" 加入队列。`
        );
        this._readyCallbacks.push(() => {
          this.sendMessage(action, payload).then(resolve).catch(reject);
        });
        return;
      }

      // 实际发送消息
      const callbackId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      this._pendingCallbacks[callbackId] = { resolve, reject };

      const message = {
        action: action,
        payload: payload,
        callbackId: callbackId,
        isResponse: false,
      };

      try {
        const jsonMessage = JSON.stringify(message);
        console.log(
          `FlutterBridge: 发送 action "${action}" 到 Flutter: ${jsonMessage}`
        );
        flutterChannel.postMessage(jsonMessage);

        // 设置超时处理
        setTimeout(() => {
          const pending = this._pendingCallbacks[callbackId];
          if (pending) {
            console.error(
              `FlutterBridge: 处理 action "${action}" (callbackId: ${callbackId})  的响应超时。`
            );
            pending.reject(
              new Error(`FlutterBridge: 处理 action "${action}" 超时。`)
            );
            delete this._pendingCallbacks[callbackId];
          }
        }, 30000);
      } catch (e) {
        console.error(`FlutterBridge: 发送 action "${action}" 时出错: ${e}`);
        delete this._pendingCallbacks[callbackId];
        reject(e);
      }
    });
  },

  // 接收来自 Flutter 的消息
  receiveMessage(jsonString: string) {
    console.log(`FlutterBridge: 收到 Flutter 消息: ${jsonString}`);
    let message;
    try {
      message = JSON.parse(jsonString);
    } catch (e) {
      console.error(`FlutterBridge: 处理来自 Flutter 的消息时出错: ${e}`);
      return;
    }

    const { action, payload, callbackId, isResponse, success, error } = message;

    if (typeof action !== "string" || action.length === 0) {
      console.error(
        "FlutterBridge: 收到来自 Flutter 的没有有效 action 的消息:",
        message
      );
      return;
    }

    if (isResponse === true) {
      // --- 处理来自 Flutter 的响应 ---
      if (typeof callbackId !== "string" || callbackId.length === 0) {
        console.warn(
          "FlutterBridge: 收到来自 Flutter 的响应，但缺少有效的 callbackId:",
          message
        );
        return;
      }

      const pending = this._pendingCallbacks[callbackId];
      if (!pending) {
        console.warn(
          `FlutterBridge: 收到未知或已处理的 callbackId 的响应: ${callbackId}`,
          message
        );
        return;
      }

      // 从等待列表中移除回调
      delete this._pendingCallbacks[callbackId];

      if (success === true) {
        console.log(
          `FlutterBridge: 处理来自 Flutter 的成功响应 (callbackId: ${callbackId})`
        );
        pending.resolve(payload);
      } else {
        console.error(
          `FlutterBridge: 处理来自 Flutter 的失败响应 (callbackId: ${callbackId}), 错误: ${error}`
        );
        // 使用 error 或默认错误信息拒绝 Promise
        pending.reject(
          new Error(
            error ||
              `Flutter action '${action}' failed without specific error message.`
          )
        );
      }
    } else {
      console.log(
        `FlutterBridge: 处理来自 Flutter 的新请求 (Action: ${action})`
      );
      const handler = this._messageHandlers[action];

      if (typeof handler !== "function") {
        console.warn(
          `FlutterBridge: 没有为来自 Flutter 的 action "${action}" 注册处理器。`
        );
        if (callbackId) {
          // 如果 Flutter 期望响应，告知它没有找到处理器
          this._sendResponseToFlutter(
            action,
            callbackId,
            false,
            `H5 Error: No handler registered for action "${action}"`
          );
        }
        return;
      }

      // 执行处理器
      Promise.resolve()
        .then(() => handler(payload)) // 执行 handler
        .then((result) => {
          // Handler 成功执行
          if (callbackId) {
            console.log(
              `FlutterBridge: 发送成功响应给 Flutter (Action: ${action}, callbackId: ${callbackId}), 结果: ${result}`
            );
            this._sendResponseToFlutter(action, callbackId, true, result);
          }
        })
        .catch((handlerError) => {
          // Handler 执行出错
          console.error(
            `FlutterBridge: 处理 action "${action}" 时出错:`,
            handlerError
          );
          if (callbackId) {
            // 如果 Flutter 期望响应，发送错误信息回去
            console.log(
              `FlutterBridge: 发送错误响应给 Flutter (Action: ${action}, callbackId: ${callbackId})`
            );
            this._sendResponseToFlutter(
              action,
              callbackId,
              false,
              handlerError
            );
          }
        });
    }
  },

  /**
   * 内部方法：向 Flutter 发送对特定请求的响应。
   * @param originalAction 原始请求的 action 名称
   * @param callbackId 原始请求的 callbackId
   * @param success 是否成功
   * @param dataOrError 成功时的数据或失败时的错误信息
   */
  _sendResponseToFlutter(
    originalAction: string,
    callbackId: string,
    success: boolean,
    dataOrError: any
  ) {
    const responseMessage = {
      action: originalAction, // 回显 action
      callbackId: callbackId,
      isResponse: true, // 标记为响应
      success: success,
      payload: success ? dataOrError : null,
      error: !success
        ? dataOrError instanceof Error
          ? dataOrError.message
          : String(dataOrError)
        : null,
    };

    const flutterChannel = window[this._channelName] as FlutterChannel;
    if (!flutterChannel || typeof flutterChannel.postMessage !== "function") {
      console.error(
        `FlutterBridge: 无法发送响应给 Flutter，通道 "${this._channelName}" 不可用。`
      );
      return;
    }

    try {
      const jsonMessage = JSON.stringify(responseMessage);
      console.log(`FlutterBridge: 发送响应到 Flutter: ${jsonMessage}`);
      flutterChannel.postMessage(jsonMessage);
    } catch (error) {
      console.error(`FlutterBridge: 发送响应到 Flutter 时出错: ${error}`);
    }
  },

  // Flutter 就绪信号
  flutterSdkReady() {
    if (this._isFlutterReady) return;
    console.log("FlutterBridge: Flutter 发出准备就绪信号。");
    this._isFlutterReady = true;
    this._readyCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error("Error in onReady callback", e);
      }
    });
    this._readyCallbacks = [];
  },

  isReady(): boolean {
    let flutterChannel = window[this._channelName] as
      | FlutterChannel
      | undefined;
    return (
      this._isFlutterReady &&
      !!flutterChannel &&
      typeof flutterChannel?.postMessage === "function"
    );
  },

  // 注册 onReady 回调
  onReady(callback: () => void) {
    console.log("FlutterBridge: 开始注册 onReady 回调。");
    if (typeof callback !== "function") {
      console.error("onReady 回调必须是一个函数");
      return;
    }
    if (this.isReady()) {
      try {
        callback();
      } catch (e) {
        console.error("Error in onReady callback", e);
      }
    } else {
      this._readyCallbacks.push(callback);
    }
  },
};

(window as any).FlutterBridgeJS = FlutterBridgeJS;

export default FlutterBridgeJS;
