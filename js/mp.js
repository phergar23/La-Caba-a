'use strict';

// Modo multijugador: de 2 a 5 personas. Siempre hay un guardabosques y un monstruo; con más gente
// entran la investigadora, el cazador y el alcalde, cada uno con su propio objetivo.
// - El primer humano de la lista (normalmente el guardabosques) lleva la hora, la cabaña, el
//   generador y el final de la partida. Los demás humanos le mandan lo que tocan en la cabaña.
// - El monstruo manda sobre su cuerpo, su vida y sus mejoras.
// - Cada humano decide si le alcanza un zarpazo (lo comprueba en su propio aparato).
// Cada uno manda ~12 veces por segundo su estado completo y una cola corta de sucesos
// (ataques, disparos, rugidos...). Los sucesos llevan número para no repetirlos.

const MP_VOICES = [
  KNOCK_LINES,
  [
    'Guarda, soy Julián, el de la ferretería. Se me ha parado el coche en el camino. ¿Me abres?',
    'Hijo, soy Remedios. Te traigo caldo caliente. Ábreme, que se enfría.',
    'Soy el padre Elías. Tengo que hablarte de Tomás. Abre, por caridad.',
  ],
  [
    '¡Está detrás de ti! ¡Sal por la puerta, rápido!',
    'Tu generador hace un ruido muy raro... baja a mirarlo.',
    'Te he visto por la ventana. Estás solo. Ábreme.',
  ],
];

class Multiplayer {
  constructor(G) {
    this.G = G;
    this.link = null;
    this.phase = 'idle';
    this.myRole = null;
    this.isHost = false;
    this.code = '';
    this.size = 2;
    this.roster = [];
    this.peers = new Map();
    this.want = '';
    this.out = [];
    this.evId = 0;
    this.sendT = 0;
    this.lastSend = 0;
    this.result = 0;
    this.cavern = null;
    this.working = -1;
    this.avatars = new Map();
    this.bindUI();
    setInterval(() => this.heartbeat(), 1000);
  }

  $(id) { return document.getElementById(id); }
  get myId() { return this.link ? this.link.id : ''; }

  // ======================= Sala de espera =======================
  bindUI() {
    const $ = (id) => this.$(id);
    $('btn-mp').addEventListener('click', () => this.open());
    $('btn-mp-create').addEventListener('click', () => this.screen('create'));
    $('btn-mp-join').addEventListener('click', () => {
      $('mp-input').value = '';
      $('mp-join-status').textContent = '';
      this.screen('joinscr');
      setTimeout(() => $('mp-input').focus(), 30);
    });
    $('btn-mp-back').addEventListener('click', () => this.close());
    document.querySelectorAll('#mp-create [data-n]').forEach((b) => b.addEventListener('click', () => this.host(+b.dataset.n)));
    document.querySelectorAll('#mp-lobby [data-role]').forEach((b) => b.addEventListener('click', () => this.pick(b.dataset.role)));
    $('btn-mp-create-back').addEventListener('click', () => this.screen('home'));
    $('btn-mp-cancel').addEventListener('click', () => { this.reset(); this.screen('home'); });
    $('btn-mp-start').addEventListener('click', () => this.start());
    $('btn-mp-join-back').addEventListener('click', () => { this.reset(); this.screen('home'); });
    $('btn-mp-copy').addEventListener('click', () => {
      const done = () => { $('btn-mp-copy').textContent = '¡Copiado!'; setTimeout(() => ($('btn-mp-copy').textContent = 'Copiar código'), 1500); };
      try { navigator.clipboard.writeText(this.code).then(done, () => {}); } catch (e) { /* sin portapapeles */ }
    });
    $('btn-mp-enter').addEventListener('click', () => this.join($('mp-input').value));
    $('mp-input').addEventListener('input', () => {
      const v = cleanRoomCode($('mp-input').value);
      if ($('mp-input').value !== v) $('mp-input').value = v;
    });
    $('mp-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.join($('mp-input').value);
      e.stopPropagation();
    });
  }

  screen(name) {
    ['home', 'create', 'lobby', 'joinscr'].forEach((s) => this.$('mp-' + s).classList.toggle('hidden', s !== name));
    this.netNote();
  }

  open() {
    SFX.init();
    this.reset();
    this.$('menu').classList.add('hidden');
    this.$('mp').classList.remove('hidden');
    this.screen('home');
  }

  close() {
    this.reset();
    this.$('mp').classList.add('hidden');
    this.$('menu').classList.remove('hidden');
  }

  reset() {
    if (this.link) {
      if (this.phase !== 'idle') for (let i = 0; i < 3; i++) this.link.send({ bye: 1 });
      this.link.close();
    }
    this.link = null;
    this.phase = 'idle';
    this.foundHost = false;
    this.warnedJoin = false;
    this.roster = [];
    this.peers = new Map();
    this.want = '';
    this.result = 0;
  }

  // Estado de cada camino de conexión (para saber qué falla si no se encuentran)
  netNote() {
    const el = this.$('mp-net-note');
    const L = this.link;
    const inClaude = !!(window.claude && typeof window.claude.use === 'function');
    const hasPeer = typeof window.Peer === 'function';
    if (!L) {
      const ways = [];
      if (inClaude) ways.push('la sala de claude.ai');
      if (hasPeer) ways.push('internet (PeerJS)');
      ways.push('pestañas de este navegador');
      el.textContent = 'Se conecta a la vez por ' + ways.join(', ') + '. Todos los aparatos tienen que coincidir en al menos uno.';
      return;
    }
    const heard = Object.assign({}, L.heard || {});
    if (heard.lobby) heard.room = true;
    const ok = (k) => (heard[k] ? ' ✓' : '');
    const parts = [];
    const room = {
      off: 'esperando', none: 'no disponible en esta vista', connecting: 'conectando...', on: 'conectada',
      error: 'error' + (L.roomError ? ' (' + L.roomError + ')' : ''),
    }[L.state.room] || L.state.room;
    let detail = '';
    if (L.state.room === 'on') {
      const bits = [];
      bits.push(L.roomConn === false ? 'SIN conexión con el servidor' : L.roomConn === true ? 'servidor OK' : 'servidor ?');
      if (L.roomOthers !== undefined) bits.push(L.roomOthers === 0 ? 'no ve ninguna otra página' : L.roomOthers === 1 ? 've 1 página más' : `ve ${L.roomOthers} páginas más`);
      if (L.joinState && L.joinState !== 'ok') bits.push('sala propia: ' + L.joinState);
      detail = ' (' + bits.join(', ') + ')';
    }
    if (inClaude || L.state.room !== 'none') parts.push('Sala de claude.ai: ' + room + detail + ok('room'));
    const peer = {
      off: 'no disponible', connecting: 'conectando...', on: 'conectado', linked: 'conectado', error: 'sin acceso', taken: 'código ocupado',
    }[L.state.peer] || L.state.peer;
    parts.push('Internet (PeerJS): ' + (hasPeer ? peer : 'no disponible') + ok('peer'));
    if (heard.local) parts.push('Otra pestaña de este navegador ✓');
    el.textContent = parts.join(' · ');
  }

  openLink() {
    this.link = new NetLink(this.code, this.isHost);
    this.link.onPacket = (p) => this.onPacket(p);
    this.link.onStatus = (kind, v) => {
      this.netNote();
      if (kind === 'peer' && v === 'taken' && this.phase === 'hosting') this.host(this.size);
    };
    this.link.start();
    this.netNote();
  }

  // Crear sala para n jugadores
  host(n) {
    this.reset();
    this.isHost = true;
    this.size = U.clamp(n | 0, 2, 5);
    this.code = makeRoomCode();
    this.openLink();
    this.phase = 'hosting';
    this.roster = [{ id: this.myId, role: '', at: performance.now() }];
    this.$('mp-code').textContent = this.code;
    this.$('mp-code-box').classList.remove('hidden');
    this.screen('lobby');
    this.renderLobby();
  }

  join(raw) {
    const code = cleanRoomCode(raw);
    if (code.length !== CODE_LEN) {
      this.$('mp-join-status').textContent = `El código tiene ${CODE_LEN} letras y números.`;
      return;
    }
    this.reset();
    this.isHost = false;
    this.code = code;
    this.openLink();
    this.phase = 'joining';
    this.joinT = 0;
    this.$('mp-join-status').textContent = `Buscando la sala ${code}...`;
  }

  // ¿Puede la persona id quedarse con ese papel? (cada papel, una sola vez; siempre tiene que
  // quedar sitio para el guardabosques y el monstruo)
  canTake(role, id) {
    if (!role) return true;
    if (!ROLE_ORDER.includes(role)) return false;
    if (this.roster.some((r) => r.id !== id && r.role === role)) return false;
    if (OPTIONAL_ROLES.includes(role)) {
      const others = this.roster.filter((r) => r.id !== id && OPTIONAL_ROLES.includes(r.role)).length;
      if (others >= this.size - 2) return false;
    }
    return true;
  }

  pick(role) {
    if (this.phase === 'hosting') {
      const me = this.roster.find((r) => r.id === this.myId);
      if (me.role === role) me.role = '';
      else if (this.canTake(role, this.myId)) me.role = role;
      SFX.ui();
      this.renderLobby();
    } else if (this.phase === 'lobby') {
      const me = this.roster.find((r) => r.id === this.myId);
      this.want = me && me.role === role ? '' : role;
      this.wantAt = performance.now();
      SFX.ui();
      this.sendNow();
      this.renderLobby();
    }
  }

  // Al empezar, quien no ha elegido recibe un papel libre (primero los obligatorios)
  start() {
    if (this.phase !== 'hosting' || this.roster.length < this.size) return;
    this.roster.forEach((r) => {
      if (r.role) return;
      const free = ROLE_ORDER.find((k) => this.canTake(k, r.id));
      r.role = free || '';
    });
    if (!this.roster.some((r) => r.role === 'ranger') || !this.roster.some((r) => r.role === 'monster')) {
      this.$('mp-lobby-status').textContent = 'Falta alguien que haga de guardabosques o de monstruo.';
      return;
    }
    const me = this.roster.find((r) => r.id === this.myId);
    this.begin(me.role, this.roster.map((r) => [r.id, r.role]));
  }

  renderLobby() {
    const $ = (id) => this.$(id);
    const me = this.roster.find((r) => r.id === this.myId);
    const n = this.size;
    $('mp-lobby-info').textContent = `Sala de ${n} jugadores · ${this.roster.length}/${n} dentro`;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const r = this.roster[i];
      if (!r) { rows.push('<li class="empty">Esperando a alguien...</li>'); continue; }
      const who = (r.id === this.myId ? 'Tú' : 'Jugador ' + (i + 1)) + (i === 0 ? ' (crea la sala)' : '');
      const role = r.role ? ROLE_INFO[r.role].name : '<i>sin papel (se le dará uno libre)</i>';
      rows.push(`<li${r.id === this.myId ? ' class="me"' : ''}><span>${who}</span><b>${role}</b></li>`);
    }
    $('mp-roster').innerHTML = rows.join('');
    document.querySelectorAll('#mp-lobby [data-role]').forEach((b) => {
      const role = b.dataset.role;
      const optional = OPTIONAL_ROLES.includes(role);
      b.classList.toggle('hidden', optional && n < 3);
      const mine = me && me.role === role;
      const owner = this.roster.find((r) => r.role === role && r.id !== this.myId);
      const ok = mine || this.canTake(role, this.myId);
      b.classList.toggle('mine', !!mine);
      b.classList.toggle('wanted', !mine && this.want === role && this.phase === 'lobby');
      b.disabled = !ok;
      const st = b.querySelector('em');
      if (st) st.textContent = mine ? 'Tú' : owner ? 'Ocupado' : ok ? '' : 'No caben más papeles extra';
    });
    const startB = $('btn-mp-start');
    startB.classList.toggle('hidden', this.phase !== 'hosting');
    const missing = n - this.roster.length;
    startB.disabled = missing > 0;
    startB.textContent = missing > 0 ? `Faltan ${missing}` : 'Empezar la partida';
    $('mp-lobby-status').textContent = this.phase === 'hosting'
      ? (missing > 0 ? `Pásales el código. Cuando estéis los ${n}, pulsa Empezar.` : '¡Ya estáis todos! Pulsa Empezar cuando queráis.')
      : this.lobbyMsg || 'Elige tu papel. Quien ha creado la sala empezará la partida.';
    $('mp-roles-note').textContent = n > 2
      ? `Siempre hay un guardabosques y un monstruo; en esta sala caben ${n - 2} papel${n - 2 > 1 ? 'es' : ''} más.`
      : 'Una persona es el guardabosques y la otra, el monstruo.';
  }

  // Se llama en cada fotograma, pase lo que pase (también en menús y pantallas finales)
  tick(dt) {
    if (!this.link) return;
    const now = performance.now();
    // Si es este aparato el que ha estado parado (pestaña en segundo plano, cargando...),
    // no se da por perdidos a los demás
    const gap = now - (this.lastTickAt || now);
    this.lastTickAt = now;
    if (gap > 2000) {
      this.peers.forEach((p) => (p.at += gap));
      if (this.phase === 'hosting') this.roster.forEach((r) => (r.at = (r.at || now) + gap));
    }
    if (this.phase === 'joining') {
      this.joinT += dt;
      if (this.joinT > 15 && !this.foundHost && !this.warnedJoin) {
        this.warnedJoin = true;
        this.$('mp-join-status').textContent = 'No aparece ninguna sala con ese código. ¿Está bien escrito? Sigo buscando... (abajo ves cómo está cada conexión en este aparato; compáralo con el otro)';
      }
    }
    if (this.phase === 'hosting') {
      // Quien cierra la página sin despedirse deja libre su sitio
      const before = this.roster.length;
      this.roster = this.roster.filter((r) => r.id === this.myId || now - r.at < 10000);
      if (this.roster.length !== before) this.renderLobby();
    }
    if (this.phase === 'lobby' && now - this.hostAt > 15000 && !this.lostHost) {
      this.lostHost = true;
      this.lobbyMsg = 'Hace rato que no llegan noticias de la sala. Sigo esperando...';
      this.renderLobby();
    }
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / (this.phase === 'playing' || this.phase === 'ended' ? CFG.MP.SEND_HZ : 4);
      this.sendNow();
    }
    if (this.phase === 'playing') {
      let worst = 0;
      this.peers.forEach((p) => {
        if (p.left) return;
        const lag = (now - p.at) / 1000;
        worst = Math.max(worst, lag);
        if (lag > CFG.MP.TIMEOUT) this.peerLeft(p, 'lost');
      });
      this.lag = worst;
    }
  }

  // Latido lento: mantiene viva la conexión aunque la pestaña esté en segundo plano
  heartbeat() {
    if (this.link && performance.now() - this.lastSend > 900) this.sendNow();
  }

  sendNow() {
    const L = this.link;
    if (!L) return;
    this.lastSend = performance.now();
    if (this.phase === 'hosting') L.send({ lb: 1, sz: this.size, ro: this.roster.map((r) => [r.id, r.role || 0]) });
    else if (this.phase === 'joining' || this.phase === 'lobby') L.send({ lb: 1, jn: 1, want: this.want || 0 });
    else if (this.phase === 'playing' || this.phase === 'ended') {
      let s = null;
      try { s = this.G.role === 'monster' ? this.monsterState() : this.humanState(); } catch (e) { s = null; }
      L.send({ go: 1, sz: this.size, ro: this.isHost ? this.roster.map((r) => [r.id, r.role]) : 0, s, ev: this.out, res: this.result || 0 });
    }
  }

  onPacket(p) {
    const now = performance.now();
    if (this.phase === 'hosting') {
      if (p.bye) { this.roster = this.roster.filter((r) => r.id !== p.f); this.renderLobby(); return; }
      if (!p.jn) return;
      let r = this.roster.find((x) => x.id === p.f);
      if (!r) {
        if (this.roster.length >= this.size) return;
        r = { id: p.f, role: '', at: now };
        this.roster.push(r);
        SFX.ui();
      }
      r.at = now;
      const want = p.want || '';
      if (want !== r.role && this.canTake(want, r.id)) r.role = want;
      this.renderLobby();
      return;
    }
    if (this.phase === 'joining' || this.phase === 'lobby') {
      if (!Array.isArray(p.ro) || !p.ro.length || p.ro[0][0] !== p.f) return;
      const mine = p.ro.find((r) => r[0] === this.myId);
      if (p.go) {
        if (mine && mine[1]) this.begin(mine[1], p.ro, p.sz);
        else this.$(this.phase === 'lobby' ? 'mp-lobby-status' : 'mp-join-status').textContent = 'Esa partida ya ha empezado sin ti.';
        return;
      }
      if (!mine && p.ro.length >= (p.sz || 2)) {
        this.$(this.phase === 'lobby' ? 'mp-lobby-status' : 'mp-join-status').textContent = `Esa sala ya está llena (${p.sz} de ${p.sz}).`;
        return;
      }
      this.hostAt = now;
      this.lostHost = false;
      if (this.phase === 'joining') {
        this.foundHost = true;
        this.phase = 'lobby';
        this.$('mp-code').textContent = this.code;
        this.screen('lobby');
      }
      this.size = p.sz || 2;
      this.roster = p.ro.map((r) => ({ id: r[0], role: r[1] || '' }));
      const me = this.roster.find((r) => r.id === this.myId);
      // Si otra persona se ha quedado con el papel que pedía, deja de pedirlo
      if (this.want && me && me.role !== this.want && this.roster.some((r) => r.role === this.want) && now - (this.wantAt || 0) > 800) {
        this.want = me.role;
        this.lobbyMsg = 'Ese papel ya lo tiene otra persona.';
      } else if (me && me.role === this.want) this.lobbyMsg = '';
      this.renderLobby();
      return;
    }
    if (this.phase !== 'playing' && this.phase !== 'ended') return;
    const peer = this.peers.get(p.f);
    if (!peer) return;
    peer.at = now;
    if (p.bye) { this.peerLeft(peer, 'left'); return; }
    if (peer.left && this.phase === 'playing') {
      peer.left = false;
      this.buildAvatars();
      this.G.hud.msg(`${ROLE_INFO[peer.role].name} ha vuelto a conectarse.`);
    }
    this.onGame(p, peer);
  }

  begin(myRole, ro, n) {
    const G = this.G;
    this.phase = 'playing';
    if (n) this.size = n;
    this.startedAt = performance.now();
    this.out = [];
    this.evId = 0;
    this.result = 0;
    this.myRole = myRole;
    this.roster = ro.map((r) => ({ id: r[0], role: r[1] }));
    this.peers = new Map();
    this.roster.forEach((r) => {
      if (r.id === this.myId) return;
      this.peers.set(r.id, { id: r.id, role: r.role, s: null, sAt: 0, at: performance.now(), inEv: 0, left: false, dd: 0 });
    });
    this.humans = this.roster.filter((r) => r.role !== 'monster').length;
    this.$('mp').classList.add('hidden');
    G.startMatch(myRole, this.roster.map((r) => r.role), hashStr(this.code));
  }

  onGame(p, peer) {
    const G = this.G;
    if (p.s) {
      const s = p.s;
      peer.s = s;
      peer.sAt = performance.now();
      try {
        if (peer.role === 'monster') {
          if (G.role !== 'monster') this.onMonsterState(s);
        } else {
          if (s.ph && peer.id === this.authorityId() && !this.isAuthority()) this.onWorldState(s);
          if (s.hm) this.applyHomeState(peer.role, s.hm, s.hx);
          G.roles.onPeerState(peer.id, peer.role, s);
          if (s.dd && !peer.dd) this.onPeerDeath(peer);
        }
      } catch (e) { console.error(e); }
    }
    if (Array.isArray(p.ev)) {
      p.ev.forEach((ev) => {
        if (!ev || !(ev.i > peer.inEv)) return;
        peer.inEv = ev.i;
        try {
          if (peer.role === 'monster') { if (G.role !== 'monster') this.onMonsterEvent(ev); }
          else this.onHumanEvent(ev, peer);
        } catch (e) { console.error(e); }
      });
    }
    if (p.res && this.phase === 'playing' && peer.id === this.authorityId()) this.finish(p.res);
  }

  emit(ev) {
    ev.i = ++this.evId;
    this.out.push(ev);
    if (this.out.length > 10) this.out.shift();
  }

  // ======================= Quién lleva el mundo =======================
  // El primer humano presente en este orden: guardabosques, investigadora, cazador, alcalde
  authorityId() {
    for (const role of HUMAN_ROLES) {
      const r = this.roster.find((x) => x.role === role);
      if (!r) continue;
      if (r.id === this.myId) return r.id;
      const p = this.peers.get(r.id);
      if (p && !p.left) return r.id;
    }
    return null;
  }

  isAuthority() { return this.G.role !== 'monster' && this.authorityId() === this.myId; }

  // La cabaña la lleva quien lleva el mundo; cada casa, su dueño
  ownsRef(i) {
    const site = this.refSite && this.refSite[i];
    if (!site) return false;
    if (site === 'cabin') return this.isAuthority();
    return this.G.role === site;
  }

  // ¿Estoy dentro del sitio (cabaña o casa) al que pertenece esa entrada?
  insideSiteOf(i) {
    const G = this.G;
    const site = this.refSite[i];
    if (site === 'cabin') return G.cabin.zoneOf(G.player.pos) !== 'outside';
    const h = G.homes.get(site);
    return !!h && h.contains(G.player.pos);
  }

  monsterPeer() {
    for (const p of this.peers.values()) if (p.role === 'monster') return p;
    return null;
  }

  humanPeers() { return [...this.peers.values()].filter((p) => p.role !== 'monster' && !p.left); }

  // Solo se puede dormir si eres el único humano (dormir adelanta la hora para todos)
  canSleep() { return this.isAuthority() && this.humanPeers().length === 0; }

  // Humanos atrapados (sin contar a los que se han ido)
  deadHumans() {
    let n = this.G.role !== 'monster' && this.G.player.dead ? 1 : 0;
    this.peers.forEach((p) => { if (p.role !== 'monster' && p.dd) n++; });
    return n;
  }

  allHumansDead() {
    if (this.G.role !== 'monster' && !this.G.player.dead) return false;
    return this.humanPeers().every((p) => p.dd);
  }

  peerLeft(peer, why) {
    if (peer.left || this.phase !== 'playing') return;
    peer.left = true;
    this.removeAvatar(peer.id);
    const G = this.G;
    const name = ROLE_INFO[peer.role].name;
    if (peer.role === 'monster') { this.finish(why === 'lost' ? 'lost' : 'left'); return; }
    if (G.role === 'monster' && this.humanPeers().length === 0) { this.finish(why === 'lost' ? 'lost' : 'left'); return; }
    G.hud.msg(why === 'lost' ? `Se ha cortado la conexión con ${ROLE_INFO[peer.role].the}.` : `${name} ha salido de la partida.`, 6);
  }

  onPeerDeath(peer) {
    peer.dd = 1;
    const G = this.G;
    const the = ROLE_INFO[peer.role].the;
    if (G.role === 'monster') {
      const left = this.humans - this.deadHumans();
      G.hud.banner('¡ATRAPADO!', `Has cazado a ${the}.` + (left > 0 ? ` Quedan ${left}.` : ''), 4);
      SFX.roar(null, 0.8);
    } else {
      G.hud.msg(`El monstruo ha atrapado a ${the}.`, 6);
      const s = peer.s;
      if (s && Array.isArray(s.p)) SFX.scream(new THREE.Vector3(s.p[0], s.p[1] + 1.5, s.p[2]), 1.2);
    }
  }

  // ======================= Empezar y terminar =======================
  setup(role) {
    const G = this.G;
    if (!this.cavern) this.cavern = new Cavern(G);
    // Entradas de la cabaña (0-7) y de las casas de los demás papeles (en el mismo orden en todos)
    this.entryRefs = [...G.cabin.doors, ...G.cabin.windows, G.cabin.hatch, G.cabin.trapdoor];
    this.refSite = this.entryRefs.map(() => 'cabin');
    this.siteRefs = { cabin: this.entryRefs.map((r, i) => i) };
    G.homes.active.forEach((h) => {
      this.siteRefs[h.id] = [];
      h.refs.forEach((r) => {
        this.siteRefs[h.id].push(this.entryRefs.length);
        this.entryRefs.push(r);
        this.refSite.push(h.id);
      });
    });
    this.override = this.entryRefs.map(() => 0);
    this.entSnap = this.entryRefs.map((r) => this.entryKey(r));
    this.pwSnap = this.powerKey();
    this.llSnap = G.lockLevel;
    this.pwOverride = 0;
    this.aimOverride = 0;
    this.flareOverride = 0;
    this.levels = { garras: 0, velocidad: 0, resistencia: 0, rugido: 0, olfato: 0, voces: 0 };
    const I = G.intruder;
    I.netMode = true;
    I.netState = null;
    I.pendingDmg = 0;
    I.lit = 0;
    I.mesh.visible = false;
    I.state = 'off';
    this.working = -1;
    this.downT = 0;
    this.danger = 0;
    this.lag = 0;
    this.specT = 0;
    this.specId = null;
    this.dazzleT = 0;
    this.chopMarks = [];
    document.body.classList.add('mp');
    this.buildAvatars();
    if (role === 'monster') this.setupMonster();
    else {
      this.cavern.setVisible(false, true);
      this.wasAuth = this.isAuthority();
      G.power.remote = !this.wasAuth;
    }
  }

  setupMonster() {
    const G = this.G;
    const P = G.player;
    P.isMonster = true;
    P.cfg = Object.assign({}, CFG.PLAYER, CFG.MP.MONSTER);
    P.health = P.cfg.maxHealth;
    P.flashOn = false;
    G.weapons.setMonster(true);
    G.power.remote = true;
    G.missions.clear();
    G.story.clearDay();
    G.events.clear();
    const cav = this.cavern;
    MON_STAT_KEYS.forEach((k) => (cav.levels[k] = 0));
    cav.newDay();
    cav.setVisible(true, true);
    cav.addLights();
    this.cabinInter = null;
    this.inCave = true;
    this.onSurface = false;
    this.transit = false;
    this.toBed();
    this.vision = new THREE.PointLight(0xffc8a8, 0, 15, 1.4);
    G.camera.add(this.vision);
    document.body.classList.add('monster-view');
    this.atkCd = 0;
    this.swipeT = 0;
    this.roarCd = 0;
    this.scentCd = 0;
    this.scentT = 0;
    this.voiceCd = 0;
    this.lastDmgT = 10;
    this.glare = 0;
    this.hbT = 0;
    this.workSndT = 0;
    this.lightMsgT = 0;
    this.anim = 'idle';
    const lab = (id, t) => (this.$(id).querySelector('span').textContent = t);
    lab('bar-health', 'VIDA');
    lab('bar-stamina', 'ALIENTO');
    this.$('bar-battery').classList.add('hidden');
    this.applyMonsterStats();
  }

  // Deja el juego como estaba antes de la partida (al volver al menú)
  teardown() {
    const G = this.G;
    const P = G.player;
    [...this.avatars.keys()].forEach((id) => this.removeAvatar(id));
    G.weapons.root.visible = true;
    if (this.vision) { G.camera.remove(this.vision); this.vision = null; }
    if (this.cavern) { this.cavern.cancel(null); this.cavern.setVisible(false, false); this.cavern.removeLights(); }
    P.isMonster = false;
    P.cfg = CFG.PLAYER;
    G.weapons.setMonster(false);
    G.power.remote = false;
    const I = G.intruder;
    I.netMode = false;
    I.netState = null;
    document.body.classList.remove('mp', 'monster-view');
    this.$('mon-glare').style.opacity = '0';
    const lab = (id, t) => (this.$(id).querySelector('span').textContent = t);
    lab('bar-health', 'SALUD');
    lab('bar-stamina', 'ALIENTO');
    this.$('bar-battery').classList.remove('hidden');
    this.$('mon-mini').classList.add('hidden');
    this.cabinInter = null;
    this.working = -1;
  }

  leave() {
    this.reset();
    this.teardown();
  }

  // Lo decide quien lleva el mundo: 'dawn' (última noche superada) o 'dead' (no queda nadie)
  finishAll(kind) {
    if (this.phase !== 'playing') return;
    this.result = kind === 'dawn' ? 'D' : 'K';
    this.finish(this.result);
  }

  // res: 'D' amanece la última noche, 'K' todos los humanos atrapados,
  // 'left' / 'lost' (el monstruo o todos los humanos se han ido o se ha cortado la conexión)
  finish(res) {
    if (this.phase !== 'playing') return;
    const G = this.G;
    this.phase = 'ended';
    if (res === 'D' || res === 'K') this.result = res;
    this.working = -1;
    const me = G.role;
    const H = this.humans;
    const kills = this.deadHumans();
    const need = Math.max(1, Math.ceil(H / 2));
    const N = CFG.MP.NIGHTS;
    // Resultado de cada uno
    const rows = this.roster.map((r) => {
      const mine = r.id === this.myId;
      const peer = this.peers.get(r.id);
      const s = mine ? null : peer && peer.s;
      const info = ROLE_INFO[r.role];
      const left = !mine && peer && peer.left;
      if (r.role === 'monster') {
        const win = res === 'K' || (res === 'D' && kills >= need);
        return { mine, role: r.role, name: info.name, state: left ? 'se fue' : '', goal: `Atrapar a ${need} de ${H}`, got: `${kills} atrapado${kills === 1 ? '' : 's'}`, win: !left && win };
      }
      const dead = mine ? G.player.dead : !!(peer && peer.dd);
      const ob = mine ? G.roles.objective() : s && Array.isArray(s.ob) ? { ok: !!s.ob[0], txt: s.ob[1] } : { ok: false, txt: '' };
      const goal = r.role === 'ranger' ? `Aguantar ${N} noches` : G.roles.goalText(r.role, 'mp');
      const okGoal = r.role === 'ranger' ? !dead : ob.ok;
      const win = res === 'D' && !dead && !left && okGoal;
      return { mine, role: r.role, name: info.name, state: left ? 'se fue' : dead ? 'atrapado' : 'vivo', goal, got: r.role === 'ranger' ? '' : ob.txt, okGoal, win };
    });
    const mineRow = rows.find((r) => r.mine) || { win: false };
    const won = mineRow.win;
    let title, sub;
    const n = G.day;
    if (res === 'left' || res === 'lost') {
      const monsterGone = me !== 'monster';
      title = res === 'lost' ? 'SE HA CORTADO LA CONEXIÓN' : monsterGone ? 'EL MONSTRUO SE HA IDO' : 'SE HAN IDO TODOS';
      sub = res === 'lost'
        ? (monsterGone ? 'Hace rato que no llegan noticias del monstruo.' : 'Hace rato que no llegan noticias de los humanos.')
        : (monsterGone ? 'La persona que hacía de monstruo ha salido de la partida.' : 'Ya no queda ningún humano en la partida.');
    } else if (me === 'monster') {
      title = won ? (H > 1 ? 'LOS HAS CAZADO' : 'LO HAS ATRAPADO') : (H > 1 ? 'SE TE HAN ESCAPADO' : 'HA AMANECIDO');
      sub = won
        ? (H > 1 ? `Has atrapado a ${kills} de ${H} humanos.` : `Has cazado al guardabosques la noche ${n}.`)
        : (H > 1 ? `Solo has atrapado a ${kills} de ${H}. Necesitabas ${need}.` : `El guardabosques ha aguantado ${N} noches. Esta vez se te ha escapado.`);
    } else if (G.player.dead) {
      title = 'TE HA ATRAPADO';
      sub = `El monstruo te ha atrapado. Un solo golpe basta.`;
    } else if (me === 'ranger') {
      title = 'HAS AGUANTADO';
      sub = `${N} noches encerrado en la cabaña. El monstruo vuelve a su guarida con las manos vacías.`;
    } else {
      title = won ? 'OBJETIVO CUMPLIDO' : 'SOBREVIVISTE, PERO...';
      sub = won ? `Has aguantado ${N} noches y has cumplido tu objetivo: ${G.roles.goalText(me, 'mp')}.` : `Has aguantado ${N} noches, pero no has cumplido tu objetivo (${G.roles.objective().txt}).`;
    }
    const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let stats = '';
    if (res === 'D' || res === 'K') {
      stats += '<table class="mp-results">' + rows.map((r) => `<tr class="${r.mine ? 'me' : ''}"><td>${esc(r.name)}${r.mine ? ' (tú)' : ''}</td><td>${esc(r.state)}</td><td>${esc(r.got || r.goal)}</td><td class="${r.win ? 'win' : 'lose'}">${r.win ? 'GANA' : 'PIERDE'}</td></tr>`).join('') + '</table>';
    }
    const lv = me === 'monster' ? this.cavern.levels : this.levels;
    stats += 'Mejoras del monstruo: ' + MON_STAT_KEYS.map((k) => `${MON_STATS[k].name} ${lv[k] || 0}`).join(' · ');
    if (me === 'ranger') stats = `Encargos cumplidos: ${G.stats.helped}<br>` + stats;
    const delay = res === 'K' ? 1600 : res === 'D' ? 2500 : 300;
    setTimeout(() => G.showMPEnd(won, title, sub, stats), delay);
  }

  // Me ha atrapado: si quedan humanos, la partida sigue y miro por los ojos de otro
  onHumanDeath() {
    const G = this.G;
    this.specT = 0;
    if (this.humanPeers().some((p) => !p.dd)) {
      const shot = G.player.killedBy === 'hunter';
      setTimeout(() => this.phase === 'playing' && G.hud.banner(shot ? 'TE HA MATADO EL CAZADOR' : 'TE HA ATRAPADO', 'La partida sigue. Haz clic para ver por los ojos de otro humano.', 6), 1400);
    }
  }

  // ======================= Humanos =======================
  // Estado de cada humano (y, si lleva el mundo, la hora, la cabaña y el generador)
  humanState() {
    const G = this.G;
    const P = G.player;
    const r2 = (v) => Math.round(v * 100) / 100;
    const s = {
      p: [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z)], yw: r2(P.yaw), pt: r2(P.pitch), sp: r2(P.speed),
      fl: P.flash.intensity > 0.4 ? 1 : 0, dd: P.dead ? 1 : 0,
      lit: P.dead ? 0 : G.intruder.lit || 0,
    };
    Object.assign(s, G.roles.netState());
    if (this.isAuthority()) Object.assign(s, this.worldState());
    const h = G.homes.get(G.role);
    if (h && h.active) {
      s.hm = h.refs.map((r) => this.refState(r));
      s.hx = h.special();
    }
    return s;
  }

  // Estado completo de una puerta o ventana (para mandarlo)
  refState(r) {
    if (r.kind === 'door') return [r.open ? 1 : 0, r.bolted ? 1 : 0, r.boards, Math.round(r.pick * 100), Math.round(r.boardHp)];
    if (r.kind === 'window') return [r.glass ? 1 : 0, r.boards, Math.round(r.rip * 100)];
    return [r.open ? 1 : 0, r.bolted ? 1 : 0, Math.round((r.kind === 'hatch' ? r.pick : r.breach) * 100)];
  }

  // Casa de otro humano: se ve como la tiene su dueño
  applyHomeState(role, hm, hx) {
    const h = this.G.homes.get(role);
    const idx = this.siteRefs[role];
    if (!h || !idx || !Array.isArray(hm)) return;
    const now = performance.now();
    hm.forEach((e, k) => {
      const i = idx[k];
      if (i === undefined || now < this.override[i]) return;
      this.applyEntry(i, e);
      this.entSnap[i] = this.entryKey(this.entryRefs[i]);
    });
    if (hx !== undefined) h.applySpecial(hx);
  }

  worldState() {
    const G = this.G;
    const c = G.cabin;
    const pw = G.power;
    const r2 = (v) => Math.round(v * 100) / 100;
    const en = [
      ...c.doors.map((d) => [d.open ? 1 : 0, d.bolted ? 1 : 0, d.boards, Math.round(d.pick * 100), Math.round(d.boardHp)]),
      ...c.windows.map((w) => [w.glass ? 1 : 0, w.boards, Math.round(w.rip * 100)]),
      [c.hatch.open ? 1 : 0, c.hatch.bolted ? 1 : 0, Math.round(c.hatch.pick * 100)],
      [c.trapdoor.open ? 1 : 0, c.trapdoor.bolted ? 1 : 0, Math.round(c.trapdoor.breach * 100)],
    ];
    let cams = 0, dets = 0;
    pw.mounts.forEach((m, i) => { if (m.cam) cams |= 1 << i; if (m.det) dets |= 1 << i; });
    return {
      ck: r2(G.clock), ph: G.phase === 'night' ? 'n' : 'd', dy: G.day,
      en,
      pw: [pw.running ? 1 : 0, pw.lightsOn ? 1 : 0, pw.flood ? 1 : 0, Math.round(pw.fuel), pw.dipT > 0 ? 1 : 0,
        r2(pw.floodAim.x), r2(pw.floodAim.y), r2(pw.floodAim.z), cams, dets],
      fr: G.flare ? [r2(G.flare.pos.x), r2(G.flare.pos.y), r2(G.flare.pos.z), r2(G.flare.t)] : 0,
      ll: G.lockLevel,
    };
  }

  // Lo que se puede tocar de cada entrada (sin el progreso del monstruo, que lo lleva el mundo)
  entryDiscrete(ref) {
    if (ref.kind === 'door') return [ref.open ? 1 : 0, ref.bolted ? 1 : 0, ref.boards];
    if (ref.kind === 'window') return [ref.glass ? 1 : 0, ref.boards];
    return [ref.open ? 1 : 0, ref.bolted ? 1 : 0];
  }

  entryKey(ref) { return this.entryDiscrete(ref).join(','); }

  powerDiscrete() {
    const pw = this.G.power;
    let cams = 0, dets = 0;
    pw.mounts.forEach((m, i) => { if (m.cam) cams |= 1 << i; if (m.det) dets |= 1 << i; });
    return [pw.running ? 1 : 0, pw.lightsOn ? 1 : 0, pw.flood ? 1 : 0, Math.round(pw.fuel), cams, dets];
  }

  powerKey() { return this.powerDiscrete().join(','); }

  // Humanos que no llevan el mundo: avisan de lo que tocan en la cabaña y el generador
  syncUp() {
    const G = this.G;
    const now = performance.now();
    this.entryRefs.forEach((ref, i) => {
      if (this.ownsRef(i)) return;
      const k = this.entryKey(ref);
      if (k === this.entSnap[i]) return;
      this.entSnap[i] = k;
      this.override[i] = now + 1500;
      this.emit({ t: 'ent', e: i, v: this.entryDiscrete(ref) });
    });
    if (this.isAuthority()) return;
    const pk = this.powerKey();
    if (pk !== this.pwSnap) {
      this.pwSnap = pk;
      this.pwOverride = now + 1500;
      this.emit({ t: 'pw', v: this.powerDiscrete() });
    }
    if (G.lockLevel !== this.llSnap) {
      this.llSnap = G.lockLevel;
      this.emit({ t: 'll', v: G.lockLevel });
    }
    // Apuntar el foco desde el tejado
    const pw = G.power;
    if (pw.floodOn && G.cabin.zoneOf(G.player.pos) === 'roof') {
      this.aimOverride = now + 600;
      if (now - (this.aimSent || 0) > 300) {
        this.aimSent = now;
        const a = pw.floodAim;
        const r1 = (v) => Math.round(v * 10) / 10;
        this.emit({ t: 'aim', x: r1(a.x), y: r1(a.y), z: r1(a.z) });
      }
    }
  }

  // Hora, cabaña y generador de quien lleva el mundo (para el monstruo y el resto de humanos)
  onWorldState(s) {
    const G = this.G;
    // Antes de pisar nada, se avisa de lo que acaba de tocar este jugador (si no, se perdería)
    if (G.role !== 'monster' && this.entSnap) this.syncUp();
    const ph = s.ph === 'n' ? 'night' : 'day';
    if (ph !== G.phase) {
      G.phase = ph;
      G.day = s.dy;
      G.clock = s.ck;
      if (G.role === 'monster') {
        if (ph === 'night') this.monsterNight();
        else this.monsterDawn();
      } else if (ph === 'night') G.onNightLocal();
      else G.onDawnLocal(s.dy - 1);
    }
    G.day = s.dy;
    const diff = s.ck - G.clock;
    if (Math.abs(diff) > 20) {
      if (diff > 60 && ph === 'day' && G.role === 'monster') G.hud.msg('El guardabosques se ha ido a dormir: la tarde se echa encima.', 6);
      G.clock = s.ck;
    } else G.clock += diff * 0.2;
    G.lockLevel = s.ll || 1;
    this.llSnap = G.lockLevel;

    const now = performance.now();
    if (Array.isArray(s.en)) {
      s.en.forEach((e, i) => {
        if (now < this.override[i]) return;
        this.applyEntry(i, e);
        this.entSnap[i] = this.entryKey(this.entryRefs[i]);
      });
    }

    const pw = G.power;
    const a = s.pw;
    if (Array.isArray(a) && now >= this.pwOverride) {
      if (!!a[0] !== pw.running) { if (a[0]) SFX.pull(pw.genPos, true); else SFX.sputter(pw.genPos); }
      pw.running = !!a[0];
      pw.lightsOn = !!a[1];
      pw.flood = !!a[2];
      pw.fuel = a[3];
      pw.dipT = a[4] ? 1 : 0;
      if (now >= this.aimOverride) pw.floodAim.set(a[5], a[6], a[7]);
      pw.mounts.forEach((m, k) => { m.cam = !!(a[8] & (1 << k)); m.det = !!(a[9] & (1 << k)); });
      this.pwSnap = this.powerKey();
    }

    if (now >= this.flareOverride) {
      if (s.fr) {
        const p = new THREE.Vector3(s.fr[0], s.fr[1], s.fr[2]);
        if (!G.flare) { SFX.flare(p); G.flareMesh.visible = true; }
        G.flare = { pos: p, t: s.fr[3] };
        G.flareMesh.position.copy(p);
      } else if (G.flare) G.flare.t = 0.001;
    }
  }

  // Quien lleva el mundo aplica lo que ha tocado otro humano
  applyHumanEntry(i, v) {
    const ref = this.entryRefs[i];
    if (!ref || !Array.isArray(v)) return;
    if (ref.kind === 'door') {
      const [o, b, bd] = v;
      if (!!o !== ref.open) { ref.open = !!o; SFX.creak(ref.pos, 0.6, o ? 0.9 : 0.5); }
      if (!!b !== ref.bolted) { ref.bolted = !!b; SFX.bolt(ref.pos, !!b); }
      if (bd !== ref.boards) {
        if (bd > ref.boards) { SFX.hammer(ref.pos); ref.boardHp = CFG.INTRUDER.boardHp; } else SFX.woodCrack(ref.pos, 0.6);
        ref.boards = bd;
      }
    } else if (ref.kind === 'window') {
      const [gl, bd] = v;
      if (!!gl !== ref.glass) { if (gl) SFX.hammer(ref.pos); else SFX.glass(ref.pos); ref.glass = !!gl; }
      if (bd !== ref.boards) {
        if (bd > ref.boards) { SFX.hammer(ref.pos); ref.rip = 0; } else SFX.woodCrack(ref.pos, 0.6);
        ref.boards = bd;
      }
    } else {
      const [o, b] = v;
      if (!!o !== ref.open) { ref.open = !!o; SFX.creak(ref.pos, 0.6, 0.6); }
      if (!!b !== ref.bolted) { ref.bolted = !!b; SFX.bolt(ref.pos, !!b); }
    }
  }

  applyHumanPower(v) {
    const pw = this.G.power;
    if (!Array.isArray(v)) return;
    const [run, lights, flood, fuel, cams, dets] = v;
    pw.fuel = Math.max(pw.fuel, fuel | 0);
    if (!!run !== pw.running) {
      if (run && pw.fuel > 0) { pw.running = true; pw.failed = false; SFX.pull(pw.genPos, true); }
      else if (!run) { pw.running = false; SFX.sputter(pw.genPos); }
    }
    pw.lightsOn = !!lights;
    pw.flood = !!flood;
    pw.mounts.forEach((m, k) => {
      if (cams & (1 << k)) m.cam = true;
      if (dets & (1 << k)) m.det = true;
    });
  }

  onHumanEvent(ev, peer) {
    const G = this.G;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const mon = G.role === 'monster';
    const auth = this.isAuthority();
    switch (ev.t) {
      case 'hit':
        if (mon) this.monsterHurt(ev.d, 'shot');
        else if (ev.x !== undefined) {
          const p = V(ev.x, ev.y || 0, ev.z);
          G.roles.addBlood(p);
          G.roles.monsterSound(p);
        }
        break;
      case 'shot':
        SFX.shotAt(V(ev.x, ev.y, ev.z), ev.k);
        // El monstruo oye los disparos y sabe de dónde vienen
        if (mon) this.onChop(ev);
        break;
      case 'flash': if (mon) this.onFlash(ev); break;
      case 'flare': {
        const p = V(ev.x, ev.y, ev.z);
        G.flare = { pos: p, t: 30 };
        G.flareMesh.position.copy(p);
        G.flareMesh.visible = true;
        SFX.flare(p);
        this.flareOverride = performance.now() + 1500;
        break;
      }
      case 'ent': if (this.ownsRef(ev.e)) this.applyHumanEntry(ev.e, ev.v); break;
      case 'trap': {
        const c = G.homes.caravan;
        const t = c.traps[ev.k];
        if (t && peer.role === 'investigator') c.fireTrap(t, true);
        if (mon) this.onDanger(V(ev.x, 1, ev.z), c.trapR + 1.5, 15, 2.2, '¡Una trampa de flash te ciega! Te han hecho una foto.');
        break;
      }
      case 'cepo':
        // Cepo del cazador: si lo he pisado yo (monstruo), me quedo clavado unos segundos
        SFX.bang(V(ev.x, 0.3, ev.z), 1.2);
        if (mon && this.onSurface && !this.transit && Math.hypot(G.player.pos.x - ev.x, G.player.pos.z - ev.z) < 3) {
          this.trapT = HUNTER_CFG.trapHold;
          this.monsterHurt(HUNTER_CFG.trapDmg, 'light');
          G.player.shake = Math.max(G.player.shake, 0.8);
          G.hud.msg('¡Un cepo te atrapa la pata! No puedes moverte.', 4);
          SFX.scream(null, 0.6);
        }
        break;
      case 'pvp': {
        // El cazador me ha disparado
        const P = G.player;
        if (ev.to !== this.myId || P.dead || mon) break;
        P.killedBy = 'hunter';
        G.hud.msg('¡El cazador te ha disparado!', 4);
        P.hurt(ev.d | 0);
        break;
      }
      case 'bell':
        G.homes.townhall.ring(true);
        if (mon) this.onDanger(V(ev.x, 1, ev.z), G.homes.townhall.bellR, 12, 1.4, 'La campana del ayuntamiento te taladra los oídos.');
        break;
      case 'pw': if (auth) this.applyHumanPower(ev.v); break;
      case 'll': if (auth) G.lockLevel = Math.max(G.lockLevel, ev.v | 0); break;
      case 'aim': if (auth) G.power.floodAim.set(ev.x, ev.y, ev.z); break;
      default: break;
    }
  }

  // Bengala lanzada por mí: los demás la ven al momento
  onFlare(p) {
    const r2 = (v) => Math.round(v * 100) / 100;
    this.flareOverride = performance.now() + 1500;
    this.emit({ t: 'flare', x: r2(p.x), y: r2(p.y), z: r2(p.z) });
  }

  onShot(from) {
    const k = this.G.weapons.current;
    this.emit({ t: 'shot', k, x: Math.round(from.x * 10) / 10, y: Math.round(from.y * 10) / 10, z: Math.round(from.z * 10) / 10 });
  }

  // Se llama desde Game.update durante la partida
  update(dt) {
    if (this.G.role === 'monster') this.monsterUpdate(dt);
    else this.humanUpdate(dt);
  }

  humanUpdate(dt) {
    const G = this.G;
    const I = G.intruder;
    const auth = this.isAuthority();
    if (auth !== this.wasAuth) {
      this.wasAuth = auth;
      G.power.remote = !auth;
      if (auth && this.phase === 'playing') G.hud.msg('Ahora llevas tú la hora, la cabaña y el generador.', 6);
      if (!auth) G.events.clear();
    }
    const mp = this.monsterPeer();
    const ms = mp && !mp.left ? mp.s : null;
    if (ms && ms.w >= 0 && this.ownsRef(ms.w) && performance.now() - mp.sAt < 500) this.applyWork(ms.w, dt);
    if (I.pendingDmg > 0) {
      const r1 = (v) => Math.round(v * 10) / 10;
      this.emit({ t: 'hit', d: Math.round(I.pendingDmg), x: r1(I.pos.x), y: r1(I.pos.y), z: r1(I.pos.z) });
      SFX.scream(I.pos, 1);
      G.roles.addBlood(I.pos);
      G.roles.monsterSound(I.pos);
      I.pendingDmg = 0;
    }
    this.syncUp();
    this.updateAvatars(dt);
    if (auth && this.phase === 'playing' && this.allHumansDead()) this.finishAll('dead');
  }

  // Muerto: la cámara va con otro humano vivo
  spectate(dt) {
    const G = this.G;
    this.specT += dt;
    G.weapons.root.visible = false;
    if (this.specT < 2.5) return;
    const list = this.humanPeers().filter((p) => !p.dd && this.avatars.has(p.id) && this.avatars.get(p.id).has);
    this.avatars.forEach((a) => (a.spectated = false));
    if (!list.length) return;
    let t = list.find((p) => p.id === this.specId);
    if (!t) { t = list[0]; this.specId = t.id; }
    const a = this.avatars.get(t.id);
    a.spectated = true;
    a.mesh.visible = false;
    const cam = G.camera;
    cam.position.set(a.pos.x, a.pos.y + 1.62, a.pos.z);
    cam.rotation.set(a.pitch, a.yaw, 0);
    this.specName = ROLE_INFO[t.role].name;
  }

  nextSpectate() {
    const list = this.humanPeers().filter((p) => !p.dd);
    if (!list.length) return;
    const i = list.findIndex((p) => p.id === this.specId);
    this.specId = list[(i + 1) % list.length].id;
    this.specT = Math.max(this.specT, 2.5);
    this.G.hud.msg('Ahora ves por los ojos de ' + ROLE_INFO[list[(i + 1) % list.length].role].the + '.');
  }

  // Marcas de los compañeros en la brújula
  mateMarkers() {
    const out = [];
    this.avatars.forEach((a, id) => {
      const p = this.peers.get(id);
      if (!a.has || !p || p.left || p.dd) return;
      out.push({ pos: a.pos, icon: '●', cls: 'mate' });
    });
    return out;
  }

  // ======================= Cuerpos de los demás humanos =======================
  buildAvatars() {
    const G = this.G;
    const mon = G.role === 'monster' || this.myRole === 'monster';
    this.peers.forEach((p) => {
      if (p.role === 'monster' || this.avatars.has(p.id)) return;
      const info = ROLE_INFO[p.role];
      const m = makeHuman(info.look);
      m.visible = false;
      const spot = new THREE.SpotLight(0xfff0d0, 0, 40, 0.42, 0.45, 1.0);
      const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glint, color: 0xff2a10, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      mark.scale.set(1.8, 1.8, 1.8);
      mark.renderOrder = 10;
      mark.visible = false;
      G.scene.add(m, spot, spot.target, mark);
      // Nombre encima de la cabeza (solo lo ven los humanos)
      let label = null;
      if (!mon) {
        const tex = makeTex(128, 24, (g, w, h) => {
          g.clearRect(0, 0, w, h);
          g.fillStyle = 'rgba(0,0,0,0.55)';
          g.fillRect(0, 0, w, h);
          g.fillStyle = '#e8dcc0';
          g.font = 'bold 14px monospace';
          g.textAlign = 'center';
          g.fillText(info.name, w / 2, 17);
        }, { clamp: true, linear: true });
        label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
        label.scale.set(1.3, 0.25, 1);
        label.visible = false;
        G.scene.add(label);
      }
      this.avatars.set(p.id, { mesh: m, spot, mark, label, pos: new THREE.Vector3(), yaw: 0, pitch: 0, has: false, stepAcc: 0, fall: 0 });
    });
  }

  removeAvatar(id) {
    const a = this.avatars.get(id);
    if (!a) return;
    this.G.scene.remove(a.mesh, a.spot, a.spot.target, a.mark);
    if (a.label) this.G.scene.remove(a.label);
    this.avatars.delete(id);
  }

  updateAvatars(dt) {
    const G = this.G;
    const hidden = G.role === 'monster' && this.inCave;
    this.avatars.forEach((a, id) => {
      const p = this.peers.get(id);
      const s = p && p.s;
      if (!s || !Array.isArray(s.p) || p.left) { a.mesh.visible = false; a.spot.intensity = 0; if (a.label) a.label.visible = false; return; }
      const [tx, ty, tz] = s.p;
      if (!a.has || Math.hypot(tx - a.pos.x, tz - a.pos.z) > 8 || Math.abs(ty - a.pos.y) > 2.5) {
        a.pos.set(tx, ty, tz);
        a.yaw = s.yw;
        a.has = true;
      }
      const bx = a.pos.x, bz = a.pos.z;
      const k = Math.min(1, dt * 10);
      a.pos.x += (tx - a.pos.x) * k;
      a.pos.y += (ty - a.pos.y) * k;
      a.pos.z += (tz - a.pos.z) * k;
      a.yaw += U.wrapAngle(s.yw - a.yaw) * k;
      a.pitch += ((s.pt || 0) - a.pitch) * k;
      // El cazador en su escondite: el monstruo no lo ve salvo que esté encima
      const blind = G.role === 'monster' && s.hid && a.pos.distanceTo(G.player.pos) > 4;
      a.mesh.visible = !hidden && !a.spectated && !blind;
      a.mesh.position.copy(a.pos);
      a.mesh.rotation.y = a.yaw + Math.PI;
      a.fall += ((s.dd ? 1 : 0) - a.fall) * Math.min(1, dt * 3);
      a.mesh.rotation.x = -a.fall * 1.45;
      animateHuman(a.mesh, dt, s.dd ? 0 : s.sp || 0);
      const moved = Math.hypot(a.pos.x - bx, a.pos.z - bz);
      a.stepAcc += moved;
      if (a.stepAcc > 1.6 && !hidden) {
        a.stepAcc = 0;
        const zone = G.cabin.zoneOf(a.pos);
        SFX.step(zone === 'outside' ? 'grass' : 'wood', new THREE.Vector3(a.pos.x, a.pos.y + 0.1, a.pos.z), 0.55);
      }
      const cp = Math.cos(a.pitch);
      const fx = -Math.sin(a.yaw) * cp, fy = Math.sin(a.pitch), fz = -Math.cos(a.yaw) * cp;
      a.spot.position.set(a.pos.x + fx * 0.35, a.pos.y + 1.45, a.pos.z + fz * 0.35);
      a.spot.target.position.set(a.spot.position.x + fx * 6, a.spot.position.y + fy * 6, a.spot.position.z + fz * 6);
      a.spot.intensity = s.fl && !hidden && !s.dd && !blind ? 2.8 : 0;
      a.mark.visible = G.role === 'monster' && this.scentT > 0 && !s.dd && !blind;
      a.mark.position.set(a.pos.x, a.pos.y + 1.5, a.pos.z);
      if (a.label) {
        const d = a.pos.distanceTo(G.player.pos);
        a.label.visible = !a.spectated && d < 35 && d > 1.5;
        a.label.position.set(a.pos.x, a.pos.y + (s.dd ? 0.6 : 2.15), a.pos.z);
      }
    });
  }

  // Humano vivo más cercano (para el monstruo)
  nearestHuman() {
    const P = this.G.player;
    let best = null, bd = Infinity;
    this.avatars.forEach((a, id) => {
      const p = this.peers.get(id);
      if (!a.has || !p || p.left || (p.s && p.s.dd)) return;
      const d = a.pos.distanceTo(P.pos);
      if (d < bd) { bd = d; best = a; }
    });
    return best ? { av: best, d: bd } : null;
  }

  // ======================= El monstruo visto por los humanos =======================
  onMonsterState(s) {
    this.G.intruder.netState = s;
    if (Array.isArray(s.up)) MON_STAT_KEYS.forEach((k, i) => (this.levels[k] = s.up[i] | 0));
  }

  // Posición más reciente que ha mandado el monstruo (la del modelo va suavizada y llega tarde)
  monsterPos() {
    const n = this.G.intruder.netState;
    if (!n || !n.vis || !Array.isArray(n.p)) return null;
    return new THREE.Vector3(n.p[0], n.p[1], n.p[2]);
  }

  monsterNear(ref, dist) {
    const p = this.monsterPos();
    return !!p && p.distanceTo(ref.pos) < dist;
  }

  // Trabajo continuo del monstruo sobre una entrada (forzar, embestir, arrancar)
  applyWork(idx, dt) {
    const G = this.G;
    const I = CFG.INTRUDER;
    const ref = this.entryRefs[idx];
    if (!ref || !this.monsterNear(ref, 3.4)) return;
    const mult = 1 + CFG.MP.WORK_PER_LEVEL * (this.levels.garras || 0);
    const inside = this.insideSiteOf(idx);
    this.workSnd = (this.workSnd || 0) - dt;
    const P = G.player;
    if (ref.kind === 'door') {
      if (ref.open) return;
      if (ref.boards > 0) {
        ref.boardHp -= dt * (I.bashDamage / I.bashEvery) * mult;
        if (this.workSnd <= 0) {
          this.workSnd = I.bashEvery / mult;
          SFX.bang(ref.pos, 1.3);
          ref.shake = 1;
          if (P.pos.distanceTo(ref.pos) < 7) P.shake = Math.max(P.shake, 0.35);
        }
        if (ref.boardHp <= 0) {
          ref.boards--;
          ref.boardHp = ref.boardHpMax || I.boardHp;
          SFX.woodCrack(ref.pos, 1.3);
          if (inside) G.hud.msg('¡Un tablón de la ' + ref.name.toLowerCase() + ' ha cedido!');
        }
        return;
      }
      if (ref.bolted && !ref.isPlayerInside(this.monsterPos())) {
        const lvl = ref.lockFactor || 1 + (G.lockLevel - 1) * 0.7;
        ref.pick += (dt / (I.pickTime * lvl)) * mult;
        if (this.workSnd <= 0) { this.workSnd = U.range(0.8, 1.6); SFX.click(ref.pos, 0.25); }
        if (ref.pick >= 1) {
          ref.pick = 0;
          ref.bolted = false;
          SFX.bolt(ref.pos, false);
          if (inside) G.hud.msg('*CLIC* ...un pestillo acaba de abrirse.');
        }
      }
      return;
    }
    if (ref.kind === 'window') {
      if (ref.boards <= 0) return;
      ref.rip += (dt / I.ripTime) * mult;
      if (this.workSnd <= 0) { this.workSnd = U.range(0.9, 1.5) / mult; SFX.creak(ref.pos, 0.5, 0.35); ref.shake = 1; }
      if (ref.rip >= 1) {
        ref.rip = 0;
        ref.boards--;
        SFX.woodCrack(ref.pos, 1.3);
        if (inside) G.hud.msg('¡Están arrancando los tablones de una ventana!');
      }
      return;
    }
    if (ref.kind === 'hatch') {
      if (ref.open || !ref.bolted || this.monsterPos().y < 5) return;
      ref.pick += (dt / I.hatchPickTime) * mult;
      if (this.workSnd <= 0) { this.workSnd = U.range(0.7, 1.4); SFX.click(ref.pos, 0.3); ref.shake = 0.6; }
      if (ref.pick >= 1) {
        ref.pick = 0;
        ref.bolted = false;
        SFX.bolt(ref.pos, false);
        if (inside) G.hud.msg('*CLIC* ...algo ha abierto el pestillo de la trampilla.');
      }
      return;
    }
    if (ref.kind === 'trapdoor') {
      if (ref.open || !ref.bolted || this.monsterPos().y < -1) return;
      ref.breach += (dt / I.bunkerTime) * mult;
      if (this.workSnd <= 0) {
        this.workSnd = 1.3 / mult;
        SFX.bang(ref.pos, 1.5);
        ref.shake = 1;
        if (G.cabin.zoneOf(P.pos) === 'bunker') P.shake = Math.max(P.shake, 0.35);
      }
      if (ref.breach >= 1) {
        ref.breach = 0;
        ref.bolted = false;
        SFX.glass(ref.pos);
        SFX.bang(ref.pos, 1.6);
        if (G.cabin.zoneOf(P.pos) === 'bunker') G.hud.msg('¡Ha reventado el cerrojo de la trampilla!');
      }
    }
  }

  // ¿Puede alcanzar el zarpazo? (sin paredes, puertas cerradas ni ventanas enteras de por medio)
  reach(a, b) {
    const A = new THREE.Vector3(a.x, a.y + 1.3, a.z);
    const B = new THREE.Vector3(b.x, b.y + 1.3, b.z);
    return this.G.world.lineOfSight(A, B, (bx) => bx.solid && !(bx.owner && bx.owner.kind === 'window' && bx.owner.open));
  }


  onMonsterEvent(ev) {
    const G = this.G;
    const P = G.player;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const inside = G.cabin.zoneOf(P.pos) !== 'outside';
    switch (ev.t) {
      case 'atk': {
        const a = V(ev.x, ev.y, ev.z);
        SFX.swipe(a, 0.9);
        if (P.dead || G.state === 'mpend') return;
        const dx = P.pos.x - a.x, dz = P.pos.z - a.z;
        const d = Math.hypot(dx, dz);
        const facing = d < 0.7 || (dx * -Math.sin(ev.yw) + dz * -Math.cos(ev.yw)) / d > 0.25;
        if (d < CFG.MP.ATTACK_RANGE && Math.abs(P.pos.y - a.y) < 1.5 && facing && this.reach(a, P.pos)) {
          G.intruder.pos.copy(a);
          G.intruder.mesh.visible = true;
          G.jumpscare(G.intruder);
          P.hurt(9999);
        }
        break;
      }
      case 'open': {
        if (!this.ownsRef(ev.e)) return;
        const ref = this.entryRefs[ev.e];
        if (!ref || !this.monsterNear(ref, 3.6)) return;
        if (ref.kind === 'door') {
          if (ref.boards > 0 || ref.open) return;
          if (ref.bolted) { if (!ref.isPlayerInside(this.monsterPos())) return; ref.setBolt(false); }
          ref.setOpen(true, true);
        } else if (ref.kind === 'hatch') {
          if (ref.open) return;
          if (ref.bolted) { if (this.monsterPos().y > 5) return; ref.setBolt(false); }
          ref.setOpen(true, true);
        } else if (ref.kind === 'trapdoor') {
          if (ref.open) return;
          if (ref.bolted) { if (this.monsterPos().y > -1) return; ref.setBolt(false); }
          ref.setOpen(true, true);
        }
        break;
      }
      case 'smash': {
        if (!this.ownsRef(ev.e)) return;
        const ref = this.entryRefs[ev.e];
        if (!ref || ref.kind !== 'window' || ref.boards > 0 || !this.monsterNear(ref, 3.6)) return;
        ref.smash();
        if (this.insideSiteOf(ev.e)) G.hud.msg('¡Han roto el cristal de la ' + ref.name.toLowerCase() + '!');
        break;
      }
      case 'lamp': {
        // El monstruo ha reventado una farola: el alcalde lo valida (tiene que estar al lado)
        const th = G.homes.townhall;
        const l = th.lamps[ev.k];
        const m = this.monsterPos();
        if (!l || !m || Math.hypot(m.x - l.pos.x, m.z - l.pos.z) > 3) return;
        th.breakLamp(ev.k, !th.owner);
        break;
      }
      case 'gen': {
        if (!this.isAuthority() || !this.monsterNear({ pos: G.power.genPos }, 3.5)) return;
        if (G.power.fail()) {
          SFX.bang(G.power.genPos, 1.2);
          if (inside) G.hud.msg('¡Algo ha parado el generador!', 5);
        }
        break;
      }
      case 'roar': {
        const p = V(ev.x, ev.y, ev.z);
        SFX.roar(p, 2.4);
        G.roles.monsterSound(p);
        if (Math.hypot(p.x, p.z) < 26 && G.power.powered && this.isAuthority()) G.power.dip(2 + ev.lv * 1.5);
        if (p.distanceTo(P.pos) < 32 && !P.dead) {
          P.flashOn = false;
          P.flashBlockT = 3 + ev.lv * 1.5;
          P.shake = Math.max(P.shake, 1.0);
          G.hud.msg('Un rugido brutal hace temblar las paredes. La linterna se apaga.', 5);
        }
        break;
      }
      case 'voice': {
        const door = this.entryRefs[ev.e];
        if (!door || door.kind !== 'door') return;
        SFX.knock(door.pos);
        G.roles.monsterSound(door.outside || door.pos);
        const pool = MP_VOICES.slice(0, Math.max(1, ev.lv)).flat();
        const line = pool[ev.l] || pool[0];
        if (this.insideSiteOf(ev.e) || P.pos.distanceTo(door.pos) < 16) setTimeout(() => G.hud.say('Voz al otro lado', line), 900);
        break;
      }
      case 'down':
        G.hud.banner('Ha huido malherido', 'Se arrastra a su guarida. Volverá.', 4);
        break;
      case 'emerge':
        SFX.growl(V(ev.x, 1, ev.z), 1.8);
        G.roles.monsterSound(V(ev.x, 1, ev.z));
        break;
      default: break;
    }
  }

  // ======================= Monstruo =======================
  monsterState() {
    const P = this.G.player;
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      p: [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z)], yw: r2(P.yaw), an: this.anim || 'idle', sp: r2(P.speed),
      vis: this.onSurface && this.downT <= 0 ? 1 : 0,
      hp: Math.round(P.health), mhp: P.cfg.maxHealth,
      up: MON_STAT_KEYS.map((k) => this.cavern.levels[k]),
      w: this.working,
    };
  }

  applyMonsterStats() {
    const P = this.G.player;
    const L = this.cavern.levels;
    const M = CFG.MP.MONSTER;
    P.cfg.walk = M.walk + 0.25 * L.velocidad;
    P.cfg.sprint = M.sprint + 0.5 * L.velocidad;
    P.cfg.staminaDrain = M.staminaDrain * (1 - 0.22 * L.velocidad);
    const max = M.maxHealth + CFG.MP.HP_PER_LEVEL * L.resistencia;
    if (max > P.cfg.maxHealth) P.health += max - P.cfg.maxHealth;
    P.cfg.maxHealth = max;
    P.health = Math.min(P.health, max);
  }

  toBed() {
    const P = this.G.player;
    P.pos.copy(this.cavern.bedPos);
    P.vel.set(0, 0, 0);
    P.vy = 0;
    P.climb = null;
    P.yaw = Math.PI / 2;
    P.pitch = -0.05;
  }

  advanceClock(dt) {
    const T = CFG.TIME;
    const G = this.G;
    const day = G.phase === 'day';
    const rate = day ? (T.NIGHT_START - T.DAY_START) / T.DAY_REAL : (T.NIGHT_END - T.NIGHT_START) / T.NIGHT_REAL;
    G.clock = Math.min(day ? T.NIGHT_START : T.NIGHT_END, G.clock + dt * rate);
  }

  applyEntry(i, e) {
    const ref = this.entryRefs[i];
    if (!ref || !Array.isArray(e)) return;
    if (ref.kind === 'door') {
      const [o, b, bd, pk, hp] = e;
      if (!!o !== ref.open) { ref.open = !!o; SFX.creak(ref.pos, 0.6, o ? 0.9 : 0.5); }
      if (!!b !== ref.bolted) { ref.bolted = !!b; SFX.bolt(ref.pos, !!b); }
      if (bd !== ref.boards) { if (bd > ref.boards) SFX.hammer(ref.pos); else SFX.woodCrack(ref.pos, 1); ref.boards = bd; }
      ref.pick = pk / 100;
      ref.boardHp = hp;
    } else if (ref.kind === 'window') {
      const [gl, bd, rip] = e;
      if (!!gl !== ref.glass) { if (gl) SFX.hammer(ref.pos); else SFX.glass(ref.pos); ref.glass = !!gl; }
      if (bd !== ref.boards) { if (bd > ref.boards) SFX.hammer(ref.pos); else SFX.woodCrack(ref.pos, 1); ref.boards = bd; }
      ref.rip = rip / 100;
    } else {
      const [o, b, pr] = e;
      if (!!o !== ref.open) { ref.open = !!o; SFX.creak(ref.pos, 0.6, 0.6); }
      if (!!b !== ref.bolted) { ref.bolted = !!b; SFX.bolt(ref.pos, !!b); }
      if (ref.kind === 'hatch') ref.pick = pr / 100; else ref.breach = pr / 100;
    }
  }

  monsterNight() {
    const G = this.G;
    this.cavern.cancel('Cae la noche: dejas lo que estabas haciendo.');
    G.hud.banner('NOCHE ' + G.day, 'Los túneles de la pared sur ya están abiertos. Sal y caza al guardabosques.', 6);
    SFX.sting();
  }

  monsterDawn() {
    const G = this.G;
    const P = G.player;
    if (this.onSurface || !this.inCave) this.toCave('dawn');
    this.cavern.newDay();
    this.downT = 0;
    P.health = P.cfg.maxHealth;
    G.hud.banner('DÍA ' + G.day, 'Amanece y vuelves a la guarida. Hazte más fuerte antes de que anochezca.', 6);
  }

  // Bajo tierra (amanecer, derribado o por gusto)
  toCave(reason) {
    const G = this.G;
    const P = G.player;
    this.onSurface = false;
    this.working = -1;
    this.transit = true;
    G.hud.fade(true);
    setTimeout(() => {
      if (G.mp !== this) return;
      this.toBed();
      this.inCave = true;
      this.transit = false;
      if (reason === 'down') P.health = Math.round(P.cfg.maxHealth * 0.6);
      else if (reason === 'dawn') P.health = P.cfg.maxHealth;
      G.hud.fade(false);
      if (reason === 'back') G.hud.msg('Vuelves a la guarida.');
    }, 700);
  }

  emerge(i) {
    if (this.transit) return;
    const G = this.G;
    const P = G.player;
    this.transit = true;
    this.cavern.cancel(null);
    G.hud.fade(true);
    SFX.heavyStep(null, 0.6);
    setTimeout(() => {
      if (G.mp !== this) return;
      const sp = this.cavern.exitSpot(i);
      P.pos.set(sp.x, 0, sp.z);
      P.vel.set(0, 0, 0);
      P.vy = 0;
      P.climb = null;
      P.yaw = sp.yaw;
      P.pitch = 0;
      this.inCave = false;
      this.onSurface = true;
      this.transit = false;
      G.hud.fade(false);
      SFX.growl(null, 0.7);
      this.emit({ t: 'emerge', x: Math.round(sp.x), z: Math.round(sp.z) });
      G.hud.msg(`Sales junto a ${CAVE_EXITS[i].name}. La cabaña está marcada en la brújula (⌂).`, 6);
    }, 700);
  }

  monsterHurt(n, why) {
    const G = this.G;
    const P = G.player;
    if (this.downT > 0 || !this.onSurface || this.transit || this.phase !== 'playing') return;
    P.health -= n;
    this.lastDmgT = 0;
    if (why === 'shot') {
      P.shake = Math.max(P.shake, 0.8);
      G.hud.damage(n / 80);
      SFX.scream(null, 0.45);
    } else if (why === 'fall') G.hud.damage(n / 80);
    if (P.health <= 0) {
      P.health = 0;
      this.knockDown();
    }
  }

  knockDown() {
    const G = this.G;
    this.emit({ t: 'down' });
    this.downT = CFG.MP.DOWN_TIME;
    G.hud.banner('TE HAN DERRIBADO', `Vuelves a rastras a la guarida. Podrás salir otra vez en ${CFG.MP.DOWN_TIME} segundos.`, 5);
    SFX.scream(null, 0.9);
    this.toCave('down');
  }

  // ---------- Controles ----------
  monsterKey(code) {
    const G = this.G;
    const cav = this.cavern;
    switch (code) {
      case 'KeyE':
        if (cav.act && cav.act.id === 'piedra') { cav.strike(); return; }
        G.interact('E');
        return;
      case 'KeyQ': this.roar(); return;
      case 'KeyV': this.scent(); return;
      case 'KeyR': this.voice(); return;
      case 'KeyF': G.hud.msg('No necesitas luz: ves en la oscuridad.'); return;
      default: return;
    }
  }

  monsterClick() {
    const cav = this.cavern;
    if (cav.act && cav.act.id === 'piedra') { cav.strike(); return; }
    this.attack();
  }

  attack() {
    const G = this.G;
    const P = G.player;
    if (this.atkCd > 0 || P.climb || this.transit) return;
    this.atkCd = CFG.MP.ATTACK_COOLDOWN;
    this.swipeT = 0.45;
    G.weapons.swipe();
    SFX.swipe(null, 0.6);
    if (this.inCave) { this.cavern.claw(); return; }
    const r2 = (v) => Math.round(v * 100) / 100;
    this.emit({ t: 'atk', x: r2(P.pos.x), y: r2(P.pos.y), z: r2(P.pos.z), yw: r2(P.yaw) });
  }

  roar() {
    const G = this.G;
    const P = G.player;
    const lv = this.cavern.levels.rugido;
    if (!lv) { G.hud.msg('Aún no sabes rugir así. Practica en el Tótem del rugido.'); return; }
    if (!this.onSurface) { SFX.roar(null, 0.9); P.shake = 0.6; return; }
    if (this.roarCd > 0) { G.hud.msg(`Rugido listo en ${Math.ceil(this.roarCd)} s`); return; }
    this.roarCd = CFG.MP.ROAR_CD[lv];
    this.swipeT = 0.9;
    SFX.roar(null, 1.1);
    P.shake = 0.8;
    const r2 = (v) => Math.round(v * 10) / 10;
    this.emit({ t: 'roar', lv, x: r2(P.pos.x), y: r2(P.pos.y), z: r2(P.pos.z) });
  }

  scent() {
    const G = this.G;
    const lv = this.cavern.levels.olfato;
    if (!lv) { G.hud.msg('Aún no tienes buen olfato. Caza ratas en el Nido de raíces.'); return; }
    if (this.scentCd > 0) { G.hud.msg(`Olfato listo en ${Math.ceil(this.scentCd)} s`); return; }
    this.scentCd = CFG.MP.SCENT_CD - (lv - 1) * 6;
    this.scentT = 5 + lv * 2.5;
    SFX.sniff();
  }

  voice() {
    const G = this.G;
    const P = G.player;
    const lv = this.cavern.levels.voces;
    if (!lv) { G.hud.msg('Aún no sabes imitar voces. Escucha al Muro de las voces.'); return; }
    if (!this.onSurface) { G.hud.msg('Desde aquí abajo no te oiría nadie.'); return; }
    if (this.voiceCd > 0) { G.hud.msg(`Voces listas en ${Math.ceil(this.voiceCd)} s`); return; }
    let best = -1, bd = Infinity;
    this.entryRefs.forEach((d, i) => {
      if (d.kind !== 'door') return;
      const dd = Math.hypot(d.outside.x - P.pos.x, d.outside.z - P.pos.z);
      if (dd < bd) { bd = dd; best = i; }
    });
    if (bd > 6) { G.hud.msg('Acércate a la puerta de una casa para llamar.'); return; }
    this.voiceCd = CFG.MP.VOICE_CD[lv];
    const pool = MP_VOICES.slice(0, lv).flat();
    const l = Math.floor(Math.random() * pool.length);
    SFX.knock(this.entryRefs[best].pos);
    this.emit({ t: 'voice', e: best, lv, l });
    G.hud.say('Tu voz', pool[l], 4);
  }

  localOpen(i, extra = {}) {
    const ref = this.entryRefs[i];
    if (ref.kind === 'door' && ref.isPlayerInside(this.G.player.pos)) ref.bolted = false;
    if (ref.kind !== 'door' && extra.unbolt) ref.bolted = false;
    ref.open = true;
    SFX.creak(ref.pos, 0.8, 0.8);
    this.override[i] = performance.now() + 900;
    this.emit({ t: 'open', e: i });
  }

  // Trepar con una ruta de puntos (ventanas, pared, trampillas)
  climbPath(pts, faceYaw) {
    const P = this.G.player;
    P.climb = { pts: [P.pos.clone(), ...pts], seg: 0, t: 0, faceYaw };
    SFX.creak(P.pos, 0.4, 0.5);
  }

  // ---------- Qué puede hacer el monstruo en la superficie ----------
  monsterInteractables() {
    if (this.inCave || this.transit) return this.inCave ? this.cavern.interactables : [];
    if (!this.cabinInter) this.cabinInter = this.buildCabinInter().concat(this.buildHomeInter());
    const out = this.cabinInter.slice();
    const th = this.G.homes.townhall;
    if (th.active && this.G.phase === 'night') {
      if (!this.lampInter) this.lampInter = th.lamps.map((l) => this.lampInterOf(l));
      th.lamps.forEach((l, k) => { if (l.lit) out.push(this.lampInter[k]); });
    }
    if (this.G.phase === 'night') {
      this.cavern.burrows.forEach((b) => out.push({
        kind: 'burrow', pos: b.pos, r: 1.4,
        prompt: () => ({ title: 'Túnel a la guarida', lines: ['[E] Volver a la guarida'], info: ['Allí abajo no te alcanza la luz'] }),
        act: (key) => { if (key === 'E') this.toCave('back'); return key === 'E'; },
      }));
    }
    return out;
  }

  // Farola del pueblo encendida por el alcalde: el monstruo puede reventarla
  lampInterOf(l) {
    return {
      kind: 'm-lamp', pos: new THREE.Vector3(l.pos.x, 1.2, l.pos.z), r: 1.3,
      prompt: () => ({ title: 'Farola de ' + l.name, lines: ['[E] Reventar la farola'], info: ['El alcalde la ha encendido desde el ayuntamiento'] }),
      act: (key) => {
        if (key !== 'E') return false;
        if (l.broken) return true;
        this.G.homes.townhall.breakLamp(l.k, true);
        this.emit({ t: 'lamp', k: l.k });
        this.swipeT = 0.45;
        this.G.weapons.swipe();
        this.G.hud.msg('Revientas la farola. Se hace la oscuridad.', 3);
        return true;
      },
    };
  }

  // ---------- Puertas y ventanas (cabaña y casas) para el monstruo ----------
  bar(v) {
    const n = Math.round(U.clamp(v, 0, 1) * 10);
    return '▮'.repeat(n) + '▯'.repeat(10 - n);
  }

  doorInter(d, i) {
    const G = this.G;
    const P = () => G.player;
    const bar = (v) => this.bar(v);
    return {
      kind: 'm-door', owner: d, pos: d.pos, r: 0.8,
      prompt: () => {
        if (d.open) return null;
        const inside = d.isPlayerInside(P().pos);
        if (d.boards > 0) return { title: d.name, lines: ['[Mantén E] Embestirla'], info: [`${d.logs ? 'Trancas' : 'Tablones'} ${d.boards} · ${bar(1 - d.boardHp / (d.boardHpMax || CFG.INTRUDER.boardHp))}`] };
        if (d.bolted && !inside) {
          const extra = d.lockFactor > 1 ? 'Puerta maciza: tardas mucho más' : this.refSite[i] === 'cabin' && G.lockLevel > 1 ? `Pestillos reforzados (nv. ${G.lockLevel})` : '';
          return { title: d.name, lines: ['[Mantén E] Forzar el pestillo'], info: [`Pestillo ${bar(d.pick)}`, extra] };
        }
        return { title: d.name, lines: ['[E] Abrirla'], info: [] };
      },
      work: () => (!d.open && (d.boards > 0 || (d.bolted && !d.isPlayerInside(P().pos))) ? i : -1),
      workAnim: () => (d.boards > 0 ? 'bash' : 'pick'),
      act: (key) => {
        if (key !== 'E') return false;
        if (d.open || d.boards > 0 || (d.bolted && !d.isPlayerInside(P().pos))) return true;
        this.localOpen(i);
        return true;
      },
    };
  }

  windowInter(w, i) {
    const G = this.G;
    const P = () => G.player;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    return {
      kind: 'm-window', owner: w, pos: w.pos, r: 0.8,
      prompt: () => {
        if (w.boards > 0) return { title: w.name, lines: ['[Mantén E] Arrancar los tablones'], info: [`Tablones ${w.boards} · ${this.bar(w.rip)}`] };
        if (w.glass) return { title: w.name, lines: ['[E] Romper el cristal'], info: [] };
        return { title: w.name, lines: [w.isPlayerInside(P().pos) ? '[E] Salir por la ventana' : '[E] Colarte dentro'], info: [] };
      },
      work: () => (w.boards > 0 ? i : -1),
      workAnim: () => 'bash',
      act: (key) => {
        if (key !== 'E' || w.boards > 0) return key === 'E';
        if (w.glass) {
          w.smash();
          this.override[i] = performance.now() + 900;
          this.emit({ t: 'smash', e: i });
          this.swipeT = 0.45;
          G.weapons.swipe();
          return true;
        }
        const inside = w.isPlayerInside(P().pos);
        const n = w.axis === 'x' ? { x: 0, z: 1 } : { x: 1, z: 0 };
        const side = inside ? w.inside : -w.inside;
        const to = inside ? w.outside : w.insideSpot;
        this.climbPath([
          V(w.pos.x + n.x * side * 0.55, 0, w.pos.z + n.z * side * 0.55),
          V(w.pos.x, -0.45, w.pos.z),
          V(w.pos.x - n.x * side * 0.55, -0.2, w.pos.z - n.z * side * 0.55),
          V(to.x, 0, to.z),
        ]);
        return true;
      },
    };
  }

  // Puertas y ventanas de las casas de los demás papeles
  buildHomeInter() {
    const out = [];
    this.entryRefs.forEach((r, i) => {
      if (this.refSite[i] === 'cabin') return;
      out.push(r.kind === 'door' ? this.doorInter(r, i) : this.windowInter(r, i));
    });
    return out;
  }

  buildCabinInter() {
    const G = this.G;
    const C = G.cabin;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const bar = (v) => {
      const n = Math.round(U.clamp(v, 0, 1) * 10);
      return '▮'.repeat(n) + '▯'.repeat(10 - n);
    };
    const P = () => G.player;
    const out = [];

    C.doors.forEach((d, i) => out.push(this.doorInter(d, i)));
    C.windows.forEach((w, k) => out.push(this.windowInter(w, 2 + k)));

    const h = C.hatch;
    out.push({
      kind: 'm-hatch', owner: h, pos: h.pos, r: 0.75,
      prompt: () => {
        const roof = P().pos.y > 5;
        if (roof) {
          if (h.open) return { title: h.name, lines: ['[E] Dejarte caer dentro'], info: [] };
          if (h.bolted) return { title: h.name, lines: ['[Mantén E] Forzar el pestillo'], info: [`Pestillo ${bar(h.pick)}`] };
          return { title: h.name, lines: ['[E] Abrirla'], info: [] };
        }
        return h.open ? null : { title: h.name, lines: ['[E] Abrirla'], info: [] };
      },
      work: () => (P().pos.y > 5 && !h.open && h.bolted ? 6 : -1),
      workAnim: () => 'pick',
      act: (key) => {
        if (key !== 'E') return false;
        const roof = P().pos.y > 5;
        if (h.open) {
          if (roof) G.player.climbTo(V(-0.5, 3.0, -2.25), Math.PI);
          return true;
        }
        if (roof && h.bolted) return true;
        this.localOpen(6, { unbolt: !roof });
        return true;
      },
    });
    out.push({
      kind: 'm-ladder', owner: h, pos: C.ladder.pos, r: 0.6,
      prompt: () => (P().pos.y > 2.5 && P().pos.y < 5 && h.open ? { title: 'Escalera de mano', lines: ['[E] Subir al tejado'], info: [] } : null),
      act: (key) => {
        if (key !== 'E' || !h.open) return false;
        G.player.climbTo(V(-0.5, 6.0, -1.9), Math.PI);
        return true;
      },
    });

    const T = C.trapdoor;
    out.push({
      kind: 'm-trapdoor', owner: T, pos: T.pos, r: 0.75,
      prompt: () => {
        const below = P().pos.y < -1;
        if (T.open) return { title: T.name, lines: [below ? '[E] Subir a la cabaña' : '[E] Bajar al búnker'], info: [] };
        if (!below && T.bolted) return { title: T.name, lines: ['[Mantén E] Reventar el cerrojo'], info: [`Cerrojo ${bar(T.breach)}`, 'Es de acero: cuesta un rato'] };
        return { title: T.name, lines: ['[E] Abrirla'], info: [] };
      },
      work: () => (P().pos.y > -1 && !T.open && T.bolted ? 7 : -1),
      workAnim: () => 'bash',
      act: (key) => {
        if (key !== 'E') return false;
        const below = P().pos.y < -1;
        const via = { x: T.cx, z: T.cz };
        if (T.open) {
          if (below) G.player.climbTo(V(T.cx, 0, 0.0), Math.PI, via);
          else G.player.climbTo(V(T.cx, -3, -0.35), Math.PI, via);
          return true;
        }
        if (!below && T.bolted) return true;
        this.localOpen(7, { unbolt: below });
        return true;
      },
    });

    // Trepar por la pared este hasta el tejado, y saltar desde allí
    out.push({
      kind: 'm-climb', pos: V(5.35, 1.6, -1.0), r: 1.0,
      prompt: () => {
        if (P().pos.y > 1 || P().pos.x < 5.3) return null;
        if (this.cavern.levels.garras < 1) return { title: 'Pared este', lines: ['Necesitas garras más afiladas'], info: ['Piedra de afilar, en tu guarida'] };
        return { title: 'Pared este', lines: ['[E] Trepar al tejado'], info: [] };
      },
      act: (key) => {
        if (key !== 'E' || this.cavern.levels.garras < 1 || P().pos.y > 1) return key === 'E';
        this.climbPath([V(5.75, 0, -1.05), V(5.75, 6.0, -1.0), V(4.4, 6.0, -1.0)], Math.PI / 2);
        return true;
      },
    });
    out.push({
      kind: 'm-jump', pos: V(5.2, 6.5, -1.0), r: 1.0,
      prompt: () => (P().pos.y > 5 ? { title: 'Borde del tejado', lines: ['[E] Saltar al suelo'], info: [] } : null),
      act: (key) => {
        if (key !== 'E' || P().pos.y < 5) return false;
        this.climbPath([V(5.75, 6.0, -1.0), V(5.75, 0, -1.05), V(6.6, 0, -1.0)], -Math.PI / 2);
        SFX.heavyStep(null, 0.9);
        return true;
      },
    });

    // Sabotear el generador
    out.push({
      kind: 'm-gen', pos: G.power.generator.pos, r: 0.7,
      prompt: () => (G.power.running ? { title: 'Generador', lines: ['[E] Arrancarle los cables'], info: ['Sin corriente: ni luces, ni foco, ni cámaras'] } : { title: 'Generador', lines: ['Está apagado'], info: [] }),
      act: (key) => {
        if (key !== 'E' || !G.power.running) return key === 'E';
        this.swipeT = 0.45;
        G.weapons.swipe();
        SFX.bang(G.power.genPos, 1);
        this.emit({ t: 'gen' });
        return true;
      },
    });
    return out;
  }

  // ---------- Bucle del monstruo ----------
  monsterUpdate(dt) {
    const G = this.G;
    const P = G.player;
    const M = CFG.MP;
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.swipeT = Math.max(0, this.swipeT - dt);
    this.roarCd = Math.max(0, this.roarCd - dt);
    this.scentCd = Math.max(0, this.scentCd - dt);
    this.scentT = Math.max(0, this.scentT - dt);
    this.voiceCd = Math.max(0, this.voiceCd - dt);
    this.downT = Math.max(0, this.downT - dt);
    this.lastDmgT += dt;
    this.lightMsgT = Math.max(0, this.lightMsgT - dt);

    this.dazzleT = Math.max(0, (this.dazzleT || 0) - dt);
    this.trapT = Math.max(0, (this.trapT || 0) - dt);
    this.updateAvatars(dt);

    // La luz le quema
    let glare = 0;
    if (this.onSurface && !this.transit) {
      // Linternas de todos los humanos que le apuntan (como mucho tres) y el foco del tejado
      const now = performance.now();
      let beams = 0, flood = false;
      this.peers.forEach((p) => {
        if (p.role === 'monster' || p.left || !p.s || now - p.sAt > 600) return;
        const lit = p.s.lit | 0;
        if (lit & 1) beams++;
        if (lit & 2) flood = true;
      });
      let dps = 0;
      if (beams) { dps += M.LIGHT_DPS * Math.min(beams, 3); glare = Math.max(glare, 0.45 + 0.1 * (Math.min(beams, 3) - 1)); }
      if (flood) { dps += M.FLOOD_DPS; glare = Math.max(glare, 0.7); }
      G.homes.repellers().forEach((r) => {
        const d = Math.hypot(P.pos.x - r.pos.x, P.pos.z - r.pos.z);
        if (d < r.r && Math.abs(P.pos.y - r.pos.y) < 4) {
          dps += (r.dps || M.FLARE_DPS) * (1 - d / r.r * 0.5);
          glare = Math.max(glare, r.lamp ? 0.4 : 0.6);
          if (!this.fireMsgT) {
            this.fireMsgT = 1;
            G.hud.msg(r.lamp ? 'La luz de la farola te quema. Revéntala (E junto al poste) o rodéala.' : '¡El fuego de la hoguera te quema! Apártate.', 3);
            setTimeout(() => (this.fireMsgT = 0), 8000);
          }
        }
      });
      const f = G.flare;
      if (f && f.t > 0) {
        const dx = P.pos.x - f.pos.x, dz = P.pos.z - f.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < M.FLARE_RADIUS && Math.abs(P.pos.y - f.pos.y) < 4) {
          dps += M.FLARE_DPS * (1 - d / M.FLARE_RADIUS * 0.5);
          glare = Math.max(glare, 0.6);
        }
      }
      if (dps > 0) {
        this.monsterHurt(dps * dt, 'light');
        if (this.lightMsgT <= 0) {
          this.lightMsgT = 12;
          G.hud.msg('¡La luz te quema! Sal del haz.', 3);
          SFX.scream(null, 0.35);
        }
      }
    }
    if (this.dazzleT > 0) glare = Math.max(glare, Math.min(1, this.dazzleT));
    if (this.inCave || (this.lastDmgT > 4 && P.health > 0)) P.health = Math.min(P.cfg.maxHealth, P.health + M.REGEN * dt * (this.inCave ? 3 : 1));
    this.glare += (glare - this.glare) * Math.min(1, dt * 6);
    this.$('mon-glare').style.opacity = this.glare.toFixed(2);

    // Mantener E: forzar, embestir, arrancar
    this.working = -1;
    const t = G.target;
    if (G.inp.use && t && t.work && !P.climb && !this.transit) {
      const idx = t.work();
      if (idx >= 0) { this.working = idx; this.workAnim = t.workAnim ? t.workAnim() : 'pick'; }
    }
    if (this.working >= 0) {
      this.workSndT -= dt;
      if (this.workSndT <= 0) {
        const ref = this.entryRefs[this.working];
        const mult = 1 + M.WORK_PER_LEVEL * this.cavern.levels.garras;
        if (this.workAnim === 'bash') { SFX.bang(ref.pos, 0.7); this.workSndT = 1.2 / mult; P.shake = Math.max(P.shake, 0.25); }
        else { SFX.click(ref.pos, 0.3); this.workSndT = U.range(0.6, 1.2); }
      }
    }

    // Animación que ve el otro
    let an = 'idle';
    if (P.climb) an = 'climb';
    else if (this.swipeT > 0) an = 'attack';
    else if (this.working >= 0) an = this.workAnim;
    else if (P.speed > 4) an = 'run';
    else if (P.speed > 0.4) an = 'walk';
    this.anim = an;

    // Tensión: oye su corazón cuando está cerca
    const nh = this.inCave ? null : this.nearestHuman();
    let danger = 0;
    if (nh) {
      const d = nh.d;
      danger = U.clamp(1 - d / 26, 0, 1);
      this.hbT -= dt;
      if (d < 12 && this.hbT <= 0) {
        this.hbT = 0.85;
        SFX.heartbeat(0.12 + (1 - d / 12) * 0.35);
      }
    }
    this.danger = danger;

    this.cavern.update(dt);
    this.monsterEnv();
  }

  // Fogonazo de la cámara de la investigadora: si le da de cara, le ciega un momento
  onFlash(ev) {
    const G = this.G;
    const P = G.player;
    if (!this.onSurface || this.transit) return;
    const e = new THREE.Vector3(ev.x, ev.y, ev.z);
    const c = new THREE.Vector3(P.pos.x, P.pos.y + 1.6, P.pos.z);
    const to = c.clone().sub(e);
    const d = to.length();
    if (d > 18 || d < 0.01) return;
    to.divideScalar(d);
    const cp = Math.cos(ev.pt);
    const f = new THREE.Vector3(-Math.sin(ev.yw) * cp, Math.sin(ev.pt), -Math.cos(ev.yw) * cp);
    if (f.dot(to) < 0.85 || !G.world.lineOfSight(e, c)) return;
    // El flash de la investigadora: ciega, quema un poco y frena unos segundos
    this.dazzleT = 2.4;
    this.monsterHurt(8, 'light');
    P.shake = Math.max(P.shake, 0.5);
    G.hud.msg('¡Un fogonazo te ciega! Te han hecho una foto: vas más lento unos segundos.', 3);
    SFX.scream(null, 0.4);
  }

  // Trampa de flash o campana cerca: daño y deslumbramiento
  onDanger(p, r, dmg, dazzle, msg) {
    const G = this.G;
    const P = G.player;
    if (!this.onSurface || this.transit) return;
    if (Math.hypot(P.pos.x - p.x, P.pos.z - p.z) > r) return;
    this.dazzleT = Math.max(this.dazzleT || 0, dazzle);
    this.monsterHurt(dmg, 'light');
    P.shake = Math.max(P.shake, 0.6);
    G.hud.msg(msg, 4);
    SFX.scream(null, 0.5);
  }

  // Disparos: el monstruo los oye y sabe dónde suenan
  onChop(ev) {
    const now = performance.now();
    this.chopMarks = (this.chopMarks || []).filter((c) => now - c.t < 25000 && Math.hypot(c.pos.x - ev.x, c.pos.z - ev.z) > 6);
    this.chopMarks.push({ pos: { x: ev.x, z: ev.z }, t: now });
    if (now - (this.chopMsgAt || 0) > 30000) {
      this.chopMsgAt = now;
      this.G.hud.msg('Oyes disparos en el bosque (✕ en la brújula): alguien va armado.', 6);
    }
  }

  // Visión del monstruo: ve en la oscuridad; la cueva tiene su propia luz
  monsterEnv() {
    const G = this.G;
    const W = G.world;
    const s = G.scene;
    if (this.inCave) {
      s.background.set(0x120c0a);
      s.fog.color.set(0x120c0a);
      s.fog.density = 0.024;
      W.hemi.color.set(0xd0a888);
      W.hemi.intensity = 0.95;
      W.sun.intensity = 0;
      W.ambient.intensity = 0.32;
      this.vision.intensity = 1.4;
    } else {
      const night = 1 - G.daylight;
      W.hemi.intensity = Math.max(W.hemi.intensity, 0.2 + 0.4 * night);
      W.ambient.intensity = Math.max(W.ambient.intensity, 0.08 + 0.14 * night);
      s.fog.density = Math.min(s.fog.density, 0.03);
      this.vision.intensity = 0.8 * night;
    }
  }

  monsterMarkers() {
    const G = this.G;
    if (this.inCave) {
      const out = G.phase === 'day' ? this.cavern.markers() : this.cavern.tunnels.map((t) => ({ pos: t.pos, icon: '▼', cls: 'story' }));
      return out;
    }
    const out = [{ pos: { x: 0, z: 0 }, icon: '⌂', cls: 'home' }];
    G.homes.active.forEach((h) => out.push({ pos: h.center, icon: '◆', cls: 'home' }));
    if (this.cavern.levels.garras >= 1 && G.player.pos.y < 1 && Math.hypot(G.player.pos.x, G.player.pos.z) < 40) out.push({ pos: { x: 5.8, z: -1.0 }, icon: '▲', cls: 'item' });
    this.cavern.burrows.forEach((b) => out.push({ pos: b.pos, icon: '▼', cls: 'tourist' }));
    if (this.scentT > 0) {
      this.avatars.forEach((a, id) => {
        const p = this.peers.get(id);
        if (a.has && p && !p.left && !(p.s && p.s.dd)) out.push({ pos: a.pos, icon: '♥', cls: 'story' });
      });
    }
    const now = performance.now();
    (this.chopMarks || []).forEach((c) => { if (now - c.t < 25000) out.push({ pos: c.pos, icon: '✕', cls: 'item' }); });
    return out;
  }

  // ---------- Interfaz del monstruo ----------
  hudMonster(h) {
    const G = this.G;
    const P = G.player;
    const cav = this.cavern;
    h.compass(this.monsterMarkers());
    h.set('day', h.el.day, 'DÍA ' + G.day);
    h.set('time', h.el.time, U.fmtTime(G.clock));
    h.set('phase', h.el.phase, G.phase === 'night' ? `NOCHE ${G.day}/${CFG.MP.NIGHTS}` : this.inCave ? 'En la guarida' : 'Día');
    h.el.clock.classList.toggle('night', G.phase === 'night');
    h.set('money', h.el.money, '');

    const tasks = [];
    let head;
    if (G.phase === 'day') {
      head = 'TU GUARIDA · HAZTE MÁS FUERTE';
      cav.taskLines().forEach((l) => tasks.push(l));
      if ((this.chopMarks || []).some((c) => performance.now() - c.t < 25000)) tasks.push({ t: 'Se oyen disparos en el bosque (✕): hay alguien fuera' });
      tasks.push({ t: 'A las 20:00 se abren los túneles de la pared sur', warn: G.clock > CFG.TIME.DUSK_WARN });
    } else {
      head = `NOCHE ${G.day} DE ${CFG.MP.NIGHTS} · CAZA`;
      if (this.downT > 0) tasks.push({ t: `Te estás recuperando (${Math.ceil(this.downT)} s)`, warn: true });
      if (this.inCave) tasks.push({ t: 'Sal por uno de los túneles de la pared sur' });
      else {
        const H = this.humans;
        if (H > 1) {
          tasks.push({ t: `Atrapa a los humanos de un zarpazo (clic): ${this.deadHumans()} de ${Math.ceil(H / 2)} necesarios`, story: true });
          tasks.push({ t: 'Cada uno duerme en su casa: cabaña (⌂), caravana, fortín del bosque y ayuntamiento (◆)' });
          if (G.homes.caravan.active) tasks.push({ t: 'Cuidado con las trampas de flash de la caravana' });
          if (G.homes.fort.active) tasks.push({ t: 'El cazador dispara desde las troneras del fortín y esconde cepos por el bosque' });
          if (G.homes.townhall.active) {
            tasks.push({ t: 'La puerta del ayuntamiento es maciza; la campana duele' });
            tasks.push({ t: 'El alcalde enciende farolas y te vigila con cámaras: revienta las farolas (E)' });
          }
          if (G.homes.caravan.active) tasks.push({ t: 'El flash de la cámara de la investigadora te ciega y te frena' });
        } else tasks.push({ t: 'Entra en la cabaña y atrápalo de un zarpazo (clic)', story: true });
        tasks.push({ t: 'Mantén E para forzar pestillos y arrancar tablones' });
        if (cav.levels.garras >= 1) tasks.push({ t: 'Puedes trepar al tejado por la pared este (▲ en la brújula)' });
        tasks.push({ t: 'La luz te quema: su linterna, el foco y las bengalas' });
      }
      tasks.push({ t: 'Al amanecer (06:00) vuelves a la guarida' });
    }
    h.set('tasks', h.el.tasks, `<div class="head">${head}</div>` + tasks.map((t) => `<div class="task${t.warn ? ' warn' : ''}${t.story ? ' story' : ''}${t.done ? ' done' : ''}">${t.t}</div>`).join(''));

    const bar = (el, v, low) => {
      el.querySelector('i').style.width = U.clamp(v, 0, 100).toFixed(1) + '%';
      el.classList.toggle('low', v < low);
    };
    bar(h.el.health, (P.health / P.cfg.maxHealth) * 100, 30);
    bar(h.el.stamina, P.stamina, 15);

    const L = cav.levels;
    h.set('inv', h.el.inv,
      `Garras <b>${L.garras}</b> · Velocidad <b>${L.velocidad}</b> · Resistencia <b>${L.resistencia}</b><br>` +
      `Rugido <b>${L.rugido}</b> · Olfato <b>${L.olfato}</b> · Voces <b>${L.voces}</b>` +
      (cav.carried ? `<br>Huesos a cuestas <b>${cav.carried}</b>` : ''));

    const ab = (key, name, lv, cd, extra) => {
      if (!lv) return `<span class="off">${key} ${name}</span>`;
      if (extra) return `<span class="on">${key} ${name} · ${extra}</span>`;
      return cd > 0 ? `<span class="cd">${key} ${name} ${Math.ceil(cd)}s</span>` : `<span class="on">${key} ${name}</span>`;
    };
    h.set('wname', h.el.wname, 'Garras' + (this.atkCd > 0 ? '' : ' · listas'));
    h.set('wammo', h.el.wammo, `<small class="abil">${ab('Q', 'Rugido', L.rugido, this.roarCd)} ${ab('V', 'Olfato', L.olfato, this.scentCd, this.scentT > 0 ? Math.ceil(this.nearestHuman() ? this.nearestHuman().d : 0) + ' m' : '')} ${ab('R', 'Voces', L.voces, this.voiceCd)}</small>`);
    h.set('power', h.el.power, '');
  }

  // Indicador de conexión
  hudBadge(h) {
    const G = this.G;
    const lag = this.lag || 0;
    const cls = lag < 2.5 ? 'ok' : lag < 8 ? 'slow' : 'bad';
    const me = ROLE_INFO[G.role] ? ROLE_INFO[G.role].name : '';
    const txt = lag < 2.5 ? '' : lag < 8 ? ' · conexión lenta' : ` · sin noticias (${Math.round(lag)} s)`;
    const spec = G.player.dead && G.role !== 'monster' && this.specName && this.specT >= 2.5 ? ` · viendo: ${this.specName}` : '';
    h.set('badge', this.$('mpbadge'), `<i class="${cls}"></i>Sala ${this.code} · ${me}${this.size > 2 ? ` · ${this.size} jugadores` : ''}${txt}${spec}`);
  }
}
