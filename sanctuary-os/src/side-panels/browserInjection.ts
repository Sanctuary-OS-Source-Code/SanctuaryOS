export const INJECTED_BROWSER_SCRIPT = `
(function() {
const SANC_BRIDGE_TOKEN = "__SANCTUARY_BRIDGE_TOKEN__";
const SANC_BG_R = Number("__OS_BG_R__") || 6;
const SANC_BG_G = Number("__OS_BG_G__") || 13;
const SANC_BG_B = Number("__OS_BG_B__") || 31;
const SANC_FRAME_R = Number("__OS_FRAME_R__") || 4;
const SANC_FRAME_G = Number("__OS_FRAME_G__") || 9;
const SANC_FRAME_B = Number("__OS_FRAME_B__") || 21;
const SANC_ACCENT_R = Number("__OS_ACCENT_R__") || 56;
const SANC_ACCENT_G = Number("__OS_ACCENT_G__") || 189;
const SANC_ACCENT_B = Number("__OS_ACCENT_B__") || 248;
const SANC_IS_LIGHT = "__OS_IS_LIGHT__" === "true";

// Universal CSP-proof Liquid Glass Viewport Mask, Inset Scrollbar & Surface Harmonizer
try {
    const frameRgbCss = 'rgb(' + SANC_FRAME_R + ', ' + SANC_FRAME_G + ', ' + SANC_FRAME_B + ')';
    const bgRgbCss = 'rgb(' + SANC_BG_R + ', ' + SANC_BG_G + ', ' + SANC_BG_B + ')';
    const pillR = Math.min(255, Math.round(SANC_BG_R + SANC_ACCENT_R * 0.08 + 13));
    const pillG = Math.min(255, Math.round(SANC_BG_G + SANC_ACCENT_G * 0.08 + 16));
    const pillB = Math.min(255, Math.round(SANC_BG_B + SANC_ACCENT_B * 0.08 + 24));
    const themeSig = [SANC_BG_R, SANC_BG_G, SANC_BG_B, SANC_FRAME_R, SANC_FRAME_G, SANC_FRAME_B, SANC_ACCENT_R, SANC_ACCENT_G, SANC_ACCENT_B, SANC_IS_LIGHT ? 1 : 0].join(',');
    window.__sanc_theme_sig = themeSig;

    const atmoGradient = [
        'radial-gradient(110% 75% at 16% 0%, rgba(' + SANC_ACCENT_R + ', ' + SANC_ACCENT_G + ', ' + SANC_ACCENT_B + ', 0.14) 0%, transparent 58%)',
        'radial-gradient(90% 65% at 86% 100%, rgba(' + SANC_ACCENT_R + ', ' + SANC_ACCENT_G + ', ' + SANC_ACCENT_B + ', 0.09) 0%, transparent 55%)',
        'linear-gradient(145deg, rgba(255, 255, 255, 0.04) 0%, transparent 42%, rgba(0, 0, 0, 0.32) 100%)'
    ].join(', ');

    // 1. Nonce-aware <style> to hide native outer scrollbar gutter (preventing right-corner bleed) & set instant root canvas
    const nonceSource = document.querySelector('style[nonce], script[nonce], link[nonce]');
    const pageNonce = nonceSource ? (nonceSource.nonce || nonceSource.getAttribute('nonce') || '') : '';
    let rootStyle = document.getElementById('sanc-universal-theme-style');
    if (!rootStyle) {
        rootStyle = document.createElement('style');
        rootStyle.id = 'sanc-universal-theme-style';
        if (pageNonce) {
            rootStyle.nonce = pageNonce;
            rootStyle.setAttribute('nonce', pageNonce);
        }
        (document.head || document.documentElement).appendChild(rootStyle);
    } else if (pageNonce && rootStyle.getAttribute('nonce') !== pageNonce) {
        rootStyle.nonce = pageNonce;
        rootStyle.setAttribute('nonce', pageNonce);
    }
    const nextCss = [
        ':root, html { color-scheme: ' + (SANC_IS_LIGHT ? 'light' : 'dark') + ' !important; scrollbar-width: none !important; -ms-overflow-style: none !important; }',
        'body { scrollbar-width: none !important; -ms-overflow-style: none !important; }',
        'html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0px !important; height: 0px !important; display: none !important; }',
        '*::-webkit-scrollbar { width: 5px; height: 5px; }',
        '*::-webkit-scrollbar-track { background: transparent; margin-block: 14px; }',
        '*::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.25); border-radius: 9999px; }'
    ].join('\\n');
    if (rootStyle.textContent !== nextCss) {
        rootStyle.textContent = nextCss;
    }

    // 2. CSP-proof inline-styled Viewport Glass Mask (#sanc-viewport-mask)
    // Uses concentric 11px inner radius inside the 6px parent bezel so the HWND corners never bleed
    if (document.documentElement) {
        let mask = document.getElementById('sanc-viewport-mask');
        if (!mask) {
            mask = document.createElement('div');
            mask.id = 'sanc-viewport-mask';
            document.documentElement.appendChild(mask);
        }
        if (mask.getAttribute('data-sanc-sig') !== themeSig) {
            mask.setAttribute('data-sanc-sig', themeSig);
            const rimColor = SANC_IS_LIGHT ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.12)';
            const topSpec = SANC_IS_LIGHT ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.22)';
            const innerDepth = SANC_IS_LIGHT ? 'rgba(15, 23, 42, 0.05)' : 'rgba(0, 0, 0, 0.38)';
            const boxShadowVal = '0 0 0 32px ' + frameRgbCss + ', inset 0 0 0 1px ' + rimColor + ', inset 0 1px 0 0 ' + topSpec + ', inset 0 0 28px ' + innerDepth;
            const lensSheenVal = SANC_IS_LIGHT
                ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.16) 0%, transparent 16%)'
                : 'radial-gradient(85% 40% at 50% 0%, rgba(' + SANC_ACCENT_R + ', ' + SANC_ACCENT_G + ', ' + SANC_ACCENT_B + ', 0.065) 0%, transparent 70%), linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 15%, transparent 86%, rgba(0, 0, 0, 0.20) 100%)';

            mask.style.setProperty('position', 'fixed', 'important');
            mask.style.setProperty('inset', '0px', 'important');
            mask.style.setProperty('pointer-events', 'none', 'important');
            mask.style.setProperty('z-index', '2147483646', 'important');
            mask.style.setProperty('border-radius', '11px', 'important');
            mask.style.setProperty('box-shadow', boxShadowVal, 'important');
            mask.style.setProperty('background', lensSheenVal, 'important');
        }

        // 3. Inset Short Liquid Glass Scrollbar (#sanc-scroll-track & #sanc-scroll-thumb)
        // Inset 22px from top and bottom so it is shorter than the viewport and never touches the rounded corners
        let scrollTrack = document.getElementById('sanc-scroll-track');
        let scrollThumb = document.getElementById('sanc-scroll-thumb');
        if (!scrollTrack) {
            scrollTrack = document.createElement('div');
            scrollTrack.id = 'sanc-scroll-track';
            scrollTrack.style.setProperty('position', 'fixed', 'important');
            scrollTrack.style.setProperty('top', '22px', 'important');
            scrollTrack.style.setProperty('bottom', '22px', 'important');
            scrollTrack.style.setProperty('right', '5px', 'important');
            scrollTrack.style.setProperty('width', '5px', 'important');
            scrollTrack.style.setProperty('border-radius', '9999px', 'important');
            scrollTrack.style.setProperty('z-index', '2147483647', 'important');
            scrollTrack.style.setProperty('pointer-events', 'none', 'important');
            scrollTrack.style.setProperty('transition', 'opacity 0.2s ease', 'important');

            scrollThumb = document.createElement('div');
            scrollThumb.id = 'sanc-scroll-thumb';
            scrollThumb.style.setProperty('position', 'absolute', 'important');
            scrollThumb.style.setProperty('left', '0px', 'important');
            scrollThumb.style.setProperty('right', '0px', 'important');
            scrollThumb.style.setProperty('border-radius', '9999px', 'important');
            scrollThumb.style.setProperty('background', 'rgba(148, 163, 184, 0.34)', 'important');
            scrollThumb.style.setProperty('box-shadow', 'inset 0 1px 0 rgba(255, 255, 255, 0.22)', 'important');

            scrollTrack.appendChild(scrollThumb);
            document.documentElement.appendChild(scrollTrack);
        }

        const updateInsetScrollbar = () => {
            if (!scrollTrack || !scrollThumb) return;
            const se = document.scrollingElement || document.documentElement;
            const scrollHeight = Math.max(
                se ? se.scrollHeight : 0,
                document.body ? document.body.scrollHeight : 0
            );
            const clientHeight = window.innerHeight || (se ? se.clientHeight : 0);
            if (scrollHeight <= clientHeight + 4) {
                scrollTrack.style.setProperty('opacity', '0', 'important');
                return;
            }
            scrollTrack.style.setProperty('opacity', '1', 'important');
            const trackHeight = Math.max(40, clientHeight - 44);
            const ratio = clientHeight / scrollHeight;
            const thumbHeight = Math.max(28, Math.min(trackHeight, Math.round(trackHeight * ratio)));
            const maxScroll = Math.max(1, scrollHeight - clientHeight);
            const scrollTop = window.scrollY || (se ? se.scrollTop : 0) || 0;
            const thumbTop = Math.min(
                trackHeight - thumbHeight,
                Math.max(0, Math.round((scrollTop / maxScroll) * (trackHeight - thumbHeight)))
            );
            scrollThumb.style.setProperty('height', thumbHeight + 'px', 'important');
            scrollThumb.style.setProperty('transform', 'translateY(' + thumbTop + 'px)', 'important');
        };
        window.__sanc_update_scrollbar = updateInsetScrollbar;
        updateInsetScrollbar();
    }

    // 4. Universal Liquid Glass Surface Harmonizer
    const parseRgba = (str) => {
        if (!str) return null;
        const m = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
        if (!m) return null;
        return {
            r: parseInt(m[1], 10),
            g: parseInt(m[2], 10),
            b: parseInt(m[3], 10),
            a: m[4] !== undefined ? parseFloat(m[4]) : 1
        };
    };

    const isNeutralDark = (c, minVal, maxVal) => {
        if (!c || c.a < 0.75) return false;
        const maxC = Math.max(c.r, c.g, c.b);
        const minC = Math.min(c.r, c.g, c.b);
        return maxC >= minVal && maxC <= maxVal && (maxC - minC) <= 16;
    };

    const isOpaqueLight = (c) => {
        if (!c || c.a < 0.75) return false;
        return c.r > 175 && c.g > 175 && c.b > 175;
    };

    const getOriginalBg = (el) => {
        if (el.hasAttribute('data-sanc-orig-bg')) {
            return parseRgba(el.getAttribute('data-sanc-orig-bg'));
        }
        const cs = window.getComputedStyle(el);
        if (cs.backgroundImage && cs.backgroundImage !== 'none' && !el.hasAttribute('data-sanc-root-styled')) {
            return null;
        }
        return parseRgba(cs.backgroundColor || '');
    };

    const lockOriginalBg = (el) => {
        if (!el.hasAttribute('data-sanc-orig-bg')) {
            el.setAttribute('data-sanc-orig-bg', window.getComputedStyle(el).backgroundColor || '');
        }
    };

    const harmonizePageSurfaces = () => {
        if (SANC_IS_LIGHT || !document.documentElement) return;

        const docEl = document.documentElement;
        const bodyEl = document.body;

        // Check if body is explicitly an opaque white light-mode page (and not just default unstyled canvas)
        const bodyOrig = bodyEl ? getOriginalBg(bodyEl) : null;
        if (bodyEl && isOpaqueLight(bodyOrig)) {
            return;
        }

        // Apply Sanctuary OS Atmospheric Liquid Glass backdrop to <html> immediately
        if (docEl.getAttribute('data-sanc-sig') !== themeSig) {
            lockOriginalBg(docEl);
            docEl.setAttribute('data-sanc-root-styled', '1');
            docEl.setAttribute('data-sanc-sig', themeSig);
            docEl.style.setProperty('background-color', bgRgbCss, 'important');
            docEl.style.setProperty('background-image', atmoGradient, 'important');
            docEl.style.setProperty('background-attachment', 'fixed', 'important');
        }

        if (!bodyEl) return;

        if (bodyEl.getAttribute('data-sanc-sig') !== themeSig) {
            lockOriginalBg(bodyEl);
            bodyEl.setAttribute('data-sanc-sig', themeSig);
            bodyEl.style.setProperty('background-color', 'transparent', 'important');
        }

        const vw = window.innerWidth || 800;
        const vh = window.innerHeight || 600;
        const nodes = bodyEl.querySelectorAll('div, main, header, footer, nav, section, article, aside, form, button, input, textarea, [role="button"], [role="search"], [role="combobox"], [role="navigation"], [role="contentinfo"]');
        const maxScan = Math.min(nodes.length, 240);

        for (let i = 0; i < maxScan; i++) {
            const el = nodes[i];
            if (!el || !el.style || el.id === 'sanc-viewport-mask' || el.id === 'sanc-scroll-track' || el.id === 'sanc-scroll-thumb' || el.id === 'sanc-ctx-menu') continue;

            const origBg = getOriginalBg(el);
            if (!isNeutralDark(origBg, 8, 72)) continue;

            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;

            // Case A: Full-width main layout wrapper -> make transparent so atmospheric glass backdrop shows through
            if (rect.width >= vw * 0.78 && rect.height >= vh * 0.34) {
                lockOriginalBg(el);
                el.setAttribute('data-sanc-role', 'wrapper');
                if (el.getAttribute('data-sanc-sig') !== themeSig) {
                    el.setAttribute('data-sanc-sig', themeSig);
                    el.style.setProperty('background-color', 'transparent', 'important');
                }
                continue;
            }

            // Case B: Full-width horizontal bar (header, sticky nav, bottom footer like Google #171717) -> smoked glass bar
            if (rect.width >= vw * 0.78 && rect.height < vh * 0.34) {
                lockOriginalBg(el);
                el.setAttribute('data-sanc-role', 'bar');
                if (el.getAttribute('data-sanc-sig') !== themeSig) {
                    el.setAttribute('data-sanc-sig', themeSig);
                    el.style.setProperty('background-color', 'rgba(' + SANC_BG_R + ', ' + SANC_BG_G + ', ' + SANC_BG_B + ', 0.62)', 'important');
                    el.style.setProperty('backdrop-filter', 'blur(16px)', 'important');
                    el.style.setProperty('-webkit-backdrop-filter', 'blur(16px)', 'important');
                    el.style.setProperty('border-color', 'rgba(255, 255, 255, 0.08)', 'important');
                }
                continue;
            }

            // Case C: Interactive UI surface (search bars, pills, buttons, cards with neutral gray #202124..#444)
            if (rect.width < vw * 0.78 && rect.width >= 36 && rect.height >= 24 && rect.height <= 420 && isNeutralDark(origBg, 20, 72)) {
                lockOriginalBg(el);
                const parentPill = el.parentElement ? el.parentElement.closest('[data-sanc-role="pill"]') : null;
                if (parentPill) {
                    if (el.getAttribute('data-sanc-sig') !== themeSig) {
                        el.setAttribute('data-sanc-sig', themeSig);
                        el.style.setProperty('background-color', 'transparent', 'important');
                        el.style.setProperty('box-shadow', 'none', 'important');
                    }
                } else {
                    el.setAttribute('data-sanc-role', 'pill');
                    if (el.getAttribute('data-sanc-sig') !== themeSig) {
                        el.setAttribute('data-sanc-sig', themeSig);
                        el.style.setProperty('background-color', 'rgba(' + pillR + ', ' + pillG + ', ' + pillB + ', 0.68)', 'important');
                        el.style.setProperty('backdrop-filter', 'blur(14px)', 'important');
                        el.style.setProperty('-webkit-backdrop-filter', 'blur(14px)', 'important');
                        el.style.setProperty('border-color', 'rgba(255, 255, 255, 0.14)', 'important');
                        el.style.setProperty('box-shadow', 'inset 0 1px 0 0 rgba(255, 255, 255, 0.15), 0 6px 18px rgba(0, 0, 0, 0.24)', 'important');
                    }
                }
            }
        }
    };

    window.__sanc_harmonize = harmonizePageSurfaces;
    harmonizePageSurfaces();

    // Attach instant DOM MutationObserver & scroll/resize listeners once per document
    // so new elements are harmonized on the exact frame they mount without flashing
    if (!window.__sanctuary_dom_observer_v1 && document.documentElement) {
        window.__sanctuary_dom_observer_v1 = true;
        let rafPending = false;
        const scheduleHarmonize = () => {
            if (rafPending) return;
            rafPending = true;
            requestAnimationFrame(() => {
                rafPending = false;
                if (typeof window.__sanc_harmonize === 'function') window.__sanc_harmonize();
                if (typeof window.__sanc_update_scrollbar === 'function') window.__sanc_update_scrollbar();
            });
        };
        const mo = new MutationObserver(scheduleHarmonize);
        mo.observe(document.documentElement, { childList: true, subtree: true });
        window.addEventListener('scroll', () => {
            if (typeof window.__sanc_update_scrollbar === 'function') window.__sanc_update_scrollbar();
        }, { passive: true });
        window.addEventListener('resize', scheduleHarmonize, { passive: true });
        document.addEventListener('DOMContentLoaded', scheduleHarmonize);
        window.addEventListener('load', scheduleHarmonize);
    }
} catch (e) {}

if (!window.__sanctuary_fs_injected) {
    window.__sanctuary_fs_injected = true;

    // Fullscreen Hook Override
    let currentFsElement = null;
    try {
        Object.defineProperty(document, 'fullscreenElement', { get: () => currentFsElement, configurable: true });
        Object.defineProperty(document, 'webkitFullscreenElement', { get: () => currentFsElement, configurable: true });
    } catch(e) {}

    function setFs(el) {
        currentFsElement = el;
        try {
            const url = new URL(window.location.href);
            if (el) url.searchParams.set("sanc_fs", "true");
            else url.searchParams.delete("sanc_fs");
            window.history.replaceState({}, "", url.toString());
            setTimeout(() => {
                document.dispatchEvent(new Event('fullscreenchange'));
                document.dispatchEvent(new Event('webkitfullscreenchange'));
            }, 10);
        } catch(e) {}
    }

    try {
        const origReq = Element.prototype.requestFullscreen || Element.prototype.webkitRequestFullscreen;
        if (origReq) {
           Element.prototype.requestFullscreen = function() { setFs(this); return Promise.resolve(); };
           Element.prototype.webkitRequestFullscreen = function() { setFs(this); return Promise.resolve(); };
        }
        const origExit = Document.prototype.exitFullscreen || Document.prototype.webkitExitFullscreen;
        if (origExit) {
           Document.prototype.exitFullscreen = function() { setFs(null); return Promise.resolve(); };
           Document.prototype.webkitExitFullscreen = function() { setFs(null); return Promise.resolve(); };
        }
    } catch(e) {}

    const origReplace = window.history.replaceState;
    window.history.replaceState = function(...args) {
        if (currentFsElement && args[2]) {
            try {
                const u = new URL(args[2], window.location.href);
                u.searchParams.set("sanc_fs", "true");
                args[2] = u.toString();
            } catch(e) {}
        }
        return origReplace.apply(this, args);
    };

    const origPush = window.history.pushState;
    window.history.pushState = function(...args) {
        if (currentFsElement && args[2]) {
            try {
                const u = new URL(args[2], window.location.href);
                u.searchParams.set("sanc_fs", "true");
                args[2] = u.toString();
            } catch(e) {}
        }
        return origPush.apply(this, args);
    };

    // Context Menu Handler (Trusted-Types Safe — Zero innerHTML)
    const ctxHandler = e => {
        if (!e.isTrusted) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        const isInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable;
        const selection = window.getSelection();
        const hasSelection = selection ? selection.toString().length > 0 : false;
        const a = e.target.closest('a');
        const isLink = a && a.href;
        const isVideo = e.target.tagName === 'VIDEO';

        let menu = document.getElementById('sanc-ctx-menu');
        if (menu) menu.remove();
        
        menu = document.createElement('div');
        menu.id = 'sanc-ctx-menu';
        menu.style.cssText = "position:fixed; z-index:2147483647; box-sizing:border-box; background:rgba(10, 18, 36, 0.78); backdrop-filter:blur(28px); -webkit-backdrop-filter:blur(28px); border:1px solid rgba(255,255,255,0.16); border-radius:12px; padding:5px; display:flex; flex-direction:column; width:180px; min-width:180px; box-shadow:0 18px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.22); overflow:hidden; font-family:system-ui, -apple-system, sans-serif;";

        const makeBtn = (text, action) => {
            const b = document.createElement('button');
            b.style.cssText = "box-sizing:border-box; background:transparent; border:none; border-radius:8px; color:rgba(255,255,255,0.9); padding:7px 12px; text-align:left; cursor:pointer; font-family:system-ui, -apple-system, sans-serif; font-size:13px; font-weight:500; margin:0; transition:background-color 0.15s; display:flex; align-items:center; gap:10px; width:100%; line-height:18px;";
            const labelSpan = document.createElement('span');
            labelSpan.textContent = text;
            b.appendChild(labelSpan);
            b.onmouseover = () => { b.style.background = "rgba(255,255,255,0.10)"; };
            b.onmouseout = () => { b.style.background = "transparent"; };
            b.onclick = (clickEv) => {
                if (!clickEv.isTrusted) return;
                if (action === 'paste') window.location.hash = "sanctuary-action=" + SANC_BRIDGE_TOKEN + ":paste";
                else if (action === 'reload') window.location.reload();
                else if (action === 'back') window.history.back();
                else if (action === 'newTab' && isLink) {
                    window.location.hash = "sanctuary-new-tab=" + encodeURIComponent(a.href);
                    setTimeout(() => window.history.replaceState(null, '', window.location.pathname + window.location.search), 50);
                } else if (action === 'copyLink' && isLink) {
                    window.location.hash = "sanctuary-action=" + SANC_BRIDGE_TOKEN + ":copyText=" + encodeURIComponent(a.href);
                    setTimeout(() => window.history.replaceState(null, '', window.location.pathname + window.location.search), 50);
                } else if (action === 'copyVideo' && isVideo) {
                    let videoUrl = window.location.href;
                    if (isLink && a && a.href && (a.href.includes('/watch') || a.href.includes('/shorts'))) {
                        videoUrl = a.href;
                    }
                    window.location.hash = "sanctuary-action=" + SANC_BRIDGE_TOKEN + ":copyText=" + encodeURIComponent(videoUrl);
                    setTimeout(() => window.history.replaceState(null, '', window.location.pathname + window.location.search), 50);
                }
                else document.execCommand(action);
                menu.style.display = 'none';
            };
            return b;
        };
        
        if (isLink) {
            menu.appendChild(makeBtn("Open Link in New Tab", "newTab"));
            menu.appendChild(makeBtn("Copy Link Address", "copyLink"));
            const div = document.createElement('div');
            div.style.cssText = "height:1px; background:rgba(255,255,255,0.12); margin:4px 0; width:100%;";
            menu.appendChild(div);
        }
        
        if (isVideo) {
            menu.appendChild(makeBtn("Copy Video URL", "copyVideo"));
            const div = document.createElement('div');
            div.style.cssText = "height:1px; background:rgba(255,255,255,0.12); margin:4px 0; width:100%;";
            menu.appendChild(div);
        }
        
        if (isInput) menu.appendChild(makeBtn("Cut", "cut"));
        if (hasSelection) menu.appendChild(makeBtn("Copy", "copy"));
        if (isInput) menu.appendChild(makeBtn("Paste", "paste"));
        if (isInput) menu.appendChild(makeBtn("Select All", "selectAll"));
        
        if (isInput || hasSelection) {
            const div = document.createElement('div');
            div.style.cssText = "height:1px; background:rgba(255,255,255,0.12); margin:4px 0; width:100%;";
            menu.appendChild(div);
        }
        
        menu.appendChild(makeBtn("Reload Page", "reload"));
        menu.appendChild(makeBtn("Go Back", "back"));
        
        document.body.appendChild(menu);
        
        window.addEventListener('mousedown', (ev) => {
            if (menu && !menu.contains(ev.target)) menu.style.display = 'none';
        }, { capture: true, once: true });
        
        let mx = e.clientX;
        let my = e.clientY;
        if (mx + 200 > window.innerWidth) mx -= 200;
        if (my + 220 > window.innerHeight) my -= 220;
        menu.style.left = mx + 'px';
        menu.style.top = my + 'px';
        menu.style.display = 'flex';
    };
    window.addEventListener('contextmenu', ctxHandler, { capture: true, passive: false });
    
    // Middle click new tab
    window.addEventListener('auxclick', e => {
        if (e.button === 1) {
            const a = e.target.closest('a');
            if (a && a.href) {
                e.preventDefault();
                e.stopPropagation();
                window.location.hash = "sanctuary-new-tab=" + encodeURIComponent(a.href);
                setTimeout(() => {
                    window.history.replaceState(null, '', window.location.pathname + window.location.search);
                }, 50);
            }
        }
    }, true);
    
    // Remove target="_blank"
    const handleLinks = () => {
        document.querySelectorAll('a').forEach(a => {
            if (a.getAttribute('target') === '_blank') {
                a.removeAttribute('target');
            }
        });
    };
    
    // Download hook
    window.addEventListener('click', e => {
        const a = e.target.closest('a');
        if (a && a.href) {
            try {
                const url = new URL(a.href);
                const ext = url.pathname.split('.').pop().toLowerCase();
                if (['zip', 'rar', '7z', 'package', 'ts4script', 'exe', 'msi', 'pdf'].includes(ext)) {
                    e.preventDefault();
                    e.stopPropagation();
                    let ifr = document.getElementById('sanc-download-frame');
                    if (!ifr) {
                        ifr = document.createElement('iframe');
                        ifr.id = 'sanc-download-frame';
                        ifr.style.display = 'none';
                        document.body.appendChild(ifr);
                    }
                    ifr.src = a.href;
                }
            } catch(err) {}
        }
    }, true);
    
    // Prevent native window.open
    window.open = function(url) {
        if (url) window.location.href = url;
        return null;
    };
    
    setInterval(handleLinks, 2000);
    handleLinks();
}

if (!window.__sanctuary_checkout_watcher_v1) {
    window.__sanctuary_checkout_watcher_v1 = true;

    const parseStripeUsdAmounts = (text) => {
        if (!text) return 0;
        const matches = text.match(/\\$\\s*(\\d+(?:,\\d{3})*(?:\\.\\d{2})?)/g) || [];
        let maxUsd = 0;
        for (const m of matches) {
            const num = parseFloat(m.replace(/[^0-9.]/g, ''));
            if (!isNaN(num) && num > maxUsd && num <= 10000) {
                maxUsd = num;
            }
        }
        return maxUsd;
    };

    const checkStripeDonationCompletion = () => {
        try {
            const host = (window.location.hostname || '').toLowerCase();
            if (!host.includes('stripe.com')) return;

            const pathMatch = (window.location.pathname || '').match(/\\/c\\/pay\\/(cs_[a-zA-Z0-9_]+)/);
            if (!pathMatch || !pathMatch[1]) return;
            const sessionId = pathMatch[1];

            if (sessionStorage.getItem('sanctuary_checkout_claimed_' + sessionId) === 'true') {
                return;
            }

            const bodyText = (document.body && document.body.innerText) ? document.body.innerText : '';
            const lowerText = bodyText.toLowerCase();

            const isConfirmation =
                lowerText.includes('thanks for your donation') ||
                lowerText.includes('thanks for your payment') ||
                lowerText.includes('thank you for your donation') ||
                lowerText.includes('thank you for your payment') ||
                lowerText.includes('thanks for your order') ||
                lowerText.includes('payment successful') ||
                lowerText.includes('will appear on your statement');

            const visibleUsd = parseStripeUsdAmounts(bodyText);

            if (!isConfirmation) {
                if (visibleUsd > 0) {
                    const prevSub = parseFloat(sessionStorage.getItem('sanctuary_checkout_subtotal_' + sessionId) || '0');
                    if (visibleUsd > prevSub) {
                        sessionStorage.setItem('sanctuary_checkout_subtotal_' + sessionId, String(visibleUsd));
                    }
                }
                return;
            }

            sessionStorage.setItem('sanctuary_checkout_claimed_' + sessionId, 'true');

            const savedSubtotal = parseFloat(sessionStorage.getItem('sanctuary_checkout_subtotal_' + sessionId) || '0');
            const amountUsd = Math.max(visibleUsd, isNaN(savedSubtotal) ? 0 : savedSubtotal, 5);

            const payload = JSON.stringify({
                sessionId: sessionId,
                amountUsd: amountUsd
            });
            window.location.hash = 'sanctuary-action=' + SANC_BRIDGE_TOKEN + ':stripeCheckoutSuccess=' + encodeURIComponent(payload);
        } catch (e) {}
    };

    setInterval(checkStripeDonationCompletion, 900);
    checkStripeDonationCompletion();
}
})();
`;
