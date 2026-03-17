"use client";

import { useEffect, useState } from "react";

export function useServerTimer(endsAt: number | null): number {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!endsAt) {
      setSecondsLeft(0);
      return;
    }

    function tick() {
      const remaining = Math.ceil((endsAt! - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, remaining));
    }

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  return secondsLeft;
}
