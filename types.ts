
export type Color = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';
export type HoldType = 'jug' | 'crimp' | 'sloper' | 'pinch' | 'volume';

export interface Hold {
  id: string;
  x: number;
  y: number;
  color: Color;
  size: number;
  type: HoldType;
  rotation: number;
  label?: 'S' | 'F';
}

export type LimbId = 'LH' | 'RH' | 'LF' | 'RF';

export interface Limb {
  id: LimbId;
  x: number;
  y: number;
  holdId: string | null;
}

export interface Climber {
  torso: { x: number; y: number };
  limbs: Record<LimbId, Limb>;
}

export interface GameLog {
  id: string;
  message: string;
  type: 'info' | 'error' | 'success';
  timestamp: Date;
}

export interface LeaderboardEntry {
  name: string;
  time: number;
  date: string;
}
