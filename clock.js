(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const wheels = [...document.querySelectorAll('.wheel')];
  const secondsReadouts = [...document.querySelectorAll('.seconds')];
  const DAY = 24 * 60 * 60;
  const wrap = (value, length) => ((value % length) + length) % length;
  const pad = (value) => String(value).padStart(2, '0');
  const localSeconds = () => {
    const now = new Date();
    return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
  };
  let live = true;
  let time = localSeconds();
  let lastMinute = -1;
  let lastSecond = -1;
  let announcementTimer;
  let activeDrag = null;

  // Every LED uses the same 22 × 6 hexagon, rotated for vertical bars.
  // Symmetric placement leaves a visible gap at every joint, including the middle.
  const segmentShape = [[-11, 0], [-8, -3], [8, -3], [11, 0], [8, 3], [-8, 3]];
  const segments = [
    [15, 6, false], [27, 20, true], [27, 48, true],
    [15, 62, false], [3, 48, true], [3, 20, true], [15, 34, false]
  ].map(([cx, cy, vertical]) => segmentShape.map(([x, y]) =>
    `${cx + (vertical ? -y : x)},${cy + (vertical ? x : y)}`
  ).join(' '));
  const digitSegments = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
  function numberSVG(value, leadingZero = true) {
    const digits = String(value).padStart(2, leadingZero ? '0' : ' ').split('').map((digit, index) =>
      digit === ' ' ? '' : `<g transform="translate(${index * 38 + 3} 0)">${segments.map((points, segment) =>
        `<polygon class="segment ${digitSegments[Number(digit)].includes('abcdefg'[segment]) ? 'on' : 'off'}" points="${points}"/>`
      ).join('')}</g>`
    ).join('');
    return `<svg viewBox="0 0 74 68" fill="currentColor" focusable="false">${digits}</svg>`;
  }
  const numberCache = Array.from({ length: 60 }, (_, value) => numberSVG(value));
  const hour12Cache = Array.from({ length: 13 }, (_, value) => numberSVG(value, false));

  // Hour markers and minute ticks share the hands' exact center.
  $('markers').innerHTML = Array.from({ length: 60 }, (_, index) => {
    const rotation = `rotate(${index * 6} 100 100)`;
    if (index % 5 === 0) {
      return `<rect class="hour-mark" x="98.5" y="9" width="3" height="11" rx=".8" transform="${rotation}"/>`;
    }
    return `<path class="minute-mark" d="M100 10v4" transform="${rotation}"/>`;
  }).join('');

  const dayColors = {
    room: '#eee5d6', 'room-top': '#fff8e9', ink: '#403d35', muted: '#7f7b6e', line: '#cfc7b8',
    dial: '#f6f0df', 'dial-outer': '#e9e3d2', 'dial-ink': '#343e35', lume: '#e9e5cc',
    metal: '#aaa494', 'metal-light': '#f5edda', inset: '#e3decd', second: '#997746',
    case: '#8b6247', 'case-light': '#bb9670', 'case-dark': '#59402f',
    lcd: '#d7ddba', digits: '#354936',
    case24: '#ccc7b8', 'case24-light': '#efebdf', 'case24-dark': '#9c988e', lcd24: '#d4ded1', digits24: '#354b43'
  };
  const nightColors = {
    room: '#080c10', 'room-top': '#0c1217', ink: '#a1ada9', muted: '#74817d', line: '#202b30',
    dial: '#10191a', 'dial-outer': '#0b1114', 'dial-ink': '#a2ddbc', lume: '#bbf5c9',
    metal: '#202a2d', 'metal-light': '#374246', inset: '#0c1516', second: '#719b86',
    case: '#1b1918', 'case-light': '#2b2724', 'case-dark': '#100f10',
    lcd: '#090e0f', digits: '#edba75',
    case24: '#20282b', 'case24-light': '#303a3d', 'case24-dark': '#101719', lcd24: '#090f11', digits24: '#9dd9bf'
  };
  function mix(a, b, amount) {
    const rgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    return `rgb(${rgb(a).map((value, index) => Math.round(value + (rgb(b)[index] - value) * amount)).join(', ')})`;
  }
  function luminance(color) {
    const rgb = color.startsWith('#')
      ? [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
      : color.match(/[\d.]+/g).map(Number);
    return rgb.reduce((sum, value, index) => {
      const channel = value / 255;
      return sum + (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
    }, 0);
  }
  function readableInk(preferred, background) {
    const light = luminance(background);
    const ink = luminance(preferred);
    const contrast = (Math.max(light, ink) + .05) / (Math.min(light, ink) + .05);
    // Cross-fading dark daytime ink into luminous night ink makes it disappear
    // against the dimming face around 18:20. Keep a contrasting foreground
    // during that crossover; the cases and room still dim continuously.
    if (contrast >= 4.5) return preferred;
    return (light + .05) / .05 >= 1.05 / (light + .05) ? '#000000' : '#ffffff';
  }
  const smooth = (x) => x * x * (3 - 2 * x);
  function renderLighting(hour) {
    // Dawn: 05:00–08:00. Dusk: 17:00–20:00. No daylight after 20:00.
    const sunlight = hour < 5 || hour >= 20 ? 0
      : hour < 8 ? smooth((hour - 5) / 3)
      : hour < 17 ? 1 : 1 - smooth((hour - 17) / 3);
    const colors = Object.fromEntries(Object.keys(dayColors).map((key) => [key, mix(nightColors[key], dayColors[key], sunlight)]));
    for (const [ink, background] of [['digits', 'lcd'], ['digits24', 'lcd24'], ['dial-ink', 'dial'], ['ink', 'room'], ['muted', 'room']]) {
      colors[ink] = readableInk(colors[ink], colors[background]);
    }
    for (const [key, color] of Object.entries(colors)) root.style.setProperty(`--${key}`, color);
    // Reflections can wash out pale ink during dusk; show them only over dark ink.
    for (const [reflection, ink, background] of [
      ['screen-reflection', 'digits', 'lcd'], ['reflection24', 'digits24', 'lcd24'], ['dial-reflection', 'dial-ink', 'dial']
    ]) {
      root.style.setProperty(`--${reflection}`, luminance(colors[ink]) < luminance(colors[background]) ? sunlight : 0);
    }
    root.style.setProperty('--sun', sunlight);
    root.style.setProperty('--night', 1 - sunlight);
    root.style.setProperty('--lume-glow', `rgba(141, 255, 185, ${(1 - sunlight) * .65})`);
    root.style.setProperty('--digital-glow', `rgba(255, 173, 77, ${(1 - sunlight) * .45})`);
    root.style.setProperty('--glow24', `rgba(135, 255, 206, ${(1 - sunlight) * .4})`);
    root.style.colorScheme = sunlight < .3 ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').content = mix(nightColors.room, dayColors.room, sunlight);
  }
  function displayValue(wheel, delta = 0) {
    if (wheel.dataset.unit === 'minutes') return wrap(Math.floor(time / 60) + delta, 60);
    const hours = wrap(Math.floor(time / 3600) + delta, 24);
    return wheel.dataset.format === '12' ? hours % 12 || 12 : hours;
  }
  function render(force = false) {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor(time / 60) % 60;
    const seconds = time % 60;
    $('hour-hand').setAttribute('transform', `rotate(${(time / 3600 % 12) * 30} 100 100)`);
    $('minute-hand').setAttribute('transform', `rotate(${(time / 60 % 60) * 6} 100 100)`);
    $('second-hand').setAttribute('transform', `rotate(${seconds * 6} 100 100)`);
    if (Math.floor(seconds) !== lastSecond || force) {
      secondsReadouts.forEach((element) => { element.textContent = `:${pad(Math.floor(seconds))}`; });
      lastSecond = Math.floor(seconds);
    }
    if (Math.floor(time / 60) === lastMinute && !force) return;
    lastMinute = Math.floor(time / 60);
    wheels.forEach((wheel) => {
      const cache = wheel.dataset.unit === 'hours' && wheel.dataset.format === '12' ? hour12Cache : numberCache;
      wheel.querySelector('.reel').innerHTML = [-1, 0, 1].map((delta) => cache[displayValue(wheel, delta)]).join('');
      wheel.setAttribute('aria-valuenow', displayValue(wheel));
      wheel.setAttribute('aria-valuetext', `${displayValue(wheel)} ${wheel.dataset.unit}${wheel.dataset.unit === 'hours' && wheel.dataset.format === '12' ? (hours < 12 ? ' AM' : ' PM') : ''}`);
    });
    const period = hours < 12 ? 'AM' : 'PM';
    $('analog-period').textContent = period;
    $('am').setAttribute('aria-pressed', hours < 12);
    $('pm').setAttribute('aria-pressed', hours >= 12);
    $('analog').setAttribute('aria-label', `Analog clock: ${hours % 12 || 12}:${pad(minutes)} ${period}`);
    // Lighting changes restyle the whole scene. Defer them while dragging so
    // pointer moves only update the clock readouts and hands.
    if (activeDrag) activeDrag.lightingPending = true;
    else renderLighting(hours + minutes / 60);
  }
  function announce() {
    clearTimeout(announcementTimer);
    announcementTimer = setTimeout(() => {
      const hours = Math.floor(time / 3600);
      $('announcement').textContent = `${live ? 'Live local time.' : 'Time paused.'} ${hours % 12 || 12}:${pad(Math.floor(time / 60) % 60)} ${hours < 12 ? 'AM' : 'PM'}.`;
    }, 180);
  }
  function adjust(unit, steps) {
    if (!steps) return;
    if (live) time = localSeconds();
    live = false;
    // Once edited, use an exact minute and freeze every clock, including seconds.
    time = wrap(Math.floor(time / 60) * 60 + steps * (unit === 'hours' ? 3600 : 60), DAY);
    document.body.dataset.live = 'false';
    $('mode').textContent = 'Paused · Now';
    render(true);
    announce();
  }

  function finishDrag() {
    if (!activeDrag) return;
    const { wheel, pointerId, lightingPending } = activeDrag;
    activeDrag = null;
    wheel.querySelector('.reel').style.transform = '';
    if (wheel.hasPointerCapture(pointerId)) wheel.releasePointerCapture(pointerId);
    if (lightingPending) renderLighting(Math.floor(time / 60) / 60);
  }
  wheels.forEach((wheel) => {
    const reel = wheel.querySelector('.reel');
    let wheelRemainder = 0;
    let wheelTime = 0;
    wheel.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0 || activeDrag) return;
      wheel.focus({ preventScroll: true });
      wheel.setPointerCapture(event.pointerId);
      activeDrag = {
        wheel, pointerId: event.pointerId, startY: event.clientY, steps: 0,
        stepSize: Math.max(18, Math.min(32, wheel.clientHeight * .3))
      };
    });
    wheel.addEventListener('pointermove', (event) => {
      if (!activeDrag || activeDrag.wheel !== wheel || activeDrag.pointerId !== event.pointerId) return;
      const drag = activeDrag;
      const position = (drag.startY - event.clientY) / drag.stepSize;
      const steps = Math.sign(position) * Math.round(Math.abs(position));
      // Commit the nearest visible digit while the pointer is still down.
      // Use the gesture's total displacement so reversing direction immediately
      // restores the matching time on both digital clocks and the analog face.
      if (steps !== drag.steps) {
        adjust(wheel.dataset.unit, steps - drag.steps);
        drag.steps = steps;
      }
      reel.style.transform = `translateY(${-(position - steps) * wheel.clientHeight}px)`;
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
      wheel.addEventListener(type, (event) => {
        if (activeDrag?.wheel === wheel && activeDrag.pointerId === event.pointerId) finishDrag();
      });
    });
    wheel.addEventListener('wheel', (event) => {
      event.preventDefault();
      if (activeDrag) return;
      if (event.timeStamp - wheelTime > 200) wheelRemainder = 0;
      wheelTime = event.timeStamp;
      wheelRemainder -= event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? wheel.clientHeight : 1);
      const steps = Math.trunc(wheelRemainder / 40);
      if (steps) { adjust(wheel.dataset.unit, steps); wheelRemainder -= steps * 40; }
    }, { passive: false });
    wheel.addEventListener('keydown', (event) => {
      const steps = { ArrowUp: 1, ArrowDown: -1, ArrowRight: 1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[event.key];
      if (steps) { event.preventDefault(); finishDrag(); adjust(wheel.dataset.unit, steps); }
    });
  });
  ['am', 'pm'].forEach((id) => $(id).addEventListener('click', () => { finishDrag(); adjust('hours', 12); }));
  [['hour-back', -1], ['hour-forward', 1]].forEach(([id, steps]) => {
    $(id).addEventListener('click', () => { finishDrag(); adjust('hours', steps); });
  });
  $('now').addEventListener('click', () => {
    finishDrag();
    live = true;
    time = localSeconds();
    document.body.dataset.live = 'true';
    $('mode').textContent = 'Live local time';
    render(true);
    announce();
  });
  window.addEventListener('blur', finishDrag);
  document.addEventListener('visibilitychange', () => {
    finishDrag();
    if (!document.hidden && live) { time = localSeconds(); render(true); }
  });
  render(true);
  setInterval(() => {
    if (live && !document.hidden) { time = localSeconds(); render(); }
  }, 100);
})();
