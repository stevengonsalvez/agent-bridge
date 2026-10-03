# debug-bridge-types

TypeScript types and protocol definitions for debug-bridge (shared by the CLI, sidecar, SDK, and feedback MCP server).

## Installation

```bash
npm install debug-bridge-types
```

## Usage

```typescript
import type {
  DebugBridgeConfig,
  CommandMessage,
  BridgeMessage,
  UiTreeItem,
} from 'debug-bridge-types';

import { PROTOCOL_VERSION } from 'debug-bridge-types';
```

## Types

### Configuration

```typescript
interface DebugBridgeConfig {
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
  domMutationBatchMs?: number;
  maxConsoleArgs?: number;
  maxConsoleArgLength?: number;
  maxDomSnapshotSize?: number;
  getCustomState?: () => Record<string, unknown>;
  getStableId?: (el: Element) => string | null;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

interface CliConfig {
  port: number;
  host: string;
  session: string;
  json: boolean;
  cdp?: boolean;
  browser?: 'managed' | 'connect' | 'none';
  cdpEndpoint?: string;
  profile?: string;
  storageState?: string;
  headless?: boolean;
  channel?: string;
  feedbackDir?: string;
  feedbackArtifacts?: boolean;
}
```

### UI Tree

```typescript
interface UiTreeItem {
  stableId: string;
  selector: string;
  role: string;
  text?: string;
  label?: string;
  disabled?: boolean;
  visible?: boolean;
  checked?: boolean;
  value?: string;
  meta?: {
    tagName?: string;
    type?: string;
    name?: string;
    href?: string;
    placeholder?: string;
  };
}
```

### Commands

```typescript
type CommandMessage =
  | ClickCommand
  | TypeCommand
  | NavigateCommand
  | EvaluateCommand
  | ScrollCommand
  | HoverCommand
  | SelectCommand
  | FocusCommand
  | RequestUiTreeCommand
  | RequestDomSnapshotCommand
  | RequestScreenshotCommand
  | RequestStateCommand;

interface ClickCommand extends BaseCommand {
  type: 'click';
  target: { stableId?: string; selector?: string; text?: string };
}

interface TypeCommand extends BaseCommand {
  type: 'type';
  target: { stableId?: string; selector?: string };
  text: string;
  options?: { clear?: boolean; pressEnter?: boolean };
}

// ... see source for all command types
```

### Messages

```typescript
type BridgeMessage =
  | HelloMessage
  | CapabilitiesMessage
  | DomSnapshotMessage
  | DomMutationsMessage
  | UiTreeMessage
  | ConsoleMessage
  | ErrorMessage
  | StateUpdateMessage
  | CommandResultMessage
  | ScreenshotMessage;
```

### Sidecar and Design Mode messages

Browser sidecar commands (`browser_navigate`, `browser_interactive_snapshot`, `browser_click`, `browser_fill`, `browser_screenshot`, `browser_preview_patch`, `browser_design_mode`, and others) and the `browser_design_mode_submit` message sent when the dock's Send fires are defined in `src/messages/browser.ts`. Feedback batch messages are in `src/messages/feedback.ts`, Design Mode messages in `src/messages/design-mode.ts`.

## Constants

```typescript
const PROTOCOL_VERSION = 1;
const DEFAULT_PORT = 4000;
```

## License

MIT
