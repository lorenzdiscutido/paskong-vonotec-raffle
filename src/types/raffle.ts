export type ThemeId = 'christmas' | 'celestial';

export interface Participant {
  id: string;
  name: string;
  department?: string;
  title?: string;
  weight: number;
  active: boolean;
}

export interface PullResult {
  id: string;
  participant: Participant;
  timestamp: number;
  status: 'won' | 'absent';
  finishRank: number;
  finishTimeSeconds?: number;
}

export interface RaffleSettings {
  eventTitle: string;
  eventSubtitle: string;
  theme: ThemeId;
  removeWinnerOnDraw: boolean;
  dramaIntensity: number; // 0 to 1: controls surge/slip frequency
  raceDurationSeconds: number; // 5 to 120: target climb duration to 100F rooftop
  soundEnabled: boolean;
}

export type WishStage = 'idle' | 'racing' | 'reveal_single' | 'summary_multi';
