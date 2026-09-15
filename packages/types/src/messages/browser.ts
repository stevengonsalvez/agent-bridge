import type { BaseMessage } from './base';
import type {
  BrowserCookie,
  BrowserTargetRef,
  Capability,
  ProviderLifecycleState,
  ProviderType,
} from '../utils';

type BrowserCommandBase = BaseMessage & {
  requestId: string;
  providerId?: string;
  targetId?: string;
};

export type ProviderHelloMessage = BaseMessage & {
  type: 'provider_hello';
  providerId: string;
  providerType: ProviderType;
  capabilities: Capability[];
  target?: BrowserTargetRef;
  profile?: string;
};

export type ProviderLifecycleMessage = BaseMessage & {
  type: 'provider_lifecycle';
  providerId: string;
  providerType: ProviderType;
  state: ProviderLifecycleState;
  reason?: string;
  target?: BrowserTargetRef;
};

export type BrowserTargetMessage = BaseMessage & {
  type: 'browser_target';
  providerId: string;
  event: 'created' | 'updated' | 'selected' | 'closed';
  target: BrowserTargetRef;
};

export type BrowserNetworkRequestMessage = BaseMessage & {
  type: 'browser_network_request';
  providerId: string;
  targetId?: string;
  requestId: string;
  method: string;
  url: string;
  resourceType?: string;
  headers?: Record<string, string>;
};

export type BrowserNetworkResponseMessage = BaseMessage & {
  type: 'browser_network_response';
  providerId: string;
  targetId?: string;
  requestId: string;
  url: string;
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  mimeType?: string;
  encodedDataLength?: number;
};

export type BrowserNetworkFailedMessage = BaseMessage & {
  type: 'browser_network_failed';
  providerId: string;
  targetId?: string;
  requestId: string;
  url?: string;
  errorText: string;
};

export type BrowserGetTargetsCommand = BrowserCommandBase & {
  type: 'browser_get_targets';
};

export type BrowserSelectTargetCommand = BrowserCommandBase & {
  type: 'browser_select_target';
  targetId: string;
};

export type BrowserNavigateCommand = BrowserCommandBase & {
  type: 'browser_navigate';
  url: string;
};

export type BrowserGetCookiesCommand = BrowserCommandBase & {
  type: 'browser_get_cookies';
  urls?: string[];
  includeValues?: boolean;
};

export type BrowserSetCookieCommand = BrowserCommandBase & {
  type: 'browser_set_cookie';
  cookie: BrowserCookie;
};

export type BrowserClearCookiesCommand = BrowserCommandBase & {
  type: 'browser_clear_cookies';
};

export type BrowserGetStorageCommand = BrowserCommandBase & {
  type: 'browser_get_storage';
};

export type BrowserScreenshotCommand = BrowserCommandBase & {
  type: 'browser_screenshot';
  fullPage?: boolean;
  selector?: string;
  clip?: { x: number; y: number; width: number; height: number };
};

export type BrowserInteractiveSnapshotCommand = BrowserCommandBase & {
  type: 'browser_interactive_snapshot';
  compact?: boolean;
  maxDepth?: number;
};

export type BrowserClickCommand = BrowserCommandBase & {
  type: 'browser_click';
  ref?: string;
  selector?: string;
  snapshotAfter?: boolean;
};

export type BrowserFillCommand = BrowserCommandBase & {
  type: 'browser_fill';
  ref?: string;
  selector?: string;
  text: string;
  snapshotAfter?: boolean;
};

export type BrowserPreviewPatchCommand = BrowserCommandBase & {
  type: 'browser_preview_patch';
  cssPatch?: string;
  jsPatch?: string;
  clear?: boolean;
};

export type BrowserDesignModeCommand = BrowserCommandBase & {
  type: 'browser_design_mode';
  action: 'enable' | 'disable' | 'status' | 'get_handoff';
  requestedChange?: string;
};

export type BrowserNetworkGetResponseBodyCommand = BrowserCommandBase & {
  type: 'browser_network_get_response_body';
  networkRequestId: string;
};

export type CdpSendCommand = BrowserCommandBase & {
  type: 'cdp_send';
  method: string;
  params?: Record<string, unknown>;
};

export type BrowserCommandMessage =
  | BrowserGetTargetsCommand
  | BrowserSelectTargetCommand
  | BrowserNavigateCommand
  | BrowserGetCookiesCommand
  | BrowserSetCookieCommand
  | BrowserClearCookiesCommand
  | BrowserGetStorageCommand
  | BrowserScreenshotCommand
  | BrowserInteractiveSnapshotCommand
  | BrowserClickCommand
  | BrowserFillCommand
  | BrowserPreviewPatchCommand
  | BrowserDesignModeCommand
  | BrowserNetworkGetResponseBodyCommand
  | CdpSendCommand;

export type BrowserCommandType = BrowserCommandMessage['type'];

export type BrowserResultMessage = BaseMessage & {
  type: 'browser_result';
  requestId: string;
  requestType: BrowserCommandType;
  providerId: string;
  success: boolean;
  result?: unknown;
  error?: { code: string; message: string };
  duration: number;
};

