(function () {
  try {
    var pref = localStorage.getItem("bld_theme");
    var normalizedPref = pref === "light" || pref === "dark" ? pref : "system";
    var colorSchemeValue =
      normalizedPref === "system" ? "light dark" : normalizedPref;

    var schemeMeta = document.querySelector('meta[name="color-scheme"]');
    if (schemeMeta) {
      schemeMeta.setAttribute("content", colorSchemeValue);
    }

    var prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    var isDark =
      normalizedPref === "dark" || (normalizedPref === "system" && prefersDark);

    var root = document.documentElement;
    root.dataset.themePref = normalizedPref;
    root.dataset.theme = isDark ? "dark" : "light";

    var themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", isDark ? "#1a1114" : "#570008");
    }
  } catch {
    // Ignore restricted storage environments; CSS media queries still apply.
  }
})();

