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
