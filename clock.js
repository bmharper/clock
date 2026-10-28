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

  // The seven segments are vector shapes, so no font or network is needed.
  const segments = [
    '5,2 25,2 29,6 25,10 5,10 1,6',
    '26,11 30,7 30,29 26,33 22,29 22,15',
    '26,35 30,39 30,61 26,57 22,53 22,39',
    '5,58 25,58 29,62 25,66 5,66 1,62',
    '4,35 8,39 8,53 4,57 0,61 0,39',
    '4,11 8,15 8,29 4,33 0,29 0,7',
    '5,30 25,30 29,34 25,38 5,38 1,34'
  ];
  const digitSegments = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
  function numberSVG(value) {
    const digits = pad(value).split('').map((digit, index) =>
      `<g transform="translate(${index * 38 + 3} 0)">${segments.map((points, segment) =>
        `<polygon class="segment ${digitSegments[Number(digit)].includes('abcdefg'[segment]) ? 'on' : 'off'}" points="${points}"/>`
      ).join('')}</g>`
    ).join('');
    return `<svg viewBox="0 0 74 68" fill="currentColor" focusable="false">${digits}</svg>`;
  }
  const numberCache = Array.from({ length: 60 }, (_, value) => numberSVG(value));

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
  const smooth = (x) => x * x * (3 - 2 * x);
  let lastLight = '';
  function renderLighting(hour) {
    // Dawn: 05:00–08:00. Dusk: 17:00–20:00. No daylight after 20:00.
    const sunlight = hour < 5 || hour >= 20 ? 0
      : hour < 8 ? smooth((hour - 5) / 3)
      : hour < 17 ? 1 : 1 - smooth((hour - 17) / 3);
    for (const key of Object.keys(dayColors)) root.style.setProperty(`--${key}`, mix(nightColors[key], dayColors[key], sunlight));
    root.style.setProperty('--sun', sunlight);
    root.style.setProperty('--night', 1 - sunlight);
    root.style.setProperty('--lume-glow', `rgba(141, 255, 185, ${(1 - sunlight) * .65})`);
    root.style.setProperty('--digital-glow', `rgba(255, 173, 77, ${(1 - sunlight) * .45})`);
    root.style.setProperty('--glow24', `rgba(135, 255, 206, ${(1 - sunlight) * .4})`);
    root.style.colorScheme = sunlight < .3 ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').content = mix(nightColors.room, dayColors.room, sunlight);
    const label = sunlight === 0 ? 'Night glow' : hour < 8 ? 'Morning light' : hour >= 17 ? 'Evening light' : 'Daylight';
    if (label !== lastLight) {
      $('light-label').textContent = label;
      $('light-icon').innerHTML = sunlight === 0
        ? '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>'
        : '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>';
      lastLight = label;
    }
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
      wheel.querySelector('.reel').innerHTML = [-1, 0, 1].map((delta) => numberCache[displayValue(wheel, delta)]).join('');
      wheel.setAttribute('aria-valuenow', displayValue(wheel));
      wheel.setAttribute('aria-valuetext', `${displayValue(wheel)} ${wheel.dataset.unit}${wheel.dataset.unit === 'hours' && wheel.dataset.format === '12' ? (hours < 12 ? ' AM' : ' PM') : ''}`);
    });
    const period = hours < 12 ? 'AM' : 'PM';
    $('analog-period').textContent = period;
    $('am').setAttribute('aria-pressed', hours < 12);
    $('pm').setAttribute('aria-pressed', hours >= 12);
    $('analog').setAttribute('aria-label', `Analog clock: ${hours % 12 || 12}:${pad(minutes)} ${period}`);
    renderLighting(hours + minutes / 60);
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
    const { wheel, pointerId } = activeDrag;
    activeDrag = null;
    wheel.querySelector('.reel').style.transform = '';
    if (wheel.hasPointerCapture(pointerId)) wheel.releasePointerCapture(pointerId);
  }
  wheels.forEach((wheel) => {
    const reel = wheel.querySelector('.reel');
    let wheelRemainder = 0;
    let wheelTime = 0;
    wheel.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0 || activeDrag) return;
      wheel.focus({ preventScroll: true });
      wheel.setPointerCapture(event.pointerId);
      activeDrag = { wheel, pointerId: event.pointerId, y: event.clientY, remainder: 0 };
    });
    wheel.addEventListener('pointermove', (event) => {
      if (!activeDrag || activeDrag.wheel !== wheel || activeDrag.pointerId !== event.pointerId) return;
      const drag = activeDrag;
      drag.remainder += drag.y - event.clientY;
      drag.y = event.clientY;
      const stepSize = Math.max(18, wheel.clientHeight * .38);
      const steps = Math.trunc(drag.remainder / stepSize);
      if (steps) { adjust(wheel.dataset.unit, steps); drag.remainder -= steps * stepSize; }
      // Reveal the next/previous number as the finger turns the virtual wheel.
      reel.style.transform = `translateY(${-drag.remainder / stepSize * wheel.clientHeight}px)`;
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
