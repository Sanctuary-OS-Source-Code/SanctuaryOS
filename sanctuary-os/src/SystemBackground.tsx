import React from 'react';
import { useTheme } from './ThemeContext';

export function SystemBackground() {
  const { currentTheme } = useTheme();

  // Destructure with defaults in case older themes are missing these properties
  const { ambientOrb = true, ambientNoise = true } = currentTheme;

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-[0] overflow-hidden bg-[var(--bg)]">
      
      {/* 
        Layer 1: The Deep Mesh Gradient 
        Uses the theme's core bgGradient, which usually contains complex radial-gradients.
      */}
      <div 
        className="absolute inset-0 w-full h-full opacity-100" 
        style={{ background: currentTheme.bgGradient || currentTheme.bg }} 
      />

      {/* 
        Layer 2: Singular Ambient Drifting Orb
        Hardware-accelerated, extreme blur, slow moving. 
        Costs almost zero frames to render, but gives life to the OS.
      */}
      {ambientOrb && (
        <div 
          className="absolute top-[-20%] left-[50%] w-[120vw] h-[120vh] rounded-[100%] opacity-50 mix-blend-screen pointer-events-none"
          style={{ 
            backgroundColor: 'color-mix(in srgb, var(--accent) 50%, transparent)',
            filter: 'blur(120px)',
            animation: 'ambient-drift 60s ease-in-out infinite alternate',
            transform: 'translate3d(0, 0, 0)'
          }} 
        />
      )}

      {/* 
        Layer 3: Hardware-Accelerated SVG Noise Texture
        Eliminates color banding and gives a physical premium feel to flat areas. 
        Only visible when ambientNoise is enabled.
      */}
      {ambientNoise && (
        <div 
          className="absolute inset-0 w-full h-full opacity-[0.06] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat'
          }} 
        />
      )}
    </div>
  );
}
