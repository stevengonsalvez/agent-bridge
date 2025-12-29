import type { BaseMessage } from './base';
import type { CommandType } from './commands';

export type ErrorCode =
  | 'TARGET_NOT_FOUND'
  | 'TARGET_NOT_VISIBLE'
  | 'TARGET_DISABLED'
  | 'TIMEOUT'
  | 'EVAL_DISABLED'
  | 'EVAL_ERROR'
  | 'NAVIGATION_FAILED'
  | 'INVALID_COMMAND'
  | 'UNKNOWN_ERROR';

export type CommandResultMessage = BaseMessage & {
  type: 'command_result';
  requestId: string;
  requestType: CommandType;
  success: boolean;
  error?: { code: ErrorCode; message: string };
  result?: unknown;
  duration: number;
};
