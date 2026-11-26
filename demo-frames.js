(() => {
  "use strict";

  const panels = [...document.querySelectorAll(".demo-panel")];
  const send = (frame, message) => frame.contentWindow.postMessage(message, "*");
  const syncTheme = () => panels.forEach(panel => {
    const frame = panel.querySelector("iframe");
    if (frame.hasAttribute("src")) send(frame, { type: "demo-theme", theme: document.documentElement.dataset.theme });
  });

  panels.forEach(panel => {
    const frame = panel.querySelector("iframe");
    const syncVisibility = () => {
      if (!panel.hidden && !frame.hasAttribute("src")) frame.src = frame.dataset.src;
      if (frame.hasAttribute("src")) send(frame, { type: "demo-visibility", visible: !panel.hidden });
    };
    frame.addEventListener("load", () => {
      syncTheme();
      syncVisibility();
    });
    new MutationObserver(syncVisibility).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    syncVisibility();
  });

  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("message", event => {
    const panel = panels.find(item => item.querySelector("iframe").contentWindow === event.source);
    if (!panel || event.data?.type !== "demo-height" || !Number.isFinite(event.data.height) || event.data.height <= 0) return;
    panel.querySelector("iframe").style.height = `${Math.ceil(event.data.height)}px`;
  });
})();
