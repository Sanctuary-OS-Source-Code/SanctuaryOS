(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get("lab_overlay") === "1") {
      document.documentElement.style.setProperty("--bg", "transparent");
      document.documentElement.style.setProperty("--boot-bg-image", "none");
      document.documentElement.style.backgroundColor = "transparent";
      document.documentElement.style.backgroundImage = "none";
      return;
    }
    var builtins = {
      architect: { bg: "#040812", sidebar: "#040812", topBar: "#1d2737", bottomBar: "#0e2244", bgImage: "/themes/architect.png" },
      radiant: { bg: "#f4f6fb", sidebar: "#f8faff", topBar: "#dfe5f2", bottomBar: "#d8deec", bgImage: "/themes/radiant.png" },
      aurora: { bg: "#030712", sidebar: "#050b1a", topBar: "#0c353d", bottomBar: "#0e2229", bgImage: "/themes/aurora.png" },
      bunker: { bg: "#020604", sidebar: "#040c08", topBar: "#365345", bottomBar: "#192e21", bgImage: "/themes/bunker.png" },
      synthwave: { bg: "#090214", sidebar: "#0d041d", topBar: "#141236", bottomBar: "#291d48", bgImage: "/themes/synthwave.png" },
      dracula: { bg: "#12101b", sidebar: "#171422", topBar: "#211632", bottomBar: "#262646", bgImage: "/themes/dracula.png" },
      true_glass: { bg: "transparent", sidebar: "#080c14", topBar: "#152238", bottomBar: "#0e1a2d", bgImage: "", transparentWindow: true }
    };
    var isNativeDesktop = Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
    var bootUa = navigator.userAgent || "";
    if (isNativeDesktop && /Linux/i.test(bootUa) && !/Android/i.test(bootUa)) {
      document.documentElement.setAttribute("data-sa-platform", "linux");
    }
    var host = (window.location.hostname || "").toLowerCase();
    var path = window.location.pathname || "/";
    var isWebRootHub = !isNativeDesktop && (host === "sanctuaryos.net" || host === "www.sanctuaryos.net" || host === "localhost" || host === "127.0.0.1") && (path === "/" || path === "");
    var wsId = isWebRootHub ? "default_workspace" : (localStorage.getItem("sanctuary_last_active_workspace") || "");
    if (!wsId) {
      try {
        var cfg = JSON.parse(localStorage.getItem("sanctuary_config") || "{}");
        if (cfg && cfg.active_workspace_id) wsId = cfg.active_workspace_id;
      } catch (e) {}
    }
    if (!wsId) wsId = "default";
    var useGlobal = localStorage.getItem("sanctuary_use_global_theme") === "true";
    var themeId = (useGlobal
      ? localStorage.getItem("sanctuary_global_theme")
      : localStorage.getItem("sanctuary_" + wsId + "_active_theme")) || "architect";
    var resolved = builtins[themeId] || null;
    if (!resolved) {
      try {
        var customs = JSON.parse(localStorage.getItem("sanctuary_" + wsId + "_custom_themes") || "{}");
        if (customs && customs[themeId]) resolved = customs[themeId];
      } catch (e) {}
    }
    if (!resolved) {
      try {
        var devs = JSON.parse(localStorage.getItem("sanctuary_" + wsId + "_dev_themes") || "{}");
        if (devs && devs[themeId]) resolved = devs[themeId];
      } catch (e) {}
    }
    if (!resolved) resolved = builtins.architect;
    var isPassthrough = isNativeDesktop && !resolved.bgImage && (resolved.bg === "transparent" || Boolean(resolved.transparentWindow));
    var fallbackThemeColor = (resolved.bg && resolved.bg !== "#000000" && resolved.bg !== "transparent")
      ? resolved.bg
      : ((resolved.panelTint && resolved.panelTint !== "#000000" && resolved.panelTint !== "transparent")
        ? resolved.panelTint
        : ((resolved.sidebar && resolved.sidebar !== "#000000" && resolved.sidebar !== "transparent") ? resolved.sidebar : "#1d2737"));
    var topBarColor = resolved.topBar || fallbackThemeColor || "#1d2737";
    var bottomBarColor = resolved.bottomBar || fallbackThemeColor || "#0e2244";
    var bgColor = isPassthrough ? "transparent" : (isNativeDesktop ? fallbackThemeColor : bottomBarColor);
    var root = document.documentElement;
    root.style.setProperty("--bg", fallbackThemeColor);
    root.style.setProperty("--sa-top-bar-blend", topBarColor);
    root.style.setProperty("--sa-bottom-bar-blend", bottomBarColor);
    root.style.backgroundColor = bgColor;
    var ua = navigator.userAgent || "";
    var isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var isIosStandalone = isIos && Boolean(navigator.standalone === true);
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      if (isIosStandalone) {
        themeMeta.remove();
      } else {
        themeMeta.setAttribute("content", topBarColor);
      }
    }
    if (resolved.bgImage) {
      var bgUrl = resolved.bgImage.indexOf("/themes/") === 0 && resolved.bgImage.indexOf("?") === -1
        ? resolved.bgImage + "?v=liquid_v22"
        : resolved.bgImage;
      var cssUrl = 'url("' + bgUrl + '")';
      root.style.setProperty("--boot-bg-image", cssUrl);
      root.style.backgroundImage = cssUrl;
      var img = new Image();
      img.decoding = "sync";
      img.src = bgUrl;
      window.__sanctuaryPreloadedWallpaper = img;
      window.__sanctuaryPreloadedWallpaperSrc = bgUrl;
    } else {
      root.style.setProperty("--boot-bg-image", "none");
      root.style.backgroundImage = "none";
    }
  } catch (err) {}
})();
