/**
 * Live Event Stream & Broadcaster for Dashboard
 * Broadcasts real-time gateway telemetry and invocation traces to connected Web UI clients.
 */

import { EventEmitter } from 'node:events';

export interface InvocationEvent {
  id: string;
  timestamp: string;
  toolName: string;
  rawParams: Record<string, any>;
  healedParams: Record<string, any>;
  wasHealed: boolean;
  healedModifications: any[];
  isError: boolean;
  isLoop: boolean;
  isCacheHit: boolean;
  rawTokens: number;
  distilledTokens: number;
  tokensSaved: number;
  durationMs: number;
  guidanceMessage?: string;
}

export class LiveStreamBroadcaster extends EventEmitter {
  private static instance = new LiveStreamBroadcaster();
  private recentEvents: InvocationEvent[] = [];
  private readonly maxHistory = 100;

  static getInstance(): LiveStreamBroadcaster {
    return this.instance;
  }

  broadcast(event: InvocationEvent): void {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.maxHistory) {
      this.recentEvents.pop();
    }
    this.emit('invocation', event);
  }

  getRecentEvents(): InvocationEvent[] {
    return [...this.recentEvents];
  }
}

export const globalLiveStream = LiveStreamBroadcaster.getInstance();
