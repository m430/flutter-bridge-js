export interface FlutterChannel {
  postMessage: (message: string) => void;
}

export interface PendingCallback {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

declare global {
  interface Window {
    [key: string]: FlutterChannel | undefined;
    FlutterBridge: FlutterChannel;
  }
}