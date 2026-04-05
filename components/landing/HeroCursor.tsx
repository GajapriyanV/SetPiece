"use client";

import { useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function HeroCursor() {
  const { isMobile } = useIsMobile();
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mx = 0, my = 0, rx = 0, ry = 0;
    let rafId: number;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`;
      }
    };

    const loop = () => {
      rx += (mx - rx) * 0.1;
      ry += (my - ry) * 0.1;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`;
      }
      rafId = requestAnimationFrame(loop);
    };

    document.addEventListener("mousemove", onMove);
    rafId = requestAnimationFrame(loop);

    return () => {
      document.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  if (isMobile) return null;

  return (
    <>
      <div
        ref={dotRef}
        style={{
          width: "8px",
          height: "8px",
          background: "var(--g)",
          borderRadius: "50%",
          position: "fixed",
          pointerEvents: "none",
          zIndex: 10001,
          top: 0,
          left: 0,
          willChange: "transform",
        }}
      />
      <div
        ref={ringRef}
        style={{
          width: "32px",
          height: "32px",
          border: "1px solid rgba(0,255,135,0.3)",
          borderRadius: "50%",
          position: "fixed",
          pointerEvents: "none",
          zIndex: 10000,
          top: 0,
          left: 0,
          willChange: "transform",
        }}
      />
    </>
  );
}
