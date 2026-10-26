/* Pinpoint Airports — find the airport from its three-letter code on a blank world map. */
(() => {
  'use strict';

  const ROUNDS = 5;
  const MAX_POINTS = 1000;
  const PERFECT_KM = 20;     // closer than this scores full marks
  const FALLOFF_KM = 1000;   // beyond that, points decay by 1/e every 1,000 km
  const KM_PER_MI = 1.609344;
  const EARTH_RADIUS_KM = 6371.0088;
  const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';

  // Daily flights ramp up: two famous hubs, two major airports, one deep cut.
  const DAILY_TIERS = [[1], [1], [2], [2], [3]];
  const DIFFICULTY = {
    easy: { tiers: [1], note: 'World-famous hubs — LHR, JFK, HND and friends.' },
    normal: { tiers: [1, 2], note: 'Big international airports from every continent.' },
    hard: { tiers: [2, 3], note: 'Regional, remote and oddball airports. Good luck with MPN.' },
  };
  const DEMO_CODES = ['LHR', 'JFK', 'HND', 'CDG', 'SYD', 'DXB', 'GRU', 'SIN', 'LAX', 'CPT', 'KEF', 'AKL'];

  const COUNTRY_NAMES = window.COUNTRY_NAMES;
  const AIRPORTS = window.AIRPORT_DATA.map(([code, name, city, cc, lat, lon, tier]) => ({ code, name, city, cc, lat, lon, tier }));
  const AIRPORT_BY_CODE = new Map(AIRPORTS.map((a) => [a.code, a]));

  const $ = (id) => document.getElementById(id);
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Storage (best effort; private windows may refuse) ----------
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    },
  };

  // ---------- Helpers ----------
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function seededRandom(text) {
    let h = 1779033703 ^ text.length;
    for (let i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickAirports(rand, tiersPerRound) {
    const used = new Set();
    return tiersPerRound.map((tiers) => {
      const pool = AIRPORTS.filter((a) => tiers.includes(a.tier) && !used.has(a.code));
      const airport = pool[Math.floor(rand() * pool.length)];
      used.add(airport.code);
      return airport;
    });
  }

  const lonLat = (a) => [a.lon, a.lat];
  const distanceKm = (from, to) => d3.geoDistance(from, to) * EARTH_RADIUS_KM;

  function scoreFor(km) {
    if (km <= PERFECT_KM) return MAX_POINTS;
    return Math.round(MAX_POINTS * Math.exp(-(km - PERFECT_KM) / FALLOFF_KM));
  }

  const fmtInt = (n) => Math.round(n).toLocaleString('en-US');

  function fmtDistance(km) {
    const value = units === 'mi' ? km / KM_PER_MI : km;
    return `${fmtInt(value)} ${units}`;
  }

  function scoreClass(points) {
    if (points >= 900) return 's-great';
    if (points >= 600) return 's-good';
    if (points >= 300) return 's-ok';
    return 's-poor';
  }

  function scoreSquare(points) {
    if (points >= 900) return '🟩';
    if (points >= 600) return '🟨';
    if (points >= 300) return '🟧';
    return '🟥';
  }

  function rating(total) {
    const share = total / (ROUNDS * MAX_POINTS);
    if (share >= 0.92) return 'Air traffic controller';
    if (share >= 0.78) return 'Captain';
    if (share >= 0.62) return 'First officer';
    if (share >= 0.42) return 'Frequent flyer';
    if (share >= 0.22) return 'Tourist';
    return 'Lost luggage';
  }

  const placeName = (a) => `${a.city}, ${COUNTRY_NAMES[a.cc] || a.cc}`;

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let toastTimer;
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  // ---------- Split-flap board ----------
  function setFlaps(el, text, { animate = true, label = text } = {}) {
    const chars = [...text];
    const token = {};
    el._flapToken = token;
    el.setAttribute('aria-label', label);
    el.innerHTML = chars.map(() => '<span class="flap" aria-hidden="true"><span class="flap-char"></span></span>').join('');
    const cells = [...el.querySelectorAll('.flap-char')];

    if (!animate || reducedMotion()) {
      cells.forEach((cell, i) => { cell.textContent = chars[i]; });
      return;
    }

    cells.forEach((cell, i) => {
      const target = chars[i];
      const alphabet = /\d/.test(target) ? '0123456789' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (!/[A-Z0-9]/.test(target)) { cell.textContent = target; return; }
      let ticks = 7 + i * 4;
      const tick = () => {
        if (el._flapToken !== token) return;
        const flap = cell.parentElement;
        flap.classList.remove('flip');
        void flap.offsetWidth; // restart the CSS animation
        flap.classList.add('flip');
        if (--ticks <= 0) { cell.textContent = target; return; }
        cell.textContent = alphabet[Math.floor(Math.random() * alphabet.length)];
        setTimeout(tick, 60);
      };
      tick();
    });
  }

  // ---------- Map ----------
  const map = (() => {
    const W = 960;
    const sphere = { type: 'Sphere' };
    const projection = d3.geoNaturalEarth1().fitWidth(W, sphere);
    const path = d3.geoPath(projection);
    const H = Math.ceil(path.bounds(sphere)[1][1]);
    projection.fitExtent([[1, 1], [W - 1, H - 1]], sphere);

    const svg = d3.select('#map').attr('viewBox', `0 0 ${W} ${H}`);
    const viewport = svg.append('g');
    viewport.append('path').datum(sphere).attr('class', 'sphere').attr('d', path);
    viewport.append('path').datum(d3.geoGraticule10()).attr('class', 'graticule').attr('d', path);
    const landLayer = viewport.append('path').attr('class', 'land');
    const hitLayer = viewport.append('path').attr('class', 'country-hit');
    const borderLayer = viewport.append('path').attr('class', 'borders');
    viewport.append('path').datum(sphere).attr('class', 'sphere-outline').attr('d', path);
    const routeLayer = viewport.append('g');
    const pinLayer = viewport.append('g');

    let transform = d3.zoomIdentity;
    let pins = [];
    let pickHandler = null;
    let countries = [];
    let userBorders = false;
    let revealed = false;

    const zoom = d3.zoom()
      .scaleExtent([1, 60])
      .translateExtent([[0, 0], [W, H]])
      .clickDistance(6)
      .on('zoom', (event) => {
        transform = event.transform;
        viewport.attr('transform', transform);
        drawPins();
      });

    svg.call(zoom).on('dblclick.zoom', null);

    svg.on('click', (event) => {
      if (!pickHandler) return;
      const [x, y] = transform.invert(d3.pointer(event, svg.node()));
      const ll = projection.invert([x, y]);
      if (!ll || !(Math.abs(ll[0]) <= 180 && Math.abs(ll[1]) <= 90)) return;
      pickHandler(ll);
    });

    function drawPins() {
      const k = transform.k;
      const sel = pinLayer.selectAll('g.pin').data(pins, (d) => d.id);
      sel.exit().remove();
      const enter = sel.enter().append('g').attr('class', (d) => `pin pin-${d.kind} fresh`);
      enter.append('circle').attr('class', 'halo');
      enter.append('circle').attr('class', 'dot');
      enter.append('text').attr('x', 11).attr('y', -9);
      const all = enter.merge(sel);
      all.attr('transform', (d) => {
        const [x, y] = projection(d.ll);
        return `translate(${x},${y}) scale(${1 / k})`;
      });
      all.select('.halo').attr('r', (d) => (d.kind === 'target' && !d.small ? 13 : 0));
      all.select('.dot').attr('r', (d) => (d.small ? 4.5 : 7));
      all.select('text').text((d) => d.label || '');
    }

    function zoomTo(t, duration = 750) {
      const ms = reducedMotion() ? 0 : duration;
      svg.interrupt().transition().duration(ms).ease(d3.easeCubicInOut).call(zoom.transform, t);
    }

    function fitTo(geometry, maxScale = 7) {
      const [[x0, y0], [x1, y1]] = path.bounds(geometry);
      const dx = Math.max(x1 - x0, 50);
      const dy = Math.max(y1 - y0, 50);
      const k = Math.max(1, Math.min(maxScale, 0.7 / Math.max(dx / W, dy / H)));
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      zoomTo(d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-cx, -cy), 900);
    }

    function syncBorders() {
      svg.classed('show-borders', userBorders || revealed);
    }

    function countryAt(ll) {
      return countries.find((f) => d3.geoContains(f, ll)) || null;
    }

    const ready = d3.json(WORLD_URL).then((topo) => {
      landLayer.datum(topojson.feature(topo, topo.objects.land)).attr('d', path);
      borderLayer.datum(topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b)).attr('d', path);
      countries = topojson.feature(topo, topo.objects.countries).features;
      $('map-loading').hidden = true;
    }).catch((err) => {
      console.error(err);
      $('map-loading').textContent = 'Map failed to load — check your connection and refresh.';
      throw err;
    });

    return {
      ready,
      setPickHandler(fn) {
        pickHandler = fn;
        svg.classed('locked', !fn);
      },
      reset() {
        pins = [];
        revealed = false;
        routeLayer.selectAll('*').remove();
        hitLayer.attr('d', null);
        syncBorders();
        drawPins();
        zoomTo(d3.zoomIdentity, 500);
      },
      setGuess(ll) {
        pins = [{ id: 'guess', kind: 'guess', ll }];
        drawPins();
      },
      reveal(guess, airport) {
        const target = lonLat(airport);
        revealed = true;
        syncBorders();
        const hit = countryAt(target);
        hitLayer.attr('d', hit ? path(hit) : null);

        const interpolate = d3.geoInterpolate(guess, target);
        routeLayer.append('path')
          .attr('class', 'route')
          .transition()
          .duration(reducedMotion() ? 0 : 900)
          .ease(d3.easeCubicInOut)
          .attrTween('d', () => (t) => path({ type: 'LineString', coordinates: [guess, interpolate(t)] }) || '');

        pins = [
          { id: 'guess', kind: 'guess', ll: guess },
          { id: `target-${airport.code}`, kind: 'target', ll: target, label: airport.code },
        ];
        drawPins();
        fitTo({ type: 'LineString', coordinates: [guess, target] });
      },
      showAll(legs) {
        revealed = true;
        syncBorders();
        hitLayer.attr('d', null);
        routeLayer.selectAll('*').remove();
        legs.forEach(({ guess, airport }) => {
          routeLayer.append('path').attr('class', 'route faint')
            .attr('d', path({ type: 'LineString', coordinates: [guess, lonLat(airport)] }) || '');
        });
        pins = legs.flatMap(({ guess, airport }, i) => [
          { id: `g${i}`, kind: 'guess', ll: guess, small: true },
          { id: `t${i}`, kind: 'target', ll: lonLat(airport), label: airport.code, small: true },
        ]);
        drawPins();
        zoomTo(d3.zoomIdentity, 600);
      },
      setBorders(on) {
        userBorders = on;
        syncBorders();
      },
      zoomBy(factor) {
        svg.interrupt().transition().duration(reducedMotion() ? 0 : 250).call(zoom.scaleBy, factor);
      },
      resetZoom() {
        zoomTo(d3.zoomIdentity, 500);
      },
      countryAt,
    };
  })();

  // ---------- State ----------
  let units = store.get('ppa:units', 'mi') === 'km' ? 'km' : 'mi';
  let difficulty = DIFFICULTY[store.get('ppa:difficulty', 'normal')] ? store.get('ppa:difficulty', 'normal') : 'normal';
  let state = null;
  let demoTimer = null;

  const dailyStoreKey = (dateKey) => `ppa:daily:${dateKey}`;

  function loadDailyResults(dateKey, airports) {
    const saved = store.get(dailyStoreKey(dateKey), []);
    if (!Array.isArray(saved)) return [];
    // Discard progress if the airport list changed since it was saved.
    const valid = saved.every((r, i) => airports[i] && r && r.code === airports[i].code && Array.isArray(r.guess));
    return valid ? saved.slice(0, ROUNDS) : [];
  }

  function dailyAirports(dateKey) {
    return pickAirports(seededRandom(`pinpoint-airports:${dateKey}`), DAILY_TIERS);
  }

  const totalOf = (results) => results.reduce((sum, r) => sum + r.points, 0);

  // ---------- Screens ----------
  function showScreen(name) {
    $('home').hidden = name !== 'home';
    $('game').hidden = name !== 'game';
    $('back').hidden = name === 'home';
    window.scrollTo({ top: 0 });
    if (name === 'home') renderHome(); else stopDemo();
  }

  function renderHome() {
    const dateKey = todayKey();
    $('home-kicker').textContent = `Map games · Daily · ${dateKey}`;

    const results = loadDailyResults(dateKey, dailyAirports(dateKey));
    const done = results.length >= ROUNDS;
    $('play-daily').textContent = done
      ? 'See today’s result →'
      : results.length ? `Resume today’s flight (${results.length}/${ROUNDS}) →` : 'Start today’s flight →';
    $('daily-note').textContent = done
      ? `Today: ${fmtInt(totalOf(results))} / ${fmtInt(ROUNDS * MAX_POINTS)} · new flight at midnight`
      : 'Same five airports for everyone today';

    document.querySelectorAll('#difficulty button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.difficulty === difficulty));
    });
    $('difficulty-note').textContent = DIFFICULTY[difficulty].note;

    const examples = [PERFECT_KM, 250, 1000, 3000];
    $('rules').innerHTML = examples.map((km) => {
      const label = km === PERFECT_KM ? `< ${fmtDistance(km)}` : fmtDistance(km);
      return `<div><dt>${escapeHtml(label)}</dt><dd>${fmtInt(scoreFor(km))} pts</dd></div>`;
    }).join('');

    const stats = store.get('ppa:stats', { played: 0, best: 0 });
    $('stats').textContent = stats.played
      ? `Flights flown · ${fmtInt(stats.played)}    Best · ${fmtInt(stats.best)}`
      : `${ROUNDS} rounds · up to ${fmtInt(MAX_POINTS)} points each · ${AIRPORTS.length} airports`;

    startDemo();
  }

  function startDemo() {
    stopDemo();
    let i = Math.floor(Math.random() * DEMO_CODES.length);
    const show = () => {
      const code = DEMO_CODES[i % DEMO_CODES.length];
      setFlaps($('demo-flaps'), code);
      $('demo-sub').textContent = `${AIRPORT_BY_CODE.get(code).city}`;
      i++;
    };
    show();
    if (!reducedMotion()) demoTimer = setInterval(show, 3200);
  }

  function stopDemo() {
    clearInterval(demoTimer);
    demoTimer = null;
  }

  // ---------- Game flow ----------
  function startGame(mode) {
    if (mode === 'daily') {
      const dateKey = todayKey();
      const airports = dailyAirports(dateKey);
      const results = loadDailyResults(dateKey, airports);
      state = { mode, dateKey, airports, results, index: results.length, phase: 'guess', guess: null };
    } else {
      const tiers = DIFFICULTY[difficulty].tiers;
      state = {
        mode,
        difficulty,
        airports: pickAirports(Math.random, Array.from({ length: ROUNDS }, () => tiers)),
        results: [],
        index: 0,
        phase: 'guess',
        guess: null,
      };
    }
    showScreen('game');
    if (state.index >= ROUNDS) showSummary();
    else startRound();
  }

  function startRound() {
    state.phase = 'guess';
    state.guess = null;
    const airport = state.airports[state.index];
    updateStatus();
    $('board-label').textContent = 'Find this airport';
    $('board-sub').textContent = state.mode === 'daily' ? `Daily · ${state.dateKey}` : `Random · ${state.difficulty}`;
    setFlaps($('flaps'), airport.code, { label: `Airport code ${airport.code.split('').join(' ')}` });
    map.reset();
    map.setPickHandler((ll) => {
      state.guess = ll;
      map.setGuess(ll);
      renderPanel();
    });
    renderPanel();
  }

  function lockIn() {
    if (!state || state.phase !== 'guess' || !state.guess) return;
    const airport = state.airports[state.index];
    const km = distanceKm(state.guess, lonLat(airport));
    const points = scoreFor(km);
    state.results.push({ code: airport.code, guess: state.guess.map((v) => +v.toFixed(4)), km: Math.round(km), points });
    state.phase = 'reveal';
    map.setPickHandler(null);
    map.reveal(state.guess, airport);
    if (state.mode === 'daily') store.set(dailyStoreKey(state.dateKey), state.results);
    updateStatus();
    renderPanel();
    if (state.results.length === ROUNDS) recordStats();
  }

  function nextRound() {
    if (!state || state.phase !== 'reveal') return;
    state.index += 1;
    if (state.index >= ROUNDS) showSummary();
    else startRound();
  }

  function recordStats() {
    const stats = store.get('ppa:stats', { played: 0, best: 0 });
    const total = totalOf(state.results);
    store.set('ppa:stats', { played: (stats.played || 0) + 1, best: Math.max(stats.best || 0, total) });
  }

  function showSummary() {
    state.phase = 'summary';
    state.index = ROUNDS;
    const total = totalOf(state.results);
    updateStatus();
    $('board-label').textContent = 'Final score';
    $('board-sub').textContent = rating(total);
    setFlaps($('flaps'), String(total), { label: `Final score ${total}` });
    map.setPickHandler(null);
    map.showAll(state.results.map((r, i) => ({ guess: r.guess, airport: state.airports[i] })));
    renderPanel();
  }

  function updateStatus() {
    const round = Math.min(state.index + 1, ROUNDS);
    $('round-label').textContent = state.phase === 'summary' ? `Complete · ${ROUNDS} / ${ROUNDS}` : `Round ${round} / ${ROUNDS}`;
    $('score-label').textContent = `Score · ${fmtInt(totalOf(state.results))}`;
  }

  // ---------- Panel ----------
  function renderPanel() {
    const panel = $('panel');
    if (!state) { panel.innerHTML = ''; return; }

    if (state.phase === 'guess') {
      const hint = state.guess
        ? 'Pin dropped. <span class="muted">Tap again to move it.</span>'
        : 'Tap the map to drop your pin. <span class="muted">Scroll or pinch to zoom.</span>';
      panel.innerHTML = `
        <p class="hint">${hint}</p>
        <button class="btn btn-primary" type="button" data-action="lock" ${state.guess ? '' : 'disabled'}>Lock in guess →</button>`;
      return;
    }

    if (state.phase === 'reveal') {
      const airport = state.airports[state.index];
      const result = state.results[state.index];
      const last = state.index === ROUNDS - 1;
      const soFar = (state.index + 1) * MAX_POINTS;
      panel.innerHTML = `
        <div class="card result">
          <div class="span-2"><div class="label">Airport</div><div class="value big"><span class="code">${airport.code}</span> · ${escapeHtml(airport.name)}</div></div>
          <div class="span-2"><div class="label">Location</div><div class="value">${escapeHtml(placeName(airport))}</div></div>
          <div><div class="label">Distance</div><div class="value">${fmtDistance(result.km)}</div></div>
          <div><div class="label">Round score</div><div class="value ${scoreClass(result.points)}">+${fmtInt(result.points)}</div></div>
          <div class="span-2 total"><div class="label">Running total</div><div class="value">${fmtInt(totalOf(state.results))} / ${fmtInt(soFar)}</div></div>
        </div>
        <button class="btn btn-primary" type="button" data-action="next">${last ? 'See results →' : 'Next round →'}</button>`;
      panel.querySelector('[data-action="next"]').focus({ preventScroll: true });
      return;
    }

    // Summary
    const total = totalOf(state.results);
    const heading = state.mode === 'daily' ? `Today’s flight · ${state.dateKey}` : `Random flight · ${state.difficulty}`;
    const legs = state.results.map((r, i) => {
      const airport = state.airports[i];
      return `<li>
          <span class="leg-code">${airport.code}</span>
          <span class="leg-place" title="${escapeHtml(airport.name)}">${escapeHtml(placeName(airport))}</span>
          <span class="leg-dist">${fmtDistance(r.km)}</span>
          <span class="leg-pts ${scoreClass(r.points)}">+${fmtInt(r.points)}</span>
        </li>`;
    }).join('');
    panel.innerHTML = `
      <div class="card">
        <div class="label">${escapeHtml(heading)}</div>
        <div class="summary-head">
          <div class="summary-total">${fmtInt(total)} <span>/ ${fmtInt(ROUNDS * MAX_POINTS)}</span></div>
          <div class="rating">${escapeHtml(rating(total))}</div>
        </div>
        <ol class="legs">${legs}</ol>
      </div>
      <div class="actions-row">
        <button class="btn btn-primary" type="button" data-action="share">Share result</button>
        <button class="btn btn-secondary" type="button" data-action="random">Random flight →</button>
      </div>
      ${state.mode === 'daily' ? '<p class="footnote">A new daily flight boards at midnight</p>' : ''}`;
  }

  function shareText() {
    const total = totalOf(state.results);
    const title = state.mode === 'daily' ? `Pinpoint Airports · ${state.dateKey}` : `Pinpoint Airports · random (${state.difficulty})`;
    const squares = state.results.map((r) => scoreSquare(r.points)).join('');
    const codes = state.airports.map((a) => a.code).join(' ');
    const lines = [title, `✈ ${fmtInt(total)} / ${fmtInt(ROUNDS * MAX_POINTS)} — ${rating(total)}`, squares];
    if (state.mode !== 'daily') lines.push(codes);
    lines.push(location.origin + location.pathname);
    return lines.join('\n');
  }

  async function share() {
    const text = shareText();
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ text }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Result copied');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      toast(ok ? 'Result copied' : 'Copy failed');
    }
  }

  // ---------- Events ----------
  function setUnits(next) {
    units = next;
    store.set('ppa:units', units);
    document.querySelectorAll('.units button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.units === units)));
    if (!$('home').hidden) renderHome();
    else renderPanel();
  }

  function bind() {
    $('play-daily').addEventListener('click', () => startGame('daily'));
    $('play-random').addEventListener('click', () => startGame('random'));
    $('back').addEventListener('click', () => { state = null; showScreen('home'); });
    $('brand').addEventListener('click', (e) => { e.preventDefault(); state = null; showScreen('home'); });

    document.querySelectorAll('.units button').forEach((b) => b.addEventListener('click', () => setUnits(b.dataset.units)));

    $('difficulty').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-difficulty]');
      if (!btn) return;
      difficulty = btn.dataset.difficulty;
      store.set('ppa:difficulty', difficulty);
      renderHome();
    });

    $('panel').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'lock') lockIn();
      else if (action === 'next') nextRound();
      else if (action === 'share') share();
      else if (action === 'random') startGame('random');
    });

    document.querySelector('.map-tools').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-zoom]');
      if (!btn) return;
      if (btn.dataset.zoom === 'in') map.zoomBy(2);
      else if (btn.dataset.zoom === 'out') map.zoomBy(0.5);
      else map.resetZoom();
    });

    const bordersToggle = $('borders-toggle');
    bordersToggle.checked = store.get('ppa:borders', false) === true;
    map.setBorders(bordersToggle.checked);
    bordersToggle.addEventListener('change', () => {
      store.set('ppa:borders', bordersToggle.checked);
      map.setBorders(bordersToggle.checked);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !state || $('game').hidden) return;
      if (e.target instanceof Element && e.target.closest('button, input, a')) return;
      if (state.phase === 'guess') lockIn();
      else if (state.phase === 'reveal') nextRound();
    });
  }

  // Exposed for console debugging and data checks.
  window.pinpoint = { AIRPORTS, map, scoreFor, distanceKm };

  bind();
  setUnits(units);
  showScreen('home');
})();
