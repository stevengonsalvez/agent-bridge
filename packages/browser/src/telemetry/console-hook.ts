type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export class ConsoleHook {
  private callback: (level: ConsoleLevel, args: string[]) => void;
  private maxArgs: number;
  private maxLength: number;
  private originals: Partial<Record<ConsoleLevel, typeof console.log>> = {};

  constructor(
    callback: (level: ConsoleLevel, args: string[]) => void,
    maxArgs = 10,
    maxLength = 1000
  ) {
    this.callback = callback;
    this.maxArgs = maxArgs;
    this.maxLength = maxLength;
  }

  start(): void {
    const levels: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

    for (const level of levels) {
      this.originals[level] = console[level];
      console[level] = (...args: unknown[]) => {
        this.originals[level]?.apply(console, args);
        const serialized = args.slice(0, this.maxArgs).map((a) => this.stringify(a));
        this.callback(level, serialized);
      };
    }
  }

  stop(): void {
    for (const [level, original] of Object.entries(this.originals)) {
      if (original) (console as Record<string, unknown>)[level] = original;
    }
    this.originals = {};
  }

  private stringify(value: unknown): string {
    try {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      return str.length > this.maxLength ? str.substring(0, this.maxLength) + '...' : str;
    } catch {
      return String(value);
    }
  }
}
