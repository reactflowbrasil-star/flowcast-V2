'use client';

import { useEffect } from 'react';

export default function ConsoleSilencer() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      try {
        const noop = () => {};
        // Preserve warn/error; silence log/info/debug in production
        console.log = noop;
        console.info = noop;
        console.debug = noop;
      } catch {
        // ignore
      }
    }
  }, []);

  return null;
}

