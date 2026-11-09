/* Luna GameZone touch and responsive controls for the MIT-licensed Javascript Racer engine. */
(() => {
  "use strict";
  const canvas = document.getElementById("canvas");
  const stage = document.getElementById("racerStage");
  const pressed = new Set();

  const controls = {
    raceLeft: "keyLeft",
    raceRight: "keyRight",
    raceGas: "keyFaster",
    raceBrake: "keySlower"
  };

  function setKey(key, value) {
    // The original engine declares these as top-level vars, so they are also
    // exposed on window in a classic script.
    window[key] = value;
  }

  function releaseAll() {
    for (const key of pressed) setKey(key, false);
    pressed.clear();
    document.querySelectorAll(".race-control.is-down").forEach((button) => {
      button.classList.remove("is-down");
    });
  }

  Object.entries(controls).forEach(([id, key]) => {
    const button = document.getElementById(id);
    if (!button) return;
    const down = (event) => {
      event.preventDefault();
      if (button.setPointerCapture && event.pointerId !== undefined) {
        try { button.setPointerCapture(event.pointerId); } catch (_) {}
      }
      pressed.add(key);
      setKey(key, true);
      button.classList.add("is-down");
    };
    const up = (event) => {
      if (event) event.preventDefault();
      pressed.delete(key);
      setKey(key, false);
      button.classList.remove("is-down");
    };
    button.addEventListener("pointerdown", down, {passive:false});
    button.addEventListener("pointerup", up, {passive:false});
    button.addEventListener("pointercancel", up, {passive:false});
    button.addEventListener("lostpointercapture", up, {passive:false});
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  });

  window.addEventListener("pointerup", () => {
    // Release only controls whose pointer capture was interrupted by the OS.
    for (const key of Array.from(pressed)) {
      const active = document.querySelector(".race-control.is-down");
      if (!active) { setKey(key, false); pressed.delete(key); }
    }
  });
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseAll();
  });
  document.addEventListener("keydown", (event) => {
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(event.key)) {
      event.preventDefault();
    }
  }, {passive:false});

  let resizeFrame = 0;
  function resizeRace() {
    if (!canvas || !stage || typeof window.raceReset !== "function") return;
    // clientWidth/clientHeight are the layout dimensions before the
    // portrait-mode 90-degree transform. getBoundingClientRect() is rotated.
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    if (stageWidth < 120 || stageHeight < 120) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(480, Math.round(stageWidth * dpr));
    const height = Math.max(320, Math.round(stageHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      window.raceReset({width, height});
    }
  }
  function scheduleResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(resizeRace);
  }
  if (window.ResizeObserver && stage) {
    new ResizeObserver(scheduleResize).observe(stage);
  }
  window.addEventListener("resize", scheduleResize, {passive:true});
  window.addEventListener("orientationchange", () => setTimeout(scheduleResize, 180), {passive:true});
  window.addEventListener("load", () => {
    scheduleResize();
    setTimeout(scheduleResize, 280);
  });
  scheduleResize();
})();
