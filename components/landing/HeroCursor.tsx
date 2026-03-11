"use client";

import { useEffect, useRef } from "react";

export default function HeroCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mx = 0, my = 0, rx = 0, ry = 0;
    let rafId: number;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.left = mx + "px";
        dotRef.current.style.top = my + "px";
      }
    };

    const loop = () => {
      rx += (mx - rx) * 0.1;
      ry += (my - ry) * 0.1;
      if (ringRef.current) {
        ringRef.current.style.left = rx + "px";
        ringRef.current.style.top = ry + "px";
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
          zIndex: 9999,
          transform: "translate(-50%, -50%)",
          mixBlendMode: "screen",
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
          zIndex: 9998,
          transform: "translate(-50%, -50%)",
        }}
      />
    </>
  );
}
