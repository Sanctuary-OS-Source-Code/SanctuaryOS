export const INJECTED_BROWSER_CSS = ``;

export const INJECTED_BROWSER_SCRIPT = `
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

    // Context Menu Handler
    const ctxHandler = e => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        const isInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable;
        const selection = window.getSelection();
        const hasSelection = selection ? selection.toString().length > 0 : false;
        const a = e.target.closest('a');
        const isLink = a && a.href;
        const isVideo = e.target.tagName === 'VIDEO';
        
        if (!document.getElementById('sanc-font')) {
            const style = document.createElement('style');
            style.id = 'sanc-font';
            style.textContent = "@keyframes sanc-fade-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }";
            document.head.appendChild(style);
        }

        let menu = document.getElementById('sanc-ctx-menu');
        if (menu) menu.remove();
        
        menu = document.createElement('div');
        menu.id = 'sanc-ctx-menu';
        menu.style.cssText = "position:fixed; z-index:2147483647; box-sizing:border-box; background:rgba(128,128,128,0.15); backdrop-filter:blur(32px); -webkit-backdrop-filter:blur(32px); border:1px solid rgba(128,128,128,0.2); border-radius:10px; padding:4px 0; display:flex; flex-direction:column; width:170px; min-width:170px; box-shadow:0 15px 35px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.05); overflow:hidden; font-family:system-ui, -apple-system, sans-serif; animation: sanc-fade-in 0.1s ease-out;";
        
        const getIcon = (action) => {
            const svgAttrs = 'width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6; transition:opacity 0.15s;"';
            if (action === 'newTab') return '<svg ' + svgAttrs + '><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
            if (action === 'copyLink') return '<svg ' + svgAttrs + '><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
            if (action === 'copyVideo') return '<svg ' + svgAttrs + '><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>';
            if (action === 'cut') return '<svg ' + svgAttrs + '><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>';
            if (action === 'copy') return '<svg ' + svgAttrs + '><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            if (action === 'paste') return '<svg ' + svgAttrs + '><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
            if (action === 'selectAll') return '<svg ' + svgAttrs + '><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 9h6v6H9z"/></svg>';
            if (action === 'reload') return '<svg ' + svgAttrs + '><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
            if (action === 'back') return '<svg ' + svgAttrs + '><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';
            return '';
        };

        const makeBtn = (text, action) => {
            const b = document.createElement('button');
            b.style.cssText = "box-sizing:border-box; background:transparent; border:none; color:rgba(255,255,255,0.85); padding:6px 14px; text-align:left; cursor:pointer; font-family:system-ui, -apple-system, sans-serif; font-size:14px; font-weight:400; margin:0; transition:background-color 0.15s; display:flex; align-items:center; gap:10px; width:100%; line-height:20px; text-shadow:0 1px 2px rgba(0,0,0,0.3);";
            b.innerHTML = getIcon(action) + '<span>' + text + '</span>';
            b.onmouseover = () => { b.style.background = "rgba(255,255,255,0.1)"; const svg = b.querySelector('svg'); if(svg) svg.style.opacity = "1"; };
            b.onmouseout = () => { b.style.background = "transparent"; const svg = b.querySelector('svg'); if(svg) svg.style.opacity = "0.5"; };
            b.onclick = () => {
                const doCopy = (text) => {
                    let success = false;
                    try {
                        const el = document.createElement('textarea');
                        el.value = text;
                        document.body.appendChild(el);
                        el.select();
                        success = document.execCommand('copy');
                        document.body.removeChild(el);
                    } catch(e) {}
                    
                    if (!success && navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text).catch(console.error);
                    }
                };

                if (action === 'paste') window.location.hash = "sanctuary-action=paste";
                else if (action === 'reload') window.location.reload();
                else if (action === 'back') window.history.back();
                else if (action === 'newTab' && isLink) {
                    window.location.hash = "sanctuary-new-tab=" + encodeURIComponent(a.href);
                    setTimeout(() => window.history.replaceState(null, '', window.location.pathname + window.location.search), 50);
                } else if (action === 'copyLink' && isLink) {
                    window.location.hash = "sanctuary-action=copyText=" + encodeURIComponent(a.href);
                    setTimeout(() => window.history.replaceState(null, '', window.location.pathname + window.location.search), 50);
                } else if (action === 'copyVideo' && isVideo) {
                    let videoUrl = window.location.href;
                    if (isLink && a && a.href && (a.href.includes('/watch') || a.href.includes('/shorts'))) {
                        videoUrl = a.href;
                    }
                    window.location.hash = "sanctuary-action=copyText=" + encodeURIComponent(videoUrl);
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
            div.style.cssText = "height:1px; background:rgba(128,128,128,0.2); margin:4px 0; width:100%;";
            menu.appendChild(div);
        }
        
        if (isVideo) {
            menu.appendChild(makeBtn("Copy Video URL", "copyVideo"));
            const div = document.createElement('div');
            div.style.cssText = "height:1px; background:rgba(128,128,128,0.2); margin:4px 0; width:100%;";
            menu.appendChild(div);
        }
        
        if (isInput) menu.appendChild(makeBtn("Cut", "cut"));
        if (hasSelection) menu.appendChild(makeBtn("Copy", "copy"));
        if (isInput) menu.appendChild(makeBtn("Paste", "paste"));
        if (isInput) menu.appendChild(makeBtn("Select All", "selectAll"));
        
        if (isInput || hasSelection) {
            const div = document.createElement('div');
            div.style.cssText = "height:1px; background:rgba(128,128,128,0.2); margin:4px 0; width:100%;";
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
`;
