import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Hold, Climber, LimbId, GameLog, Color, HoldType, Limb, LeaderboardEntry 
} from './types';
import { 
  CANVAS_WIDTH, CANVAS_HEIGHT, HOLD_COUNT, COLORS, INITIAL_CLIMBER_POS, MAX_REACH, LIMB_IDS 
} from './constants';
import ClimbingCanvas from './components/ClimbingCanvas';
import ControlPanel from './components/ControlPanel';
import LogPanel from './components/LogPanel';

const App: React.FC = () => {
  const [holds, setHolds] = useState<Hold[]>([]);
  const [climber, setClimber] = useState<Climber>(INITIAL_CLIMBER_POS);
  const [logs, setLogs] = useState<GameLog[]>([]);
  const [activeLimb, setActiveLimb] = useState<LimbId | null>(null);
  const [isFalling, setIsFalling] = useState(false);
  const [isClientLoaded, setIsClientLoaded] = useState(false);
  const [winStatus, setWinStatus] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [hintPath, setHintPath] = useState<string[]>([]);
  const [showHint, setShowHint] = useState(false);
  
  const [timer, setTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  const [draggingLimb, setDraggingLimb] = useState<LimbId | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const holdTypes: HoldType[] = ['jug', 'crimp', 'sloper', 'pinch', 'volume'];

  const generateWall = useCallback(() => {
    const newHolds: Hold[] = [];
    const actualHoldCount = Math.floor(HOLD_COUNT * 1.1);
    
    for (let i = 0; i < actualHoldCount; i++) {
      let x, y, tooClose;
      let attempts = 0;
      do {
        x = (Math.random() * (CANVAS_WIDTH - 120)) + 60;
        y = (Math.random() * (CANVAS_HEIGHT - 250)) + 120;
        tooClose = newHolds.some(h => Math.sqrt(Math.pow(h.x - x, 2) + Math.pow(h.y - y, 2)) < 35);
        attempts++;
      } while (tooClose && attempts < 40);

      if (attempts >= 40) continue;

      let color = COLORS[Math.floor(Math.random() * COLORS.length)] as Color;
      const nearby = newHolds.filter(h => Math.sqrt(Math.pow(h.x - x, 2) + Math.pow(h.y - y, 2)) < 80);
      if (nearby.some(n => n.color === color)) {
        const otherColors = COLORS.filter(c => !nearby.some(n => n.color === c));
        if (otherColors.length > 0) {
          color = otherColors[Math.floor(Math.random() * otherColors.length)] as Color;
        }
      }

      newHolds.push({
        id: `h-${i}`,
        x,
        y,
        color,
        size: Math.random() * 8 + 12,
        type: holdTypes[Math.floor(Math.random() * holdTypes.length)],
        rotation: Math.random() * Math.PI * 2,
      });
    }

    newHolds.push({ id: 'start-l', x: 280, y: 770, color: 'green', size: 18, type: 'jug', rotation: 0, label: 'S' });
    newHolds.push({ id: 'start-r', x: 320, y: 770, color: 'green', size: 18, type: 'jug', rotation: 0, label: 'S' });
    newHolds.push({ id: 'finish', x: 300, y: 60, color: 'red', size: 30, type: 'volume', rotation: 0, label: 'F' });

    setHolds(newHolds);
    setClimber({
        torso: { x: 300, y: 720 },
        limbs: {
            LH: { id: 'LH', x: 260, y: 710, holdId: null },
            RH: { id: 'RH', x: 340, y: 710, holdId: null },
            LF: { id: 'LF', x: 280, y: 770, holdId: 'start-l' },
            RF: { id: 'RF', x: 320, y: 770, holdId: 'start-r' },
        }
    });
    setTimer(0);
    setIsTimerRunning(false);
    setWinStatus(false);
    setIsFalling(false);
    setShowHint(false);
    setHintPath([]);
  }, []);

  useEffect(() => {
    generateWall();
    addLog('System', 'Wall ready. Drag limbs to climb!', 'info');
    setIsClientLoaded(true);
    const saved = localStorage.getItem('climbing_leaderboard');
    if (saved) {
      try { setLeaderboard(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, [generateWall]);

  useEffect(() => {
    if (isTimerRunning) {
      const startTime = Date.now() - timer;
      timerRef.current = window.setInterval(() => { setTimer(Date.now() - startTime); }, 10);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTimerRunning, timer]);

  const addLog = (tag: string, message: string, type: 'info' | 'error' | 'success') => {
    setLogs(prev => [{
      id: Math.random().toString(36),
      message: `[${tag}] ${message}`,
      type,
      timestamp: new Date()
    }, ...prev].slice(0, 50));
  };

  const calculateHintPath = useCallback(() => {
    const startHold = holds.find(h => h.label === 'S') || holds[0];
    const finishHold = holds.find(h => h.label === 'F');
    if (!finishHold) return;

    // Dijkstra-lite for route pathfinding
    const dists: Record<string, number> = {};
    const prevs: Record<string, string | null> = {};
    const queue: string[] = [];

    holds.forEach(h => {
      dists[h.id] = Infinity;
      prevs[h.id] = null;
      queue.push(h.id);
    });

    // Fix: Cast Object.values to Limb[] to ensure l.holdId is typed correctly
    const currentHoldIds = (Object.values(climber.limbs) as Limb[]).map(l => l.holdId).filter(Boolean) as string[];
    currentHoldIds.forEach(id => { dists[id] = 0; });

    while (queue.length > 0) {
      queue.sort((a, b) => dists[a] - dists[b]);
      const uId = queue.shift()!;
      if (dists[uId] === Infinity) break;
      const u = holds.find(h => h.id === uId)!;

      holds.filter(v => queue.includes(v.id)).forEach(v => {
        const d = Math.sqrt(Math.pow(u.x - v.x, 2) + Math.pow(u.y - v.y, 2));
        if (d < MAX_REACH * 0.9) { // Step size
          const alt = dists[uId] + d;
          if (alt < dists[v.id]) {
            dists[v.id] = alt;
            prevs[v.id] = uId;
          }
        }
      });
    }

    const path: string[] = [];
    let curr: string | null = finishHold.id;
    while (curr) {
      path.push(curr);
      curr = prevs[curr];
    }
    setHintPath(path.reverse());
    setShowHint(true);
  }, [holds, climber, MAX_REACH]);

  const resetGame = useCallback((reason: string) => {
    setIsFalling(true);
    setIsTimerRunning(false);
    addLog('FALL', reason, 'error');
    setDraggingLimb(null);
    setWinStatus(false);
    setTimeout(() => { generateWall(); }, 2800);
  }, [generateWall]);

  const checkStability = (newClimber: Climber) => {
    const attachedLimbs = LIMB_IDS.filter(id => newClimber.limbs[id].holdId !== null);
    
    // 3 points rule
    if (attachedLimbs.length < 3) {
      return { stable: false, reason: "Insufficient contact: You need at least 3 points of tension to stay on the wall." };
    }

    // Hands below feet rule
    const hands = [newClimber.limbs.LH, newClimber.limbs.RH];
    const feet = [newClimber.limbs.LF, newClimber.limbs.RF];
    const handsBelowFeet = hands.every(h => feet.some(f => h.y > f.y));
    if (handsBelowFeet) {
        return { stable: false, reason: "Physics Error: Both hands are below your center of gravity support, leading to a back-peel." };
    }

    // CG logic
    const attachedX = attachedLimbs.map(id => newClimber.limbs[id].x);
    const minX = Math.min(...attachedX);
    const maxX = Math.max(...attachedX);
    const margin = 160; 

    if (newClimber.torso.x < minX - margin || newClimber.torso.x > maxX + margin) {
      return { stable: false, reason: "Out of Balance: Your weight shifted too far outside your points of contact." };
    }

    return { stable: true };
  };

  const moveLimb = useCallback((limbId: LimbId, holdId: string) => {
    if (!isTimerRunning && !winStatus) setIsTimerRunning(true);

    const targetHold = holds.find(h => h.id === holdId);
    if (!targetHold) return;

    setClimber(prev => {
      // Crimp rule
      const isOccupiedByOther = LIMB_IDS.some(id => id !== limbId && prev.limbs[id].holdId === targetHold.id);
      if (targetHold.type === 'crimp' && isOccupiedByOther) {
        addLog('OCCUPIED', "Crimps are single-point only!", 'error');
        return prev;
      }

      const dist = Math.sqrt(Math.pow(targetHold.x - prev.torso.x, 2) + Math.pow(targetHold.y - prev.torso.y, 2));
      if (dist > MAX_REACH) {
        addLog('REACH', `Limb reach limit exceeded (${Math.round(dist)}u > ${MAX_REACH}u).`, 'error');
        return prev;
      }

      const newLimbs = { ...prev.limbs };
      newLimbs[limbId] = { ...newLimbs[limbId], x: targetHold.x, y: targetHold.y, holdId: targetHold.id };

      const attachedLimbs = LIMB_IDS.map(id => newLimbs[id]).filter(l => l.holdId !== null);
      const avgX = attachedLimbs.reduce((sum, l) => sum + l.x, 0) / attachedLimbs.length;
      const avgY = (attachedLimbs.reduce((sum, l) => sum + l.y, 0) / attachedLimbs.length) - 45;

      const updatedClimber: Climber = { torso: { x: avgX, y: avgY }, limbs: newLimbs };

      const stability = checkStability(updatedClimber);
      if (!stability.stable) {
        resetGame(stability.reason!);
        return prev;
      }

      if (targetHold.label === 'F') {
        setIsTimerRunning(false);
        setWinStatus(true);
        addLog('WIN', `CRUSHED! Time: ${(timer/1000).toFixed(2)}s.`, 'success');
      } else {
        addLog('MOVE', `${limbId} secure.`, 'success');
      }
      return updatedClimber;
    });
  }, [holds, resetGame, isTimerRunning, timer, winStatus]);

  const handleCommand = (cmd: string) => {
    if (isFalling || winStatus) return;
    const cleanCmd = cmd.toLowerCase().trim();
    const moveRegex = /move\s+(lh|rh|lf|rf)\s+to\s+(?:nearest\s+)?(\w+)/i;
    const match = cleanCmd.match(moveRegex);

    if (match) {
      const limb = match[1].toUpperCase() as LimbId;
      const targetColor = match[2];
      const colorHolds = holds.filter(h => h.color === targetColor);
      if (colorHolds.length === 0) {
        addLog('CMD', `No ${targetColor} holds.`, 'error');
        return;
      }
      const currentLimbPos = climber.limbs[limb];
      const nearest = colorHolds.reduce((p, c) => {
        const dp = Math.sqrt(Math.pow(p.x - currentLimbPos.x, 2) + Math.pow(p.y - currentLimbPos.y, 2));
        const dc = Math.sqrt(Math.pow(c.x - currentLimbPos.x, 2) + Math.pow(c.y - currentLimbPos.y, 2));
        return dc < dp ? c : p;
      });
      moveLimb(limb, nearest.id);
    } else {
      addLog('CMD', "Try: 'move RH to blue'", 'error');
    }
  };

  const saveToLeaderboard = () => {
    if (!playerName.trim()) return;
    const entry: LeaderboardEntry = { name: playerName, time: timer, date: new Date().toLocaleDateString() };
    const newList = [...leaderboard, entry].sort((a, b) => a.time - b.time).slice(0, 10);
    setLeaderboard(newList);
    localStorage.setItem('climbing_leaderboard', JSON.stringify(newList));
    setWinStatus(false);
    setPlayerName('');
    generateWall();
  };

  const handleMouseDown = (x: number, y: number) => {
    if (isFalling || winStatus) return;
    for (const id of LIMB_IDS) {
      const limb = climber.limbs[id];
      const dist = Math.sqrt(Math.pow(x - limb.x, 2) + Math.pow(y - limb.y, 2));
      if (dist < 45) { 
        setDraggingLimb(id);
        setActiveLimb(id);
        setMousePos({ x, y });
        return;
      }
    }
    if (activeLimb) {
      for (const h of holds) {
        const dist = Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2));
        if (dist < 35) { moveLimb(activeLimb, h.id); return; }
      }
    }
  };

  const handleMouseUp = () => {
    if (!draggingLimb) return;
    let nearest: Hold | null = null;
    let minDist = Infinity;
    holds.forEach(h => {
      const d = Math.sqrt(Math.pow(h.x - mousePos.x, 2) + Math.pow(h.y - mousePos.y, 2));
      if (d < minDist && d < 60) { minDist = d; nearest = h; }
    });
    if (nearest) moveLimb(draggingLimb, nearest.id);
    setDraggingLimb(null);
  };

  if (!isClientLoaded) return null;

  return (
    <div className="flex h-screen w-screen bg-slate-950 p-4 gap-4 select-none">
      <div className="w-1/4 flex flex-col gap-4">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 flex flex-col shadow-2xl overflow-hidden">
          <div className="flex justify-between items-center mb-1">
            <h1 className="text-3xl font-black text-emerald-400 tracking-tight">ASCENT</h1>
            <div className="text-xl font-mono text-white tabular-nums">{(timer/1000).toFixed(2)}s</div>
          </div>
          <p className="text-slate-400 text-sm mb-4 leading-relaxed">
            Short limbs, small crimps. Hands below feet = fall.
          </p>
          <div className="flex flex-col gap-2 mb-4">
              <button onClick={calculateHintPath} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-xs uppercase tracking-widest transition-colors shadow-lg shadow-emerald-900/20">Get Route Hint</button>
              <button onClick={() => generateWall()} className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors border border-slate-700">Restart Climb</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="text-xs font-mono uppercase text-slate-500 tracking-widest border-b border-slate-800 pb-1 mb-2">Top 10</div>
            <div className="text-[10px] space-y-1">
              {leaderboard.length === 0 ? <div className="text-slate-600">No records yet.</div> : 
               leaderboard.map((e, i) => (
                 <div key={i} className="flex justify-between border-b border-slate-800/50 pb-1">
                   <span className="text-slate-300">#{i+1} {e.name}</span>
                   <span className="text-emerald-400 font-mono">{(e.time/1000).toFixed(2)}s</span>
                 </div>
               ))}
            </div>
          </div>
        </div>
        <LogPanel logs={logs} />
      </div>

      <div className="flex-1 flex flex-col gap-4 relative">
        <div className="bg-[#d4c5a9] rounded-xl border-4 border-slate-800 relative flex-1 overflow-hidden shadow-inner ring-4 ring-slate-900">
          <ClimbingCanvas 
            climber={climber} 
            holds={holds} 
            activeLimb={activeLimb}
            draggingLimb={draggingLimb}
            mousePos={mousePos}
            isFalling={isFalling}
            hintPath={showHint ? hintPath : []}
            onMouseDown={handleMouseDown}
            onMouseMove={(x, y) => setMousePos({ x, y })}
            onMouseUp={handleMouseUp}
          />
          {isFalling && (
            <div className="absolute inset-0 bg-red-950/70 flex items-center justify-center backdrop-blur-md z-50">
              <div className="text-center p-8 bg-black/60 rounded-3xl border border-white/10 shadow-2xl animate-in zoom-in duration-300">
                <div className="text-7xl font-black text-white drop-shadow-2xl mb-4 italic">GRAVITY WINS</div>
                <div className="text-red-200 text-xl italic font-medium">
                    {logs[0]?.type === 'error' ? logs[0].message.replace('[FALL] ', '') : 'A mistake cost you the climb.'}
                </div>
              </div>
            </div>
          )}
          {winStatus && (
            <div className="absolute inset-0 bg-emerald-950/80 flex items-center justify-center backdrop-blur-md z-50">
                <div className="text-center bg-slate-900 p-10 rounded-3xl border border-emerald-500/30 shadow-2xl">
                    <div className="text-6xl font-black text-white mb-2 tracking-tighter uppercase">Summit!</div>
                    <div className="text-2xl text-emerald-400 font-mono mb-8 italic">{(timer/1000).toFixed(2)}s</div>
                    <div className="flex flex-col gap-4">
                        <input 
                          type="text" 
                          placeholder="ENTER NAME" 
                          className="bg-slate-800 text-white border border-slate-700 rounded-xl px-6 py-4 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xl font-black uppercase"
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
                          onKeyDown={(e) => e.key === 'Enter' && saveToLeaderboard()}
                          autoFocus
                        />
                        <button onClick={saveToLeaderboard} className="bg-emerald-500 text-slate-950 px-8 py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 disabled:opacity-50" disabled={!playerName.trim()}>Submit Record</button>
                    </div>
                </div>
            </div>
          )}
        </div>
        <ControlPanel 
          onCommand={handleCommand} 
          onLimbSelect={setActiveLimb} 
          activeLimb={activeLimb}
          availableColors={COLORS}
          onQuickMove={(color) => {
            if (activeLimb) handleCommand(`move ${activeLimb} to ${color}`);
            else addLog('CMD', 'Select a limb first!', 'info');
          }}
        />
      </div>
    </div>
  );
};

export default App;