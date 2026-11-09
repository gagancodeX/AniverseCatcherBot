/* Luna GameZone mobile racing controls and responsive high-density canvas sizing. */
(() => {
  "use strict";
  const canvas = document.getElementById("canvas");
  const stage = document.getElementById("racerStage");
  const steerPad = document.getElementById("steerPad");
  const steerWheel = document.getElementById("steerWheel");
  const activeKeys = new Set();

  function setKey(name, value) {
    window[name] = value;
  }

  function releaseKey(name) {
    activeKeys.delete(name);
    setKey(name, false);
    document.querySelectorAll('[data-key="' + name + '"]').forEach((node) => node.classList.remove("is-down"));
  }

  function bindHold(id, key) {
    const control = document.getElementById(id);
    if (!control) return;
    control.dataset.key = key;
    const down = (event) => {
      event.preventDefault();
      if (control.setPointerCapture && event.pointerId !== undefined) {
        try { control.setPointerCapture(event.pointerId); } catch (_) {}
      }
      activeKeys.add(key);
      setKey(key, true);
      control.classList.add("is-down");
    };
    const up = (event) => {
      if (event) event.preventDefault();
      releaseKey(key);
    };
    control.addEventListener("pointerdown", down, {passive:false});
    control.addEventListener("pointerup", up, {passive:false});
    control.addEventListener("pointercancel", up, {passive:false});
    control.addEventListener("lostpointercapture", up, {passive:false});
    control.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  bindHold("raceGas", "keyFaster");
  bindHold("raceBrake", "keySlower");
  bindHold("raceBoost", "keyBoost");

  let steeringPointer = null;
  function steerFromPointer(event) {
    if (!steerPad) return;
    const rect = steerPad.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width * .34);
    const steering = Math.max(-1, Math.min(1, dx));
    const deadZone = .16;
    setKey("keyLeft", steering < -deadZone);
    setKey("keyRight", steering > deadZone);
    if (steerWheel) steerWheel.style.transform = "rotate(" + (steering * 125) + "deg)";
    steerPad.classList.add("is-down");
  }
  function releaseSteering(event) {
    if (event && steeringPointer !== null && event.pointerId !== steeringPointer) return;
    steeringPointer = null;
    setKey("keyLeft", false);
    setKey("keyRight", false);
    if (steerWheel) steerWheel.style.transform = "rotate(0deg)";
    if (steerPad) steerPad.classList.remove("is-down");
  }
  if (steerPad) {
    steerPad.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      steeringPointer = event.pointerId;
      if (steerPad.setPointerCapture) {
        try { steerPad.setPointerCapture(event.pointerId); } catch (_) {}
      }
      steerFromPointer(event);
    }, {passive:false});
    steerPad.addEventListener("pointermove", (event) => {
      if (steeringPointer !== event.pointerId) return;
      event.preventDefault();
      steerFromPointer(event);
    }, {passive:false});
    ["pointerup","pointercancel","lostpointercapture"].forEach((name) => {
      steerPad.addEventListener(name, releaseSteering, {passive:false});
    });
    steerPad.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  function releaseAll() {
    Array.from(activeKeys).forEach(releaseKey);
    releaseSteering();
  }
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseAll();
  });

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
      event.preventDefault();
      setKey("keyBoost", true);
    }
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(event.key)) event.preventDefault();
  }, {passive:false});
  document.addEventListener("keyup", (event) => {
    if (event.code === "Space" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
      event.preventDefault();
      setKey("keyBoost", false);
    }
  }, {passive:false});

  let resizeFrame = 0;
  function resizeRace() {
    if (!canvas || !stage || typeof window.raceReset !== "function") return;
    // Use the real viewport dimensions: no rotated bounding box and no forced landscape mode.
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    if (stageWidth < 120 || stageHeight < 160) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(360, Math.round(stageWidth * dpr));
    const height = Math.max(360, Math.round(stageHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      window.raceReset({width, height});
    }
  }
  function scheduleResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(resizeRace);
  }
  if (window.ResizeObserver && stage) new ResizeObserver(scheduleResize).observe(stage);
  window.addEventListener("resize", scheduleResize, {passive:true});
  window.addEventListener("orientationchange", () => {
    releaseAll();
    setTimeout(scheduleResize, 160);
  }, {passive:true});
  window.addEventListener("load", () => {
    scheduleResize();
    setTimeout(scheduleResize, 260);
  });
  scheduleResize();
})();