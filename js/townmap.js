'use strict';

// Mapa del alcalde: un plano antiguo de Robledal dibujado a tinta sobre pergamino.
// El fondo (pergamino, bosque, camino, edificios, rosa de los vientos) se dibuja una vez;
// encima, cada fotograma, la noche, las farolas, las cámaras, dónde lo han visto y tú.
const TownMapArt = {
  INK: '#3b2a1a',
  PAPER: '#dcc79c',

  font(size, bold) { return `${bold ? 'bold ' : ''}${size}px 'IM Fell English SC', Georgia, serif`; },

  // Texto con un halo del color del papel para que se lea encima de los árboles
  label(g, t, x, y, size = 13, color = this.INK, align = 'center') {
    g.font = this.font(size);
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(226,206,160,0.92)';
    g.strokeText(t, x, y);
    g.fillStyle = color;
    g.fillText(t, x, y);
  },

  // Edificios que no son locales con interior (casas cerradas, armería, cabaña, caravana, fortín)
  extras(G) {
    const c = G.village.center;
    const L = G.world.landmarks;
    return [
      { name: '', x0: c.x + 14 - 3.25, x1: c.x + 14 + 3.25, z0: c.z + 11 - 2.5, z1: c.z + 11 + 2.5 },
      { name: '', x0: c.x - 4 - 3, x1: c.x - 4 + 3, z0: c.z + 24 - 2.5, z1: c.z + 24 + 2.5 },
      { name: 'Armería', x0: c.x + 2 - 4, x1: c.x + 2 + 4, z0: c.z - 15 - 3.5, z1: c.z - 15 + 3 },
      { name: 'Campanario', x0: 173, x1: 176.5, z0: -27.5, z1: -23.5, slate: true, noLabel: true },
      { name: 'Cabaña del guarda', x0: -5, x1: 5, z0: -4, z1: 4, wood: true },
      { name: 'Caravana', x0: L.caravan.x - 2.4, x1: L.caravan.x + 2.4, z0: L.caravan.z - 1.1, z1: L.caravan.z + 1.1, tin: true },
      { name: 'Fortín', x0: L.fort.x - 4.1, x1: L.fort.x + 4.1, z0: L.fort.z - 4.1, z1: L.fort.z + 4.1, wood: true },
    ];
  },

  background(G, F, view, w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const W = G.world;
    const rnd = U.mulberry32(view === 'pueblo' ? 1234 : 5678);
    const pueblo = view === 'pueblo';
    const INK = this.INK;

    // ---------- Pergamino: color, motas, manchas y bordes tostados ----------
    g.fillStyle = this.PAPER;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3200; i++) {
      g.fillStyle = `rgba(${(90 + rnd() * 60) | 0},${(60 + rnd() * 40) | 0},${(30 + rnd() * 20) | 0},${(0.03 + rnd() * 0.07).toFixed(3)})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    for (let i = 0; i < 10; i++) {
      const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(140,96,48,0.12)');
      gr.addColorStop(1, 'rgba(140,96,48,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // ---------- Bosque: un arbolito de tinta por cada árbol ----------
    const s0 = U.clamp(F.k * 1.5, 3.2, 11);
    W.trees.forEach((t) => {
      if (t.felled) return;
      const x = F.sx(t.x), y = F.sz(t.z);
      if (x < -10 || y < -10 || x > w + 10 || y > h + 10) return;
      const s = s0 * (0.8 + (t.r || 0.4) * 0.5);
      if (t.kind === 'pine') {
        g.fillStyle = `rgba(${(44 + rnd() * 16) | 0},${(70 + rnd() * 20) | 0},${(40 + rnd() * 12) | 0},0.9)`;
        g.beginPath();
        g.moveTo(x, y - s);
        g.lineTo(x + s * 0.6, y + s * 0.45);
        g.lineTo(x - s * 0.6, y + s * 0.45);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(70,46,24,0.8)';
        g.fillRect(x - 0.6, y + s * 0.45, 1.2, s * 0.32);
      } else {
        // Árbol seco: unas ramas de tinta
        g.strokeStyle = 'rgba(80,64,48,0.75)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y + s * 0.6);
        g.lineTo(x, y - s * 0.5);
        g.moveTo(x, y - s * 0.05);
        g.lineTo(x - s * 0.4, y - s * 0.5);
        g.moveTo(x, y + s * 0.15);
        g.lineTo(x + s * 0.45, y - s * 0.3);
        g.stroke();
      }
    });

    // ---------- Camino: borde de tinta, tierra clara y una línea de puntos ----------
    const pw = Math.max(4, F.k * 2.2);
    const path = () => {
      g.beginPath();
      W.pathPts.forEach((p, i) => (i ? g.lineTo(F.sx(p.x), F.sz(p.z)) : g.moveTo(F.sx(p.x), F.sz(p.z))));
    };
    g.lineJoin = 'round';
    g.lineCap = 'round';
    path();
    g.strokeStyle = 'rgba(92,62,34,0.85)';
    g.lineWidth = pw + 3;
    g.stroke();
    path();
    g.strokeStyle = '#e8d6aa';
    g.lineWidth = pw;
    g.stroke();
    path();
    g.setLineDash([3, 5]);
    g.strokeStyle = 'rgba(120,84,46,0.55)';
    g.lineWidth = 1;
    g.stroke();
    g.setLineDash([]);

    // ---------- Plaza empedrada y claro de la cabaña ----------
    const V = CFG.WORLD.village;
    const clearing = (x, z, r) => {
      g.beginPath();
      g.arc(F.sx(x), F.sz(z), r * F.k, 0, Math.PI * 2);
      g.fillStyle = 'rgba(214,190,140,0.95)';
      g.fill();
      g.strokeStyle = 'rgba(92,62,34,0.6)';
      g.lineWidth = 1.5;
      g.stroke();
    };
    clearing(V.x, V.z, V.r * 0.55);
    if (pueblo) {
      // Adoquines
      for (let i = 0; i < 260; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * V.r * 0.53;
        g.strokeStyle = 'rgba(110,80,46,0.25)';
        g.lineWidth = 1;
        g.beginPath();
        g.arc(F.sx(V.x + Math.cos(a) * d), F.sz(V.z + Math.sin(a) * d), 2 + rnd() * 2, 0, Math.PI * 2);
        g.stroke();
      }
    } else clearing(0, 0, CFG.WORLD.cabinClear * 0.6);

    // ---------- Edificios: tejados vistos desde arriba, con sombra y cumbrera ----------
    const roof = (o, kind) => {
      const x0 = F.sx(o.x0), y0 = F.sz(o.z0), x1 = F.sx(o.x1), y1 = F.sz(o.z1);
      const bw = x1 - x0, bh = y1 - y0;
      if (bw < 1 || x1 < 0 || y1 < 0 || x0 > w || y0 > h) return;
      g.fillStyle = 'rgba(60,40,20,0.35)';
      g.fillRect(x0 + 3, y0 + 3, bw, bh);
      const col = { slate: '#7d7f86', wood: '#8a6440', tin: '#c8c4b4', hall: '#7a7c84' }[kind] || '#a8653a';
      g.fillStyle = col;
      g.fillRect(x0, y0, bw, bh);
      // Media agua en sombra con plumeado
      g.save();
      g.beginPath();
      g.rect(x0, y0, bw, bh);
      g.clip();
      g.strokeStyle = 'rgba(40,26,14,0.28)';
      g.lineWidth = 1;
      const alongX = bw >= bh;
      for (let i = -bh - bw; i < bw + bh; i += 3) {
        g.beginPath();
        if (alongX) { g.moveTo(x0 + i, y0 + bh / 2); g.lineTo(x0 + i + bh / 2, y1); } else { g.moveTo(x0 + bw / 2, y0 + i); g.lineTo(x1, y0 + i + bw / 2); }
        g.stroke();
      }
      g.restore();
      g.strokeStyle = INK;
      g.lineWidth = 1.5;
      g.strokeRect(x0, y0, bw, bh);
      g.beginPath();
      if (alongX) { g.moveTo(x0, y0 + bh / 2); g.lineTo(x1, y0 + bh / 2); } else { g.moveTo(x0 + bw / 2, y0); g.lineTo(x0 + bw / 2, y1); }
      g.lineWidth = 1;
      g.stroke();
    };
    const kindOf = (b) => (b.id === 'ayuntamiento' ? 'hall' : b.id === 'iglesia' ? 'slate' : '');
    G.village.buildings.forEach((b) => roof(b, kindOf(b)));
    const ex = this.extras(G);
    ex.forEach((o) => roof(o, o.slate ? 'slate' : o.wood ? 'wood' : o.tin ? 'tin' : ''));

    // Iconos: cruz en la iglesia, bandera en el ayuntamiento
    const ig = G.village.buildings.find((b) => b.id === 'iglesia');
    const ay = G.village.buildings.find((b) => b.id === 'ayuntamiento');
    if (pueblo && ig) {
      const x = F.sx(174.75), y = F.sz(-25.5);
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y - 7); g.lineTo(x, y + 7);
      g.moveTo(x - 4.5, y - 2.5); g.lineTo(x + 4.5, y - 2.5);
      g.stroke();
    }
    if (ay) {
      const x = F.sx((ay.x0 + ay.x1) / 2), y = F.sz((ay.z0 + ay.z1) / 2);
      const s = pueblo ? 1 : 0.6;
      g.strokeStyle = INK;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y + 9 * s); g.lineTo(x, y - 10 * s);
      g.stroke();
      g.fillStyle = '#9a1e1a';
      g.beginPath();
      g.moveTo(x, y - 10 * s); g.lineTo(x + 10 * s, y - 7 * s); g.lineTo(x, y - 4 * s);
      g.closePath();
      g.fill();
    }

    // ---------- Rótulos ----------
    if (pueblo) {
      G.village.buildings.forEach((b) => this.label(g, b.name, F.sx((b.x0 + b.x1) / 2), F.sz(b.z0) - 9, b.id === 'ayuntamiento' ? 15 : 13));
      ex.forEach((o) => { if (o.name && !o.noLabel) this.label(g, o.name, F.sx((o.x0 + o.x1) / 2), F.sz(o.z0) - 9, 12); });
      this.label(g, 'Plaza Mayor', F.sx(V.x), F.sz(V.z + 2), 14, 'rgba(59,42,26,0.75)');
      this.label(g, 'al bosque', F.sx(120.5), F.sz(-1), 11, 'rgba(59,42,26,0.7)');
    } else {
      const L = W.landmarks;
      const mark = (x, z, t, icon) => {
        const px = F.sx(x), py = F.sz(z);
        g.fillStyle = INK;
        g.strokeStyle = INK;
        g.lineWidth = 1.5;
        if (icon === 'well') { g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.stroke(); g.fillRect(px - 1, py - 1, 2, 2); }
        else if (icon === 'tent') { g.beginPath(); g.moveTo(px, py - 6); g.lineTo(px + 6, py + 4); g.lineTo(px - 6, py + 4); g.closePath(); g.stroke(); }
        else if (icon === 'cross') { g.beginPath(); g.moveTo(px, py - 6); g.lineTo(px, py + 6); g.moveTo(px - 4, py - 2); g.lineTo(px + 4, py - 2); g.stroke(); }
        this.label(g, t, px, py + 13, 12);
      };
      ex.forEach((o) => { if (o.name && !o.noLabel && o.name !== 'Armería') this.label(g, o.name, F.sx((o.x0 + o.x1) / 2), F.sz(o.z0) - 9, 12); });
      mark(L.well.x, L.well.z, 'Pozo viejo', 'well');
      mark(L.camp.x, L.camp.z, 'Campamento', 'tent');
      mark(L.grave.x, L.grave.z, 'Tumba', 'cross');
      this.label(g, 'ROBLEDAL', F.sx(V.x), F.sz(V.z - V.r * 0.75), 18);
      this.label(g, 'Bosque de Robledal', F.sx(40), F.sz(-75), 16, 'rgba(59,42,26,0.6)');
    }

    // ---------- Rosa de los vientos ----------
    const rx = w - 48, ry = 50, R = 30;
    g.save();
    g.translate(rx, ry);
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, R * 0.62, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const len = i % 2 ? R * 0.55 : R;
      const side = i % 2 ? 3.5 : 5.5;
      [1, -1].forEach((sd) => {
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        g.lineTo(Math.cos(a + (sd * Math.PI) / 2) * side, Math.sin(a + (sd * Math.PI) / 2) * side);
        g.closePath();
        g.fillStyle = sd > 0 ? INK : '#efe0b8';
        g.fill();
        g.stroke();
      });
    }
    g.restore();
    this.label(g, 'N', rx, ry - R - 9, 14);

    // ---------- Escala ----------
    const meters = pueblo ? 10 : 50;
    const sl = meters * F.k;
    const sx0 = 22, sy = h - 22;
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#efe0b8' : INK;
      g.fillRect(sx0 + (i * sl) / 4, sy, sl / 4, 5);
    }
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.strokeRect(sx0, sy, sl, 5);
    this.label(g, `${meters} m`, sx0 + sl / 2, sy - 9, 11);

    // ---------- Cartela del título ----------
    const title = pueblo ? 'Villa de Robledal' : 'Término municipal';
    g.font = this.font(17);
    const tw = g.measureText(title).width + 34;
    g.fillStyle = '#ead9ae';
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(18, 16); g.lineTo(18 + tw, 16); g.lineTo(18 + tw - 8, 30); g.lineTo(18 + tw, 44); g.lineTo(18, 44); g.lineTo(26, 30);
    g.closePath();
    g.fill();
    g.stroke();
    this.label(g, title, 18 + tw / 2, 30, 17);

    // ---------- Bordes tostados y doble marco ----------
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(90,56,24,0)');
    vg.addColorStop(1, 'rgba(90,56,24,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.lineWidth = 1;
    g.strokeRect(9, 9, w - 18, h - 18);
    [[9, 9], [w - 9, 9], [9, h - 9], [w - 9, h - 9]].forEach(([x, y]) => {
      g.fillStyle = INK;
      g.beginPath();
      g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y);
      g.closePath();
      g.fill();
    });
    return c;
  },

  // Lo que cambia: noche, farolas, cámaras, avistamiento y tú. hover: posición del ratón en el lienzo
  overlay(G, g, F, hover) {
    const w = g.canvas.width, h = g.canvas.height;
    const th = G.homes.townhall;
    const now = performance.now();
    const pueblo = G.mapView === 'pueblo';
    const night = G.daylight < 0.35;
    const INK = this.INK;
    let hot = null;
    if (hover) {
      let bd = 16;
      th.lamps.forEach((l, k) => { const d = Math.hypot(F.sx(l.pos.x) - hover.x, F.sz(l.pos.z) - hover.y); if (d < bd) { bd = d; hot = { lamp: k }; } });
      th.cams.forEach((c, k) => { const d = Math.hypot(F.sx(c.pos.x) - hover.x, F.sz(c.pos.z) - hover.y); if (d < bd) { bd = d; hot = { cam: k }; } });
    }

    // De noche el pergamino se ve a la luz de un candil
    if (night) {
      g.fillStyle = 'rgba(16,22,44,0.5)';
      g.fillRect(0, 0, w, h);
    }

    // Conos de visión de las cámaras
    th.cams.forEach((c, k) => {
      const x = F.sx(c.pos.x), y = F.sz(c.pos.z);
      if (x < -40 || y < -40 || x > w + 40 || y > h + 40) return;
      const seen = c.seenT > 0 && now - c.seenT < 10000;
      const a = Math.atan2(c.fwd.z, c.fwd.x);
      const R = Math.min(32 * F.k, pueblo ? 120 : 64);
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, R, a - 0.55, a + 0.55);
      g.closePath();
      g.fillStyle = seen ? `rgba(220,40,30,${(0.22 + Math.sin(now * 0.012) * 0.1).toFixed(2)})` : hot && hot.cam === k ? 'rgba(60,110,160,0.28)' : 'rgba(60,110,160,0.13)';
      g.fill();
    });

    // Farolas: halo de luz, poste y número
    th.lamps.forEach((l, k) => {
      const x = F.sx(l.pos.x), y = F.sz(l.pos.z);
      const lit = l.on && !l.broken;
      if (lit) {
        const R = th.lampR * F.k;
        const gr = g.createRadialGradient(x, y, 0, x, y, R);
        gr.addColorStop(0, night ? 'rgba(255,214,120,0.75)' : 'rgba(255,200,90,0.35)');
        gr.addColorStop(1, 'rgba(255,200,90,0)');
        g.save();
        g.globalCompositeOperation = night ? 'lighter' : 'source-over';
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, R, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      const r = pueblo ? 8 : 4.5;
      if (hot && hot.lamp === k) {
        g.strokeStyle = '#9a1e1a';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, r + 5, 0, Math.PI * 2);
        g.stroke();
      }
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = l.broken ? '#3a1410' : lit ? '#ffd770' : '#b8a888';
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 1.5;
      g.stroke();
      if (lit && pueblo) {
        // Rayitos de luz
        g.strokeStyle = 'rgba(255,230,150,0.9)';
        g.lineWidth = 1.2;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 + now * 0.0006;
          g.beginPath();
          g.moveTo(x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2));
          g.lineTo(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6));
          g.stroke();
        }
      }
      if (l.broken) {
        g.strokeStyle = '#d23a2a';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x - r, y - r); g.lineTo(x + r, y + r);
        g.moveTo(x + r, y - r); g.lineTo(x - r, y + r);
        g.stroke();
      }
      if (pueblo) {
        g.font = this.font(11, true);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = lit ? '#3b2a1a' : '#efe0b8';
        if (!l.broken) g.fillText(String(k + 1), x, y + 0.5);
      }
    });

    // Cámaras: cuerpo y objetivo apuntando a donde miran
    th.cams.forEach((c, k) => {
      const x = F.sx(c.pos.x), y = F.sz(c.pos.z);
      if (x < -10 || y < -10 || x > w + 10 || y > h + 10) return;
      const seen = c.seenT > 0 && now - c.seenT < 10000;
      const a = Math.atan2(c.fwd.z, c.fwd.x);
      const s = pueblo ? 1.2 : 0.9;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = seen ? (Math.sin(now * 0.02) > 0 ? '#d23a2a' : '#f0a090') : hot && hot.cam === k ? '#5a8ab8' : '#3a5a7a';
      g.strokeStyle = INK;
      g.lineWidth = 1;
      g.fillRect(-6 * s, -3.5 * s, 9 * s, 7 * s);
      g.strokeRect(-6 * s, -3.5 * s, 9 * s, 7 * s);
      g.beginPath();
      g.moveTo(3 * s, -2 * s); g.lineTo(7 * s, -3.5 * s); g.lineTo(7 * s, 3.5 * s); g.lineTo(3 * s, 2 * s);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    });

    // Dónde lo han visto: una X roja de tinta que se va borrando
    const sg = th.sighting;
    if (sg && now - sg.t < 60000) {
      const x = F.sx(sg.x), y = F.sz(sg.z);
      const fade = 1 - (now - sg.t) / 60000;
      const p = 9 + (Math.sin(now * 0.01) + 1) * 4;
      g.strokeStyle = `rgba(200,30,20,${fade.toFixed(2)})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, p, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y + 6);
      g.moveTo(x + 6, y - 6); g.lineTo(x - 6, y + 6);
      g.stroke();
      this.label(g, `visto hace ${Math.round((now - sg.t) / 1000)} s`, x, y + p + 10, 11, `rgba(160,24,16,${Math.max(0.3, fade).toFixed(2)})`);
    }

    // Tú
    const P = G.player;
    const px = F.sx(P.pos.x), py = F.sz(P.pos.z);
    const fa = Math.atan2(-Math.cos(P.yaw), -Math.sin(P.yaw));
    g.fillStyle = '#9a1e1a';
    g.strokeStyle = '#efe0b8';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(px + Math.cos(fa) * 10, py + Math.sin(fa) * 10);
    g.lineTo(px + Math.cos(fa + 2.5) * 7, py + Math.sin(fa + 2.5) * 7);
    g.lineTo(px + Math.cos(fa - 2.5) * 7, py + Math.sin(fa - 2.5) * 7);
    g.closePath();
    g.fill();
    g.stroke();
    if (pueblo) this.label(g, 'Tú', px, py + 15, 11, '#9a1e1a');

    // Cartelito de lo que hay bajo el ratón
    if (hot) {
      let t;
      if (hot.lamp !== undefined) {
        const l = th.lamps[hot.lamp];
        t = `Farola ${hot.lamp + 1} · ${l.name} — ${l.broken ? 'rota' : l.on ? 'clic: apagar' : 'clic: encender'}`;
      } else t = `Cámara ${th.cams[hot.cam].name} — clic: verla`;
      g.font = this.font(13);
      const tw = g.measureText(t).width + 16;
      const tx = U.clamp(hover.x + 14, 12, w - tw - 12), ty = U.clamp(hover.y - 30, 12, h - 34);
      g.fillStyle = 'rgba(239,224,184,0.96)';
      g.strokeStyle = INK;
      g.lineWidth = 1;
      g.fillRect(tx, ty, tw, 22);
      g.strokeRect(tx, ty, tw, 22);
      g.fillStyle = INK;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(t, tx + 8, ty + 11);
    }
    return hot;
  },
};
