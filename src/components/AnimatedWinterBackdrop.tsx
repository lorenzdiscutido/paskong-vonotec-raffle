import React, { useEffect, useRef } from 'react';
import { ThemeId } from '../types/raffle';

interface AnimatedWinterBackdropProps {
  theme: ThemeId;
  accentHex?: string;
  dimLevel?: 'normal' | 'summary';
}

interface Snowflake {
  x: number;
  y: number;
  r: number;
  speedY: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  alpha: number;
  layer: 0 | 1 | 2;
}

interface SmokePuff {
  originIdx: number;
  age: number;
  maxAge: number;
  driftX: number;
  size: number;
}

// Normalized (0..1) positions of warm lights on winter-village-bg.jpg so glows twinkle right on the bulbs & windows!
const WARM_GLOW_POINTS = [
  // Overhead string lights
  { x: 0.425, y: 0.275, r: 16, phase: 0.2 },
  { x: 0.465, y: 0.305, r: 16, phase: 1.1 },
  { x: 0.505, y: 0.312, r: 16, phase: 2.0 },
  { x: 0.545, y: 0.308, r: 16, phase: 2.9 },
  { x: 0.585, y: 0.295, r: 16, phase: 3.8 },
  // Cozy cottage windows & street lantern
  { x: 0.08, y: 0.41, r: 38, phase: 0.5 },
  { x: 0.08, y: 0.60, r: 42, phase: 1.7 },
  { x: 0.885, y: 0.275, r: 40, phase: 2.4 },
  { x: 0.885, y: 0.555, r: 44, phase: 0.9 },
  { x: 0.642, y: 0.575, r: 36, phase: 3.2 },
  // Foreground snow-tree fairy lights
  { x: 0.94, y: 0.74, r: 22, phase: 1.4 },
  { x: 0.89, y: 0.93, r: 24, phase: 2.7 },
];

// Normalized chimney tops on winter-village-bg.jpg
const CHIMNEY_ORIGINS = [
  { x: 0.06, y: 0.08 },
  { x: 0.155, y: 0.135 },
  { x: 0.835, y: 0.055 },
];

export const AnimatedWinterBackdrop: React.FC<AnimatedWinterBackdropProps> = ({
  theme,
  accentHex = '#fbbf24',
  dimLevel = 'normal',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Create 130 multi-layer parallax snowflakes
    const flakes: Snowflake[] = Array.from({ length: 130 }, (_, i) => {
      const layer = (i % 3) as 0 | 1 | 2;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r: layer === 2 ? 3.8 + Math.random() * 3.2 : layer === 1 ? 2.0 + Math.random() * 1.6 : 1.0 + Math.random() * 1.0,
        speedY: layer === 2 ? 48 + Math.random() * 32 : layer === 1 ? 28 + Math.random() * 20 : 14 + Math.random() * 12,
        swayAmp: layer === 2 ? 28 : layer === 1 ? 18 : 10,
        swayFreq: 0.6 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
        alpha: layer === 2 ? 0.55 : layer === 1 ? 0.78 : 0.45,
        layer,
      };
    });

    // Cozy rising chimney smoke puffs
    const puffs: SmokePuff[] = Array.from({ length: 18 }, (_, i) => ({
      originIdx: i % CHIMNEY_ORIGINS.length,
      age: (i / 18) * 5.5,
      maxAge: 5.5,
      driftX: 16 + (i % 4) * 6,
      size: 14 + (i % 3) * 8,
    }));

    let rafId = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      rafId = requestAnimationFrame(render);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const t = now * 0.001;

      ctx.clearRect(0, 0, width, height);

      if (theme === 'christmas') {
        // 1. Subtle Breathing Moonbeams from Upper-Left Sky
        ctx.save();
        const beamAlpha = 0.06 + Math.sin(t * 0.7) * 0.025;
        const beamGrad = ctx.createLinearGradient(width * 0.15, 0, width * 0.65, height * 0.85);
        beamGrad.addColorStop(0, `rgba(186, 230, 253, ${beamAlpha * 1.6})`);
        beamGrad.addColorStop(0.6, `rgba(186, 230, 253, ${beamAlpha * 0.6})`);
        beamGrad.addColorStop(1, 'rgba(186, 230, 253, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(width * 0.05, 0);
        ctx.lineTo(width * 0.42, 0);
        ctx.lineTo(width * 0.82, height);
        ctx.lineTo(width * 0.30, height);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // 2. Rising Cozy Chimney Smoke Wisps
        puffs.forEach((p) => {
          p.age += dt;
          if (p.age >= p.maxAge) p.age = 0;
          const prog = p.age / p.maxAge;
          const origin = CHIMNEY_ORIGINS[p.originIdx];
          const px = origin.x * width + prog * p.driftX + Math.sin(t * 1.2 + p.originIdx) * 8;
          const py = origin.y * height - prog * 68;
          const rad = p.size * (0.6 + prog * 1.65);
          const alpha = Math.sin(prog * Math.PI) * 0.16;

          const sg = ctx.createRadialGradient(px, py, 0, px, py, rad);
          sg.addColorStop(0, `rgba(226, 238, 255, ${alpha})`);
          sg.addColorStop(1, 'rgba(226, 238, 255, 0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fill();
        });

        // 3. Twinkling Warm String Lights & Cozy Window Candlelight
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        WARM_GLOW_POINTS.forEach((pt) => {
          const pulse = 0.65 + 0.35 * Math.sin(t * 2.6 + pt.phase);
          const gx = pt.x * width;
          const gy = pt.y * height;
          const gr = pt.r * (0.85 + pulse * 0.3);

          const wg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
          wg.addColorStop(0, `rgba(255, 220, 130, ${0.38 * pulse})`);
          wg.addColorStop(0.45, `rgba(251, 165, 60, ${0.16 * pulse})`);
          wg.addColorStop(1, 'rgba(251, 146, 60, 0)');
          ctx.fillStyle = wg;
          ctx.beginPath();
          ctx.arc(gx, gy, gr, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      }

      // 4. Multi-Layer Drifting Snowflakes (or Starlight Motes in Celestial Mode)
      flakes.forEach((f) => {
        f.y += f.speedY * dt * (theme === 'christmas' ? 1 : 0.45);
        const curX = f.x + Math.sin(t * f.swayFreq + f.phase) * f.swayAmp;
        if (f.y > height + 12) {
          f.y = -12;
          f.x = Math.random() * width;
        }

        if (f.layer === 2) {
          // Soft dreamy foreground bokeh snowflake
          const fg = ctx.createRadialGradient(curX, f.y, 0, curX, f.y, f.r * 2.2);
          fg.addColorStop(0, `rgba(255, 255, 255, ${f.alpha})`);
          fg.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(curX, f.y, f.r * 2.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, ${f.alpha})`;
          ctx.beginPath();
          ctx.arc(curX, f.y, f.r, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [theme]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {theme === 'christmas' ? (
        /* Animated Cozy Winter Village Artwork with Smooth 2.5D Ken Burns Drift */
        <img
          src="/winter-village-bg.jpg"
          alt=""
          aria-hidden="true"
          className={`w-full h-full object-cover animate-village-drift ${
            dimLevel === 'summary' ? 'brightness-[0.42] saturate-110' : 'brightness-[0.58] saturate-115'
          }`}
        />
      ) : (
        /* Starry Celestial Fallback when switched to non-Christmas General Theme */
        <div className="w-full h-full bg-gradient-to-b from-[#0b1026] via-[#151e42] to-[#090d1f]" />
      )}

      {/* Live Canvas Layer: Chimney Smoke, Twinkling String Lights, Moonbeams & 3-Layer Snowfall */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Subtle Rarity Aura Tint + Center Readability Scrim so Winner Name & Stars Pop Crisp! */}
      <div
        className="absolute inset-0 transition-all duration-700"
        style={{
          background:
            dimLevel === 'summary'
              ? `radial-gradient(circle at 50% 50%, rgba(12, 18, 34, 0.45) 0%, rgba(10, 14, 28, 0.78) 100%)`
              : `radial-gradient(circle at 62% 50%, ${accentHex}2e 0%, rgba(10, 16, 32, 0.58) 58%, rgba(8, 12, 26, 0.72) 100%)`,
        }}
      />
    </div>
  );
};
