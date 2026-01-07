# debug-bridge-types

TypeScript types and protocol definitions for debug-bridge.

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

## Constants

```typescript
const PROTOCOL_VERSION = 1;
```

## License

MIT
