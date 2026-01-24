export type CliConfig = {
  port: number;
  host: string;
  session: string;
  json: boolean;
};

export type DebugBridgeConfig = {
  url: string;
  sessionId: string;
  appName?: string;
  appVersion?: string;

  enableDomSnapshot?: boolean;
  enableDomMutations?: boolean;
  enableUiTree?: boolean;
  enableConsole?: boolean;
  enableErrors?: boolean;
  enableEval?: boolean;
  enableNetwork?: boolean;
  enableNavigation?: boolean;

  domMutationBatchMs?: number;
  maxConsoleArgs?: number;
  maxConsoleArgLength?: number;
  maxDomSnapshotSize?: number;
  maxNetworkBodySize?: number;
  networkUrlFilter?: (url: string) => boolean;

  getCustomState?: () => Record<string, unknown>;
  getStableId?: (el: Element) => string | null;

  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
};
