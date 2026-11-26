(() => {
  "use strict";

  if (window.parent === window) return;

  const shell = document.querySelector(".site-shell");
  let resizeFrame = 0;
  function reportHeight() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const height = shell.getBoundingClientRect().bottom + window.scrollY;
      if (height > 0) window.parent.postMessage({ type: "demo-height", height }, "*");
    });
  }
  window.addEventListener("message", event => {
    if (event.source !== window.parent) return;
    if (event.data?.type === "demo-theme" && (event.data.theme === "light" || event.data.theme === "dark")) {
      document.documentElement.dataset.theme = event.data.theme;
    } else if (event.data?.type === "demo-visibility" && event.data.visible) {
      reportHeight();
    }
  });
  window.addEventListener("resize", reportHeight);
  new ResizeObserver(reportHeight).observe(shell);
  reportHeight();
})();
