import React, { useEffect, useRef, useState } from 'react';
import { useLexicon } from '../LexiconContext';
import { computeGlassOpticalVars } from '../ThemeContext';
import { VAULT_CHIP_CLASS } from '../shared';
import {
  SHADER_REV,
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
  embedded?: boolean;
}

const MAX_SANDBOX_INSTANCES = 64;
const FLOATS_PER_INSTANCE = 12;

export function ChameleonSandboxPreview({
  currentTheme,
  embedded = false,
}: ChameleonSandboxPreviewProps) {
  const { t } = useLexicon();
  const opticalVars = computeGlassOpticalVars(currentTheme);

  const sandboxRootRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeRef = useRef<any>(currentTheme);
  themeRef.current = currentTheme;

  const rebuildTexturesRef = useRef<(() => void) | null>(null);
  const scheduleRenderRef = useRef<(() => void) | null>(null);
  const [mobilePane, setMobilePane] = useState<'controls' | 'preview'>('controls');
  const [previewView, setPreviewView] = useState<'workspace' | 'card'>('workspace');
  const [bgImgFailed, setBgImgFailed] = useState(false);

  useEffect(() => {
    setBgImgFailed(false);
  }, [currentTheme.bgImage]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      scheduleRenderRef.current?.();
    });
    return () => cancelAnimationFrame(id);
  }, [previewView]);

  useEffect(() => {
    if (embedded) return;
    const handlePaneSwitch = (e: Event) => {
      const next = (e as CustomEvent<'controls' | 'preview'>).detail;
      if (next === 'controls' || next === 'preview') {
        setMobilePane(next);
        if (next === 'preview') {
          requestAnimationFrame(() => {
            rebuildTexturesRef.current?.();
            scheduleRenderRef.current?.();
          });
        }
      }
    };
    window.addEventListener('sanctuary-chameleon-mobile-pane', handlePaneSwitch);
    return () => window.removeEventListener('sanctuary-chameleon-mobile-pane', handlePaneSwitch);
  }, [embedded]);

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
    const glassUniformAccent = gl.getUniformLocation(glassProg, 'u_accentRgb');
    const glassUniformIsLight = gl.getUniformLocation(glassProg, 'u_isLight');
    const glassUniformSpecScale = gl.getUniformLocation(glassProg, 'u_specScale');
    const glassUniformRefractScale = gl.getUniformLocation(glassProg, 'u_refractScale');
    const glassUniformBezelScale = gl.getUniformLocation(glassProg, 'u_bezelScale');
    const glassUniformShadowScale = gl.getUniformLocation(glassProg, 'u_shadowScale');
    const glassUniformIsPassthrough = gl.getUniformLocation(glassProg, 'u_isPassthrough');
    const glassUniformMobileDockFade = gl.getUniformLocation(glassProg, 'u_mobileDockFade');

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

      const th = themeRef.current || {};
      const isPassthrough =
        !th.bgImage && (th.bg === 'transparent' || Boolean(th.transparentWindow));

      // 1. Draw sharp wallpaper across sandbox viewport (or clear to transparent for Desktop Passthrough)
      gl.viewport(0, 0, targetW, targetH);
      gl.disable(gl.BLEND);
      if (isPassthrough) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      } else {
        gl.useProgram(bgProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sharpTex);
        gl.uniform1i(bgUniformSharp, 0);
        gl.bindVertexArray(bgVao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // 2. Collect sandbox glass specimens in layer order (panels/nav first, nested surfaces second)
      const {
        rawOpacity,
        specScale,
        refractScale,
        bezelScale,
        shadowScale,
        isLight,
        tintRgb,
        accentRgb,
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
        gl.uniform3f(glassUniformAccent, accentRgb[0], accentRgb[1], accentRgb[2]);
        gl.uniform1f(glassUniformIsLight, isLight);
        gl.uniform1f(glassUniformSpecScale, specScale);
        gl.uniform1f(glassUniformRefractScale, refractScale);
        gl.uniform1f(glassUniformBezelScale, bezelScale);
        gl.uniform1f(glassUniformShadowScale, shadowScale);
        gl.uniform1f(glassUniformIsPassthrough, isPassthrough ? 1.0 : 0.0);
        gl.uniform2f(glassUniformMobileDockFade, 99999.0, 99999.0);

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
        ? Math.max(80, Math.min(130, Math.round(104 * (parsedSat / 185))))
        : Math.max(85, Math.min(165, Math.round(115 * (parsedSat / 185))));

      const uploadFromSourceCanvas = (srcCanvas: HTMLCanvasElement) => {
        if (disposed) return;
        gl.bindTexture(gl.TEXTURE_2D, sharpTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);

        const bw = 720;
        const bh = Math.max(360, Math.round(bw / targetAspect));
        const blurPx = rawBlur <= 0
          ? 0
          : isLightTheme
            ? Math.max(3, Math.min(12, Math.round(rawBlur * 0.24)))
            : Math.max(3, Math.min(14, Math.round(rawBlur * 0.26)));
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

          const blurBright = isLightTheme ? '1.03' : '0.98';
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

          const hasOrbs =
            Boolean(th.ambientOrb) ||
            (Array.isArray(th.volumetricOrbs) && th.volumetricOrbs.length > 0) ||
            th.bg === 'transparent' ||
            Boolean(th.transparentWindow);

          if (hasOrbs) {
            const orbs =
              Array.isArray(th.volumetricOrbs) && th.volumetricOrbs.length > 0
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
          }
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
  }, [SHADER_REV]);

  // Rebuild sandbox wallpaper & Gaussian blur textures when wallpaper, blur, or saturation changes
  useEffect(() => {
    rebuildTexturesRef.current?.();
  }, [
    currentTheme.bgImage,
    currentTheme.bg,
    currentTheme.transparentWindow,
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
    currentTheme.textCase,
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

  const displayBezelPct = toPct(currentTheme.glassBezel, 100);
  const displayOpacityPct = toPct(currentTheme.glassOpacity, 14);
  const displayRefractPct = toPct(currentTheme.glassRefraction, 100);
  const displaySpecPct = toPct(currentTheme.glassSpecular, 26);
  const parsedBlurVal = parseInt(String(currentTheme.glassBlur ?? '36'), 10);
  const displayBlurPx = isNaN(parsedBlurVal) ? 36 : parsedBlurVal;

  const isPassthrough =
    !currentTheme.bgImage &&
    (currentTheme.bg === 'transparent' || Boolean(currentTheme.transparentWindow));

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
    <div
      className={
        embedded
          ? 'w-full h-[540px] shrink-0 flex flex-col overflow-hidden'
          : `${mobilePane === 'preview' ? 'flex' : 'hidden lg:flex'} w-full lg:w-[450px] xl:w-[490px] shrink-0 h-full min-h-0 p-3.5 sm:p-4 flex-col gap-3 overflow-hidden`
      }
    >
      {!embedded && (
        <div className="glass-panel px-3.5 py-2.5 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
              <span className="material-symbols-outlined !text-[16px]">
                {t('icon_visibility', 'visibility')}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-black text-[var(--text)] leading-tight truncate">
                {currentTheme.name || t('btn_preview_theme', 'Preview')}
              </span>
              <span className="text-[9.5px] font-mono font-bold text-[var(--subtext)] opacity-80 leading-tight truncate">
                {`${displayOpacityPct}% · ${displayBlurPx}px · ${displayRefractPct}%`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setPreviewView('workspace')}
              className={`${VAULT_CHIP_CLASS} ${
                previewView === 'workspace' ? 'sa-glass-pill-active' : 'hover:sa-glass-pill-active'
              } transition-all cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t('icon_desktop_windows', 'desktop_windows')}
              </span>
              <span>{t('tab_workspace', 'Workspace')}</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewView('card')}
              className={`${VAULT_CHIP_CLASS} ${
                previewView === 'card' ? 'sa-glass-pill-active' : 'hover:sa-glass-pill-active'
              } transition-all cursor-pointer`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t('icon_style', 'style')}
              </span>
              <span>{t('chameleon_dynamic_preview_badge', 'Card')}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('sanctuary-chameleon-mobile-pane', { detail: 'controls' })
                )
              }
              className={`lg:hidden ${VAULT_CHIP_CLASS} hover:sa-glass-pill-active transition-all cursor-pointer shrink-0`}
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t('icon_tune', 'tune')}
              </span>
              <span>{t('edit', 'Edit')}</span>
            </button>
          </div>
        </div>
      )}
      <div
        ref={sandboxRootRef}
        data-sandbox-preview-root="true"
        data-text-case={currentTheme.textCase || 'capitalize'}
        className="w-full flex-1 min-h-0 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-2xl relative flex flex-col overflow-hidden"
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
          '--textCase': currentTheme.textCase || 'capitalize',
          '--fontFamily': currentTheme.fontFamily || 'Inter, sans-serif',
          '--bgGradient':
            currentTheme.bgGradient && currentTheme.bgGradient !== 'transparent'
              ? currentTheme.bgGradient
              : currentTheme.bg,
          ...opticalVars,
          backgroundColor: isPassthrough ? 'transparent' : currentTheme.bg || '#060b14',
          fontFamily: currentTheme.fontFamily || 'Inter, sans-serif',
        } as React.CSSProperties}
      >
        {/* Fallback Backdrop while WebGL2 Initializes (or Desktop Passthrough grid cue) */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          {currentTheme.bgImage && !bgImgFailed ? (
            <img
              src={currentTheme.bgImage}
              alt=""
              draggable={false}
              onError={() => setBgImgFailed(true)}
              className="absolute inset-0 w-full h-full object-cover object-center opacity-100 select-none"
            />
          ) : isPassthrough ? (
            <div
              className="absolute inset-0 w-full h-full opacity-95"
              style={{
                backgroundColor: 'rgba(6, 11, 20, 0.25)',
                backgroundImage:
                  'radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.16) 0%, transparent 55%), radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.12) 0%, transparent 55%), linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.03) 75%, rgba(255,255,255,0.03)), linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.03) 75%, rgba(255,255,255,0.03))',
                backgroundPosition: '0 0, 0 0, 0 0, 12px 12px',
                backgroundSize: '100% 100%, 100% 100%, 24px 24px, 24px 24px',
              }}
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
          className="relative z-10 flex-1 min-h-full flex flex-col justify-between p-4 sm:p-5 gap-3.5 overflow-y-auto custom-scrollbar"
        >
          {previewView === 'workspace' ? (
            <>
              {/* Row 0: Public ViewHeader & Upper-Right Segmented TitleBar Capsule */}
              <div className="flex items-center justify-between gap-2.5 shrink-0">
                <div
                  data-sandbox-glass="panel"
                  style={panelBorderStyle}
                  className="px-3 py-2 flex items-center gap-2.5 min-w-0"
                >
                  <div
                    data-sandbox-glass="surface"
                    style={surfaceBorderStyle}
                    className="w-8 h-8 flex items-center justify-center shrink-0 text-[var(--accent)]"
                  >
                    <span className="material-symbols-outlined !text-[16px]">
                      {t('icon_desktop_windows', 'desktop_windows')}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h1
                        className="leading-tight whitespace-nowrap truncate"
                        style={{
                          fontSize: '0.88rem',
                          color: currentTheme.headerText || currentTheme.text,
                          fontWeight: 900,
                        }}
                      >
                        {t('nav_dashboard', 'Command Center')}
                      </h1>
                      {isPassthrough && (
                        <span
                          data-sandbox-glass="surface"
                          style={chipBorderStyle}
                          className="px-1.5 py-0.5 text-[7.5px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1 shrink-0"
                        >
                          <span
                            className="material-symbols-outlined !text-[10px]"
                            style={{ color: currentTheme.accent || '#38bdf8' }}
                          >
                            {t('icon_desktop_windows', 'desktop_windows')}
                          </span>
                          {t('forge_wp_desktop_passthrough', 'Desktop Passthrough')}
                        </span>
                      )}
                    </div>
                    <p
                      className="leading-snug truncate"
                      style={{
                        fontSize: '0.62rem',
                        color: currentTheme.subtext,
                        opacity: 0.85,
                      }}
                    >
                      {t('overview', 'Overview')}
                    </p>
                  </div>
                </div>

                {/* Miniature Upper-Right Segmented TitleBar Capsule */}
                <div
                  data-sandbox-glass="panel"
                  style={panelBorderStyle}
                  className="h-9 px-2.5 flex items-center gap-2 shrink-0"
                >
                  <div className="flex items-center gap-1.5 pr-2 border-r border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                    <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                      {t('icon_sports_esports', 'sports_esports')}
                    </span>
                    <div className="flex flex-col leading-none">
                      <span className="text-[6px] font-black uppercase tracking-wider text-[var(--accent)]">
                        {t('tab_workspace', 'Workspace')}
                      </span>
                      <span className="text-[9px] font-black text-[var(--text)] whitespace-nowrap">
                        {t('theme_name_sims4', 'The Sims 4')}
                      </span>
                    </div>
                  </div>
                  <span
                    className="flex items-center gap-0.5 text-[9px] font-black"
                    style={{ color: currentTheme.success || '#10b981' }}
                  >
                    <span className="material-symbols-outlined !text-[12px]">
                      {t('icon_layers', 'layers')}
                    </span>
                    <span>2</span>
                  </span>
                  <span className="flex items-center gap-0.5 text-[9px] font-black text-[var(--accent)]">
                    <span className="material-symbols-outlined !text-[12px]">
                      {t('icon_notifications', 'notifications')}
                    </span>
                    <span>2</span>
                  </span>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--text)] opacity-75">
                    {t('icon_terminal', 'terminal')}
                  </span>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--text)] opacity-75">
                    {t('icon_settings', 'settings')}
                  </span>
                </div>
              </div>

              {/* Row 1: 2-Column StatTile Specimen (Spacious, Zero Truncation) */}
              <div className="grid grid-cols-2 gap-3 shrink-0">
                <div
                  data-sandbox-glass="panel"
                  style={panelBorderStyle}
                  className="p-3 flex items-center gap-3 overflow-hidden"
                >
                  <div
                    data-sandbox-glass="surface"
                    style={surfaceBorderStyle}
                    className="w-9 h-9 flex items-center justify-center shrink-0"
                  >
                    <span className="material-symbols-outlined !text-[17px] text-[var(--text)]">
                      {t('icon_account_balance', 'account_balance')}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[8.5px] font-black uppercase tracking-widest text-[var(--subtext)] leading-tight truncate">
                      {t('nav_vault', 'Your Vault')}
                    </span>
                    <span className="text-lg font-black text-[var(--text)] leading-tight">3,075</span>
                  </div>
                </div>

                <div
                  data-sandbox-glass="panel"
                  style={panelBorderStyle}
                  className="p-3 flex items-center gap-3 overflow-hidden"
                >
                  <div
                    data-sandbox-glass="surface"
                    style={surfaceBorderStyle}
                    className="w-9 h-9 flex items-center justify-center shrink-0"
                  >
                    <span className="material-symbols-outlined !text-[17px] text-[var(--accent)]">
                      {t('icon_hub', 'hub')}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[8.5px] font-black uppercase tracking-widest text-[var(--subtext)] leading-tight truncate">
                      {t('nav_nexus', 'The Nexus')}
                    </span>
                    <span className="text-lg font-black text-[var(--accent)] leading-tight">2,990</span>
                  </div>
                </div>
              </div>

              {/* Row 2: Public Sidebar Navigation & Quick Launch Specimen */}
              <div
                data-sandbox-glass="nav"
                style={panelBorderStyle}
                className="p-3 flex flex-col gap-2.5 shrink-0"
              >
                <div className="grid grid-cols-2 gap-2">
                  {/* Active NavButton (Command Center) */}
                  <div
                    className="px-3 py-2 rounded-xl flex items-center gap-2 min-w-0"
                    style={{
                      backgroundColor: opticalVars['--glass-nav-active-bg'],
                      backgroundImage:
                        'linear-gradient(135deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.03) 52%, rgba(255, 255, 255, 0.05) 100%)',
                      boxShadow: opticalVars['--glass-nav-active-shadow'],
                      borderTop: '1px solid rgba(255, 255, 255, 0.28)',
                      borderLeft: '1px solid rgba(255, 255, 255, 0.18)',
                      borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                      {t('icon_desktop_windows', 'desktop_windows')}
                    </span>
                    <span
                      className="font-black capitalize tracking-[0.08em] text-[var(--sidebartext)] leading-tight truncate"
                      style={{ fontSize: currentTheme.fontSizeSidebar || '10px' }}
                    >
                      {t('nav_dashboard', 'Command Center')}
                    </span>
                  </div>

                  {/* Inactive Public NavButton (Your Vault) */}
                  <div className="px-3 py-2 rounded-xl flex items-center gap-2 opacity-75 min-w-0">
                    <span className="material-symbols-outlined !text-[15px] text-[var(--sidebartext)] shrink-0">
                      {t('icon_account_balance', 'account_balance')}
                    </span>
                    <span
                      className="font-black capitalize tracking-[0.08em] text-[var(--sidebartext)] leading-tight truncate"
                      style={{ fontSize: currentTheme.fontSizeSidebar || '10px' }}
                    >
                      {t('nav_vault', 'Your Vault')}
                    </span>
                  </div>

                  {/* Inactive Public NavButton (The Nexus) */}
                  <div className="px-3 py-2 rounded-xl flex items-center gap-2 opacity-70 min-w-0">
                    <span className="material-symbols-outlined !text-[15px] text-[var(--sidebartext)] shrink-0">
                      {t('icon_hub', 'hub')}
                    </span>
                    <span
                      className="font-black capitalize tracking-[0.08em] text-[var(--sidebartext)] leading-tight truncate"
                      style={{ fontSize: currentTheme.fontSizeSidebar || '10px' }}
                    >
                      {t('nav_nexus', 'The Nexus')}
                    </span>
                  </div>

                  {/* Inactive Public NavButton (Blueprints) */}
                  <div className="px-3 py-2 rounded-xl flex items-center gap-2 opacity-65 min-w-0">
                    <span className="material-symbols-outlined !text-[15px] text-[var(--sidebartext)] shrink-0">
                      {t('icon_map', 'map')}
                    </span>
                    <span
                      className="font-black capitalize tracking-[0.08em] text-[var(--sidebartext)] leading-tight truncate"
                      style={{ fontSize: currentTheme.fontSizeSidebar || '10px' }}
                    >
                      {t('nav_blueprints', 'Blueprints')}
                    </span>
                  </div>
                </div>

                {/* Quick Launch Bar */}
                <div
                  data-sandbox-glass="surface"
                  className="relative px-3.5 py-2 rounded-xl font-black capitalize tracking-[0.16em] flex items-center justify-center gap-2 overflow-hidden"
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

              {/* Row 3: 2-Column Public Sanctuary Cards Specimen (Vault / Nexus Cards) */}
              <div className="grid grid-cols-2 gap-3 shrink-0">
                {[
                  {
                    title: t('nav_vault', 'Your Vault'),
                    author: t('term_mason', 'Mason'),
                    icon: t('icon_extension', 'extension'),
                    badgeIcon: t('icon_verified', 'verified'),
                    badgeLabel: t('verified', 'Verified'),
                    badgeColor: currentTheme.success || '#10b981',
                    catIcon: t('icon_code', 'code'),
                    catLabel: t('filter_script', 'Script'),
                    actionIcon: t('icon_download', 'download'),
                    actionLabel: t('btn_install', 'Install'),
                  },
                  {
                    title: t('nav_blueprints', 'Blueprints'),
                    author: t('term_citizen', 'Citizen'),
                    icon: t('icon_map', 'map'),
                    badgeIcon: t('icon_cloud_done', 'cloud_done'),
                    badgeLabel: t('synced_badge', 'Synced'),
                    badgeColor: currentTheme.success || '#10b981',
                    catIcon: t('icon_extension', 'extension'),
                    catLabel: t('filter_package', 'Package'),
                    actionIcon: t('icon_visibility', 'visibility'),
                    actionLabel: t('btn_preview_theme', 'Preview'),
                  },
                ].map((card, cIdx) => (
                  <div
                    key={cIdx}
                    data-sandbox-glass="panel"
                    style={panelBorderStyle}
                    className="p-3.5 flex flex-col justify-between gap-3 overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        data-sandbox-glass="surface"
                        style={surfaceBorderStyle}
                        className="w-9 h-9 flex items-center justify-center shrink-0"
                      >
                        <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                          {card.icon}
                        </span>
                      </div>
                      <span
                        data-sandbox-glass="surface"
                        style={chipBorderStyle}
                        className="px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1 shrink-0"
                      >
                        <span
                          className="material-symbols-outlined !text-[11px]"
                          style={{ color: card.badgeColor }}
                        >
                          {card.badgeIcon}
                        </span>
                        <span>{card.badgeLabel}</span>
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span
                        className="font-black text-[var(--text)] leading-tight truncate"
                        style={{ fontSize: currentTheme.fontSizeText || '0.9rem' }}
                      >
                        {card.title}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--subtext)] truncate">
                        {card.author}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span
                        data-sandbox-glass="surface"
                        style={chipBorderStyle}
                        className="px-2 py-1 text-[8px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                          {card.catIcon}
                        </span>
                        <span>{card.catLabel}</span>
                      </span>

                      <span
                        data-sandbox-glass="surface"
                        style={chipBorderStyle}
                        className="px-2.5 py-1 text-[8.5px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                          {card.actionIcon}
                        </span>
                        <span>{card.actionLabel}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Row 4: Semantic Status Badges (Transparent Background per Sanctuary Design Rules) */}
              <div className="grid grid-cols-3 gap-2.5 shrink-0">
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
                    className="px-2.5 py-2 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--text)] overflow-hidden"
                  >
                    <span
                      className="material-symbols-outlined !text-[12px] shrink-0"
                      style={{ color: badge.color }}
                    >
                      {badge.icon}
                    </span>
                    <span className="leading-none">{badge.label}</span>
                  </div>
                ))}
              </div>

              {/* Row 5: Bottom-Right Sculpted Status Toast Specimen */}
              <div className="pt-0.5 flex justify-end shrink-0">
                <div
                  data-sandbox-glass="panel"
                  style={panelBorderStyle}
                  className="px-3 py-2 flex items-center gap-2.5 max-w-[85%]"
                >
                  <div
                    data-sandbox-glass="surface"
                    style={surfaceBorderStyle}
                    className="w-7 h-7 flex items-center justify-center shrink-0"
                  >
                    <span
                      className="material-symbols-outlined !text-[14px]"
                      style={{ color: currentTheme.success || '#10b981' }}
                    >
                      {t('icon_check_circle', 'check_circle')}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-[7px] font-black uppercase tracking-widest leading-none"
                      style={{ color: currentTheme.success || '#10b981' }}
                    >
                      {t('stat_system_stable', 'System Stable')}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--text)] leading-tight truncate mt-0.5">
                      {t('status_synced', 'Synced')}
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4 my-auto">
              {/* Nexus Marketplace Card Specimen */}
              <div
                data-sandbox-glass="panel"
                style={panelBorderStyle}
                className="overflow-hidden flex flex-col"
              >
                <div className="relative">
                  <DynamicThemePreviewBanner
                    data={currentTheme}
                    heightClass="h-44"
                    insetTopClass="top-3"
                    expanded
                  />
                </div>
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col min-w-0">
                      <span className="text-base font-black text-[var(--text)] leading-tight truncate">
                        {currentTheme.name || t('market_untitled', 'Untitled')}
                      </span>
                      <span className="text-[11px] font-bold text-[var(--subtext)] truncate mt-0.5">
                        {t('term_chameleon', 'Chameleon')}
                      </span>
                    </div>
                    <span
                      data-sandbox-glass="surface"
                      style={chipBorderStyle}
                      className="px-2.5 py-1 text-[8.5px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0"
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

                  {/* Color Swatch Strip */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <div className="flex items-center gap-1.5">
                      {[
                        currentTheme.bg || '#040812',
                        currentTheme.panelTint || '#060d1f',
                        currentTheme.accent || '#38bdf8',
                        currentTheme.text || '#f8fafc',
                        currentTheme.subtext || '#94a3b8',
                        currentTheme.success || '#10b981',
                        currentTheme.warning || '#f59e0b',
                        currentTheme.danger || '#ef4444',
                      ].map((hex, idx) => (
                        <span
                          key={idx}
                          className="w-4 h-4 rounded-full border border-white/25 shadow-sm"
                          style={{ backgroundColor: hex === 'transparent' ? '#040812' : hex }}
                        />
                      ))}
                    </div>
                    <span className="text-[9.5px] font-mono font-bold text-[var(--accent)]">
                      {String(currentTheme.accent || '#38bdf8').toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Optical Spec Sheet */}
              <div
                data-sandbox-glass="panel"
                style={panelBorderStyle}
                className="p-4 grid grid-cols-2 gap-3"
              >
                {[
                  {
                    label: t('forge_glass_opacity', 'Glass Opacity'),
                    val: `${displayOpacityPct}%`,
                  },
                  {
                    label: t('forge_glass_blur', 'Refractive Blur'),
                    val: `${displayBlurPx}px`,
                  },
                  {
                    label: t('forge_glass_refraction', "Snell's Refraction"),
                    val: `${displayRefractPct}%`,
                  },
                  {
                    label: t('forge_glass_specular', 'Specular Glare'),
                    val: `${displaySpecPct}%`,
                  },
                  {
                    label: t('forge_glass_bezel', 'Meniscus Lip Width'),
                    val: `${displayBezelPct}%`,
                  },
                  {
                    label: t('forge_radius', 'Corner Radius'),
                    val: currentTheme.radius || '1.25rem',
                  },
                ].map((spec, idx) => (
                  <div
                    key={idx}
                    data-sandbox-glass="surface"
                    style={surfaceBorderStyle}
                    className="px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] truncate">
                      {spec.label}
                    </span>
                    <span className="text-[10px] font-mono font-black text-[var(--accent)] shrink-0">
                      {spec.val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
