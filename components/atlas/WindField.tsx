"use client";

import { useEffect, useRef } from "react";

type WindFieldProps = {
  visible: boolean;
  speed: number;
  direction: number;
};

type Particle = { x: number; y: number; life: number };

export default function WindField({ visible, speed, direction }: WindFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const valuesRef = useRef({ visible, speed, direction });

  useEffect(() => {
    valuesRef.current = { visible, speed, direction };
  }, [visible, speed, direction]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      particlesRef.current = Array.from({ length: Math.min(260, Math.max(110, Math.floor(rect.width / 7))) }, () => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        life: Math.random() * 90,
      }));
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = () => {
      const { visible: enabled, speed: windSpeed, direction: windDirection } = valuesRef.current;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      if (!enabled) {
        context.clearRect(0, 0, width, height);
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      context.fillStyle = "rgba(5, 17, 30, .14)";
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "rgba(159, 217, 255, .28)";
      context.lineWidth = 0.8;

      const angle = ((windDirection || 270) - 90) * (Math.PI / 180);
      const velocity = Math.max(0.45, Math.min(2.25, (windSpeed || 12) / 18));
      particlesRef.current.forEach((particle) => {
        const previousX = particle.x;
        const previousY = particle.y;
        particle.x += Math.cos(angle) * velocity;
        particle.y += Math.sin(angle) * velocity;
        particle.life += 1;
        if (particle.x < -10 || particle.x > width + 10 || particle.y < -10 || particle.y > height + 10 || particle.life > 118) {
          particle.x = Math.random() * width;
          particle.y = Math.random() * height;
          particle.life = 0;
        }
        context.beginPath();
        context.moveTo(previousX, previousY);
        context.lineTo(particle.x, particle.y);
        context.stroke();
      });

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);
    return () => {
      observer.disconnect();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="atlas-wind-field" aria-hidden="true" />;
}
