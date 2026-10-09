'use strict';

// Notas del antiguo guarda (sirven de tutorial y de historia) y mensajes de la radio.
const NOTES = {
  n1: {
    title: 'NOTA SOBRE LA MESA',
    body: [
      'Si estás leyendo esto, eres el nuevo guarda. Me alegro de que no sea yo.',
      'De día, ayuda a los excursionistas que se pierden: el ayuntamiento paga por cada uno que vuelve de una pieza. Mira la brújula de arriba: los que piden ayuda salen marcados.',
      'Siguiendo el camino llegas al pueblo. Anselmo te venderá balas, tablones, pilas y botiquines. Cierra a las siete y media.',
      'Y vuelve antes de las ocho. SIEMPRE.',
      '— T.',
    ],
  },
  n2: {
    title: 'NOTA EN LA MESILLA',
    body: [
      'Por las noches alguien prueba las puertas. Primero con suavidad.',
      'Si oyes un CLIC metálico es que ha abierto un pestillo. Corre a echarlo otra vez (Q). No le des tiempo.',
      'Los tablones (T) aguantan más que un pestillo. Atranca las puertas y tapia las ventanas antes de que anochezca.',
    ],
  },
  n3: {
    title: 'NOTA CLAVADA JUNTO A LA ESCALERA',
    body: [
      'Desde la trampilla del tejado se ve todo el claro.',
      'Odia la luz. Si le das de lleno con la linterna el tiempo suficiente, se aparta. Pero no para siempre.',
      'Una bala le duele más. Si le haces bastante daño, se va hasta el amanecer.',
    ],
  },
  n4: {
    title: 'PÁGINA ARRUGADA JUNTO AL POZO',
    body: [
      'Los cristales no aguantan nada. Tres tablones en cada ventana, como mínimo.',
      'Si rompe uno, en el pueblo venden cristal. Pero de noche no hay tiempo para cambiarlo.',
      'No te fíes del silencio. Cuando deja de hacer ruido es porque está escuchando.',
    ],
  },
  n5: {
    title: 'PÁGINA ENTRE LAS FIGURAS DE PALOS',
    body: [
      'He contado las noches. Cada una es peor que la anterior.',
      'Ahora sube por las paredes. La segunda noche le oí andar por el tejado.',
      'ECHA EL PESTILLO DE LA TRAMPILLA. Y si subes, ciérrala al bajar.',
    ],
  },
  n6: {
    title: 'PÁGINA SOBRE LA TUMBA',
    body: [
      'Si lees esto, ya no estoy.',
      'No le mires a los ojos. No salgas de noche. No abras cuando llame, aunque use mi voz.',
      'A veces, de día, lo verás a lo lejos entre los árboles. Mirándote. No te acerques. Desaparece.',
    ],
  },
  n7: {
    title: 'NOTA EN LA TIENDA DE CAMPAÑA',
    body: [
      'Día 3. Marta dice que oyó a alguien llamarnos por el nombre desde el bosque.',
      'Día 4. Marta no está. Su saco de dormir está abierto. Hay huellas muy largas alrededor de la tienda.',
      'Me voy al pueblo. Sigo el camino de tierra. No voy a mirar atrás.',
    ],
  },
  n8: {
    title: 'NOTA PEGADA A LOS MONITORES',
    body: [
      'Las cámaras van a los soportes de fuera: fachada, trasera, los dos laterales y el tejado. Los detectores, también. Julián los vende en la ferretería.',
      'Todo tira del generador de arriba. Si dejas las luces y el foco encendidos toda la noche, te quedas a oscuras antes del amanecer.',
      'A veces llaman a la puerta de madrugada. Antes de abrir, MIRA. Por la ventana o por las cámaras. Los vecinos de verdad llevan farol.',
      'Lo otro no lleva luz. No la necesita.',
    ],
  },
  diary1: {
    title: 'DIARIO DE TOMÁS · PÁGINAS SUELTAS',
    body: [
      'Día 9. Lo he visto de día. No es un hombre. Camina como si le doliera estar erguido.',
      'Se rasca la cornamenta contra los árboles secos, como un ciervo. Deja marcas de garras a dos metros de altura. Van hacia el suroeste, hacia las rocas.',
      'Imita voces. Anoche usó la de Marta, la campista. Marta lleva cuatro días desaparecida.',
      'Si lo sigo de día, quizá encuentre dónde duerme.',
    ],
  },
  diary2: {
    title: 'DIARIO DE TOMÁS · ÚLTIMA PÁGINA',
    body: [
      'La guarida está entre las rocas. Huesos, astas, ropa de excursionistas. La chaqueta roja de Marta.',
      'Duerme aquí de día, enroscado como un perro. Me he acercado tanto que he oído su respiración.',
      'El padre Elías dice que hace cien años ya quemaron este sitio. Que el fuego no lo mata, pero lo deja sin refugio. Que hay que hacerlo de día.',
      'Dejo mi linterna aquí como prueba de que he llegado. Si no vuelvo, que alguien termine esto.',
    ],
  },
  poster: {
    title: 'TABLÓN DE ANUNCIOS DE ROBLEDAL',
    body: [
      'SE BUSCA: TOMÁS VIDAL, guarda forestal. Desaparecido desde el día 3. Cualquier información, al ayuntamiento.',
      'AVISO A EXCURSIONISTAS: no abandonen los senderos señalizados. El ayuntamiento no se hace responsable de extravíos después del anochecer.',
      'Se venden tablones y cristales. Preguntar por Anselmo.',
    ],
  },
};

const RADIO_LINES = [
  'Radio Valle... se recuerda a los excursionistas que no abandonen los senderos. El guarda Tomás Vidal sigue en paradero desconocido...',
  '...hoy hay excursionistas en el bosque de Robledal. El ayuntamiento agradece la colaboración del nuevo guarda...',
  '...vecinos informan de ruidos en los tejados durante la madrugada. Las autoridades piden calma...',
  '...se ha encontrado una tienda de campaña abandonada en la zona norte. Sus ocupantes no aparecen...',
  '...previsión: niebla densa esta noche. Cierren puertas y ventanas... cierren puertas y... cierren...',
  '...ábreme... ábreme... ábreme... [estática]',
];

class NoteProp {
  constructor(G, key, pos, rotY = 0, onWall = false) {
    this.G = G;
    this.kind = 'note';
    this.key = key;
    this.note = NOTES[key];
    this.pos = new THREE.Vector3(pos.x, pos.y + 0.05, pos.z);
    this.r = 0.45;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), new THREE.MeshLambertMaterial({ map: TEX.paper, side: THREE.DoubleSide }));
    if (onWall) {
      m.rotation.y = rotY;
      m.rotation.z = 0.06;
    } else {
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rotY;
    }
    m.position.set(pos.x, pos.y, pos.z);
    G.scene.add(m);
    this.mesh = m;
  }

  prompt(G) {
    return { title: G.notesRead.has(this.key) ? 'Nota (leída)' : 'Nota', lines: ['[E] Leer'], info: [] };
  }

  act(key, G) {
    if (key !== 'E') return false;
    G.readNote(this.note, this.key);
    return true;
  }
}
