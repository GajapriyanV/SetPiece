"use client";

import { useEffect, useState } from "react";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 768px)");
    const tabletQuery = window.matchMedia("(max-width: 1024px)");

    const update = () => {
      setIsMobile(mobileQuery.matches);
      setIsTablet(tabletQuery.matches && !mobileQuery.matches);
    };

    update();
    mobileQuery.addEventListener("change", update);
    tabletQuery.addEventListener("change", update);

    return () => {
      mobileQuery.removeEventListener("change", update);
      tabletQuery.removeEventListener("change", update);
    };
  }, []);

  return { isMobile, isTablet };
}
