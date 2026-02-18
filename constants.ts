
export const CANVAS_WIDTH = 600;
export const CANVAS_HEIGHT = 800;
export const MAX_REACH = 155; // Shortened from 175 for a more realistic feel
export const HOLD_COUNT = 90; // Increased density to compensate for shorter limbs
export const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'] as const;
export const LIMB_IDS = ['LH', 'RH', 'LF', 'RF'] as const;

export const INITIAL_CLIMBER_POS = {
  torso: { x: 300, y: 720 },
  limbs: {
    LH: { id: 'LH' as const, x: 260, y: 720, holdId: null },
    RH: { id: 'RH' as const, x: 340, y: 720, holdId: null },
    LF: { id: 'LF' as const, x: 280, y: 770, holdId: 'start-l' },
    RF: { id: 'RF' as const, x: 320, y: 770, holdId: 'start-r' },
  }
};
