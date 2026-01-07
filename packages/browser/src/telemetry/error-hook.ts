import type { ErrorMessage } from 'debug-bridge-types';

type ErrorCallback = (
  msg: Omit<ErrorMessage, 'protocolVersion' | 'sessionId' | 'timestamp'>
) => void;

export class ErrorHook {
  private callback: ErrorCallback;
  private errorHandler: ((event: ErrorEvent) => void) | null = null;
  private rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  constructor(callback: ErrorCallback) {
    this.callback = callback;
  }

  start(): void {
    this.errorHandler = (event: ErrorEvent) => {
      this.callback({
        type: 'error',
        errorType: 'runtime',
        message: event.message,
        stack: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };

    this.rejectionHandler = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      this.callback({
        type: 'error',
        errorType: 'unhandledrejection',
        message: error?.message ?? String(error),
        stack: error?.stack,
      });
    };

    window.addEventListener('error', this.errorHandler);
    window.addEventListener('unhandledrejection', this.rejectionHandler);
  }

  stop(): void {
    if (this.errorHandler) window.removeEventListener('error', this.errorHandler);
    if (this.rejectionHandler) window.removeEventListener('unhandledrejection', this.rejectionHandler);
    this.errorHandler = null;
    this.rejectionHandler = null;
  }
}
