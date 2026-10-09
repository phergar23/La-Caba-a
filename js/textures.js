'use strict';

// Texturas generadas con canvas (pixeladas a propósito).
const TEX = {};
const MAT = {};

function makeTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = opts.linear ? THREE.LinearFilter : THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (opts.linear) t.generateMipmaps = false;
  return t;
}

function noiseFill(g, w, h, base, vary, rnd, alpha = 1) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * vary;
    d[i] = U.clamp(base[0] + n, 0, 255);
    d[i + 1] = U.clamp(base[1] + n, 0, 255);
    d[i + 2] = U.clamp(base[2] + n, 0, 255);
    d[i + 3] = 255 * alpha;
  }
  g.putImageData(img, 0, 0);
}

function speckle(g, w, h, rnd, count, colors, size = 1) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), size, size);
  }
}

function buildTextures() {
  const rnd = U.mulberry32(CFG.SEED + 7);

  TEX.logs = makeTex(64, 64, (g, w, h) => {
    for (let row = 0; row < 4; row++) {
      const y0 = row * 16;
      for (let y = 0; y < 16; y++) {
        const k = Math.sin((y / 16) * Math.PI);
        const r = 58 + k * 38, gg = 38 + k * 24, b = 24 + k * 14;
        g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
        g.fillRect(0, y0 + y, w, 1);
      }
      g.fillStyle = 'rgba(20,12,6,0.9)';
      g.fillRect(0, y0 + 15, w, 1);
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `rgba(30,18,8,${0.25 + rnd() * 0.3})`;
        g.fillRect(Math.floor(rnd() * w), y0 + 2 + Math.floor(rnd() * 12), 3 + Math.floor(rnd() * 8), 1);
      }
      if (rnd() < 0.6) {
        g.fillStyle = 'rgba(25,14,6,0.8)';
        g.fillRect(Math.floor(rnd() * 58), y0 + 6, 3, 3);
      }
    }
  });

  TEX.planks = makeTex(64, 64, (g, w, h) => {
    for (let i = 0; i < 4; i++) {
      const v = 70 + rnd() * 20;
      g.fillStyle = `rgb(${v | 0},${(v * 0.68) | 0},${(v * 0.45) | 0})`;
      g.fillRect(i * 16, 0, 16, h);
      for (let k = 0; k < 30; k++) {
        g.fillStyle = `rgba(35,22,10,${0.2 + rnd() * 0.3})`;
        g.fillRect(i * 16 + Math.floor(rnd() * 15), Math.floor(rnd() * h), 1, 3 + Math.floor(rnd() * 10));
      }
      g.fillStyle = 'rgba(20,12,5,0.9)';
      g.fillRect(i * 16, 0, 1, h);
      g.fillRect(i * 16, Math.floor(rnd() * 64), 16, 1);
    }
  });

  TEX.door = makeTex(32, 64, (g, w, h) => {
    for (let i = 0; i < 4; i++) {
      const v = 55 + rnd() * 15;
      g.fillStyle = `rgb(${v | 0},${(v * 0.65) | 0},${(v * 0.42) | 0})`;
      g.fillRect(i * 8, 0, 8, h);
      g.fillStyle = 'rgba(15,9,4,0.9)';
      g.fillRect(i * 8, 0, 1, h);
    }
    g.fillStyle = 'rgb(40,26,14)';
    g.fillRect(0, 10, w, 5);
    g.fillRect(0, 48, w, 5);
    speckle(g, w, h, rnd, 60, ['rgba(20,10,5,0.4)', 'rgba(90,60,35,0.3)']);
  });

  TEX.roof = makeTex(64, 64, (g, w, h) => {
    noiseFill(g, w, h, [38, 34, 32], 18, rnd);
    for (let y = 0; y < 64; y += 8) {
      g.fillStyle = 'rgba(10,8,8,0.8)';
      g.fillRect(0, y, w, 1);
      const off = (y / 8) % 2 ? 8 : 0;
      for (let x = off; x < 64; x += 16) g.fillRect(x, y, 1, 8);
    }
  });

  TEX.bark = makeTex(32, 64, (g, w, h) => {
    noiseFill(g, w, h, [52, 40, 32], 20, rnd);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(20,14,10,${0.4 + rnd() * 0.4})`;
      g.fillRect(Math.floor(rnd() * w), 0, 1 + Math.floor(rnd() * 2), h);
    }
  });

  TEX.deadbark = makeTex(32, 64, (g, w, h) => {
    noiseFill(g, w, h, [70, 66, 60], 22, rnd);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(25,22,20,${0.4 + rnd() * 0.4})`;
      g.fillRect(Math.floor(rnd() * w), 0, 1, h);
    }
  });

  TEX.needles = makeTex(64, 64, (g, w, h) => {
    noiseFill(g, w, h, [22, 42, 26], 24, rnd);
    speckle(g, w, h, rnd, 500, ['#0d1f12', '#1c3a22', '#29492c', '#122616'], 2);
  });

  TEX.grass = makeTex(64, 64, (g, w, h) => {
    noiseFill(g, w, h, [44, 58, 32], 22, rnd);
    speckle(g, w, h, rnd, 400, ['#2c3d1f', '#3d5129', '#4a4a2a', '#26331b', '#51472e'], 1);
    speckle(g, w, h, rnd, 30, ['#5b4b33', '#3b3325'], 3);
  });

  TEX.dirt = makeTex(64, 64, (g, w, h) => {
    noiseFill(g, w, h, [76, 60, 44], 24, rnd);
    speckle(g, w, h, rnd, 120, ['#3e3024', '#8a7456', '#5a4a3a'], 2);
  });

  TEX.stone = makeTex(64, 64, (g, w, h) => {
    noiseFill(g, w, h, [80, 80, 78], 20, rnd);
    g.fillStyle = 'rgba(25,25,25,0.8)';
    for (let y = 0; y < 64; y += 12) {
      g.fillRect(0, y, w, 1);
      const off = (y / 12) % 2 ? 10 : 0;
      for (let x = off; x < 64; x += 20) g.fillRect(x, y, 1, 12);
    }
  });

  TEX.concrete = makeTex(64, 64, (g, w, h) => {
    noiseFill(g, w, h, [96, 98, 94], 18, rnd);
    speckle(g, w, h, rnd, 160, ['#4c4e4a', '#6e706a', '#5a5c58'], 1);
    g.fillStyle = 'rgba(30,30,28,0.6)';
    g.fillRect(0, 31, w, 1);
    g.fillRect(31, 0, 1, h);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(60,50,40,${0.15 + rnd() * 0.2})`;
      g.fillRect(Math.floor(rnd() * w), 0, 2, 10 + Math.floor(rnd() * 40));
    }
  });

  TEX.plaster = makeTex(64, 64, (g, w, h) => {
    noiseFill(g, w, h, [150, 142, 124], 16, rnd);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(80,70,50,${0.1 + rnd() * 0.15})`;
      g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 4 + rnd() * 10, 6 + rnd() * 20);
    }
  });

  TEX.fabric = makeTex(32, 32, (g, w, h) => {
    noiseFill(g, w, h, [110, 34, 30], 20, rnd);
    g.fillStyle = 'rgba(30,10,8,0.5)';
    for (let i = 0; i < 32; i += 8) { g.fillRect(i, 0, 2, h); g.fillRect(0, i, w, 2); }
  });

  TEX.glass = makeTex(32, 32, (g, w, h) => {
    g.fillStyle = 'rgba(150,180,190,0.22)';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(220,240,255,0.3)';
    for (let i = 0; i < 10; i++) g.fillRect(4 + i, 18 - i, 2, 1);
  }, { clamp: true });

  TEX.glassBroken = makeTex(32, 32, (g, w, h) => {
    g.fillStyle = 'rgba(150,180,190,0.35)';
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(32, 0); g.lineTo(32, 32); g.lineTo(0, 32); g.closePath();
    g.moveTo(3, 4); g.lineTo(12, 3); g.lineTo(9, 10); g.lineTo(18, 6); g.lineTo(28, 3); g.lineTo(24, 12);
    g.lineTo(29, 20); g.lineTo(26, 29); g.lineTo(17, 24); g.lineTo(10, 29); g.lineTo(4, 26); g.lineTo(7, 16); g.closePath();
    g.fill('evenodd');
  }, { clamp: true });

  TEX.metal = makeTex(16, 16, (g, w, h) => noiseFill(g, w, h, [60, 62, 66], 18, rnd));

  TEX.face = makeTex(32, 32, (g, w, h) => {
    noiseFill(g, w, h, [196, 186, 160], 26, rnd);
    g.fillStyle = '#050303';
    g.fillRect(6, 9, 7, 8);
    g.fillRect(19, 9, 7, 8);
    g.fillRect(14, 18, 4, 4);
    g.fillRect(9, 25, 14, 3);
    g.fillStyle = '#d8d0b8';
    for (let x = 10; x < 23; x += 2) g.fillRect(x, 25, 1, 3);
    g.fillStyle = 'rgba(60,20,10,0.6)';
    g.fillRect(5, 17, 1, 8);
    g.fillRect(26, 17, 1, 6);
    speckle(g, w, h, rnd, 40, ['rgba(60,40,30,0.5)']);
  });

  TEX.flash = makeTex(32, 32, (g, w, h) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,250,220,1)');
    gr.addColorStop(0.3, 'rgba(255,200,80,0.9)');
    gr.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, { clamp: true, linear: true });

  TEX.glint = makeTex(16, 16, (g, w, h) => {
    const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    gr.addColorStop(0, 'rgba(255,255,230,1)');
    gr.addColorStop(0.4, 'rgba(255,240,160,0.6)');
    gr.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, { clamp: true, linear: true });

  TEX.paper = makeTex(16, 16, (g, w, h) => {
    noiseFill(g, w, h, [205, 196, 170], 14, rnd);
    g.fillStyle = 'rgba(40,30,20,0.6)';
    for (let y = 3; y < 14; y += 2) g.fillRect(2, y, 8 + Math.floor(rnd() * 5), 1);
  });

  TEX.poster = makeTex(64, 80, (g, w, h) => {
    noiseFill(g, w, h, [210, 200, 170], 16, rnd);
    g.fillStyle = '#1a1410';
    g.font = 'bold 11px monospace';
    g.textAlign = 'center';
    g.fillText('SE BUSCA', 32, 13);
    g.fillStyle = '#6d6353';
    g.fillRect(16, 18, 32, 34);
    g.fillStyle = '#2b251f';
    g.fillRect(24, 24, 16, 18);
    g.fillRect(20, 42, 24, 10);
    g.fillStyle = '#1a1410';
    g.font = '8px monospace';
    g.fillText('TOMÁS VIDAL', 32, 62);
    g.fillText('GUARDA', 32, 71);
    g.fillStyle = 'rgba(90,20,10,0.5)';
    g.fillRect(50, 0, 3, 30);
  }, { clamp: true });

  TEX.shopSign = makeTex(128, 32, (g, w, h) => {
    g.fillStyle = '#2a1a10';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b08850';
    g.lineWidth = 2;
    g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#e8c890';
    g.font = 'bold 13px monospace';
    g.textAlign = 'center';
    g.fillText('ARMERÍA', 64, 15);
    g.font = '9px monospace';
    g.fillText('ULTRAMARINOS ANSELMO', 64, 26);
  }, { clamp: true });

  TEX.villageSign = makeTex(64, 24, (g, w, h) => {
    g.fillStyle = '#e8e2d0';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#20301a';
    g.fillRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#e8e2d0';
    g.font = 'bold 9px monospace';
    g.textAlign = 'center';
    g.fillText('ROBLEDAL', 32, 11);
    g.font = '7px monospace';
    g.fillText('pobl. 212', 32, 19);
  }, { clamp: true });

  TEX.window = makeTex(8, 8, (g, w, h) => {
    g.fillStyle = '#ffcf7a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a2410';
    g.fillRect(3, 0, 2, h);
    g.fillRect(0, 3, w, 2);
  }, { clamp: true });

  // Materiales compartidos
  const lam = (map, extra = {}) => new THREE.MeshLambertMaterial(Object.assign({ map }, extra));
  MAT.logs = lam(TEX.logs);
  MAT.planks = lam(TEX.planks);
  MAT.door = lam(TEX.door);
  MAT.roof = lam(TEX.roof);
  MAT.bark = lam(TEX.bark);
  MAT.deadbark = lam(TEX.deadbark);
  MAT.needles = lam(TEX.needles);
  MAT.grass = lam(TEX.grass);
  MAT.dirt = lam(TEX.dirt);
  MAT.stone = lam(TEX.stone);
  MAT.plaster = lam(TEX.plaster);
  MAT.concrete = lam(TEX.concrete);
  MAT.fabric = lam(TEX.fabric);
  MAT.metal = lam(TEX.metal);
  MAT.paper = lam(TEX.paper);
  MAT.dark = new THREE.MeshLambertMaterial({ color: 0x151210 });
  MAT.black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  MAT.plankBoard = lam(TEX.planks, { color: 0xc8b090 });
  MAT.glass = new THREE.MeshLambertMaterial({ map: TEX.glass, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  MAT.glassBroken = new THREE.MeshLambertMaterial({ map: TEX.glassBroken, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05 });
  MAT.litWindow = new THREE.MeshBasicMaterial({ map: TEX.window, color: 0xffffff });
  MAT.face = lam(TEX.face);
}

// Geometría de caja con UVs en metros (la textura se repite según el tamaño real).
function boxGeo(w, h, d, texSize = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // Orden de caras: +x, -x, +y, -y, +z, -z (4 vértices cada una)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / texSize, (uv.getY(i) * dims[f][1]) / texSize);
    }
  }
  uv.needsUpdate = true;
  return g;
}
