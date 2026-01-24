import type { BaseMessage } from './base';
import type { UiTreeItem, DomMutation } from '../utils';

export type DomSnapshotMessage = BaseMessage & {
  type: 'dom_snapshot';
  html: string;
  requestId?: string;
};

export type DomMutationsMessage = BaseMessage & {
  type: 'dom_mutations';
  batchId: string;
  mutations: DomMutation[];
};

export type UiTreeMessage = BaseMessage & {
  type: 'ui_tree';
  requestId?: string;
  items: UiTreeItem[];
};

export type ConsoleMessage = BaseMessage & {
  type: 'console';
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: string[];
};

export type ErrorMessage = BaseMessage & {
  type: 'error';
  errorType: 'runtime' | 'unhandledrejection';
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
};

export type StateUpdateMessage = BaseMessage & {
  type: 'state_update';
  scope: string;
  state: unknown;
};

export type ScreenshotMessage = BaseMessage & {
  type: 'screenshot';
  requestId?: string;
  data: string; // Base64 encoded PNG
  width: number;
  height: number;
  timestamp: number;
};

// Network telemetry
export type NetworkRequestMessage = BaseMessage & {
  type: 'network_request';
  requestId: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  initiator?: 'fetch' | 'xhr';
};

export type NetworkResponseMessage = BaseMessage & {
  type: 'network_response';
  requestId: string;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  body?: string; // Truncated if too large
  duration: number;
  ok: boolean;
};

// Navigation telemetry
export type NavigationMessage = BaseMessage & {
  type: 'navigation';
  url: string;
  previousUrl?: string;
  trigger: 'pushstate' | 'popstate' | 'replacestate' | 'hashchange' | 'initial';
};
