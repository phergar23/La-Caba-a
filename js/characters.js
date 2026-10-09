'use strict';

// Modelos low-poly de personajes: humanos (turistas, aldeanos) y la criatura.

function makeHuman(o = {}) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: o.skin || 0xd7a883 });
  const shirt = new THREE.MeshLambertMaterial({ color: o.shirt || 0x3a6ea5 });
  const pants = new THREE.MeshLambertMaterial({ color: o.pants || 0x2c2c34 });
  const hair = new THREE.MeshLambertMaterial({ color: o.hair || 0x3b2716 });

  const mk = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(boxGeo(w, h, d, 1), mat);
    m.position.set(x, y, z);
    return m;
  };
  const limb = (w, h, d, mat, px, py, pz) => {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, pz);
    pivot.add(mk(w, h, d, mat, 0, -h / 2, 0));
    g.add(pivot);
    return pivot;
  };

  const legL = limb(0.15, 0.82, 0.17, pants, -0.1, 0.84, 0);
  const legR = limb(0.15, 0.82, 0.17, pants, 0.1, 0.84, 0);
  const torso = mk(0.44, 0.62, 0.25, shirt, 0, 1.14, 0);
  g.add(torso);
  const armL = limb(0.12, 0.64, 0.14, shirt, -0.29, 1.42, 0);
  const armR = limb(0.12, 0.64, 0.14, shirt, 0.29, 1.42, 0);
  armL.children[0].add(mk(0.1, 0.1, 0.12, skin, 0, -0.34, 0));
  armR.children[0].add(mk(0.1, 0.1, 0.12, skin, 0, -0.34, 0));
  const head = new THREE.Group();
  head.position.set(0, 1.6, 0);
  head.add(mk(0.25, 0.27, 0.25, skin, 0, 0, 0));
  head.add(mk(0.27, 0.1, 0.27, hair, 0, 0.13, -0.01));
  head.add(mk(0.27, 0.2, 0.06, hair, 0, 0.04, -0.12));
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x111111 });
  head.add(mk(0.04, 0.04, 0.02, eyeM, -0.06, 0.02, 0.126));
  head.add(mk(0.04, 0.04, 0.02, eyeM, 0.06, 0.02, 0.126));
  g.add(head);
  if (o.hat) {
    const hm = new THREE.MeshLambertMaterial({ color: o.hat });
    head.add(mk(0.36, 0.04, 0.36, hm, 0, 0.17, 0));
    head.add(mk(0.26, 0.12, 0.26, hm, 0, 0.23, 0));
  }
  if (o.backpack) {
    const bm = new THREE.MeshLambertMaterial({ color: o.backpack });
    g.add(mk(0.34, 0.46, 0.18, bm, 0, 1.12, -0.21));
    g.add(mk(0.36, 0.14, 0.2, bm, 0, 0.86, -0.2));
  }
  if (o.apron) {
    g.add(mk(0.4, 0.7, 0.02, new THREE.MeshLambertMaterial({ color: o.apron }), 0, 1.0, 0.135));
  }
  g.userData = { legL, legR, armL, armR, head, torso, phase: Math.random() * 6 };
  return g;
}

// speed en m/s (0 = quieto)
function animateHuman(h, dt, speed, extra = {}) {
  const u = h.userData;
  u.phase += dt * (speed > 0.1 ? 2.2 + speed * 1.4 : 1.2);
  const swing = speed > 0.1 ? Math.min(0.7, 0.25 + speed * 0.15) : 0;
  const s = Math.sin(u.phase * (speed > 0.1 ? 1 : 0));
  u.legL.rotation.x = s * swing;
  u.legR.rotation.x = -s * swing;
  u.armL.rotation.x = -s * swing * 0.8;
  u.armR.rotation.x = s * swing * 0.8;
  if (extra.wave) {
    u.armR.rotation.x = -2.6 + Math.sin(u.phase * 3) * 0.3;
    u.armR.rotation.z = 0.3;
  } else u.armR.rotation.z = 0;
  if (extra.sit) {
    u.legL.rotation.x = -1.4;
    u.legR.rotation.x = -1.2;
  }
  if (extra.hurt) {
    u.legR.rotation.x = 0.3;
    u.head.rotation.x = 0.35;
  } else if (!extra.lookAt) u.head.rotation.x = Math.sin(u.phase * 0.3) * 0.05;
  if (speed <= 0.1) u.torso.position.y = 1.14 + Math.sin(u.phase * 1.5) * 0.005;
}

function makeCreature() {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x0e0c0b });
  const bone = new THREE.MeshLambertMaterial({ color: 0xc9bfa6 });
  const mk = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(boxGeo(w, h, d, 1), mat);
    m.position.set(x, y, z);
    return m;
  };
  const limb = (w, h, d, mat, px, py, pz, parent) => {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, pz);
    pivot.add(mk(w, h, d, mat, 0, -h / 2, 0));
    (parent || g).add(pivot);
    return pivot;
  };
  const legL = limb(0.1, 1.3, 0.12, body, -0.1, 1.3, 0);
  const legR = limb(0.1, 1.3, 0.12, body, 0.1, 1.3, 0);
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 1.3, 0);
  torsoPivot.rotation.x = 0.25;
  g.add(torsoPivot);
  torsoPivot.add(mk(0.36, 0.85, 0.2, body, 0, 0.42, 0));
  // costillas marcadas
  for (let i = 0; i < 3; i++) torsoPivot.add(mk(0.3, 0.025, 0.02, bone, 0, 0.45 + i * 0.1, 0.105));
  const armL = limb(0.07, 1.35, 0.08, body, -0.24, 0.8, 0, torsoPivot);
  const armR = limb(0.07, 1.35, 0.08, body, 0.24, 0.8, 0, torsoPivot);
  // dedos largos
  [armL, armR].forEach((a) => {
    for (let i = 0; i < 3; i++) {
      const f = mk(0.018, 0.22, 0.018, bone, -0.025 + i * 0.025, -1.45, 0.01);
      a.add(f);
    }
  });
  // harapos
  const rag = new THREE.MeshLambertMaterial({ color: 0x1a1512, side: THREE.DoubleSide });
  const rags = [];
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.7), rag);
    r.position.set(-0.15 + i * 0.1, 0.2, -0.11);
    torsoPivot.add(r);
    rags.push(r);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0.05);
  torsoPivot.add(head);
  head.add(mk(0.26, 0.38, 0.28, bone, 0, 0.12, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.38), MAT.face);
  face.position.set(0, 0.12, 0.141);
  head.add(face);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a10 });
  const eyes = [];
  [-0.065, 0.065].forEach((x) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), eyeMat);
    e.position.set(x, 0.17, 0.13);
    head.add(e);
    eyes.push(e);
  });
  // cuernas
  [-1, 1].forEach((sd) => {
    const a = mk(0.03, 0.45, 0.03, bone, sd * 0.1, 0.45, -0.02);
    a.rotation.z = -sd * 0.5;
    head.add(a);
    const b = mk(0.025, 0.3, 0.025, bone, sd * 0.24, 0.62, -0.02);
    b.rotation.z = -sd * 1.1;
    head.add(b);
    const c = mk(0.022, 0.25, 0.022, bone, sd * 0.2, 0.75, 0.02);
    c.rotation.z = sd * 0.2;
    head.add(c);
    const d = mk(0.02, 0.2, 0.02, bone, sd * 0.3, 0.8, -0.04);
    d.rotation.z = -sd * 0.4;
    head.add(d);
  });
  g.userData = { legL, legR, armL, armR, head, torsoPivot, rags, eyes, eyeMat, phase: 0 };
  return g;
}

// mode: 'walk' | 'run' | 'idle' | 'stare' | 'attack' | 'bash' | 'pick' | 'climb'
function animateCreature(c, dt, mode, speed) {
  const u = c.userData;
  u.phase += dt * (mode === 'run' ? 9 : mode === 'walk' ? 4.2 : mode === 'bash' ? 5 : mode === 'climb' ? 6 : 1.6);
  const s = Math.sin(u.phase);
  const jerk = Math.random() < 0.02 ? (Math.random() - 0.5) * 0.4 : 0;
  u.legL.rotation.x = 0; u.legR.rotation.x = 0;
  u.armL.rotation.set(0, 0, 0.08); u.armR.rotation.set(0, 0, -0.08);
  u.torsoPivot.rotation.x = 0.25;
  if (mode === 'walk' || mode === 'run') {
    const sw = mode === 'run' ? 0.8 : 0.45;
    u.legL.rotation.x = s * sw;
    u.legR.rotation.x = -s * sw;
    u.armL.rotation.x = -s * sw * 0.6 + (mode === 'run' ? -0.6 : 0);
    u.armR.rotation.x = s * sw * 0.6 + (mode === 'run' ? -0.6 : 0);
    u.torsoPivot.rotation.x = mode === 'run' ? 0.55 : 0.3;
    u.head.rotation.z = Math.sin(u.phase * 0.5) * 0.15 + jerk;
  } else if (mode === 'stare') {
    u.head.rotation.z = U.lerp(u.head.rotation.z, 0.55, dt * 1.5);
    u.torsoPivot.rotation.x = 0.1;
  } else if (mode === 'attack') {
    u.armL.rotation.x = -1.9 + s * 0.3;
    u.armR.rotation.x = -1.9 - s * 0.3;
    u.torsoPivot.rotation.x = 0.5;
    u.head.rotation.z = jerk;
  } else if (mode === 'bash') {
    const k = Math.max(0, Math.sin(u.phase));
    u.armL.rotation.x = -1.2 - k * 1.2;
    u.armR.rotation.x = -1.3 - k * 1.1;
    u.torsoPivot.rotation.x = 0.2 + k * 0.4;
  } else if (mode === 'pick') {
    u.armR.rotation.x = -1.3 + Math.sin(u.phase * 3) * 0.08;
    u.armL.rotation.x = -0.6;
    u.torsoPivot.rotation.x = 0.45;
    u.head.rotation.z = 0.3 + jerk;
  } else if (mode === 'climb') {
    u.armL.rotation.x = -2.8 + s * 0.5;
    u.armR.rotation.x = -2.8 - s * 0.5;
    u.legL.rotation.x = -0.6 + s * 0.5;
    u.legR.rotation.x = -0.6 - s * 0.5;
    u.torsoPivot.rotation.x = 0;
  } else {
    u.head.rotation.z = U.lerp(u.head.rotation.z, Math.sin(u.phase * 0.4) * 0.3, dt) + jerk;
    u.armL.rotation.x = Math.sin(u.phase * 0.7) * 0.05;
  }
  u.rags.forEach((r, i) => (r.rotation.x = Math.sin(u.phase * 1.3 + i) * 0.25 + (mode === 'run' ? 0.6 : 0.1)));
}

function makeQuestItem(kind) {
  const g = new THREE.Group();
  const m = (w, h, d, color, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(boxGeo(w, h, d, 1), new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  if (kind === 'cámara') { m(0.22, 0.14, 0.1, 0x1a1a1a, 0, 0.07); m(0.08, 0.08, 0.08, 0x333333, 0, 0.07, 0.08); }
  else if (kind === 'cartera') m(0.2, 0.03, 0.12, 0x5a3418, 0, 0.02);
  else if (kind === 'móvil') m(0.08, 0.015, 0.16, 0x111111, 0, 0.01);
  else if (kind === 'mochila') { m(0.34, 0.4, 0.2, 0xb04020, 0, 0.2); m(0.3, 0.12, 0.1, 0x802810, 0, 0.12, 0.13); }
  else { m(0.08, 0.08, 0.16, 0x222222, -0.05, 0.05); m(0.08, 0.08, 0.16, 0x222222, 0.05, 0.05); }
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glint, color: 0xfff0c0, transparent: true, depthWrite: false, fog: false }));
  glint.scale.set(0.6, 0.6, 0.6);
  glint.position.y = 0.25;
  g.add(glint);
  g.userData.glint = glint;
  return g;
}

// Perro (para la misión del perro perdido)
function makeDog(color = 0x7a5a3a) {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1410 });
  const mk = (w, h, d, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(boxGeo(w, h, d, 1), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  mk(0.26, 0.24, 0.62, fur, 0, 0.42, 0);
  const head = new THREE.Group();
  head.position.set(0, 0.6, 0.36);
  g.add(head);
  mk(0.2, 0.2, 0.22, fur, 0, 0, 0, head);
  mk(0.12, 0.1, 0.14, fur, 0, -0.04, 0.16, head);
  mk(0.05, 0.04, 0.03, dark, 0, -0.01, 0.235, head);
  mk(0.06, 0.1, 0.03, dark, -0.08, 0.13, -0.02, head);
  mk(0.06, 0.1, 0.03, dark, 0.08, 0.13, -0.02, head);
  const legs = [];
  [[-0.09, 0.22], [0.09, 0.22], [-0.09, -0.22], [0.09, -0.22]].forEach(([x, z]) => {
    const p = new THREE.Group();
    p.position.set(x, 0.32, z);
    mk(0.07, 0.32, 0.07, fur, 0, -0.16, 0, p);
    g.add(p);
    legs.push(p);
  });
  const tail = new THREE.Group();
  tail.position.set(0, 0.5, -0.31);
  mk(0.05, 0.05, 0.25, fur, 0, 0, -0.12, tail);
  tail.rotation.x = -0.6;
  g.add(tail);
  g.userData = { legs, tail, head, phase: 0 };
  return g;
}

function animateDog(d, dt, speed) {
  const u = d.userData;
  u.phase += dt * (speed > 0.1 ? 4 + speed * 2.5 : 3);
  const s = Math.sin(u.phase);
  const sw = speed > 0.1 ? 0.6 : 0;
  u.legs[0].rotation.x = s * sw;
  u.legs[3].rotation.x = s * sw;
  u.legs[1].rotation.x = -s * sw;
  u.legs[2].rotation.x = -s * sw;
  u.tail.rotation.y = Math.sin(u.phase * 2.5) * 0.5;
  u.head.rotation.x = speed > 0.1 ? 0 : Math.sin(u.phase * 0.4) * 0.1;
}

// Seta brillante (misión de Remedios)
function makeMushroom() {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 6), new THREE.MeshLambertMaterial({ color: 0xe8e0c8 }));
  stem.position.y = 0.06;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc8402a }));
  cap.position.y = 0.11;
  g.add(stem, cap);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glint, color: 0xffb0a0, transparent: true, depthWrite: false, fog: false }));
  glint.scale.set(0.35, 0.35, 0.35);
  glint.position.y = 0.2;
  g.add(glint);
  g.userData.glint = glint;
  return g;
}

// Cámara de fototrampeo en un poste (misión del alcalde)
function makeTrailCam() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(boxGeo(0.12, 1.3, 0.12, 1), MAT.deadbark);
  post.position.y = 0.65;
  const box = new THREE.Mesh(boxGeo(0.18, 0.24, 0.14, 1), new THREE.MeshLambertMaterial({ color: 0x4a5a2a }));
  box.position.set(0, 1.15, 0.12);
  const led = new THREE.Mesh(boxGeo(0.03, 0.03, 0.02, 1), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
  led.position.set(0.05, 1.22, 0.2);
  g.add(post, box, led);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glint, color: 0xffe0a0, transparent: true, depthWrite: false, fog: false }));
  glint.scale.set(0.5, 0.5, 0.5);
  glint.position.y = 1.4;
  g.add(glint);
  g.userData.glint = glint;
  return g;
}

function glintSprite(color = 0xfff0c0, s = 0.5, y = 0.3) {
  const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glint, color, transparent: true, depthWrite: false, fog: false }));
  g.scale.set(s, s, s);
  g.position.y = y;
  return g;
}

// Haz de leña (encargo del tabernero)
function makeFirewood() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.9, 6), MAT.bark);
    l.rotation.z = Math.PI / 2;
    l.position.set(0, 0.09 + (i > 2 ? 0.15 : 0), -0.18 + (i % 3) * 0.17 + (i > 2 ? 0.08 : 0));
    g.add(l);
  }
  const rope = new THREE.Mesh(boxGeo(0.04, 0.42, 0.5, 1), new THREE.MeshLambertMaterial({ color: 0xb09a60 }));
  rope.position.y = 0.16;
  g.add(rope);
  g.userData.glint = glintSprite(0xffe0a0, 0.45, 0.45);
  g.add(g.userData.glint);
  return g;
}

// Poste indicador del sendero (roto o arreglado)
function makeSignpost() {
  const g = new THREE.Group();
  const post = new THREE.Group();
  const p = new THREE.Mesh(boxGeo(0.12, 1.6, 0.12, 1), MAT.planks);
  p.position.y = 0.8;
  post.add(p);
  const board = new THREE.Mesh(boxGeo(0.8, 0.26, 0.05, 1), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
  board.position.set(0.3, 1.4, 0.07);
  board.rotation.z = 0.08;
  post.add(board);
  g.add(post);
  g.userData.post = post;
  g.userData.glint = glintSprite(0xffd090, 0.5, 1.6);
  g.add(g.userData.glint);
  return g;
}

// Cepo de un furtivo
function makeBearTrap() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 10), MAT.metal);
  base.position.y = 0.02;
  g.add(base);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const t = new THREE.Mesh(boxGeo(0.03, 0.1, 0.03, 1), MAT.metal);
    t.position.set(Math.cos(a) * 0.28, 0.07, Math.sin(a) * 0.28);
    g.add(t);
  }
  const chain = new THREE.Mesh(boxGeo(0.6, 0.02, 0.03, 1), MAT.dark);
  chain.position.set(0.55, 0.02, 0);
  g.add(chain);
  g.userData.glint = glintSprite(0xd0e0ff, 0.3, 0.2);
  g.add(g.userData.glint);
  return g;
}

// Hoguera abandonada con humo
function makeCampfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), MAT.stone);
    s.position.set(Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6);
    g.add(s);
  }
  const flames = new THREE.Group();
  const fm = [new THREE.MeshBasicMaterial({ color: 0xff7a20 }), new THREE.MeshBasicMaterial({ color: 0xffd060 })];
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 4), fm[i % 2]);
    f.position.set(Math.cos(i * 1.3) * 0.18, 0.3, Math.sin(i * 1.3) * 0.18);
    flames.add(f);
  }
  g.add(flames);
  const smoke = [];
  const sm = new THREE.SpriteMaterial({ map: TEX.glint, color: 0x6a6a68, transparent: true, opacity: 0.5, depthWrite: false });
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(sm.clone());
    s.position.set(0, 1 + i * 1.2, 0);
    s.scale.setScalar(1.2 + i * 0.35);
    g.add(s);
    smoke.push(s);
  }
  g.userData = { flames, smoke };
  return g;
}

function animateCampfire(g, dt, t, lit) {
  g.userData.flames.visible = lit;
  g.userData.flames.children.forEach((f, i) => (f.scale.y = 0.7 + Math.sin(t * 9 + i * 2) * 0.35));
  g.userData.smoke.forEach((s, i) => {
    s.position.y += dt * 0.9;
    s.position.x = Math.sin(t * 0.4 + i) * 0.6 + (s.position.y * 0.15);
    if (s.position.y > 13) s.position.y = 1;
    s.material.opacity = (lit ? 0.45 : 0.15) * (1 - s.position.y / 14);
  });
}

// Cráneo de ciervo con cornamenta (un "regalo" en el porche)
function makeDeerSkull() {
  const g = new THREE.Group();
  const bone = new THREE.MeshLambertMaterial({ color: 0xd8d0b8 });
  const skull = new THREE.Mesh(boxGeo(0.22, 0.18, 0.45, 1), bone);
  skull.position.y = 0.1;
  g.add(skull);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x5a0000 });
  [-0.07, 0.07].forEach((x) => {
    const e = new THREE.Mesh(boxGeo(0.05, 0.05, 0.02, 1), eyeM);
    e.position.set(x, 0.14, 0.12);
    g.add(e);
  });
  [-1, 1].forEach((sd) => {
    for (let k = 0; k < 3; k++) {
      const a = new THREE.Mesh(boxGeo(0.03, 0.35 - k * 0.07, 0.03, 1), bone);
      a.position.set(sd * (0.1 + k * 0.08), 0.32 + k * 0.1, -0.05);
      a.rotation.z = -sd * (0.4 + k * 0.35);
      g.add(a);
    }
  });
  return g;
}

// Página o libreta (diario de Tomás)
function makeJournal() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(boxGeo(0.24, 0.05, 0.32, 1), new THREE.MeshLambertMaterial({ color: 0x4a2a1a }));
  b.position.y = 0.03;
  g.add(b);
  const p = new THREE.Mesh(boxGeo(0.22, 0.01, 0.3, 1), MAT.paper);
  p.position.y = 0.06;
  g.add(p);
  g.userData.glint = glintSprite(0xfff0c0, 0.5, 0.25);
  g.add(g.userData.glint);
  return g;
}

// Linterna vieja de Tomás
function makeOldLantern() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 8), new THREE.MeshLambertMaterial({ color: 0x3a4a3a }));
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.06;
  g.add(body);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8), new THREE.MeshBasicMaterial({ color: 0x8a8060 }));
  lens.position.set(0.155, 0.06, 0);
  lens.rotation.y = Math.PI / 2;
  g.add(lens);
  g.userData.glint = glintSprite(0xfff0c0, 0.5, 0.25);
  g.add(g.userData.glint);
  return g;
}

// Bengala encendida
function makeFlare() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), new THREE.MeshLambertMaterial({ color: 0xa02020 }));
  stick.rotation.z = 1.2;
  stick.position.y = 0.05;
  g.add(stick);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glint, color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(1.4, 1.4, 1.4);
  glow.position.y = 0.15;
  g.add(glow);
  g.userData.glow = glow;
  return g;
}
