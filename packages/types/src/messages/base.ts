import { PROTOCOL_VERSION } from '../constants';

export type BaseMessage = {
  protocolVersion: typeof PROTOCOL_VERSION;
  sessionId: string;
  timestamp: number;
  type: string;
};

export function createBaseMessage(sessionId: string, type: string): BaseMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    sessionId,
    timestamp: Date.now(),
    type,
  };
}
