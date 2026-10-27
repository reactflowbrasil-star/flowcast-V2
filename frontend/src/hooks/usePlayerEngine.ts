'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_PLAYER_ENGINE, getPreferredPlayerEngine, subscribeToPlayerEngineUpdates, type PlayerEngine } from '@/lib/playerEngine';

export function usePlayerEngine(): PlayerEngine {
  const [engine, setEngine] = useState<PlayerEngine>(DEFAULT_PLAYER_ENGINE);
  useEffect(() => {
    let active = true;
    getPreferredPlayerEngine().then((value) => { if (active) setEngine(value); });
    const unsubscribe = subscribeToPlayerEngineUpdates(setEngine);
    return () => { active = false; unsubscribe(); };
  }, []);
  return engine;
}
