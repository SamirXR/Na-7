import { useEffect, useRef } from 'react';

type Dot = {
  x: number;
  y: number;
  opacity: number;
  targetOpacity: number;
};

export default function InteractiveDotBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    const SPACING = 20;
    const MIN_RADIUS = 0.45;
    const MAX_RADIUS = 1.75;
    const INTERACTION_RADIUS = 140;

    let mouseX = -1000;
    let mouseY = -1000;

    const dots: Dot[] = [];

    const resizeCanvas = () => {
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      dots.length = 0;
      for (let x = SPACING / 2; x < width; x += SPACING) {
        for (let y = SPACING / 2; y < height; y += SPACING) {
          dots.push({ x, y, opacity: 0, targetOpacity: 0 });
        }
      }
    };

    const onPointerMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const onPointerLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
    };

    resizeCanvas();

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseleave', onPointerLeave);

    let rafId = 0;

    const frame = () => {
      ctx.clearRect(0, 0, width, height);

      for (const dot of dots) {
        const dx = mouseX - dot.x;
        const dy = mouseY - dot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < INTERACTION_RADIUS) {
          const intensity = 1 - dist / INTERACTION_RADIUS;
          dot.targetOpacity = Math.max(0, intensity * 0.55);
        } else {
          dot.targetOpacity = 0;
        }

        dot.opacity += (dot.targetOpacity - dot.opacity) * 0.18;

        if (dot.opacity < 0.005) continue;

        const radius = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * dot.opacity;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${dot.opacity})`;
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseleave', onPointerLeave);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-70 mix-blend-screen"
      aria-hidden="true"
    />
  );
}
