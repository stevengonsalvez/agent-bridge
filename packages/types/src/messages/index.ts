export * from './base';
export * from './connection';
export * from './telemetry';
export * from './commands';
export * from './results';

import type { HelloMessage, CapabilitiesMessage } from './connection';
import type {
  DomSnapshotMessage,
  DomMutationsMessage,
  UiTreeMessage,
  ConsoleMessage,
  ErrorMessage,
  StateUpdateMessage,
  ScreenshotMessage,
} from './telemetry';
import type { CommandMessage } from './commands';
import type { CommandResultMessage } from './results';

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
  | CommandMessage
  | CommandResultMessage;
