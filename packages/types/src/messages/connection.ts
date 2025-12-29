import type { BaseMessage } from './base';
import type { Capability } from '../utils';

export type HelloMessage = BaseMessage & {
  type: 'hello';
  appName?: string;
  appVersion?: string;
  url: string;
  userAgent: string;
  viewport: { width: number; height: number };
};

export type CapabilitiesMessage = BaseMessage & {
  type: 'capabilities';
  capabilities: Capability[];
};
