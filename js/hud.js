'use strict';

// Interfaz: brújula, reloj, barras, mensajes, subtítulos y avisos.
class Hud {
  constructor(G) {
    this.G = G;
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), strip: $('compass-strip'), day: $('clock-day'), time: $('clock-time'), phase: $('clock-phase'),
      clock: $('clock'), money: $('money'), tasks: $('tasks'), cross: $('crosshair'), prompt: $('prompt'),
      subs: $('subs'), msgs: $('msgs'), inv: $('inventory'), wname: $('weapon-name'), wammo: $('weapon-ammo'),
      banner: $('banner'), bTitle: $('banner-title'), bSub: $('banner-sub'),
      health: $('bar-health'), stamina: $('bar-stamina'), battery: $('bar-battery'),
      damage: $('fx-damage'), flash: $('fx-flash'), fade: $('fx-fade'), grain: $('fx-grain'),
      power: $('power'), alert: $('alert'),
    };
    this.alertT = 0;
    this.cache = {};
    this.subsList = [];
    this.bannerT = 0;
    this.damageV = 0;
    this.flashV = 0;
    this.grainCtx = this.el.grain.getContext('2d');
    this.grainImg = this.grainCtx.createImageData(160, 90);
    this.grainT = 0;
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  set(key, el, html) {
    if (this.cache[key] === html) return;
    this.cache[key] = html;
    el.innerHTML = html;
  }

  msg(text, dur = 4) {
    const d = document.createElement('div');
    d.className = 'm';
    d.textContent = text;
    this.el.msgs.appendChild(d);
    while (this.el.msgs.children.length > 5) this.el.msgs.removeChild(this.el.msgs.firstChild);
    setTimeout(() => (d.style.opacity = '0'), dur * 1000);
    setTimeout(() => d.remove(), dur * 1000 + 700);
  }

  say(who, text, dur) {
    const t = dur || Math.max(3, text.length * 0.065);
    this.subsList.push({ who, text, t });
    if (this.subsList.length > 2) this.subsList.shift();
    this.renderSubs();
  }

  renderSubs() {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    this.set('subs', this.el.subs, this.subsList.map((s) => `<div class="sub"><span class="who">${esc(s.who)}:</span> ${esc(s.text)}</div>`).join('<br>'));
  }

  // Aviso grande en rojo (detectores de movimiento)
  alert(text) {
    this.el.alert.textContent = '⚠ ' + text;
    this.el.alert.classList.add('show');
    this.alertT = 3.5;
  }

  banner(title, sub, dur = 4) {
    this.el.bTitle.textContent = title;
    this.el.bSub.textContent = sub || '';
    this.el.banner.classList.add('show');
    this.bannerT = dur;
  }

  damage(v) { this.damageV = Math.min(1, this.damageV + 0.4 + v); }
  flash(v) { this.flashV = Math.max(this.flashV, v); }
  fade(on) { this.el.fade.style.opacity = on ? '1' : '0'; }

  // markers: lista propia de marcas (monstruo); si no se da, las del guardabosques
  compass(markers) {
    const G = this.G;
    const P = G.player;
    const W = this.el.strip.clientWidth || 460;
    const fov = Math.PI * 0.9;
    const items = [];
    const heading = P.yaw;
    const place = (worldAngle, html, cls) => {
      // Ángulo relativo: 0 = delante
      const rel = U.wrapAngle(heading - worldAngle);
      if (Math.abs(rel) > fov / 2) return;
      const x = W / 2 + (rel / (fov / 2)) * (W / 2);
      items.push(`<span class="${cls}" style="left:${x.toFixed(0)}px">${html}</span>`);
    };
    // yaw 0 mira hacia -Z (norte)
    const card = [['N', 0], ['NO', Math.PI / 4], ['O', Math.PI / 2], ['SO', Math.PI * 0.75], ['S', Math.PI], ['SE', -Math.PI * 0.75], ['E', -Math.PI / 2], ['NE', -Math.PI / 4]];
    card.forEach(([n, a]) => place(a, n, n.length === 1 ? 'cardinal' : ''));
    const markerAt = (p, icon, cls) => {
      const dx = p.x - P.pos.x, dz = p.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2) return;
      const a = Math.atan2(-dx, -dz);
      place(a, `${icon}<small>${Math.round(d)}m</small>`, 'mk ' + cls);
    };
    if (markers) markers.forEach((m) => markerAt(m.pos, m.icon, m.cls));
    else {
      markerAt({ x: 0, z: 0 }, '⌂', 'home');
      markerAt(G.village.center, '✚', 'village');
      if (G.phase === 'day') G.missions.markers().forEach((m) => markerAt(m.pos, m.icon, m.cls));
      G.story.markers().forEach((m) => markerAt(m.pos, m.icon, m.cls));
      G.roles.markers().forEach((m) => markerAt(m.pos, m.icon, m.cls));
      if (G.mp) G.mp.mateMarkers().forEach((m) => markerAt(m.pos, m.icon, m.cls));
    }
    this.set('compass', this.el.strip, items.join(''));
  }

  update(dt) {
    const G = this.G;
    if (G.role === 'monster' && G.mp) G.mp.hudMonster(this);
    else this.updateRanger();
    if (G.mp) G.mp.hudBadge(this);
    this.updateCommon(dt);
  }

  updateRanger() {
    const G = this.G;
    const P = G.player;
    this.compass();

    this.set('day', this.el.day, 'DÍA ' + G.day);
    this.set('time', this.el.time, U.fmtTime(G.clock));
    let phase = 'Día';
    const c = G.clock;
    if (G.phase === 'night') phase = 'NOCHE ' + G.day;
    else if (c < 7 * 60) phase = 'Amanecer';
    else if (c >= CFG.TIME.DUSK_WARN) phase = 'Anochece';
    else if (c >= 17 * 60) phase = 'Tarde';
    this.set('phase', this.el.phase, phase);
    this.el.clock.classList.toggle('night', G.phase === 'night');
    this.set('money', this.el.money, '$ ' + G.money);

    // Tareas
    const tasks = [];
    const ranger = G.role === 'ranger' || !G.role;
    if (P.dead && G.mp) {
      tasks.push({ t: 'Estás fuera de la partida', warn: true });
      tasks.push({ t: 'Clic: ver por los ojos de otro humano' });
    } else if (G.phase === 'day') {
      if (ranger) {
        const tl = G.missions.taskLines();
        const sl = G.story.label();
        if (sl) tasks.push({ t: sl, story: true });
        tl.forEach((t) => tasks.push({ t }));
        if (!tl.length) tasks.push({ t: `Encargos de hoy completados (${G.missions.doneCount()}/${G.missions.list.length})` });
      } else G.roles.taskLines().forEach((t) => tasks.push(t));
      if (G.mp) tasks.push({ t: `El monstruo se hace más fuerte en su guarida. Aguanta ${CFG.MP.NIGHTS} noches.` });
      if (c >= CFG.TIME.DUSK_WARN) tasks.push({ t: `Vuelve ${G.homeTo()} antes de las 20:00`, warn: true });
    } else {
      tasks.push({ t: G.mp ? `Sobrevive hasta las 06:00 (noche ${G.day} de ${CFG.MP.NIGHTS})` : 'Sobrevive hasta las 06:00' });
      if (G.storyOn && G.story.id === 'night' && G.story.ready) tasks.push({ t: 'Has quemado su guarida: está furioso', story: true });
      if (!G.atHome()) tasks.push({ t: `¡Vuelve ${G.homeTo()}!`, warn: true });
      else tasks.push({ t: 'Mantén los pestillos echados' });
      const h = G.myHome;
      if (!h && !G.power.running) tasks.push({ t: 'El generador está parado', warn: true });
      if (h === G.homes.caravan) {
        const n = h.traps.filter((t) => t.armed).length;
        tasks.push({ t: `Trampas de flash armadas: ${n}/3`, warn: n === 0 });
      } else if (h === G.homes.fort) {
        tasks.push({ t: 'Arriba hay troneras: dispara desde ahí. Los cencerros avisan de por dónde viene' });
      } else if (h === G.homes.townhall) {
        tasks.push({ t: `Farolas encendidas ${h.litCount()}/${h.maxLit} · mapa del despacho (arriba)` });
        tasks.push({ t: `Campana de alarma: ${h.rings} toque${h.rings === 1 ? '' : 's'} esta noche` });
      }
      if (!ranger) G.roles.taskLines().filter((t) => t.story || t.done).forEach((t) => tasks.push(t));
      if (G.role === 'investigator') tasks.push({ t: 'Clic: foto con flash (lo espanta) · nítida a menos de 9 m' });
      if (G.role === 'hunter') {
        tasks.push({ t: `Rifle (4) y mira (clic dcho.) · balas ${G.inv.ammo308} · puntería ${G.roles.hunt.skill}/${HUNTER_CFG.maxSkill}` });
        G.roles.hunt.taskLines().filter((t) => !t.done).slice(0, 1).forEach((t) => tasks.push(t));
      }
    }
    let head;
    if (G.phase !== 'day') head = 'NOCHE';
    else if (ranger) head = `ENCARGOS DEL DÍA (${G.missions.doneCount()}/${G.missions.list.length} hechos)`;
    else head = G.roles.head();
    this.set('tasks', this.el.tasks, `<div class="head">${head}</div>` + tasks.map((t) => `<div class="task${t.warn ? ' warn' : ''}${t.story ? ' story' : ''}${t.done ? ' done' : ''}">${t.t}</div>`).join(''));

    // Barras
    const bar = (el, v, low) => {
      el.querySelector('i').style.width = U.clamp(v, 0, 100).toFixed(1) + '%';
      el.classList.toggle('low', v < low);
    };
    bar(this.el.health, P.health, 30);
    bar(this.el.stamina, P.stamina, 15);
    bar(this.el.battery, P.battery, 15);

    const inv = G.inv;
    this.set('inv', this.el.inv,
      `Tablones <b>${inv.planks}</b> · Pilas <b>${inv.batteries}</b> · Botiquines <b>${inv.medkits}</b><br>` +
      `Cristales <b>${inv.glass}</b> · Balas <b>${inv.ammo38}</b> · Cartuchos <b>${inv.shells}</b>${inv.ammo308 || G.weapons.owned.rifle ? ` · Rifle <b>${inv.ammo308}</b>` : ''}<br>` +
      `Gasolina <b>${inv.fuel}</b> · Cámaras <b>${inv.cameras}</b> · Detectores <b>${inv.detectors}</b>` +
      (inv.flares || G.story.flags.flares || G.mp || !ranger ? ` · Bengalas <b>${inv.flares}</b>` : '') +
      (G.lockLevel > 1 ? ` · Pestillos <b>nv.${G.lockLevel}</b>` : '') +
      (ranger ? '' : '<br>' + G.roles.invLine()));

    const W = G.weapons;
    if ((W.current === 'none' || W.current === 'camera') && G.role === 'investigator') {
      this.set('wname', this.el.wname, 'Cámara' + (G.roles.flashCd > 0 ? ' · cargando flash' : ' · flash listo'));
      this.set('wammo', this.el.wammo, `<small>● REC · clic: foto · dcho.: zoom · V: medidor ${G.roles.emfOn ? 'ON' : 'OFF'}</small>`);
    } else if (W.current === 'none') {
      this.set('wname', this.el.wname, 'Linterna');
      this.set('wammo', this.el.wammo, P.flashOn ? 'ON' : 'OFF');
    } else if (W.current === 'camera') {
      this.set('wname', this.el.wname, 'Cámara de fotos' + (G.roles.flashCd > 0 ? ' · cargando flash' : ''));
      this.set('wammo', this.el.wammo, `<small>${G.roles.recOn ? '● REC · ' : ''}clic: foto</small>`);
    } else {
      const w = CFG.WEAPONS[W.current];
      this.set('wname', this.el.wname, w.name + (W.reloading > 0 ? ' · recargando' : ''));
      this.set('wammo', this.el.wammo, `${W.mag[W.current]}<small> / ${inv[w.ammo]}</small>`);
    }

    // Generador
    const pw = G.power;
    const pct = Math.round(pw.fuel);
    const st = pw.running ? (pw.dipT > 0 ? 'FALLO' : 'ON') : 'OFF';
    this.set('power', this.el.power, `⚡ Generador <b class="${pct < 15 ? 'low' : ''}">${pct}%</b> · ${st}${pw.flood && pw.powered ? ' · FOCO' : ''}`);
  }

  updateCommon(dt) {
    const G = this.G;
    const P = G.player;
    if (this.alertT > 0) {
      this.alertT -= dt;
      if (this.alertT <= 0) this.el.alert.classList.remove('show');
    }

    // Prompt de interacción
    const tgt = G.target;
    if (tgt && !P.climb) {
      const pr = tgt.prompt(G);
      if (pr) {
        const html = `<div class="p-title">${pr.title}</div>` + pr.lines.map((l) => `<div class="p-line">${l}</div>`).join('') + (pr.info || []).filter(Boolean).map((l) => `<div class="p-info">${l}</div>`).join('');
        this.set('prompt', this.el.prompt, html);
        this.el.cross.classList.add('active');
      } else this.clearPrompt();
    } else this.clearPrompt();

    // Subtítulos
    let changed = false;
    this.subsList.forEach((s) => (s.t -= dt));
    const before = this.subsList.length;
    this.subsList = this.subsList.filter((s) => s.t > 0);
    if (this.subsList.length !== before) changed = true;
    if (changed) this.renderSubs();

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.classList.remove('show');
    }

    this.damageV = Math.max(0, this.damageV - dt * 0.8);
    // (muerto en multijugador se ve la partida por los ojos de otro: sin tinte rojo)
    const lowHp = P.health / P.maxHealth < 0.3 && !(P.dead && G.mp) ? 0.35 + Math.sin(performance.now() * 0.006) * 0.15 : 0;
    this.el.damage.style.opacity = Math.max(this.damageV, lowHp).toFixed(2);
    this.flashV = Math.max(0, this.flashV - dt * 3);
    this.el.flash.style.opacity = this.flashV.toFixed(2);
  }

  clearPrompt() {
    this.set('prompt', this.el.prompt, '');
    this.el.cross.classList.remove('active');
  }

  grain(dt, amount) {
    this.grainT -= dt;
    if (this.grainT > 0) return;
    this.grainT = 0.05;
    const d = this.grainImg.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    this.grainCtx.putImageData(this.grainImg, 0, 0);
    this.el.grain.style.opacity = amount.toFixed(2);
  }
}
