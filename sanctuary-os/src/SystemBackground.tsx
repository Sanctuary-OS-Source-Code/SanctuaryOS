import React from 'react';
import { useTheme } from './ThemeContext';

export function SystemBackground() {
  const { currentTheme } = useTheme();

  const { ambientOrb = true, ambientNoise = true, volumetricOrbs } = currentTheme;

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-[0] overflow-hidden bg-[var(--bg)]">
      
      {/* 
        Layer 1: The Deep Mesh Gradient or Wallpaper
        Uses the theme's bgImage if provided, otherwise falls back to bgGradient or solid bg.
      */}
      {currentTheme.bgImage ? (
        <div 
          className="absolute inset-0 rounded-[inherit] w-full h-full opacity-100 transition-all duration-1000" 
          style={{ 
            backgroundImage: `url("${currentTheme.bgImage}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }} 
        />
      ) : (
        <div 
          className="absolute inset-0 rounded-[inherit] w-full h-full opacity-100 transition-colors duration-1000" 
          style={{ background: currentTheme.bgGradient || currentTheme.bg }} 
        />
      )}

      {/* 
        Layer 2: The Volumetric Aero-Mesh Engine
        Spawns massive, overlapping orbs that physically mix colors.
      */}
      {ambientOrb && volumetricOrbs && volumetricOrbs.length > 0 ? (
        <div className="absolute inset-0 rounded-[inherit] w-full h-full">
          {volumetricOrbs.map((orb: any, index: number) => (
            <div 
              key={`${currentTheme.name || 'theme'}-${index}`}
              className={`absolute rounded-full pointer-events-none ${orb.blendMode || 'mix-blend-screen'}`}
              style={{ 
                backgroundColor: orb.color,
                top: orb.top, left: orb.left, width: orb.width || '120vw', height: orb.height || '120vh',
                filter: `blur(${orb.blur})`, opacity: orb.opacity || 0.5,
                animation: `${orb.animation || 'ambient-drift'} ${orb.duration || '60s'} ease-in-out infinite alternate`,
                transform: 'translate3d(0, 0, 0)'
              }} 
            />
          ))}
        </div>
      ) : null}

      {/* 
        Layer 3: Hardware-Accelerated SVG Noise Texture
        Eliminates color banding and gives a physical premium feel to flat areas. 
      */}
      {ambientNoise && (
        <div 
          className="absolute inset-0 rounded-[inherit] w-full h-full opacity-[0.06] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat'
          }} 
        />
      )}

      {/* 
        Layer 4: CRT Scanlines (Specific to Bunker theme)
      */}
      {currentTheme.scanlines && (
        <div 
          className="absolute inset-0 rounded-[inherit] w-full h-full pointer-events-none opacity-20"
          style={{
            background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2))',
            backgroundSize: '100% 4px'
          }}
        />
      )}
    </div>
  );
}

