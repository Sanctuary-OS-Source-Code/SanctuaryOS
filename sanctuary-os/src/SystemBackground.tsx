import React from 'react';
import { useTheme } from './ThemeContext';

export function SystemBackground() {
  const { currentTheme } = useTheme();

  const { ambientOrb = true, ambientNoise = true, volumetricOrbs } = currentTheme;

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-[0] overflow-hidden transform-gpu">

      {/* 
        Layer 1: The Deep Mesh Gradient or Wallpaper
        Provides an intermediate stacking context so Chromium backdrop-filter can blur it.
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
          className="absolute inset-0 rounded-[inherit] w-full h-full opacity-100 transition-all duration-1000"
          style={{ background: 'var(--bgGradient)' }}
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
                animation: `${orb.animation || 'ambient-drift'} ${orb.duration || '60s'} ease-in-out infinite alternate`
              }}
            />
          ))}
        </div>
      ) : null}

      {/* 
        Layer 3: Hardware-Accelerated SVG Noise Texture
        (Moved to App.tsx to sit on top of the DOM and avoid backdrop-filter bugs)
      */}
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

