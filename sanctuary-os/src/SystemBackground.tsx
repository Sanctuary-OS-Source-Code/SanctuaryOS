import React, { useEffect, useRef } from 'react';
import { useTheme } from './ThemeContext';

export const VERTEX_SHADER_BG = `#version 300 es
precision highp float;
const vec2 POS[4] = vec2[4](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2(-1.0,  1.0),
  vec2( 1.0,  1.0)
);
out vec2 v_uv;
void main() {
  vec2 p = POS[gl_VertexID];
  v_uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER_BG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_sharpTex;
out vec4 outColor;
void main() {
  outColor = texture(u_sharpTex, v_uv);
}
`;

export const VERTEX_SHADER_GLASS = `#version 300 es
precision highp float;

const vec2 UNIT_QUAD[4] = vec2[4](
  vec2(0.0, 0.0),
  vec2(1.0, 0.0),
  vec2(0.0, 1.0),
  vec2(1.0, 1.0)
);

layout(location = 0) in vec4 a_rect; // x, y, w, h in CSS px
layout(location = 1) in vec4 a_clip; // clipLeft, clipTop, clipRight, clipBottom in CSS px
layout(location = 2) in vec4 a_meta; // radiusPx, glassKind (0=panel,1=chrome/drawer,2=surface), opacityScale, elevation

uniform vec2 u_viewport; // vw, vh in CSS px

out vec2 v_fragPx;
flat out vec4 v_rect;
flat out vec4 v_clip;
flat out vec4 v_meta;

void main() {
  vec2 unit = UNIT_QUAD[gl_VertexID];
  // Pad quad by 2px so anti-aliased SDF edges never clip
  vec2 posPx = (a_rect.xy - 2.0) + unit * (a_rect.zw + 4.0);
  v_fragPx = posPx;
  v_rect = a_rect;
  v_clip = a_clip;
  v_meta = a_meta;

  vec2 ndc = vec2(
    (posPx.x / u_viewport.x) * 2.0 - 1.0,
    1.0 - (posPx.y / u_viewport.y) * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

export const SHADER_REV = 'webgl_glass_v39';

export const FRAGMENT_SHADER_GLASS = `#version 300 es
precision highp float;

in vec2 v_fragPx;
flat in vec4 v_rect;
flat in vec4 v_clip;
flat in vec4 v_meta;

uniform sampler2D u_sharpTex;
uniform sampler2D u_blurTex;
uniform vec2 u_viewport;
uniform vec3 u_tintRgb;
uniform vec3 u_accentRgb;
uniform float u_isLight;
uniform float u_specScale;
uniform float u_refractScale;
uniform float u_bezelScale;
uniform float u_shadowScale;
uniform float u_isPassthrough;

out vec4 outColor;

void main() {
  // 1. Scroll / container clip check
  if (
    v_fragPx.x < v_clip.x ||
    v_fragPx.y < v_clip.y ||
    v_fragPx.x > v_clip.z ||
    v_fragPx.y > v_clip.w
  ) {
    discard;
  }

  float glassKind = v_meta.y; // 0.0 = panel, 1.0 = sidebar/drawer/dock, 2.0 = nested surface
  float isSideDrawer = v_meta.w; // 2.0 = SidePanel drawer
  if (isSideDrawer > 1.5 && v_fragPx.x > v_rect.x + v_rect.z) {
    discard;
  }

  // 2. Signed Distance Field (sdRoundedBox) & Analytical 2D Surface Normal
  // For right-anchored SidePanel drawers (isSideDrawer > 1.5), extend the SDF box past the right window edge
  // so only the left corners are rounded by the theme radius (--radius) while the right edge and right corners stay 0px flush.
  vec4 effRect = (isSideDrawer > 1.5) ? vec4(v_rect.xy, v_rect.z + 96.0, v_rect.w) : v_rect;
  vec2 halfSize = effRect.zw * 0.5;
  vec2 center = effRect.xy + halfSize;
  vec2 rel = v_fragPx - center;
  vec2 panelHalfSize = v_rect.zw * 0.5;
  vec2 panelRel = v_fragPx - (v_rect.xy + panelHalfSize);
  float r = clamp(v_meta.x, 0.0, min(panelHalfSize.x, panelHalfSize.y));

  vec2 innerHalf = max(halfSize - vec2(r), vec2(0.0));
  vec2 q = abs(rel) - innerHalf;
  float outsideLen = length(max(q, 0.0));
  float insideDist = min(max(q.x, q.y), 0.0);
  float d = outsideLen + insideDist - r;

  if (d > 0.75) {
    discard;
  }

  float edgeAlpha = smoothstep(0.65, -0.65, d);
  float distFromEdge = max(0.0, -d);

  // Outward unit normal vector around edges and rounded corners
  vec2 s = sign(rel);
  vec2 grad;
  if (q.x > 0.0 && q.y > 0.0) {
    grad = q / max(outsideLen, 0.0001);
  } else if (q.x > q.y) {
    grad = vec2(1.0, 0.0);
  } else {
    grad = vec2(0.0, 1.0);
  }
  vec2 normal2D = normalize(s * grad + vec2(0.00001));

  // 3. True 3D Liquid Glass Lens & Meniscus Profile
  float minDim = min(panelHalfSize.x, panelHalfSize.y);
  float compactFactor = smoothstep(14.0, 36.0, minDim);
  float isLargeSlab = (isSideDrawer > 1.5 || (glassKind > 0.5 && glassKind < 1.5 && minDim > 80.0)) ? 1.0 : 0.0;
  float rawBezel = (glassKind > 1.5)
    ? clamp(minDim * 0.34, 5.0, 12.0)
    : (isLargeSlab > 0.5)
      ? clamp(minDim * 0.28, 16.0, 38.0)
      : clamp(minDim * 0.36, 12.0, 26.0);
  float bezelWidth = clamp(rawBezel * u_bezelScale, 4.0, max(4.5, minDim * 0.78));

  float normY = clamp((panelRel.y / max(1.0, panelHalfSize.y)) * 0.5 + 0.5, 0.0, 1.0);
  float normX = clamp((panelRel.x / max(1.0, panelHalfSize.x)) * 0.5 + 0.5, 0.0, 1.0);
  float diagCoord = clamp(normX * 0.44 + normY * 0.56, 0.0, 1.0);

  // Normalized position inside the curved perimeter meniscus (0 = flat interior, 1 = outer edge)
  float t = clamp(1.0 - distFromEdge / bezelWidth, 0.0, 1.0);
  float rimSlope = pow(t, 1.85);
  float outerLip = pow(t, 4.2);

  // 4. Strong Physical Snell's Law Lens Refraction (Visible Background Bending Around Rounded Corners)
  float refractAmp = ((glassKind > 1.5) ? 16.0 : (isLargeSlab > 0.5 ? 42.0 : 34.0)) * (0.35 + 0.65 * compactFactor) * u_refractScale;
  float bodyMag = ((glassKind > 1.5) ? 0.012 : 0.022) * (0.40 + 0.60 * compactFactor) * u_refractScale;
  vec2 lensOffsetPx = -normal2D * (rimSlope * refractAmp - outerLip * (refractAmp * 0.24)) - panelRel * bodyMag;

  vec2 baseUV = v_fragPx / u_viewport;
  vec2 dispUV = lensOffsetPx / u_viewport;
  vec2 uvRefract = clamp(baseUV + dispUV, 0.001, 0.999);

  vec3 blurCol = texture(u_blurTex, uvRefract).rgb;
  vec3 sharpCol = texture(u_sharpTex, uvRefract).rgb;

  // Interior has a delicate silky optical frost (blurCol); curved perimeter meniscus transitions smoothly
  // into 100% crystal-clear refracted glass (sharpCol) so background shapes visibly bend around the edges
  float rimClarity = smoothstep(0.04, 0.78, rimSlope) * (u_isLight > 0.5 ? 0.90 : 0.86) * (0.35 + 0.65 * compactFactor);
  vec3 refractedCol = mix(blurCol, sharpCol, rimClarity);

  // 5. Ultra-Sheer Liquid Glass Transmittance (See-Through Optical Crystal, Never Flat Opaque Paint)
  float opScale = clamp(v_meta.z, 0.04, 0.72);
  vec3 crystalCol;

  if (u_isLight > 0.5) {
    // Light Theme: Pure Water-Droplet / Clear Quartz Lens (84%–96% transparent refracted backdrop)
    float lightReadability = (isSideDrawer > 1.5)
      ? clamp(0.12 + opScale * 0.22, 0.11, 0.26)
      : (glassKind > 0.5 && glassKind < 1.5)
        ? clamp(0.10 + opScale * 0.20, 0.09, 0.22)
        : (glassKind > 1.5)
          ? clamp(0.06 + opScale * 0.14, 0.05, 0.16)
          : clamp(0.08 + opScale * 0.18, 0.07, 0.20);

    // Meniscus rim is nearly 100% clear water-droplet refraction; body blends subtle quartz tint instead of chalky white
    float bodyMix = lightReadability * (1.0 - rimSlope * 0.88);
    vec3 lightBodyTone = mix(vec3(0.94, 0.96, 0.99), u_tintRgb, 0.65);
    crystalCol = mix(refractedCol, lightBodyTone, clamp(bodyMix, 0.0, 0.34));

    // Glossy diagonal glass reflection across the top-left dome
    float glassReflection = pow(clamp(1.0 - diagCoord, 0.0, 1.0), 3.0) * (glassKind > 1.5 ? 0.12 : 0.18) * u_specScale;
    crystalCol = mix(crystalCol, vec3(1.0), clamp(glassReflection, 0.0, 0.26));

    // Crisp cool quartz depth at the bottom-right curve so glass is sculpted even over white wallpaper areas
    float bottomQuartzDepth = smoothstep(0.42, 1.0, diagCoord) * (glassKind > 1.5 ? 0.08 : 0.12) * u_shadowScale;
    crystalCol = mix(crystalCol, vec3(0.70, 0.77, 0.86), clamp(bottomQuartzDepth * (1.0 - rimSlope * 0.45), 0.0, 0.26));
  } else {
    // Dark Theme: Translucent Smoked-Obsidian Lens (68%–92% transparent refracted backdrop)
    float darkReadability = (isSideDrawer > 1.5)
      ? clamp(0.30 + opScale * 0.38, 0.28, 0.54)
      : (glassKind > 0.5 && glassKind < 1.5)
        ? clamp(0.22 + opScale * 0.34, 0.20, 0.46)
        : (glassKind > 1.5)
          ? clamp(0.12 + opScale * 0.24, 0.10, 0.30)
          : clamp(0.20 + opScale * 0.34, 0.18, 0.44);

    float bodyMix = darkReadability * (1.0 - rimSlope * 0.82);
    crystalCol = mix(refractedCol, u_tintRgb, clamp(bodyMix, 0.0, 0.65));

    // Glossy diagonal glass reflection across the top-left dome
    float glassReflection = pow(clamp(1.0 - diagCoord, 0.0, 1.0), 3.2) * (glassKind > 1.5 ? 0.07 : 0.12) * u_specScale;
    crystalCol = mix(crystalCol, mix(vec3(1.0), u_accentRgb, 0.22), clamp(glassReflection, 0.0, 0.24));

    // Subtle bottom-right depth weight
    float bottomVolumeShade = smoothstep(0.48, 1.0, diagCoord) * 0.16 * u_shadowScale;
    crystalCol = mix(crystalCol, vec3(0.0), clamp(bottomVolumeShade * (1.0 - rimSlope * 0.60), 0.0, 0.28));
  }

  // 6. Tight, Wet-Glass Meniscus Caustic Line & Fresnel Rim (Sharp 1px..2.5px — Never a Blurry Grey Smudge)
  vec2 keyDir = normalize(vec2(-0.64, -0.77));    // Top-left key light
  vec2 bounceDir = normalize(vec2(0.64, 0.77));  // Bottom-right rim bounce
  float keyDot = max(0.0, dot(normal2D, keyDir));
  float bounceDot = max(0.0, dot(normal2D, bounceDir));
  float dirLight = 0.12 + 0.88 * pow(keyDot, 1.70) + 0.52 * pow(bounceDot, 1.85);

  // Tight 1.1px wet specular caustic line right inside the curved lip (at 2.0px from edge)
  float wetCaustic = exp(-pow((distFromEdge - 2.0) / 1.1, 2.0))
    * dirLight
    * (u_isLight > 0.5 ? (glassKind > 1.5 ? 0.38 : 0.54) : (glassKind > 1.5 ? 0.18 : 0.28))
    * u_specScale;

  // Crisp 1.5px outer Fresnel catchlight
  float cornerGlint = pow(max(keyDot, bounceDot * 0.70), 1.65);
  float fresnelAmp = (u_isLight > 0.5)
    ? (glassKind > 1.5 ? 0.52 : 0.76)
    : (glassKind > 1.5 ? 0.24 : 0.42);
  float outerFresnel = smoothstep(1.8, 0.0, distFromEdge)
    * (0.12 + 0.88 * cornerGlint)
    * fresnelAmp
    * u_specScale;

  // Crisp 1.8px bottom-right refraction edge on Light Mode so glass droplets pop even over white areas
  if (u_isLight > 0.5) {
    float lowerLipShade = exp(-pow((distFromEdge - 3.2) / 1.4, 2.0)) * pow(bounceDot, 1.4) * 0.18 * u_shadowScale;
    crystalCol = mix(crystalCol, vec3(0.56, 0.64, 0.76), clamp(lowerLipShade, 0.0, 0.36));
  }

  float totalSpecular = clamp(wetCaustic + outerFresnel, 0.0, u_isLight > 0.5 ? 0.92 : 0.72);
  vec3 specTint = mix(vec3(1.0), u_accentRgb, (u_isLight > 0.5) ? 0.08 : 0.20);
  vec3 finalRgb = mix(crystalCol, specTint, totalSpecular);

  float finalAlpha = edgeAlpha;
  if (u_isPassthrough > 0.5) {
    float baseAlpha = (isSideDrawer > 1.5)
      ? clamp(0.62 + opScale * 0.55, 0.58, 0.88)
      : (glassKind > 0.5 && glassKind < 1.5)
        ? clamp(0.38 + opScale * 0.65, 0.32, 0.78)
        : (glassKind > 1.5)
          ? clamp(0.18 + opScale * 0.45, 0.14, 0.52)
          : clamp(0.30 + opScale * 0.65, 0.24, 0.74);
    float rimAlphaBoost = rimSlope * 0.22 + totalSpecular * 0.75;
    finalAlpha = edgeAlpha * clamp(baseAlpha + rimAlphaBoost, 0.15, 0.96);
  }

  outColor = vec4(finalRgb, finalAlpha);
}
`;

interface CachedElementMeta {
  radiusPx: number;
  glassKind: number;
  scrollClipEl: HTMLElement | null;
  isOverlay: boolean;
  isSideDrawer: boolean;
}

const MAX_INSTANCES = 360;
const FLOATS_PER_INSTANCE = 12;

export function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('LiquidGlass shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('LiquidGlass program link error:', gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

export function parseHexNormalized(hexStr: string | undefined, fallback: [number, number, number]): [number, number, number] {
  const clean = String(hexStr || '').trim().replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r / 255, g / 255, b / 255];
  } else if (clean.length >= 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r / 255, g / 255, b / 255];
  }
  return fallback;
}





export function parseUnitDec(val: any, fallbackDec: number): number {
  if (val === undefined || val === null || val === '') return fallbackDec;
  const s = String(val).trim();
  const n = parseFloat(s);
  if (isNaN(n)) return fallbackDec;
  if (s.endsWith('%')) return n / 100;
  return n > 2.5 ? n / 100 : n;
}

export function computeThemeShaderUniforms(t: any) {
  const rawOpacity = Math.max(0.04, Math.min(0.70, parseUnitDec(t?.glassOpacity, 0.14)));
  const specOpacity = parseUnitDec(t?.glassSpecular ?? t?.glassSpecularOpacity, 0.24);
  const specScale = Math.max(0.0, Math.min(2.4, specOpacity / 0.24));
  const refractScale = Math.max(0.0, Math.min(2.2, parseUnitDec(t?.glassRefraction, 1.0)));
  const bezelScale = Math.max(0.35, Math.min(2.0, parseUnitDec(t?.glassBezel, 1.0)));
  const shadowDec = parseUnitDec(t?.glassShadow, 0.42);
  const shadowScale = Math.max(0.0, Math.min(2.2, shadowDec / 0.42));

  const [bgR, bgG, bgB] = parseHexNormalized(t?.bg, [0.03, 0.04, 0.07]);
  const [sbR, sbG, sbB] = parseHexNormalized(t?.sidebar || t?.bg, [bgR, bgG, bgB]);
  const [txtR, txtG, txtB] = parseHexNormalized(t?.text, [0.97, 0.98, 1.0]);
  const [accR, accG, accB] = parseHexNormalized(t?.accent, [0.22, 0.74, 0.97]);
  const hasExplicitPanelTint = Boolean(t?.panelTint && String(t.panelTint).trim() !== '');
  const [ptR, ptG, ptB] = parseHexNormalized(t?.panelTint, [sbR, sbG, sbB]);

  const bgYiq = (bgR * 299 + bgG * 587 + bgB * 114) / 1000;
  const txtYiq = (txtR * 299 + txtG * 587 + txtB * 114) / 1000;
  const isLight = (bgYiq >= 0.50 || txtYiq < 0.45) ? 1.0 : 0.0;

  const tintRgb: [number, number, number] = isLight > 0.5
    ? [
        Math.min(1.0, ptR * 0.25 + sbR * 0.15 + 0.59),
        Math.min(1.0, ptG * 0.25 + sbG * 0.15 + 0.595),
        Math.min(1.0, ptB * 0.25 + sbB * 0.15 + 0.60),
      ]
    : hasExplicitPanelTint
      ? [
          Math.max(0.022, (bgR * 0.25 + ptR * 0.62 + accR * 0.13) * 0.90 + 0.012),
          Math.max(0.028, (bgG * 0.25 + ptG * 0.62 + accG * 0.13) * 0.90 + 0.016),
          Math.max(0.042, (bgB * 0.25 + ptB * 0.62 + accB * 0.13) * 0.90 + 0.026),
        ]
      : [
          Math.max(0.022, (bgR * 0.78 + accR * 0.14) * 0.85 + 0.014),
          Math.max(0.028, (bgG * 0.78 + accG * 0.14) * 0.85 + 0.020),
          Math.max(0.042, (bgB * 0.80 + accB * 0.14) * 0.85 + 0.034),
        ];

  const accentRgb: [number, number, number] = [accR, accG, accB];

  return {
    rawOpacity,
    specScale,
    refractScale,
    bezelScale,
    shadowScale,
    isLight,
    tintRgb,
    accentRgb,
  };
}

export function SystemBackground() {
  const { currentTheme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeRef = useRef<any>(currentTheme);
  themeRef.current = currentTheme;

  const { ambientOrb = true, volumetricOrbs } = currentTheme;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
    const instanceData = new Float32Array(MAX_INSTANCES * FLOATS_PER_INSTANCE);

    gl.bindVertexArray(glassVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceVbo);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_INSTANCE * 4;
    // location 0: a_rect (vec4)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(0, 1);
    // location 1: a_clip (vec4)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(1, 1);
    // location 2: a_meta (vec4)
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

    let metaCache = new WeakMap<HTMLElement, CachedElementMeta>();
    const overlayCanvasMap = new WeakMap<HTMLElement, HTMLCanvasElement>();
    let cachedLayer0: HTMLElement[] = [];
    let cachedOrphanLayer1: HTMLElement[] = [];
    let cachedCardChildren = new Map<HTMLElement, HTMLElement[]>();
    let cachedLayer2: HTMLElement[] = [];
    let cachedOverlayChildren = new Map<HTMLElement, HTMLElement[]>();
    let texGeneration = 0;
    let needsElementScan = true;
    let rafId = 0;
    let animEndTimestamp = 0;

    const findScrollClipParent = (el: HTMLElement): HTMLElement | null => {
      let cur = el.parentElement;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        if (cur.id === 'sanctuary-main-scroll') return cur;
        const cls = cur.className;
        if (typeof cls === 'string' && (cls.includes('overflow-y-auto') || cls.includes('overflow-x-auto') || cls.includes('custom-scrollbar'))) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    };

    const getElementMeta = (el: HTMLElement): CachedElementMeta => {
      let meta = metaCache.get(el);
      if (meta) return meta;

      const cs = window.getComputedStyle(el);
      const tl = parseFloat(cs.borderTopLeftRadius || '0');
      const tr = parseFloat(cs.borderTopRightRadius || '0');
      const bl = parseFloat(cs.borderBottomLeftRadius || '0');
      const br = parseFloat(cs.borderBottomRightRadius || '0');
      const maxCorner = Math.max(
        Number.isNaN(tl) ? 0 : tl,
        Number.isNaN(tr) ? 0 : tr,
        Number.isNaN(bl) ? 0 : bl,
        Number.isNaN(br) ? 0 : br
      );
      const rawRadius = maxCorner;
      const isSidePanel = el.classList.contains('sa-side-panel-window');
      const isSidebar = el.tagName === 'NAV' && el.classList.contains('firefox-safe-glass');
      const isSurface = el.classList.contains('glass-surface');

      const glassKind = (isSidebar || isSidePanel) ? 1.0 : isSurface ? 2.0 : 0.0;
      const isOverlay = isSidePanel;
      const scrollClipEl = (isSidebar || isSidePanel) ? null : findScrollClipParent(el);

      meta = {
        radiusPx: rawRadius,
        glassKind,
        scrollClipEl,
        isOverlay,
        isSideDrawer: isSidePanel,
      };
      metaCache.set(el, meta);
      return meta;
    };

    const scanGlassElements = () => {
      needsElementScan = false;

      // Clean up any stale overlay canvases inside floating popovers, tooltips, or portal pills
      const staleCanvases = document.querySelectorAll<HTMLCanvasElement>('canvas.sa-webgl-overlay-canvas');
      for (let i = 0; i < staleCanvases.length; i++) {
        const c = staleCanvases[i];
        if (!c.parentElement?.classList.contains('sa-side-panel-window')) {
          c.remove();
        }
      }

      const nodes = document.querySelectorAll<HTMLElement>(
        'nav.firefox-safe-glass, .glass-panel, .glass-surface, .sa-side-panel-window'
      );

      const layer0: HTMLElement[] = []; // Main top-level cards & sidebar
      const orphanLayer1: HTMLElement[] = []; // Standalone surfaces on main page
      const cardChildren = new Map<HTMLElement, HTMLElement[]>(); // Surfaces/nested panels grouped by parent card
      const layer2: HTMLElement[] = []; // Full-height SidePanel drawers
      const overlayChildren = new Map<HTMLElement, HTMLElement[]>(); // Surfaces/cards grouped by parent SidePanel

      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (el.closest('[data-sandbox-preview-root]')) continue;
        if (
          el.classList.contains('sa-dropdown-popover') ||
          el.classList.contains('portal-glass-fix') ||
          el.classList.contains('sa-tooltip-glass') ||
          el.closest('.sa-dropdown-popover, .portal-glass-fix, .sa-tooltip-glass, #sa-tooltip-portal')
        ) {
          continue;
        }

        const isSelfOverlay = el.classList.contains('sa-side-panel-window');
        if (isSelfOverlay) {
          layer2.push(el);
          if (!overlayChildren.has(el)) overlayChildren.set(el, []);
          continue;
        }

        const hostOverlay = el.closest('.sa-side-panel-window') as HTMLElement | null;
        if (hostOverlay) {
          // Inside a SidePanel, the drawer container itself is the continuous 3D Liquid Glass slab;
          // internal components sit cleanly on top of that slab via CSS translucent glass fills instead of punching separate wallpaper lenses.
          continue;
        }

        const hostCard = el.parentElement?.closest('.glass-panel, nav.firefox-safe-glass') as HTMLElement | null;
        if (hostCard) {
          // Only keep WebGL lens for badges floating over an opaque <img> banner where the parent card's glass is covered by the image
          if (el.classList.contains('glass-surface') && el.closest('.sa-card-has-banner-img')) {
            let list = cardChildren.get(hostCard);
            if (!list) {
              list = [];
              cardChildren.set(hostCard, list);
            }
            list.push(el);
          }
          continue;
        } else if (el.classList.contains('glass-surface')) {
          orphanLayer1.push(el);
        } else {
          layer0.push(el);
        }
      }

      cachedLayer0 = layer0;
      cachedOrphanLayer1 = orphanLayer1;
      cachedCardChildren = cardChildren;
      cachedLayer2 = layer2;
      cachedOverlayChildren = overlayChildren;
    };

    const ensureOverlayCanvas = (host: HTMLElement): HTMLCanvasElement => {
      let ov = overlayCanvasMap.get(host);
      if (ov && ov.parentElement === host) return ov;

      const existing = host.querySelectorAll<HTMLCanvasElement>(':scope > canvas.sa-webgl-overlay-canvas');
      if (existing.length > 0) {
        ov = existing[0];
        for (let k = 1; k < existing.length; k++) {
          existing[k].remove();
        }
      } else {
        ov = document.createElement('canvas');
        ov.className = 'sa-webgl-overlay-canvas';
        host.insertBefore(ov, host.firstChild);
      }

      const isSidePanel = host.classList.contains('sa-side-panel-window');
      // Inside SidePanel, header is z-30 and body is z-10, so z-index: 0 sits cleanly behind SidePanel content and 100% above main page.
      // For right-anchored SidePanels (border-left:1px, border-right:0px), align 1:1 with the host's border-box and keep right corners 0px flush.
      ov.style.cssText = isSidePanel
        ? 'position:absolute;top:-1px;bottom:-1px;left:-1px;right:0px;width:calc(100% + 1px);height:calc(100% + 2px);pointer-events:none;z-index:0;border-top-left-radius:inherit;border-bottom-left-radius:inherit;border-top-right-radius:0px;border-bottom-right-radius:0px;'
        : 'position:absolute;inset:-1px;width:calc(100% + 2px);height:calc(100% + 2px);pointer-events:none;z-index:-1;border-radius:inherit;';
      overlayCanvasMap.set(host, ov);
      return ov;
    };

    function scheduleRender() {
      if (rafId === 0 && !disposed) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    }

    function triggerAnimWindow(ms = 420) {
      animEndTimestamp = Math.max(animEndTimestamp, performance.now() + ms);
      scheduleRender();
    }

    function renderFrame() {
      rafId = 0;
      if (disposed || !texturesReady) return;

      if (needsElementScan) {
        scanGlassElements();
      }

      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const targetW = Math.round(vw * dpr);
      const targetH = Math.round(vh * dpr);

      if (canvas!.width !== targetW || canvas!.height !== targetH) {
        canvas!.width = targetW;
        canvas!.height = targetH;
      }

      // Collect visible glass rects using parent-first viewport culling
      const t = (window as any).__sanctuaryPreviewTheme || themeRef.current || {};
      const isTransparentPassthrough =
        !t.bgImage && (t.bg === 'transparent' || Boolean(t.transparentWindow));

      const drawWallpaperPass = () => {
        gl!.viewport(0, 0, targetW, targetH);
        gl!.disable(gl!.BLEND);
        if (isTransparentPassthrough) {
          gl!.clearColor(0, 0, 0, 0);
          gl!.clear(gl!.COLOR_BUFFER_BIT);
          return;
        }
        gl!.useProgram(bgProg);
        gl!.activeTexture(gl!.TEXTURE0);
        gl!.bindTexture(gl!.TEXTURE_2D, sharpTex);
        gl!.uniform1i(bgUniformSharp, 0);
        gl!.bindVertexArray(bgVao);
        gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      };

      const {
        rawOpacity,
        specScale,
        refractScale,
        bezelScale,
        shadowScale,
        isLight,
        tintRgb,
        accentRgb,
      } = computeThemeShaderUniforms(t);

      let count = 0;
      const activeOverlays: Array<{
        el: HTMLElement;
        rect: DOMRect;
        childSig: string;
        startIdx: number;
        instCount: number;
      }> = [];
      const clipCache = new Map<HTMLElement, DOMRect>();

      const pushElementInstance = (el: HTMLElement, checkOverlayHidden: boolean): DOMRect | null => {
        if (count >= MAX_INSTANCES) return null;
        if (!el.isConnected) {
          needsElementScan = true;
          return null;
        }
        const mayBeHidden =
          checkOverlayHidden ||
          (typeof el.className === 'string' &&
            (el.className.includes('opacity-0') ||
              el.className.includes('hidden') ||
              el.className.includes('invisible')));
        if (mayBeHidden) {
          const cs = window.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') < 0.5) {
            return null;
          }
        }

        const rect = el.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return null;
        if (rect.bottom <= 0 || rect.top >= vh || rect.right <= 0 || rect.left >= vw) return null;

        const meta = getElementMeta(el);
        let clipL = 0;
        let clipT = 0;
        let clipR = vw;
        let clipB = vh;

        if (meta.scrollClipEl) {
          let cRect = clipCache.get(meta.scrollClipEl);
          if (!cRect) {
            cRect = meta.scrollClipEl.getBoundingClientRect();
            clipCache.set(meta.scrollClipEl, cRect);
          }
          clipL = Math.max(0, cRect.left);
          clipT = Math.max(0, cRect.top);
          clipR = Math.min(vw, cRect.right);
          clipB = Math.min(vh, cRect.bottom);
          if (rect.bottom <= clipT || rect.top >= clipB || rect.right <= clipL || rect.left >= clipR) {
            return null;
          }
        }

        const base = count * FLOATS_PER_INSTANCE;
        instanceData[base + 0] = rect.left;
        instanceData[base + 1] = rect.top;
        instanceData[base + 2] = rect.width;
        instanceData[base + 3] = rect.height;

        instanceData[base + 4] = clipL;
        instanceData[base + 5] = clipT;
        instanceData[base + 6] = clipR;
        instanceData[base + 7] = clipB;

        instanceData[base + 8] = Math.min(meta.radiusPx, Math.min(rect.width, rect.height) * 0.5);
        instanceData[base + 9] = meta.glassKind;
        instanceData[base + 10] = rawOpacity;
        instanceData[base + 11] = meta.isSideDrawer ? 2.0 : (meta.glassKind > 1.5 ? 0.5 : 1.0);

        count++;
        return rect;
      };

      // 1. Top-level cards & sidebar (off-screen cards are culled here along with all their children)
      const visibleLayer0: HTMLElement[] = [];
      for (let i = 0; i < cachedLayer0.length && count < MAX_INSTANCES; i++) {
        const el = cachedLayer0[i];
        if (pushElementInstance(el, false)) {
          visibleLayer0.push(el);
        }
      }

      // 2. Standalone surfaces & nested children of ONLY the visible top-level cards
      for (let i = 0; i < cachedOrphanLayer1.length && count < MAX_INSTANCES; i++) {
        pushElementInstance(cachedOrphanLayer1[i], false);
      }
      for (let i = 0; i < visibleLayer0.length && count < MAX_INSTANCES; i++) {
        const children = cachedCardChildren.get(visibleLayer0[i]);
        if (children) {
          for (let j = 0; j < children.length && count < MAX_INSTANCES; j++) {
            pushElementInstance(children[j], false);
          }
        }
      }

      const mainPageCount = count;

      // 3. Floating overlays (TitleBar, SystemStatusBar, SidePanel) & their internal children
      for (let i = 0; i < cachedLayer2.length && count < MAX_INSTANCES; i++) {
        const ovEl = cachedLayer2[i];
        const ovStartIdx = count;
        const ovRect = pushElementInstance(ovEl, true);
        if (ovRect) {
          let childSig = '';
          const children = cachedOverlayChildren.get(ovEl);
          if (children) {
            for (let j = 0; j < children.length && count < MAX_INSTANCES; j++) {
              const cRect = pushElementInstance(children[j], false);
              if (cRect) {
                childSig += `${Math.round(cRect.left)},${Math.round(cRect.top)},${Math.round(cRect.width)},${Math.round(cRect.height)};`;
              }
            }
          }
          if (getElementMeta(ovEl).isOverlay) {
            activeOverlays.push({
              el: ovEl,
              rect: ovRect,
              childSig,
              startIdx: ovStartIdx,
              instCount: count - ovStartIdx,
            });
          }
        }
      }

      const drawGlassSlice = (startIdx: number, instCount: number) => {
        if (instCount <= 0) return;
        gl!.enable(gl!.BLEND);
        gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);

        gl!.useProgram(glassProg);
        gl!.activeTexture(gl!.TEXTURE0);
        gl!.bindTexture(gl!.TEXTURE_2D, sharpTex);
        gl!.uniform1i(glassUniformSharp, 0);

        gl!.activeTexture(gl!.TEXTURE1);
        gl!.bindTexture(gl!.TEXTURE_2D, blurTex);
        gl!.uniform1i(glassUniformBlur, 1);

        gl!.uniform2f(glassUniformViewport, vw, vh);
        gl!.uniform3f(glassUniformTint, tintRgb[0], tintRgb[1], tintRgb[2]);
        gl!.uniform3f(glassUniformAccent, accentRgb[0], accentRgb[1], accentRgb[2]);
        gl!.uniform1f(glassUniformIsLight, isLight);
        gl!.uniform1f(glassUniformSpecScale, specScale);
        gl!.uniform1f(glassUniformRefractScale, refractScale);
        gl!.uniform1f(glassUniformBezelScale, bezelScale);
        gl!.uniform1f(glassUniformShadowScale, shadowScale);
        gl!.uniform1f(glassUniformIsPassthrough, isTransparentPassthrough ? 1.0 : 0.0);

        gl!.bindVertexArray(glassVao);
        gl!.bindBuffer(gl!.ARRAY_BUFFER, instanceVbo);
        gl!.bufferSubData(
          gl!.ARRAY_BUFFER,
          0,
          instanceData.subarray(startIdx * FLOATS_PER_INSTANCE, (startIdx + instCount) * FLOATS_PER_INSTANCE)
        );
        gl!.drawArraysInstanced(gl!.TRIANGLE_STRIP, 0, 4, instCount);
        gl!.bindVertexArray(null);
      };

      // Check if any floating overlay (SidePanel, TitleBar, SystemStatusBar) needs its occlusion canvas updated
      const dirtyOverlays: Array<{
        ovCanvas: HTMLCanvasElement;
        ow: number;
        oh: number;
        sx: number;
        sy: number;
        sw: number;
        sh: number;
        blitKey: string;
        startIdx: number;
        instCount: number;
      }> = [];

      const themeKey = `${t.bgImage || ''}:${t.bg || ''}:${Boolean(t.transparentWindow)}:${t.panelTint || ''}:${t.radius || ''}:${isLight}`;
      for (let i = 0; i < activeOverlays.length; i++) {
        const { el, rect, childSig, startIdx, instCount } = activeOverlays[i];
        const ovCanvas = ensureOverlayCanvas(el);
        const ow = Math.max(1, Math.round(rect.width * dpr));
        const oh = Math.max(1, Math.round(rect.height * dpr));
        const sx = Math.max(0, Math.round(rect.left * dpr));
        const sy = Math.max(0, Math.round(rect.top * dpr));
        const sw = Math.min(targetW - sx, ow);
        const sh = Math.min(targetH - sy, oh);
        const elRadius = getElementMeta(el).radiusPx;
        const blitKey = `${themeKey}:${texGeneration}:${targetW}x${targetH}:${rawOpacity}:${specScale}:${refractScale}:${bezelScale}:${shadowScale}:${elRadius}:${sx},${sy},${sw},${sh},${ow},${oh}:${childSig}`;

        if (ovCanvas.width !== ow || ovCanvas.height !== oh || (ovCanvas as any).__lastBlitKey !== blitKey) {
          dirtyOverlays.push({ ovCanvas, ow, oh, sx, sy, sw, sh, blitKey, startIdx, instCount });
        }
      }

      // Render each dirty overlay in its own isolated wallpaper + single-overlay pass
      // so stacked SidePanels never bake their glass boxes into an underlying SidePanel's occlusion canvas
      if (dirtyOverlays.length > 0) {
        for (let i = 0; i < dirtyOverlays.length; i++) {
          const { ovCanvas, ow, oh, sx, sy, sw, sh, blitKey, startIdx, instCount } = dirtyOverlays[i];
          drawWallpaperPass();
          drawGlassSlice(startIdx, instCount);
          if (ovCanvas.width !== ow || ovCanvas.height !== oh) {
            ovCanvas.width = ow;
            ovCanvas.height = oh;
          }
          const ctx2d = ovCanvas.getContext('2d');
          if (ctx2d && sw > 0 && sh > 0) {
            ctx2d.clearRect(0, 0, ow, oh);
            ctx2d.drawImage(canvas!, sx, sy, sw, sh, 0, 0, ow, oh);
            (ovCanvas as any).__lastBlitKey = blitKey;
          }
        }
      }

      // Main viewport pass: sharp wallpaper + main-page glass instances only
      // (overlays render via their own internal sa-webgl-overlay-canvas so closing an overlay never leaves a ghost)
      drawWallpaperPass();
      if (mainPageCount > 0) {
        drawGlassSlice(0, mainPageCount);
      }

      if (performance.now() < animEndTimestamp) {
        scheduleRender();
      }
    }

    // Upload wallpaper textures (sharpTex + blurTex) when theme or viewport aspect changes
    const buildWallpaperTextures = () => {
      const t = (window as any).__sanctuaryPreviewTheme || themeRef.current || {};
      const vw = Math.max(320, window.innerWidth);
      const vh = Math.max(240, window.innerHeight);
      const targetAspect = vw / vh;
      const parsedBlur = parseFloat(String(t.glassBlur ?? '36'));
      const rawBlur = Math.max(0, Math.min(64, isNaN(parsedBlur) ? 36 : parsedBlur));
      const parsedSat = parseFloat(String(t.glassSaturation ?? '185')) || 185;
      const [bgR, bgG, bgB] = parseHexNormalized(t.bg, [0.03, 0.04, 0.07]);
      const [txtR, txtG, txtB] = parseHexNormalized(t.text, [0.97, 0.98, 1.0]);
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

        // Generate clamped-border lightly-frosted texture so background shapes stay recognizable & visibly refract
        const bw = 1440;
        const bh = Math.max(320, Math.round(bw / targetAspect));
        const blurPx = rawBlur <= 0
          ? 0
          : isLightTheme
            ? Math.max(3, Math.min(14, Math.round(rawBlur * 0.25)))
            : Math.max(3, Math.min(16, Math.round(rawBlur * 0.28)));
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

        texGeneration++;
        texturesReady = true;
        needsElementScan = true;
        triggerAnimWindow(500);
      };

      if (t.bgImage) {
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
          sharpCanvas.width = Math.min(2560, Math.max(1600, Math.round(vw * Math.min(2, window.devicePixelRatio || 1))));
          sharpCanvas.height = Math.max(400, Math.round(sharpCanvas.width / targetAspect));
          const sCtx = sharpCanvas.getContext('2d');
          if (sCtx) {
            sCtx.imageSmoothingEnabled = true;
            sCtx.imageSmoothingQuality = 'high';
            sCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sharpCanvas.width, sharpCanvas.height);
            uploadFromSourceCanvas(sharpCanvas);
          }
        };
        img.src = t.bgImage;
      } else {
        const gradCanvas = document.createElement('canvas');
        gradCanvas.width = 1280;
        gradCanvas.height = Math.max(360, Math.round(1280 / targetAspect));
        const gCtx = gradCanvas.getContext('2d');
        if (gCtx) {
          gCtx.fillStyle = t.bg && t.bg !== 'transparent' ? t.bg : '#080b12';
          gCtx.fillRect(0, 0, gradCanvas.width, gradCanvas.height);
          const orbs = Array.isArray(t.volumetricOrbs) ? t.volumetricOrbs : [];
          for (let i = 0; i < orbs.length; i++) {
            const orb = orbs[i];
            const ox = (parseFloat(String(orb.left || '20')) / 100) * gradCanvas.width;
            const oy = (parseFloat(String(orb.top || '20')) / 100) * gradCanvas.height;
            const rad = gradCanvas.width * 0.55;
            const rg = gCtx.createRadialGradient(ox, oy, 0, ox, oy, rad);
            rg.addColorStop(0, orb.color || '#38bdf8');
            rg.addColorStop(1, 'transparent');
            gCtx.globalAlpha = Number(orb.opacity ?? 0.35);
            gCtx.fillStyle = rg;
            gCtx.fillRect(0, 0, gradCanvas.width, gradCanvas.height);
          }
          gCtx.globalAlpha = 1.0;
          uploadFromSourceCanvas(gradCanvas);
        }
      }
    };

    buildWallpaperTextures();

    const onScroll = () => {
      scheduleRender();
    };

    const onResize = () => {
      buildWallpaperTextures();
      needsElementScan = true;
      scheduleRender();
    };

    // Only animate WebGL glass during genuine geometry/layout transitions or opacity-0 glass reveals
    const onTransition = (e: TransitionEvent) => {
      const prop = e.propertyName;
      if (prop === 'opacity') {
        const tgt = e.target as HTMLElement | null;
        if (tgt?.classList && (tgt.classList.contains('glass-panel') || tgt.classList.contains('glass-surface'))) {
          scheduleRender();
        }
        return;
      }
      if (
        prop !== 'width' &&
        prop !== 'min-width' &&
        prop !== 'max-width' &&
        prop !== 'height' &&
        prop !== 'grid-template-rows' &&
        prop !== 'transform' &&
        prop !== 'margin-bottom'
      ) {
        return;
      }
      if (prop === 'transform') {
        const tgt = e.target as HTMLElement | null;
        if (
          !tgt?.classList ||
          (!tgt.classList.contains('sa-side-panel-window') &&
            !tgt.classList.contains('portal-glass-fix') &&
            tgt.tagName !== 'NAV')
        ) {
          return;
        }
      }
      needsElementScan = true;
      triggerAnimWindow(540);
    };

    const onAnimationStart = (e: AnimationEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (
        tgt?.classList &&
        (tgt.classList.contains('sa-side-panel-window') ||
          tgt.classList.contains('portal-glass-fix') ||
          tgt.classList.contains('sa-dropdown-popover') ||
          tgt.classList.contains('sa-side-panel-backdrop'))
      ) {
        needsElementScan = true;
        triggerAnimWindow(560);
      }
    };

    const mutObserver = new MutationObserver((mutations) => {
      let hasRelevantMutation = false;
      let needsAnimLoop = false;

      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        const tgt = m.target as HTMLElement | null;
        if (!tgt) continue;
        if (tgt.id === 'sa-tooltip-portal' || tgt.closest?.('#sa-tooltip-portal')) continue;

        if (m.type === 'childList') {
          let isOnlyOverlayCanvas = true;
          for (let j = 0; j < m.addedNodes.length; j++) {
            const n = m.addedNodes[j] as HTMLElement;
            if (n.nodeType === 1 && !n.classList?.contains('sa-webgl-overlay-canvas')) {
              isOnlyOverlayCanvas = false;
              if (
                n.classList?.contains('sa-side-panel-window') ||
                n.classList?.contains('sa-side-panel-wrapper') ||
                n.classList?.contains('portal-glass-fix') ||
                n.classList?.contains('sa-dropdown-popover') ||
                n.classList?.contains('grid')
              ) {
                needsAnimLoop = true;
              }
            }
          }
          for (let j = 0; j < m.removedNodes.length; j++) {
            const n = m.removedNodes[j] as HTMLElement;
            if (n.nodeType === 1 && !n.classList?.contains('sa-webgl-overlay-canvas')) {
              isOnlyOverlayCanvas = false;
            }
          }
          if (!isOnlyOverlayCanvas) {
            hasRelevantMutation = true;
          }
        } else if (m.type === 'attributes') {
          if (m.attributeName === 'class') {
            metaCache.delete(tgt);
            hasRelevantMutation = true;
          }
          if (
            tgt.classList?.contains('sa-side-panel-window') ||
            tgt.classList?.contains('sa-side-panel-wrapper') ||
            tgt.classList?.contains('portal-glass-fix') ||
            tgt.classList?.contains('sa-dropdown-popover') ||
            tgt.classList?.contains('glass-panel') ||
            tgt.classList?.contains('glass-surface') ||
            tgt.tagName === 'NAV' ||
            tgt.closest?.('.portal-glass-fix')
          ) {
            hasRelevantMutation = true;
            needsAnimLoop = true;
          }
        }
      }

      if (hasRelevantMutation) {
        needsElementScan = true;
        if (needsAnimLoop) {
          triggerAnimWindow(560);
        } else {
          scheduleRender();
        }
      }
    });
    mutObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('transitionstart', onTransition, { capture: true, passive: true });
    window.addEventListener('transitionend', onTransition, { capture: true, passive: true });
    window.addEventListener('animationstart', onAnimationStart, { capture: true, passive: true });

    (window as any).__sanctuaryRebuildWebGLGlass = () => {
      buildWallpaperTextures();
    };
    (window as any).__sanctuaryRenderWebGLGlass = (rescan = false) => {
      if (rescan) {
        metaCache = new WeakMap<HTMLElement, CachedElementMeta>();
        needsElementScan = true;
      }
      scheduleRender();
    };

    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      mutObserver.disconnect();
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('transitionstart', onTransition, true);
      window.removeEventListener('transitionend', onTransition, true);
      window.removeEventListener('animationstart', onAnimationStart, true);
      gl.deleteTexture(sharpTex);
      gl.deleteTexture(blurTex);
      gl.deleteBuffer(instanceVbo);
      gl.deleteVertexArray(bgVao);
      gl.deleteVertexArray(glassVao);
      gl.deleteProgram(bgProg);
      gl.deleteProgram(glassProg);
    };
  }, [SHADER_REV]);

  useEffect(() => {
    (window as any).__sanctuaryRebuildWebGLGlass?.();
  }, [
    currentTheme.bgImage,
    currentTheme.bg,
    currentTheme.transparentWindow,
    currentTheme.glassBlur,
    currentTheme.glassSaturation,
    currentTheme.ambientOrb,
  ]);

  useEffect(() => {
    (window as any).__sanctuaryRenderWebGLGlass?.(true);
  }, [
    currentTheme.glassOpacity,
    currentTheme.glassSpecular,
    currentTheme.glassRefraction,
    currentTheme.glassBezel,
    currentTheme.glassShadow,
    currentTheme.glassBorderOpacity,
    currentTheme.panelTint,
    currentTheme.sidebar,
    currentTheme.accent,
    currentTheme.text,
    currentTheme.radius,
    currentTheme.transparentWindow,
  ]);

  const isTransparentPassthrough =
    !currentTheme.bgImage &&
    (currentTheme.bg === 'transparent' || Boolean(currentTheme.transparentWindow));

  return (
    <div
      className="fixed inset-0 w-full h-full pointer-events-none z-[0] overflow-hidden"
      style={{
        top: 'calc(-1 * env(safe-area-inset-top, 0px))',
        bottom: 'calc(-1 * env(safe-area-inset-bottom, 0px))',
        left: 'calc(-1 * env(safe-area-inset-left, 0px))',
        right: 'calc(-1 * env(safe-area-inset-right, 0px))',
        minHeight: 'calc(100dvh + env(safe-area-inset-top, 0px) + env(safe-area-inset-bottom, 0px))',
        backgroundColor: isTransparentPassthrough ? 'transparent' : 'var(--bg, #000000)',
      }}
    >
      {/* Fallback image layer while WebGL textures initialize */}
      {currentTheme.bgImage ? (
        <img
          src={currentTheme.bgImage}
          alt=""
          decoding="async"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover object-center opacity-100 pointer-events-none select-none"
        />
      ) : !isTransparentPassthrough ? (
        <div
          className="absolute inset-0 rounded-[inherit] w-full h-full opacity-100 transition-all duration-1000"
          style={{ background: 'var(--bgGradient)' }}
        />
      ) : null}

      {/* Volumetric Aero-Mesh Orbs for Non-Wallpaper Themes */}
      {!currentTheme.bgImage && ambientOrb && volumetricOrbs && volumetricOrbs.length > 0 ? (
        <div className="absolute inset-0 rounded-[inherit] w-full h-full">
          {volumetricOrbs.map((orb: any, index: number) => (
            <div
              key={`${currentTheme.name || 'theme'}-${index}`}
              className={`absolute rounded-full pointer-events-none ${orb.blendMode || 'mix-blend-screen'}`}
              style={{
                backgroundColor: orb.color,
                top: orb.top,
                left: orb.left,
                width: orb.width || '120vw',
                height: orb.height || '120vh',
                filter: `blur(${orb.blur})`,
                opacity: orb.opacity || 0.5,
                animation: `${orb.animation || 'ambient-drift'} ${orb.duration || '60s'} ease-in-out infinite alternate`,
              }}
            />
          ))}
        </div>
      ) : null}

      {/* Full-Viewport WebGL2 Instanced SDF Liquid Glass Engine */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none select-none z-[2]"
      />

      {currentTheme.scanlines && (
        <div
          className="absolute inset-0 rounded-[inherit] w-full h-full pointer-events-none opacity-20 z-[3]"
          style={{
            background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2))',
            backgroundSize: '100% 4px',
          }}
        />
      )}
    </div>
  );
}

