(() => {
  "use strict";
  const key = "synapse-theme-v1";
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  let choice = null;

  try {
    const saved = localStorage.getItem(key);
    if (saved === "dark" || saved === "light") choice = saved;
  } catch (error) {
    console.warn("AI Quiz could not read the theme preference.", error);
  }

  function applyTheme() {
    const dark = choice ? choice === "dark" : systemTheme.matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const button = document.getElementById("theme-toggle");
    if (button) {
      button.setAttribute("aria-pressed", String(dark));
      button.querySelector(".theme-icon").textContent = dark ? "☀" : "☾";
    }
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = dark ? "#111916" : "#f6f5ef";
  }

  applyTheme();
  systemTheme.addEventListener("change", () => {
    if (!choice) applyTheme();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) {
      choice = event.newValue === "dark" || event.newValue === "light" ? event.newValue : null;
      applyTheme();
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    applyTheme();
    document.getElementById("theme-toggle").addEventListener("click", () => {
      choice = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme();
      try {
        localStorage.setItem(key, choice);
      } catch (error) {
        const notice = document.getElementById("storage-notice");
        notice.textContent = "Your theme preference could not be saved. It will last for this visit.";
        notice.hidden = false;
        console.warn("AI Quiz could not save the theme preference.", error);
      }
    });
  });
})();
