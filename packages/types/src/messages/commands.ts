import type { BaseMessage } from './base';
import type { ElementTarget } from '../utils';

type CommandBase = BaseMessage & {
  requestId: string;
};

export type ClickCommand = CommandBase & {
  type: 'click';
  target: ElementTarget;
};

export type TypeCommand = CommandBase & {
  type: 'type';
  target: ElementTarget;
  text: string;
  options?: { clear?: boolean; delay?: number; pressEnter?: boolean };
};

export type NavigateCommand = CommandBase & {
  type: 'navigate';
  url: string;
};

export type EvaluateCommand = CommandBase & {
  type: 'evaluate';
  code: string;
};

export type ScrollCommand = CommandBase & {
  type: 'scroll';
  target?: ElementTarget;
  x?: number;
  y?: number;
};

export type HoverCommand = CommandBase & {
  type: 'hover';
  target: ElementTarget;
};

export type SelectCommand = CommandBase & {
  type: 'select';
  target: ElementTarget;
  value?: string;
  label?: string;
  index?: number;
};

export type FocusCommand = CommandBase & {
  type: 'focus';
  target: ElementTarget;
};

export type RequestUiTreeCommand = CommandBase & {
  type: 'request_ui_tree';
};

export type RequestDomSnapshotCommand = CommandBase & {
  type: 'request_dom_snapshot';
};

export type RequestStateCommand = CommandBase & {
  type: 'request_state';
  scope?: string;
};

export type RequestScreenshotCommand = CommandBase & {
  type: 'request_screenshot';
  selector?: string;
  fullPage?: boolean;
};

export type CommandMessage =
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
  | RequestStateCommand
  | RequestScreenshotCommand;

export type CommandType = CommandMessage['type'];
