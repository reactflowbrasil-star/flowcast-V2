'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_PLAYER_ENGINE, getPreferredPlayerEngine, type PlayerEngine } from '@/lib/playerEngine';

export function usePlayerEngine(): PlayerEngine {
  const [engine, setEngine] = useState<PlayerEngine>(DEFAULT_PLAYER_ENGINE);
  useEffect(() => {
    let active = true;
    getPreferredPlayerEngine().then((value) => { if (active) setEngine(value); });
    return () => { active = false; };
  }, []);
  return engine;
}
