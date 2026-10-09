'use strict';

// Entrevista de la investigadora a un vecino (Q al hablar con él). Dos rondas: cómo empiezas y
// cómo le convences. Cada vecino tiene su carácter (se nota en cómo te recibe). Si aciertas las dos,
// te da su testimonio, que va al expediente. Cada vecino, una entrevista al día.
class Interview {
  constructor(G) {
    this.G = G;
    this.active = false;
  }

  can(id) {
    const G = this.G;
    const R = G.roles;
    const n = G.village.byId[id];
    return R.role === 'investigator' && G.phase === 'day' && !!INTERVIEWS[id] && !!n && n.mesh.visible && !R.interviewed.has(id);
  }

  start(id) {
    const G = this.G;
    if (!this.can(id) || this.active) return false;
    this.active = true;
    this.id = id;
    this.npc = G.village.byId[id];
    this.data = INTERVIEWS[id];
    this.type = INTERVIEW_TYPES[this.data.type];
    this.round = 0;
    this.answered = -1;
    this.finishSoon = false;
    this.say = '';
    this.ok = false;
    this.result = '';
    G.roles.interviewed.add(id);
    G.state = 'talk';
    G.exitLock();
    G.clearInput();
    document.getElementById('talk').classList.remove('hidden');
    SFX.click(null, 0.4);
    this.shuffle();
    this.render();
    return true;
  }

  shuffle() {
    const keys = Object.keys(INTERVIEW_ROUNDS[this.round].opts);
    for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
    this.order = keys;
    this.answered = -1;
  }

  answer(slot) {
    const G = this.G;
    const R = G.roles;
    if (!this.active || this.answered !== -1) return;
    const key = this.order[slot];
    if (!key) return;
    this.answered = slot;
    let ok = key === this.type['r' + (this.round + 1)];
    // Lo que cuesta o lo que hace falta tener
    if (key === 'invitar') {
      if (G.money >= 5) G.addMoney(-5, 'Una ronda');
      else ok = false;
    }
    if (key === 'pruebas' && R.sentTotal + PROOF_KEYS.reduce((a, k) => a + R.got[k], 0) === 0) ok = false;
    const react = INTERVIEW_REACT[this.data.type];
    this.say = ok ? react.good[this.round] : react.bad[this.round];
    this.ok = ok;
    if (ok) SFX.chime(null, 1.1, 0.4); else SFX.click(null, 0.3);
    if (!ok) {
      this.result = this.round === 0 ? 'Se cierra en banda. Hoy no le sacarás nada.' : 'Te cuenta algo, pero no deja que lo grabes: no sirve para el expediente.';
    } else if (this.round === 1) {
      R.got.testimonio++;
      R.ivDone++;
      this.result = `TESTIMONIO: «${this.data.testimony}»`;
      SFX.shutter();
    }
    this.render();
    // Siguiente ronda o fin
    clearTimeout(this.nextT);
    this.nextT = setTimeout(() => {
      if (!this.active) return;
      if (ok && this.round === 0) { this.round = 1; this.shuffle(); this.say = ''; this.render(); }
      else this.finishSoon = true;
      this.render();
    }, 1600);
  }

  close() {
    const G = this.G;
    if (!this.active) return;
    clearTimeout(this.nextT);
    this.active = false;
    document.getElementById('talk').classList.add('hidden');
    if (G.state === 'talk') G.state = 'playing';
    G.requestLock();
    if (this.ok && this.round === 1 && this.answered !== -1) {
      G.hud.msg(`Testimonio grabado. (Testimonios sin enviar: ${G.roles.got.testimonio})`, 5);
    }
  }

  reset() { if (this.active) this.close(); }

  update() {
    if (this.active && (this.G.player.dead || this.G.phase !== 'day')) this.close();
  }

  render() {
    const $ = (id) => document.getElementById(id);
    const R = INTERVIEW_ROUNDS[this.round];
    $('talk-who').textContent = `${this.npc.name} · parece ${this.type.name}`;
    $('talk-mood').textContent = this.data.mood;
    $('talk-q').textContent = this.finishSoon ? '' : R.q;
    $('talk-say').textContent = this.say ? `${this.npc.name.split(' (')[0]}: «${this.say}»` : '';
    $('talk-result').textContent = this.answered !== -1 && (!this.ok || this.round === 1) ? this.result : '';
    $('talk-result').classList.toggle('good', !!this.ok);
    if (this.finishSoon || (this.answered !== -1 && (!this.ok || this.round === 1))) {
      $('talk-opts').innerHTML = '<button class="pleno-opt" data-close="1"><b>E</b> Terminar la entrevista</button>';
      return;
    }
    $('talk-opts').innerHTML = this.order.map((k, i) => {
      let cls = '';
      if (this.answered !== -1) cls = i === this.answered ? (this.ok ? ' ok' : ' bad') : ' off';
      return `<button class="pleno-opt${cls}" data-slot="${i}"${this.answered !== -1 ? ' disabled' : ''}><b>${i + 1}</b> ${R.opts[k]}</button>`;
    }).join('');
  }
}
