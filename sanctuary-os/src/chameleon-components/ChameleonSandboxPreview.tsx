import React, { useEffect, useRef } from 'react';
import { useLexicon } from '../LexiconContext';
import { computeGlassOpticalVars } from '../ThemeContext';
import {
  VERTEX_SHADER_BG,
  FRAGMENT_SHADER_BG,
  VERTEX_SHADER_GLASS,
  FRAGMENT_SHADER_GLASS,
  createProgram,
  parseHexNormalized,
  computeThemeShaderUniforms,
} from '../SystemBackground';
import { DynamicThemePreviewBanner } from './ThemeCard';

interface ChameleonSandboxPreviewProps {
  currentTheme: any;
}

const MAX_SANDBOX_INSTANCES = 64;
const FLOATS_PER_INSTANCE = 12;

export function ChameleonSandboxPreview({ currentTheme }: ChameleonSandboxPreviewProps) {
  const { t } = useLexicon();
  const opticalVars = computeGlassOpticalVars(currentTheme);

  const sandboxRootRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeRef = useRef<any>(currentTheme);
  themeRef.current = currentTheme;

  const rebuildTexturesRef = useRef<(() => void) | null>(null);
  const scheduleRenderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const rootEl = sandboxRootRef.current;
    if (!canvas || !rootEl) return;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) return;

    const bgProg = createProgram(gl, VERTEX_SHADER_BG, FRAGMENT_SHADER_BG);
    const glassProg = createProgram(gl, VERTEX_SHADER_GLASS, FRAGMENT_SHADER_GLASS);
    if (!bgProg || !glassProg) return;

    const bgVao = gl.createVertexArray();
    const glassVao = gl.createVertexArray();
    const instanceVbo = gl.createBuffer();
    const instanceData = new Float32Array(MAX_SANDBOX_INSTANCES * FLOATS_PER_INSTANCE);

    gl.bindVertexArray(glassVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceVbo);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_INSTANCE * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(0, 1);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 32);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);

    const createTex = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };

    const sharpTex = createTex();
    const blurTex = createTex();
    let texturesReady = false;
    let disposed = false;
    let rafId = 0;

    const bgUniformSharp = gl.getUniformLocation(bgProg, 'u_sharpTex');
    const glassUniformSharp = gl.getUniformLocation(glassProg, 'u_sharpTex');
    const glassUniformBlur = gl.getUniformLocation(glassProg, 'u_blurTex');
    const glassUniformViewport = gl.getUniformLocation(glassProg, 'u_viewport');
    const glassUniformTint = gl.getUniformLocation(glassProg, 'u_tintRgb');
    const glassUniformIsLight = gl.getUniformLocation(glassProg, 'u_isLight');
    const glassUniformSpecScale = gl.getUniformLocation(glassProg, 'u_specScale');
    const glassUniformRefractScale = gl.getUniformLocation(glassProg, 'u_refractScale');
    const glassUniformBezelScale = gl.getUniformLocation(glassProg, 'u_bezelScale');
    const glassUniformShadowScale = gl.getUniformLocation(glassProg, 'u_shadowScale');

    const scheduleRender = () => {
      if (rafId === 0 && !disposed) {
        rafId = window.requestAnimationFrame(renderSandboxFrame);
      }
    };

    const renderSandboxFrame = () => {
      rafId = 0;
      if (disposed || !texturesReady || !sandboxRootRef.current) return;

      const rootRect = sandboxRootRef.current.getBoundingClientRect();
      const vw = Math.max(1, rootRect.width);
      const vh = Math.max(1, rootRect.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const targetW = Math.max(1, Math.round(vw * dpr));
      const targetH = Math.max(1, Math.round(vh * dpr));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      // 1. Draw sharp wallpaper across sandbox viewport
      gl.viewport(0, 0, targetW, targetH);
      gl.disable(gl.BLEND);
      gl.useProgram(bgProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sharpTex);
      gl.uniform1i(bgUniformSharp, 0);
      gl.bindVertexArray(bgVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 2. Collect sandbox glass specimens in layer order (panels/nav first, nested surfaces second)
      const th = themeRef.current || {};
      const {
        rawOpacity,
        specScale,
        refractScale,
        bezelScale,
        shadowScale,
        isLight,
        tintRgb,
      } = computeThemeShaderUniforms(th);

      const scrollEl = scrollContainerRef.current;
      const scrollRect = scrollEl ? scrollEl.getBoundingClientRect() : rootRect;
      const clipL = Math.max(0, scrollRect.left - rootRect.left);
      const clipT = Math.max(0, scrollRect.top - rootRect.top);
      const clipR = Math.min(vw, scrollRect.right - rootRect.left);
      const clipB = Math.min(vh, scrollRect.bottom - rootRect.top);

      const panels = sandboxRootRef.current.querySelectorAll<HTMLElement>(
        '[data-sandbox-glass="panel"], [data-sandbox-glass="nav"]'
      );
      const surfaces = sandboxRootRef.current.querySelectorAll<HTMLElement>(
        '[data-sandbox-glass="surface"]'
      );

      let count = 0;
      const pushNode = (el: HTMLElement, glassKind: number) => {
        if (count >= MAX_SANDBOX_INSTANCES) return;
        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return;
        const relL = r.left - rootRect.left;
        const relT = r.top - rootRect.top;
        const relR = relL + r.width;
        const relB = relT + r.height;
        if (relB <= clipT || relT >= clipB || relR <= clipL || relL >= clipR) return;

        const cs = window.getComputedStyle(el);
        const parsedRad = parseFloat(cs.borderTopLeftRadius || '16');
        const radiusPx = Number.isNaN(parsedRad) ? 16 : parsedRad;

        const base = count * FLOATS_PER_INSTANCE;
        instanceData[base + 0] = relL;
        instanceData[base + 1] = relT;
        instanceData[base + 2] = r.width;
        instanceData[base + 3] = r.height;

        instanceData[base + 4] = clipL;
        instanceData[base + 5] = clipT;
        instanceData[base + 6] = clipR;
        instanceData[base + 7] = clipB;

        instanceData[base + 8] = Math.min(radiusPx, Math.min(r.width, r.height) * 0.5);
        instanceData[base + 9] = glassKind;
        instanceData[base + 10] = rawOpacity;
        instanceData[base + 11] = glassKind > 1.5 ? 0.5 : 1.0;
        count++;
      };

      for (let i = 0; i < panels.length; i++) {
        const kindAttr = panels[i].getAttribute('data-sandbox-glass');
        pushNode(panels[i], kindAttr === 'nav' ? 1.0 : 0.0);
      }
      for (let i = 0; i < surfaces.length; i++) {
        pushNode(surfaces[i], 2.0);
      }

      if (count > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(glassProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sharpTex);
        gl.uniform1i(glassUniformSharp, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, blurTex);
        gl.uniform1i(glassUniformBlur, 1);

        gl.uniform2f(glassUniformViewport, vw, vh);
        gl.uniform3f(glassUniformTint, tintRgb[0], tintRgb[1], tintRgb[2]);
        gl.uniform1f(glassUniformIsLight, isLight);
        gl.uniform1f(glassUniformSpecScale, specScale);
        gl.uniform1f(glassUniformRefractScale, refractScale);
        gl.uniform1f(glassUniformBezelScale, bezelScale);
        gl.uniform1f(glassUniformShadowScale, shadowScale);

        gl.bindVertexArray(glassVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceVbo);
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          0,
          instanceData.subarray(0, count * FLOATS_PER_INSTANCE)
        );
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
        gl.bindVertexArray(null);
      }
    };

    const buildSandboxTextures = () => {
      if (disposed || !sandboxRootRef.current) return;
      const th = themeRef.current || {};
      const rect = sandboxRootRef.current.getBoundingClientRect();
      const vw = Math.max(260, rect.width || 430);
      const vh = Math.max(400, rect.height || 780);
      const targetAspect = vw / vh;

      const parsedBlur = parseFloat(String(th.glassBlur ?? '36'));
      const rawBlur = Math.max(0, Math.min(64, isNaN(parsedBlur) ? 36 : parsedBlur));
      const parsedSat = parseFloat(String(th.glassSaturation ?? '185')) || 185;
      const [bgR, bgG, bgB] = parseHexNormalized(th.bg, [0.03, 0.04, 0.07]);
      const [txtR, txtG, txtB] = parseHexNormalized(th.text, [0.97, 0.98, 1.0]);
      const bgYiq = (bgR * 299 + bgG * 587 + bgB * 114) / 1000;
      const txtYiq = (txtR * 299 + txtG * 587 + txtB * 114) / 1000;
      const isLightTheme = bgYiq >= 0.50 || txtYiq < 0.45;
      const satPct = isLightTheme
        ? Math.max(70, Math.min(160, Math.round(104 * (parsedSat / 185))))
        : Math.max(65, Math.min(185, Math.round(118 * (parsedSat / 185))));

      const uploadFromSourceCanvas = (srcCanvas: HTMLCanvasElement) => {
        if (disposed) return;
        gl.bindTexture(gl.TEXTURE_2D, sharpTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);

        const bw = 640;
        const bh = Math.max(320, Math.round(bw / targetAspect));
        const blurPx = rawBlur <= 0
          ? 0
          : isLightTheme
            ? Math.max(3, Math.min(44, Math.round(rawBlur * 0.78)))
            : Math.max(2, Math.min(40, Math.round(rawBlur * 0.68)));
        const pad = Math.max(48, blurPx * 3);

        const padCanvas = document.createElement('canvas');
        padCanvas.width = bw + pad * 2;
        padCanvas.height = bh + pad * 2;
        const padCtx = padCanvas.getContext('2d');

        const blurCanvas = document.createElement('canvas');
        blurCanvas.width = bw;
        blurCanvas.height = bh;
        const blurCtx = blurCanvas.getContext('2d');

        if (padCtx && blurCtx) {
          const sw = srcCanvas.width;
          const sh = srcCanvas.height;
          padCtx.drawImage(srcCanvas, 0, 0, sw, 1, pad, 0, bw, pad);
          padCtx.drawImage(srcCanvas, 0, sh - 1, sw, 1, pad, pad + bh, bw, pad);
          padCtx.drawImage(srcCanvas, 0, 0, 1, sh, 0, pad, pad, bh);
          padCtx.drawImage(srcCanvas, sw - 1, 0, 1, sh, pad + bw, pad, pad, bh);
          padCtx.drawImage(srcCanvas, 0, 0, sw, sh, pad, pad, bw, bh);

          const blurBright = isLightTheme ? '1.04' : '0.97';
          blurCtx.imageSmoothingEnabled = true;
          blurCtx.imageSmoothingQuality = 'high';
          blurCtx.filter = blurPx > 0
            ? `blur(${blurPx}px) saturate(${satPct}%) brightness(${blurBright})`
            : `saturate(${satPct}%) brightness(${blurBright})`;
          blurCtx.drawImage(padCanvas, -pad, -pad, padCanvas.width, padCanvas.height);
          blurCtx.filter = 'none';

          gl.bindTexture(gl.TEXTURE_2D, blurTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, blurCanvas);
        } else {
          gl.bindTexture(gl.TEXTURE_2D, blurTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
        }

        texturesReady = true;
        scheduleRender();
      };

      const paintProceduralFallback = () => {
        const gradCanvas = document.createElement('canvas');
        gradCanvas.width = 720;
        gradCanvas.height = Math.max(400, Math.round(720 / targetAspect));
        const gCtx = gradCanvas.getContext('2d');
        if (gCtx) {
          gCtx.fillStyle = th.bg && th.bg !== 'transparent' ? th.bg : '#080b12';
          gCtx.fillRect(0, 0, gradCanvas.width, gradCanvas.height);

          const orbs = Array.isArray(th.volumetricOrbs) && th.volumetricOrbs.length > 0
            ? th.volumetricOrbs
            : [
                { color: th.accent || '#38bdf8', left: '78%', top: '18%', opacity: 0.32 },
                { color: th.success || '#10b981', left: '22%', top: '82%', opacity: 0.22 },
              ];
          for (let i = 0; i < orbs.length; i++) {
            const orb = orbs[i];
            const ox = (parseFloat(String(orb.left || '20')) / 100) * gradCanvas.width;
            const oy = (parseFloat(String(orb.top || '20')) / 100) * gradCanvas.height;
            const rad = Math.max(gradCanvas.width, gradCanvas.height) * 0.58;
            const rg = gCtx.createRadialGradient(ox, oy, 0, ox, oy, rad);
            rg.addColorStop(0, orb.color || th.accent || '#38bdf8');
            rg.addColorStop(1, 'transparent');
            gCtx.globalAlpha = Number(orb.opacity ?? 0.32);
            gCtx.fillStyle = rg;
            gCtx.fillRect(0, 0, gradCanvas.width, gradCanvas.height);
          }
          gCtx.globalAlpha = 1.0;
          uploadFromSourceCanvas(gradCanvas);
        }
      };

      if (th.bgImage && String(th.bgImage).trim() !== '' && th.bgImage !== 'none') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (disposed) return;
          const nw = img.naturalWidth || 1920;
          const nh = img.naturalHeight || 1080;
          const imgAspect = nw / nh;
          let sx = 0;
          let sy = 0;
          let sw = nw;
          let sh = nh;
          if (imgAspect > targetAspect) {
            sw = nh * targetAspect;
            sx = (nw - sw) * 0.5;
          } else if (imgAspect < targetAspect) {
            sh = nw / targetAspect;
            sy = (nh - sh) * 0.5;
          }

          const sharpCanvas = document.createElement('canvas');
          sharpCanvas.width = Math.min(1280, Math.max(720, Math.round(vw * Math.min(2, window.devicePixelRatio || 1))));
          sharpCanvas.height = Math.max(400, Math.round(sharpCanvas.width / targetAspect));
          const sCtx = sharpCanvas.getContext('2d');
          if (sCtx) {
            sCtx.imageSmoothingEnabled = true;
            sCtx.imageSmoothingQuality = 'high';
            sCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sharpCanvas.width, sharpCanvas.height);
            uploadFromSourceCanvas(sharpCanvas);
          }
        };
        img.onerror = () => {
          if (!disposed) paintProceduralFallback();
        };
        img.src = th.bgImage;
      } else {
        paintProceduralFallback();
      }
    };

    rebuildTexturesRef.current = buildSandboxTextures;
    scheduleRenderRef.current = scheduleRender;

    buildSandboxTextures();

    const scrollEl = scrollContainerRef.current;
    const onScroll = () => scheduleRender();
    scrollEl?.addEventListener('scroll', onScroll, { passive: true });

    let prevW = Math.round(rootEl.getBoundingClientRect().width);
    let prevH = Math.round(rootEl.getBoundingClientRect().height);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nw = Math.round(entry.contentRect.width);
      const nh = Math.round(entry.contentRect.height);
      if (Math.abs(nw - prevW) > 4 || Math.abs(nh - prevH) > 4) {
        prevW = nw;
        prevH = nh;
        buildSandboxTextures();
      } else {
        scheduleRender();
      }
    });
    ro.observe(rootEl);

    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      scrollEl?.removeEventListener('scroll', onScroll);
      ro.disconnect();
      gl.deleteTexture(sharpTex);
      gl.deleteTexture(blurTex);
      gl.deleteBuffer(instanceVbo);
      gl.deleteVertexArray(bgVao);
      gl.deleteVertexArray(glassVao);
      gl.deleteProgram(bgProg);
      gl.deleteProgram(glassProg);
    };
  }, []);

  // Rebuild sandbox wallpaper & Gaussian blur textures when wallpaper, blur, or saturation changes
  useEffect(() => {
    rebuildTexturesRef.current?.();
  }, [
    currentTheme.bgImage,
    currentTheme.bg,
    currentTheme.bgGradient,
    currentTheme.glassBlur,
    currentTheme.glassSaturation,
    currentTheme.accent,
  ]);

  // Re-render WebGL2 SDF glass instances at 60fps when any optical, color, or typography parameter changes
  useEffect(() => {
    scheduleRenderRef.current?.();
  }, [
    currentTheme.glassOpacity,
    currentTheme.glassRefraction,
    currentTheme.glassBezel,
    currentTheme.glassSpecular,
    currentTheme.glassShadow,
    currentTheme.glassBorderOpacity,
    currentTheme.panelTint,
    currentTheme.sidebar,
    currentTheme.text,
    currentTheme.subtext,
    currentTheme.radius,
    currentTheme.fontFamily,
    currentTheme.fontSizeHeader,
    currentTheme.fontSizeText,
    currentTheme.fontSizeSubtext,
  ]);

  const toPct = (rawVal: any, fb: number) => {
    if (rawVal === undefined || rawVal === null || rawVal === '') return fb;
    const str = String(rawVal).trim();
    if (str.endsWith('%')) {
      const p = parseFloat(str);
      return isNaN(p) ? fb : Math.round(p);
    }
    const n = parseFloat(str);
    if (isNaN(n)) return fb;
    return n <= 2.5 && n >= 0 && !str.includes('%') && str.includes('.')
      ? Math.round(n * 100)
      : Math.round(n);
  };

  const displayOpacityPct = toPct(currentTheme.glassOpacity, 10);
  const displayRefractPct = toPct(currentTheme.glassRefraction, 100);
  const displayBezelPct = toPct(currentTheme.glassBezel, 100);
  const displayBlurPx = parseInt(String(currentTheme.glassBlur ?? '36'), 10);
  const resolvedBlurPx = isNaN(displayBlurPx) ? 36 : displayBlurPx;

  // Transparent DOM containers with crisp 1px directional specular borders —
  // the dedicated WebGL2 SDF canvas underneath renders the real 3D curved meniscus refraction!
  const panelBorderStyle: React.CSSProperties = {
    borderRadius: currentTheme.radius || '1.25rem',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderTopColor: opticalVars['--glass-border-top'],
    borderLeftColor: opticalVars['--glass-border-left'],
    borderRightColor: opticalVars['--glass-border-right'],
    borderBottomColor: opticalVars['--glass-border-bottom'],
    backgroundColor: 'transparent',
    boxShadow: `${opticalVars['--glass-outer-shadow']}, ${opticalVars['--glass-inset-highlight']}`,
  };

  const surfaceBorderStyle: React.CSSProperties = {
    borderRadius: `max(0px, calc((${currentTheme.radius || '1.25rem'}) * 0.65))`,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderTopColor: opticalVars['--glass-border-top'],
    borderLeftColor: opticalVars['--glass-border-left'],
    borderRightColor: opticalVars['--glass-surface-border'],
    borderBottomColor: opticalVars['--glass-surface-border'],
    backgroundColor: 'transparent',
    boxShadow: opticalVars['--glass-surface-inset-highlight'],
  };

  const chipBorderStyle: React.CSSProperties = {
    ...surfaceBorderStyle,
    borderRadius: `max(0px, calc((${currentTheme.radius || '1.25rem'}) * 0.55))`,
  };

  return (
    <div className="w-full lg:w-[430px] xl:w-[470px] shrink-0 h-full p-4 flex flex-col overflow-hidden">
      <div
        ref={sandboxRootRef}
        data-sandbox-preview-root="true"
        className="w-full h-full rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-2xl relative flex flex-col overflow-hidden"
        style={{
          '--bg': currentTheme.bg,
          '--text': currentTheme.text,
          '--subtext': currentTheme.subtext,
          '--accent': currentTheme.accent,
          '--sidebar': currentTheme.sidebar,
          '--sidebartext': currentTheme.sidebartext,
          '--success': currentTheme.success || '#10b981',
          '--warning': currentTheme.warning || '#f59e0b',
          '--danger': currentTheme.danger || '#f43f5e',
          '--panelTint': currentTheme.panelTint || currentTheme.sidebar,
          '--headerText': currentTheme.headerText || currentTheme.text,
          '--radius': currentTheme.radius || '1.25rem',
          '--glassBlur': currentTheme.glassBlur || '36px',
          '--bgGradient':
            currentTheme.bgGradient && currentTheme.bgGradient !== 'transparent'
              ? currentTheme.bgGradient
              : currentTheme.bg,
          ...opticalVars,
          backgroundColor: currentTheme.bg || '#060b14',
          fontFamily: currentTheme.fontFamily || 'Inter, sans-serif',
        } as React.CSSProperties}
      >
        {/* Fallback Backdrop while WebGL2 Initializes */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          {currentTheme.bgImage ? (
            <img
              src={currentTheme.bgImage}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover object-center opacity-100 select-none"
            />
          ) : (
            <div
              className="absolute inset-0 w-full h-full opacity-100"
              style={{ background: 'var(--bgGradient)' }}
            />
          )}
        </div>

        {/* Dedicated Sandbox WebGL2 Instanced SDF Liquid Glass Engine */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none select-none z-[1]"
        />

        {currentTheme.scanlines && (
          <div
            className="absolute inset-0 w-full h-full pointer-events-none opacity-20 z-[2]"
            style={{
              background:
                'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.25))',
              backgroundSize: '100% 4px',
            }}
          />
        )}

        <div
          ref={scrollContainerRef}
          className="relative z-10 flex-1 flex flex-col p-5 gap-3.5 overflow-y-auto custom-scrollbar pb-24"
        >
          {/* Top Floating 2-Pill Telemetry Bar (Standard Sanctuary OS VAULT_CHIP_CLASS Badges) */}
          <div className="flex items-center justify-between gap-2">
            <div
              data-sandbox-glass="surface"
              style={chipBorderStyle}
              className="px-2.5 py-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--text)] shrink-0"
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t('icon_blur_on', 'blur_on')}
              </span>
              <span>{t('forge_preview_pill_label', 'Liquid Glass Active')}</span>
            </div>
            <div
              data-sandbox-glass="surface"
              style={chipBorderStyle}
              className="px-2.5 py-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--text)] shrink-0"
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t('icon_tune', 'tune')}
              </span>
              <span className="font-mono">{`${displayOpacityPct}% · ${resolvedBlurPx}px · ${displayRefractPct}%`}</span>
            </div>
          </div>

          {/* Live Header Specimen */}
          <div className="flex flex-col gap-0.5 pt-0.5">
            <h1
              className="truncate"
              style={{
                fontSize: currentTheme.fontSizeHeader || '1.65rem',
                color: currentTheme.headerText || currentTheme.text,
                fontWeight: 900,
                lineHeight: 1.15,
              }}
            >
              {currentTheme.name || t('forge_preview', 'Live Sandbox')}
            </h1>
            <p style={{ fontSize: currentTheme.fontSizeSubtext || '0.75rem', color: currentTheme.subtext, opacity: 0.9 }}>
              {t('forge_preview_desc', 'Real-time 3D optical refraction, specular rim highlights, and elevation preview.')}
            </p>
          </div>

          {/* Row 1: 2-Up Stat Tile Specimen */}
          <div className="grid grid-cols-2 gap-3">
            <div
              data-sandbox-glass="panel"
              style={panelBorderStyle}
              className="p-3.5 flex items-center gap-3 overflow-hidden"
            >
              <div
                data-sandbox-glass="surface"
                style={surfaceBorderStyle}
                className="w-9 h-9 flex items-center justify-center shrink-0"
              >
                <span className="material-symbols-outlined !text-[18px] text-[var(--text)]">
                  {t('icon_account_balance', 'account_balance')}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)] truncate">
                  {t('nav_vault', 'Your Vault')}
                </span>
                <span className="text-lg font-black text-[var(--text)] leading-tight">3,074</span>
              </div>
            </div>

            <div
              data-sandbox-glass="panel"
              style={panelBorderStyle}
              className="p-3.5 flex items-center gap-3 overflow-hidden"
            >
              <div
                data-sandbox-glass="surface"
                style={surfaceBorderStyle}
                className="w-9 h-9 flex items-center justify-center shrink-0"
              >
                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                  {t('icon_hub', 'hub')}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[8px] font-black uppercase tracking-widest text-[var(--subtext)] truncate">
                  {t('nav_nexus', 'The Nexus')}
                </span>
                <span className="text-lg font-black text-[var(--accent)] leading-tight">2,990</span>
              </div>
            </div>
          </div>

          {/* Row 2: Full-Width Interactive 3D Meniscus Glass Specimen */}
          <div
            data-sandbox-glass="panel"
            style={panelBorderStyle}
            className="p-4 flex flex-col gap-3 overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  data-sandbox-glass="surface"
                  style={surfaceBorderStyle}
                  className="w-10 h-10 flex items-center justify-center shrink-0"
                >
                  <span className="material-symbols-outlined !text-[20px] text-[var(--accent)]">
                    {t('icon_blur_on', 'blur_on')}
                  </span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span
                    className="font-bold text-[var(--text)] truncate"
                    style={{ fontSize: currentTheme.fontSizeText || '0.95rem' }}
                  >
                    {t('ui_forge_glass', 'Liquid Glass Surface')}
                  </span>
                  <span className="text-[10px] text-[var(--subtext)] line-clamp-1 leading-relaxed">
                    {t('ui_forge_glass_desc', 'Refractive backdrop saturation & specular rim lighting.')}
                  </span>
                </div>
              </div>
              <span
                data-sandbox-glass="surface"
                style={chipBorderStyle}
                className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--text)] shrink-0 flex items-center gap-1.5"
              >
                <span
                  className="material-symbols-outlined !text-[12px]"
                  style={{ color: currentTheme.success || '#10b981' }}
                >
                  {t('icon_cloud_done', 'cloud_done')}
                </span>
                <span>{t('synced_badge', 'Synced')}</span>
              </span>
            </div>

            {/* Live 4-Metric Optical Telemetry Strip inside Card */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: t('forge_metric_opacity', 'Opacity'), val: `${displayOpacityPct}%` },
                { label: t('forge_metric_blur', 'Blur'), val: `${resolvedBlurPx}px` },
                { label: t('forge_metric_refract', 'Refract'), val: `${displayRefractPct}%` },
                { label: t('forge_metric_bezel', 'Bezel'), val: `${displayBezelPct}%` },
              ].map((m) => (
                <div
                  key={m.label}
                  data-sandbox-glass="surface"
                  style={surfaceBorderStyle}
                  className="px-2.5 py-1.5 flex flex-col items-center justify-center"
                >
                  <span className="text-[7px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-75">
                    {m.label}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[var(--accent)]">
                    {m.val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Row 3: Simulated Navigation Bar & Quick Launch Specimen (Matches Sidebar.tsx 1:1) */}
          <div
            data-sandbox-glass="nav"
            style={panelBorderStyle}
            className="p-2.5 flex items-center justify-between gap-2 overflow-hidden"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Active NavButton (Command Center) matching Sidebar.tsx lines 28-67 */}
              <div
                className="px-3 py-2 rounded-xl flex items-center gap-2 shrink-0"
                style={{
                  backgroundColor: opticalVars['--glass-nav-active-bg'],
                  backgroundImage:
                    'linear-gradient(135deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.02) 52%, rgba(255, 255, 255, 0.04) 100%)',
                  boxShadow: opticalVars['--glass-nav-active-shadow'],
                  borderTop: '1px solid rgba(255, 255, 255, 0.22)',
                  borderLeft: '1px solid rgba(255, 255, 255, 0.14)',
                  borderRight: '1px solid rgba(255, 255, 255, 0.06)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                  {t('icon_desktop_windows', 'desktop_windows')}
                </span>
                <span
                  className="font-black capitalize tracking-[0.14em] text-[var(--sidebartext)] truncate"
                  style={{ fontSize: currentTheme.fontSizeSidebar || '10px' }}
                >
                  {t('nav_dashboard', 'Command Center')}
                </span>
              </div>

              {/* Inactive NavButton (Your Vault) matching Sidebar.tsx lines 40-67 */}
              <div className="px-2.5 py-2 rounded-xl flex items-center gap-2 opacity-65 min-w-0">
                <span className="material-symbols-outlined !text-[16px] text-[var(--sidebartext)] shrink-0">
                  {t('icon_account_balance', 'account_balance')}
                </span>
                <span
                  className="font-black capitalize tracking-[0.14em] text-[var(--sidebartext)] truncate"
                  style={{ fontSize: currentTheme.fontSizeSidebar || '10px' }}
                >
                  {t('nav_vault', 'Your Vault')}
                </span>
              </div>
            </div>

            {/* Quick Launch Button matching Sidebar.tsx lines 655-680 */}
            <div
              data-sandbox-glass="surface"
              className="relative px-3 py-2 rounded-xl font-black capitalize tracking-[0.16em] flex items-center justify-center gap-2 shrink-0 overflow-hidden"
              style={{
                ...surfaceBorderStyle,
                borderRadius: `max(0px, calc((${currentTheme.radius || '1.25rem'}) * 0.65))`,
                borderColor: `color-mix(in srgb, ${currentTheme.success || '#10b981'} 55%, rgba(255, 255, 255, 0.32))`,
                color: currentTheme.success || '#10b981',
                fontSize: currentTheme.fontSizeSidebar || '10px',
              }}
            >
              <div
                className="absolute inset-0 rounded-[inherit] pointer-events-none opacity-85"
                style={{
                  background: `linear-gradient(135deg, color-mix(in srgb, ${currentTheme.success || '#10b981'} 18%, rgba(255, 255, 255, 0.06)) 0%, color-mix(in srgb, ${currentTheme.success || '#10b981'} 5%, transparent) 55%, transparent 100%)`,
                }}
              />
              <span className="relative z-10 material-symbols-outlined !text-[15px] leading-none">
                {t('icon_rocket_launch', 'rocket_launch')}
              </span>
              <span className="relative z-10">
                {t('sidebar_quick_launch', 'Quick Launch')}
              </span>
            </div>
          </div>

          {/* Row 4: Live Dynamic Nexus Preview Card Specimen */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                {t('chameleon_dynamic_preview_badge', 'Nexus Card Preview')}
              </span>
              <span
                data-sandbox-glass="surface"
                style={chipBorderStyle}
                className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0"
              >
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t('icon_auto_awesome', 'auto_awesome')}
                </span>
                <span>
                  {currentTheme.previewImage
                    ? t('forge_preview_custom_mode', 'Custom Banner')
                    : t('forge_preview_dynamic_mode', 'Auto-Generated')}
                </span>
              </span>
            </div>
            <div className="rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-xl">
              <DynamicThemePreviewBanner
                data={currentTheme}
                heightClass="h-28"
                insetTopClass="top-3"
              />
            </div>
          </div>

          {/* Row 5: Semantic Status Badges (Matches Sanctuary OS VAULT_CHIP_CLASS Status Chips) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
              {t('forge_semantic', 'Semantic Status Badges')}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  key: 'success' as const,
                  icon: t('icon_verified', 'verified'),
                  label: t('verified', 'Verified'),
                  color: currentTheme.success || '#10b981',
                },
                {
                  key: 'warning' as const,
                  icon: t('icon_warning', 'warning'),
                  label: t('label_unstable', 'Unstable'),
                  color: currentTheme.warning || '#f59e0b',
                },
                {
                  key: 'danger' as const,
                  icon: t('icon_error', 'error'),
                  label: t('status_corrupted', 'Broken'),
                  color: currentTheme.danger || '#f43f5e',
                },
              ].map((badge) => (
                <div
                  key={badge.key}
                  data-sandbox-glass="surface"
                  style={chipBorderStyle}
                  className="px-2.5 py-1.5 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--text)] overflow-hidden"
                >
                  <span
                    className="material-symbols-outlined !text-[12px] shrink-0"
                    style={{ color: badge.color }}
                  >
                    {badge.icon}
                  </span>
                  <span className="truncate">{badge.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
