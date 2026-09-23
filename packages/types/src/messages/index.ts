export * from './base';
export * from './connection';
export * from './telemetry';
export * from './commands';
export * from './results';
export * from './browser';
export * from './feedback';
export * from './design-mode';

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
  BrowserDesignModeSubmitMessage,
  BrowserNetworkFailedMessage,
  BrowserNetworkRequestMessage,
  BrowserNetworkResponseMessage,
  BrowserResultMessage,
  BrowserTargetMessage,
  ProviderHelloMessage,
  ProviderLifecycleMessage,
} from './browser';
import type { UiFeedbackMessage } from './feedback';
import type {
  AgentStatusUpdateMessage,
  DesignModeSaveCropMessage,
  DesignModeCropSavedMessage,
} from './design-mode';

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
  | BrowserDesignModeSubmitMessage
  | BrowserResultMessage
  | UiFeedbackMessage
  | AgentStatusUpdateMessage
  | DesignModeSaveCropMessage
  | DesignModeCropSavedMessage;

