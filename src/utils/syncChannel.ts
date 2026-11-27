import { Participant, PullResult, RaffleSettings, WishStage } from '../types/raffle';

export const WISH_SYNC_CHANNEL = 'celestia_wish_sync_v2';

export interface SyncStateSnapshot {
  stage: WishStage;
  currentBatch: PullResult[];
  revealIndex: number;
  wishCaption: string;
  activeCount: number;
  participants: Participant[];
  history: PullResult[];
  settings: RaffleSettings;
}

export type SyncMessage =
  | { type: 'REQUEST_STATE' }
  | { type: 'STATE_SNAPSHOT'; payload: SyncStateSnapshot }
  | { type: 'PROJECTOR_HEARTBEAT' }
  | { type: 'PROJECTOR_RELEASE' }
  | { type: 'CMD_START_RACE'; count: number }
  | { type: 'CMD_SKIP_RACE' }
  | { type: 'CMD_ADVANCE_REVEAL' }
  | { type: 'CMD_SKIP_TO_END' }
  | { type: 'CMD_CLOSE_SUMMARY' }
  | { type: 'CMD_MARK_ABSENT'; pullId: string }
  | { type: 'CMD_RERACE_ABSENT'; pullId: string }
  | {
      type: 'CMD_UPDATE_DATA';
      participants?: Participant[];
      history?: PullResult[];
      settings?: RaffleSettings;
    };

export function createWishSyncChannel(onMessage: (msg: SyncMessage) => void): {
  post: (msg: SyncMessage) => void;
  close: () => void;
} {
  if (typeof BroadcastChannel === 'undefined') {
    return {
      post: () => {},
      close: () => {},
    };
  }

  const channel = new BroadcastChannel(WISH_SYNC_CHANNEL);
  channel.onmessage = (event: MessageEvent<SyncMessage>) => {
    if (event.data && typeof event.data.type === 'string') {
      onMessage(event.data);
    }
  };

  return {
    post: (msg: SyncMessage) => {
      try {
        channel.postMessage(msg);
      } catch (err) {
        console.warn('[syncChannel] Failed to post message:', err);
      }
    },
    close: () => {
      channel.close();
    },
  };
}
