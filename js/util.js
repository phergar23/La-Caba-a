'use strict';

const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  smooth(a, b, x) {
    const t = U.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  },
  range: (a, b) => a + Math.random() * (b - a),
  irange: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p) => Math.random() < p,

  mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  },

  dist2D: (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz),

  fmtTime(min) {
    const m = ((Math.floor(min) % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  },

  // Rayo contra caja alineada con los ejes. Devuelve la distancia o Infinity.
  rayBox(o, d, b, maxT) {
    let tmin = 0;
    let tmax = maxT;
    const axes = [['x', 'minX', 'maxX'], ['y', 'minY', 'maxY'], ['z', 'minZ', 'maxZ']];
    for (let i = 0; i < 3; i++) {
      const [k, mn, mx] = axes[i];
      const dk = d[k];
      if (Math.abs(dk) < 1e-9) {
        if (o[k] < b[mn] || o[k] > b[mx]) return Infinity;
      } else {
        const inv = 1 / dk;
        let t1 = (b[mn] - o[k]) * inv;
        let t2 = (b[mx] - o[k]) * inv;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return Infinity;
      }
    }
    return tmin;
  },

  raySphere(o, d, c, r, maxT) {
    const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const cc = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - cc;
    if (disc < 0) return Infinity;
    const s = Math.sqrt(disc);
    let t = -b - s;
    if (t < 0) t = -b + s;
    if (t < 0 || t > maxT) return Infinity;
    return t;
  },

  // Rayo contra cilindro vertical (con tapas).
  rayCylinder(o, d, cx, cz, r, y0, y1, maxT) {
    const ox = o.x - cx, oz = o.z - cz;
    const a = d.x * d.x + d.z * d.z;
    let t0, t1;
    if (a < 1e-9) {
      if (ox * ox + oz * oz > r * r) return Infinity;
      t0 = -Infinity; t1 = Infinity;
    } else {
      const b = 2 * (ox * d.x + oz * d.z);
      const c = ox * ox + oz * oz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return Infinity;
      const s = Math.sqrt(disc);
      t0 = (-b - s) / (2 * a);
      t1 = (-b + s) / (2 * a);
    }
    let ty0, ty1;
    if (Math.abs(d.y) < 1e-9) {
      if (o.y < y0 || o.y > y1) return Infinity;
      ty0 = -Infinity; ty1 = Infinity;
    } else {
      ty0 = (y0 - o.y) / d.y;
      ty1 = (y1 - o.y) / d.y;
      if (ty0 > ty1) { const tmp = ty0; ty0 = ty1; ty1 = tmp; }
    }
    const enter = Math.max(t0, ty0, 0);
    const exit = Math.min(t1, ty1, maxT);
    if (enter > exit) return Infinity;
    return enter;
  },

  // Segmento 2D (XZ) contra rectángulo. true si lo atraviesa.
  segRect(ax, az, bx, bz, r) {
    let tmin = 0, tmax = 1;
    const dx = bx - ax, dz = bz - az;
    const check = (p, dp, mn, mx) => {
      if (Math.abs(dp) < 1e-9) return p > mn && p < mx;
      let t1 = (mn - p) / dp, t2 = (mx - p) / dp;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      return tmin < tmax;
    };
    if (!check(ax, dx, r.minX, r.maxX)) return false;
    if (!check(az, dz, r.minZ, r.maxZ)) return false;
    return tmax - tmin > 1e-4;
  },
};
