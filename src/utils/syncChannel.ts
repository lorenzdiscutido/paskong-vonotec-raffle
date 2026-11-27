import { Participant, PullResult, RaffleSettings, WishStage } from '../types/raffle';
import { getSupabaseClient } from './supabaseClient';

export const WISH_SYNC_CHANNEL = 'celestia_wish_sync_v2';
export const REMOTE_SYNC_CHANNEL = 'vonotec_raffle_remote_v1';

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
  const localChannel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(WISH_SYNC_CHANNEL) : null;

  if (localChannel) {
    localChannel.onmessage = (event: MessageEvent<SyncMessage>) => {
      if (event.data && typeof event.data.type === 'string') {
        onMessage(event.data);
      }
    };
  }

  // Bridge cross-device remote control via Supabase Realtime Broadcast when configured
  const supabase = getSupabaseClient();
  let realtimeSubscribed = false;
  let pendingInitialRequest = false;

  const remoteChannel = supabase
    ? supabase
        .channel(REMOTE_SYNC_CHANNEL, {
          config: { broadcast: { self: false } },
        })
        .on('broadcast', { event: 'sync' }, (envelope) => {
          const payload = envelope?.payload as SyncMessage | undefined;
          if (payload && typeof payload.type === 'string') {
            onMessage(payload);
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            realtimeSubscribed = true;
            if (pendingInitialRequest && remoteChannel) {
              pendingInitialRequest = false;
              void remoteChannel.send({
                type: 'broadcast',
                event: 'sync',
                payload: { type: 'REQUEST_STATE' } satisfies SyncMessage,
              });
            }
          }
        })
    : null;

  return {
    post: (msg: SyncMessage) => {
      if (localChannel) {
        try {
          localChannel.postMessage(msg);
        } catch (err) {
          console.warn('[syncChannel] Failed to post message:', err);
        }
      }

      // Keep tab arbitration local to the same browser; relay all other state & commands remotely
      if (
        remoteChannel &&
        msg.type !== 'PROJECTOR_HEARTBEAT' &&
        msg.type !== 'PROJECTOR_RELEASE'
      ) {
        if (realtimeSubscribed) {
          void remoteChannel.send({
            type: 'broadcast',
            event: 'sync',
            payload: msg,
          });
        } else if (msg.type === 'REQUEST_STATE') {
          pendingInitialRequest = true;
        }
      }
    },
    close: () => {
      localChannel?.close();
      if (supabase && remoteChannel) {
        void supabase.removeChannel(remoteChannel);
      }
    },
  };
}
