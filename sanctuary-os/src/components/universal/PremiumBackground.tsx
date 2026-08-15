import React from 'react';
import { useTheme } from '../../ThemeContext';

export function PremiumBackground() {
  const { currentTheme } = useTheme();

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[var(--bg)] transition-colors duration-1000 pointer-events-none">
      <style>
        {`
          @keyframes orb-float-1 {
            0% { transform: translate(0%, 0%) scale(1); }
            33% { transform: translate(30%, 10%) scale(1.2); }
            66% { transform: translate(-20%, 20%) scale(0.8); }
            100% { transform: translate(0%, 0%) scale(1); }
          }
          @keyframes orb-float-2 {
            0% { transform: translate(0%, 0%) scale(1); }
            33% { transform: translate(-30%, -20%) scale(1.1); }
            66% { transform: translate(20%, -10%) scale(0.9); }
            100% { transform: translate(0%, 0%) scale(1); }
          }
          @keyframes orb-float-3 {
            0% { transform: translate(0%, 0%) scale(1); }
            33% { transform: translate(10%, -30%) scale(0.9); }
            66% { transform: translate(-10%, 20%) scale(1.1); }
            100% { transform: translate(0%, 0%) scale(1); }
          }
          
          .orb-1 { animation: orb-float-1 30s ease-in-out infinite; }
          .orb-2 { animation: orb-float-2 35s ease-in-out infinite; }
          .orb-3 { animation: orb-float-3 40s ease-in-out infinite; }
        `}
      </style>
      
      {/* Orb 1: Accent Color */}
      <div 
        className="orb-1 absolute -top-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full mix-blend-normal opacity-60 blur-[100px] transition-colors duration-1000 pointer-events-none"
        style={{ background: 'var(--accent)' }}
      />
      
      {/* Orb 2: A mix of Accent and a cooler tone */}
      <div 
        className="orb-2 absolute top-[10%] -right-[10%] w-[50vw] h-[50vw] rounded-full mix-blend-normal opacity-50 blur-[100px] transition-colors duration-1000 pointer-events-none"
        style={{ background: 'color-mix(in srgb, var(--accent) 50%, #f43f5e)' }} 
      />
      
      {/* Orb 3: A deeper, darker base tone */}
      <div 
        className="orb-3 absolute -bottom-[20%] left-[20%] w-[70vw] h-[70vw] rounded-full mix-blend-normal opacity-60 blur-[120px] transition-colors duration-1000 pointer-events-none"
        style={{ background: 'color-mix(in srgb, var(--accent) 40%, #06b6d4)' }}
      />

      {/* Subtle Noise Overlay for Texture */}
      <div 
        className="absolute inset-0 rounded-[inherit] opacity-[0.03] pointer-events-none mix-blend-overlay"
        style={{ 
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
          backgroundSize: '100px 100px'
        }}
      />
    </div>
  );
}

