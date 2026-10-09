'use strict';

class Player {
  constructor(G) {
    this.G = G;
    this.cam = G.camera;
    this.pos = new THREE.Vector3(1.2, 0, 1.8);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = Math.PI * 0.85;
    this.pitch = -0.1;
    this.health = CFG.PLAYER.maxHealth;
    this.stamina = 100;
    this.battery = 100;
    this.exhausted = false;
    this.flashOn = false;
    this.flickerT = 0;
    this.bobT = 0;
    this.bobAmt = 0;
    this.stepAcc = 0;
    this.speed = 0;
    this.climb = null;
    this.shake = 0;
    this.forceLook = null;
    this.dead = false;
    this.aiming = false;
    this.grounded = true;
    this.fov = 72;
    // Cuerpo: el del guarda por defecto; en multijugador puede ser el del monstruo
    this.cfg = CFG.PLAYER;
    this.isMonster = false;
    this.flashBlockT = 0;

    this.flash = new THREE.SpotLight(0xfff0d0, 0, 42, 0.42, 0.45, 1.0);
    this.flash.position.set(0.25, -0.2, 0.1);
    this.flash.target.position.set(0.05, -0.15, -6);
    this.cam.add(this.flash);
    this.cam.add(this.flash.target);
  }

  get eye() { return this.pos.y + this.cfg.eye; }

  get maxHealth() { return this.cfg.maxHealth; }

  eyePos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.eye, this.pos.z); }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  look(dx, dy) {
    if (this.dead) return;
    const sens = 0.0022 * (this.aiming ? 0.6 : 1) * this.G.settings.sens;
    this.yaw -= dx * sens;
    this.pitch = U.clamp(this.pitch - dy * sens, -1.45, 1.45);
  }

  climbTo(target, faceYaw, via) {
    const hx = via ? via.x : -0.5, hz = via ? via.z : -3.1;
    const up = target.y > this.pos.y;
    const pts = up
      ? [this.pos.clone(), new THREE.Vector3(hx, this.pos.y, hz - 0.1), new THREE.Vector3(hx, target.y, hz), target.clone()]
      : [this.pos.clone(), new THREE.Vector3(hx, this.pos.y, hz), new THREE.Vector3(hx, target.y, hz - 0.1), target.clone()];
    this.climb = { pts, seg: 0, t: 0, faceYaw };
    SFX.creak(this.pos, 0.4, 0.6);
  }

  updateClimb(dt) {
    const c = this.climb;
    const a = c.pts[c.seg], b = c.pts[c.seg + 1];
    const len = a.distanceTo(b);
    const dur = Math.max(0.15, len / (Math.abs(b.y - a.y) > 0.5 ? 2.6 : 3.2));
    c.t += dt / dur;
    if (c.t >= 1) {
      c.seg++;
      c.t = 0;
      if (Math.abs(b.y - a.y) > 0.5) SFX.step('wood', null, 0.3);
      if (c.seg >= c.pts.length - 1) {
        this.pos.copy(c.pts[c.pts.length - 1]);
        this.climb = null;
        this.vy = 0;
        return;
      }
    }
    const k = U.smooth(0, 1, c.t);
    this.pos.lerpVectors(a, b, k);
    if (c.faceYaw !== undefined && c.seg >= c.pts.length - 2) {
      this.yaw += U.wrapAngle(c.faceYaw - this.yaw) * Math.min(1, dt * 4);
    }
    this.bobT += dt * 8;
  }

  surface() {
    const G = this.G;
    const z = G.cabin.zoneOf(this.pos);
    if (z !== 'outside') return 'wood';
    if (this.pos.x > -2.8 && this.pos.x < 2.8 && this.pos.z > 4 && this.pos.z < 6.2) return 'wood';
    if (G.world.isOnPath(this.pos.x, this.pos.z) || G.village.contains(this.pos)) return 'dirt';
    return 'grass';
  }

  hurt(amount) {
    if (this.dead) return;
    if (this.isMonster) { if (this.G.mp) this.G.mp.monsterHurt(amount, 'fall'); return; }
    this.health -= amount;
    this.shake = Math.max(this.shake, 1.2);
    this.G.hud.damage(amount / 60);
    SFX.hurt();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.G.onDeath();
    }
  }

  heal(n) { this.health = Math.min(this.cfg.maxHealth, this.health + n); }

  update(dt, inp) {
    const P = this.cfg;
    const G = this.G;
    // Giro con flechas (útil si el ratón no se puede capturar)
    if (inp.turnL) this.yaw += dt * 2.2;
    if (inp.turnR) this.yaw -= dt * 2.2;

    if (this.forceLook) {
      const f = this.forceLook;
      f.t -= dt;
      const e = this.eyePos();
      const dx = f.target.x - e.x, dy = f.target.y - e.y, dz = f.target.z - e.z;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      this.yaw += U.wrapAngle(yaw - this.yaw) * Math.min(1, dt * 14);
      this.pitch += (pitch - this.pitch) * Math.min(1, dt * 14);
      if (f.t <= 0) this.forceLook = null;
    }

    this.updateFlashlight(dt);

    if (this.climb) {
      this.updateClimb(dt);
      this.speed = 0;
      this.applyCamera(dt);
      return;
    }

    let fx = 0, fz = 0;
    if (!this.dead) {
      if (inp.fwd) fz += 1;
      if (inp.back) fz -= 1;
      if (inp.left) fx -= 1;
      if (inp.right) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    const wantsSprint = inp.sprint && fz > 0 && !this.exhausted && len > 0 && !(G.roles && !this.isMonster && G.roles.heavy);
    let spd = wantsSprint ? P.sprint : P.walk;
    if (this.aiming) spd *= 0.55;
    if (this.health < 30) spd *= 0.85;
    // Monstruo deslumbrado por un flash o una trampa: va a tientas
    if (this.isMonster && G.mp && G.mp.dazzleT > 0) spd *= 0.45;
    // Atrapado en un cepo del cazador
    if (this.isMonster && G.mp && G.mp.trapT > 0) spd = 0;
    if (wantsSprint) {
      this.stamina -= P.staminaDrain * dt * (G.buffs && G.buffs.coffee ? 0.5 : 1);
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
        G.hud.msg('Estás agotado...');
      }
    } else {
      this.stamina = Math.min(100, this.stamina + P.staminaRegen * dt * (len > 0 ? 0.7 : 1));
      if (this.exhausted && this.stamina > 35) this.exhausted = false;
    }
    let mx = 0, mz = 0;
    if (len > 0) {
      fx /= len; fz /= len;
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      mx = (-s * fz + c * fx) * spd;
      mz = (-c * fz - s * fx) * spd;
    }
    const acc = Math.min(1, dt * 10);
    this.vel.x += (mx - this.vel.x) * acc;
    this.vel.z += (mz - this.vel.z) * acc;

    const before = this.pos.clone();
    const moveLen = Math.hypot(this.vel.x, this.vel.z) * dt;
    const steps = Math.max(1, Math.ceil(moveLen / 0.12));
    for (let i = 0; i < steps; i++) {
      this.pos.x += (this.vel.x * dt) / steps;
      this.pos.z += (this.vel.z * dt) / steps;
      G.world.collide(this.pos, P.radius, this.pos.y, P.height || 1.75);
      const fy = G.world.getFloorY(this.pos.x, this.pos.z, this.pos.y);
      if (fy > this.pos.y) this.pos.y = fy;
    }

    // Gravedad / suelo
    const floorY = G.world.getFloorY(this.pos.x, this.pos.z, this.pos.y);
    if (this.grounded && this.pos.y - floorY < 0.4) {
      this.pos.y = floorY;
      this.vy = 0;
    } else if (this.pos.y > floorY + 0.001) {
      this.grounded = false;
      this.vy -= P.gravity * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= floorY) {
        if (this.vy < -11) this.hurt(Math.round((-this.vy - 11) * 8));
        if (this.vy < -4) SFX.step(this.surface(), null, 0.8);
        this.pos.y = floorY;
        this.vy = 0;
        this.grounded = true;
      }
    } else {
      this.pos.y = floorY;
      this.vy = 0;
      this.grounded = true;
    }

    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    this.speed = moved / Math.max(dt, 1e-4);
    this.bobAmt += ((this.speed > 0.5 ? 1 : 0) - this.bobAmt) * Math.min(1, dt * 6);
    this.bobT += moved * 2.1;
    this.stepAcc += moved;
    const stride = wantsSprint ? 2.1 : 1.6;
    if (this.stepAcc > stride && this.grounded) {
      this.stepAcc = 0;
      if (this.isMonster) SFX.heavyStep(null, wantsSprint ? 0.32 : 0.2);
      else SFX.step(this.surface(), null, wantsSprint ? 0.6 : 0.4);
    }

    this.applyCamera(dt);
  }

  updateFlashlight(dt) {
    const G = this.G;
    if (this.isMonster) { this.flash.intensity = 0; return; }
    this.flashBlockT = Math.max(0, this.flashBlockT - dt);
    if (this.flashBlockT > 0) this.flashOn = false;
    if (this.flashOn) {
      this.battery -= CFG.PLAYER.batteryDrain * dt;
      if (this.battery <= 0) {
        if (G.inv.batteries > 0) {
          G.inv.batteries--;
          this.battery = 100;
          SFX.click(null, 0.6);
          G.hud.msg('Cambias las pilas de la linterna.');
        } else {
          this.battery = 0;
          this.flashOn = false;
          G.hud.msg('La linterna se ha quedado sin pilas.');
        }
      }
    }
    let I = this.flashOn ? 2.8 : 0;
    if (this.flashOn) {
      this.flickerT -= dt;
      const danger = G.intruder ? G.intruder.nearness : 0;
      if (this.flickerT <= 0) {
        const p = (this.battery < 15 ? 0.25 : 0) + (danger > 0.6 ? danger * 0.15 : 0);
        if (Math.random() < p) this.flickerT = 0.04 + Math.random() * 0.12;
        else this.flickerT = -0.1;
      }
      if (this.flickerT > 0) I *= 0.08;
      if (this.battery < 25) I *= 0.55 + this.battery / 55;
    }
    this.flash.intensity = I;
  }

  toggleFlash() {
    if (this.isMonster) return;
    if (this.flashBlockT > 0) {
      this.flashOn = false;
      SFX.click(null, 0.4);
      this.G.hud.msg('La linterna no responde...');
      return;
    }
    if (this.battery <= 0 && this.G.inv.batteries > 0) {
      this.G.inv.batteries--;
      this.battery = 100;
      this.G.hud.msg('Pones pilas nuevas.');
    }
    if (this.battery <= 0) {
      this.G.hud.msg('No quedan pilas. Cómpralas en el pueblo.');
      SFX.click(null, 0.4);
      return;
    }
    this.flashOn = !this.flashOn;
    SFX.click(null, 0.5);
  }

  applyCamera(dt) {
    const cam = this.cam;
    const b = this.bobAmt;
    const bx = Math.cos(this.bobT) * 0.035 * b;
    const by = Math.abs(Math.sin(this.bobT)) * 0.055 * b;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    cam.position.set(this.pos.x + c * bx, this.eye + by - 0.03 * b, this.pos.z - s * bx);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(
      this.pitch + (Math.random() - 0.5) * 0.05 * sh,
      this.yaw + (Math.random() - 0.5) * 0.05 * sh,
      Math.cos(this.bobT) * 0.006 * b + (this.dead ? 0.4 : 0),
    );
    // La investigadora, con las manos libres, apunta con el zoom de su cámara
    const zoom = this.G.role === 'investigator' && this.G.weapons.current === 'none';
    const scope = this.G.weapons.current === 'rifle';
    const targetFov = this.aiming ? (zoom ? 24 : scope ? 16 : 52) : this.G.settings.fov;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 10);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
