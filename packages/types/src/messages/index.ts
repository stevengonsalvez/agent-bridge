export * from './base';
export * from './connection';
export * from './telemetry';
export * from './commands';
export * from './results';
export * from './browser';
export * from './feedback';

import type { HelloMessage, CapabilitiesMessage } from './connection';
import type {
  DomSnapshotMessage,
  DomMutationsMessage,
  UiTreeMessage,
  ConsoleMessage,
  ErrorMessage,
  StateUpdateMessage,
  ScreenshotMessage,
  NetworkRequestMessage,
  NetworkResponseMessage,
  NavigationMessage,
} from './telemetry';
import type { CommandMessage } from './commands';
import type { CommandResultMessage } from './results';
import type {
  BrowserCommandMessage,
  BrowserNetworkFailedMessage,
  BrowserNetworkRequestMessage,
  BrowserNetworkResponseMessage,
  BrowserResultMessage,
  BrowserTargetMessage,
  ProviderHelloMessage,
  ProviderLifecycleMessage,
} from './browser';
import type { UiFeedbackMessage } from './feedback';

export type BridgeMessage =
  | HelloMessage
  | CapabilitiesMessage
  | DomSnapshotMessage
  | DomMutationsMessage
  | UiTreeMessage
  | ConsoleMessage
  | ErrorMessage
  | StateUpdateMessage
  | ScreenshotMessage
  | NetworkRequestMessage
  | NetworkResponseMessage
  | NavigationMessage
  | CommandMessage
  | CommandResultMessage
  | ProviderHelloMessage
  | ProviderLifecycleMessage
  | BrowserTargetMessage
  | BrowserNetworkRequestMessage
  | BrowserNetworkResponseMessage
  | BrowserNetworkFailedMessage
  | BrowserCommandMessage
  | BrowserResultMessage
  | UiFeedbackMessage;
