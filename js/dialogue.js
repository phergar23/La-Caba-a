'use strict';

// Lo que dice cada vecino según el papel con el que juegas. Si un papel no tiene frases propias,
// el vecino dice las de siempre (las del guardabosques, en village.js y config.js).

const ROLE_LINES = {
  vecina: {
    investigator: [
      '¿Usted es la de la revista? Escriba que aquí somos gente decente.',
      'Mi marido vio algo una noche, hace años. Nunca más quiso hablar de ello.',
      'No me saque fotos, que salgo fatal. Sáqueselas a eso del bosque.',
      'Las huellas aparecen siempre por la mañana, en el barro. Apúntelo en su libretita.',
    ],
    hunter: [
      'Cuando oigo tu rifle de noche, por lo menos sé que alguien le planta cara.',
      'Ten cuidado con esos cepos, que el otro día casi pierde la pata mi gato.',
      'Mi padre también cazaba. Hasta que algo empezó a cazarle a él.',
      'Si traes un ciervo, te lo cambio por un tarro de mermelada.',
    ],
    mayor: [
      'Alcalde, ¿y la farola de mi calle para cuándo?',
      'Usted dirá lo que quiera, pero anoche algo arañó mi contraventana.',
      'Le voté, ¿eh? Que conste. Pero eso de los lobos no me lo creo.',
      'Mi nieta no puede jugar en la plaza. Haga algo.',
    ],
  },
  vecino: {
    investigator: [
      'Si le pagan por las fotos, yo tengo una de mi perro asustado. Por diez duros es suya.',
      'Los de ciudad vienen, sacan fotos y se van. Y aquí nos quedamos con lo que despiertan.',
      'Hay un pozo viejo al oeste. Nadie va. Por algo será.',
      'Dicen que a esa cosa la luz la vuelve loca. Su flash le va a encantar.',
    ],
    hunter: [
      'Buen tiro el de ayer. Se oyó hasta en la plaza.',
      'Dicen que montas escondites en el bosque. ¿Para cazar a qué, exactamente?',
      'Si lo cazas, el pueblo entero te invita a cenar.',
      'No dispares hacia el camino, que por ahí pasamos todos.',
    ],
    mayor: [
      'Alcalde, en la taberna dicen que usted esconde algo.',
      'Yo no he visto nada, alcalde. Pero mi perro no sale de debajo de la cama.',
      'Ponga más farolas y menos discursos, hombre.',
      'Si hay pleno hoy, allí estaré. Tengo preguntas.',
    ],
  },
  parroquiano1: {
    investigator: [
      '¿Me invitas a un vaso y te cuento lo que vi en el camino del fortín?',
      'Graba, graba. Mi abuelo decía que esa cosa imita voces.',
      'Aquí nadie va a firmar nada. Ni en tu revista ni en ningún sitio.',
    ],
    hunter: [
      '¡El cazador! ¿Qué, cuántas piezas esta semana?',
      'Mi abuelo decía que a esa cosa no la mata una bala. Hacen falta muchas.',
      '¿Es verdad que duermes en un fortín? Como en las películas del oeste.',
    ],
    mayor: [
      'Alcalde, ¿es verdad lo de los lobos? Porque los lobos no abren puertas.',
      'A ver si el ayuntamiento paga la ronda, que para eso cobra.',
      'Tranquilo, alcalde, que aquí no hablamos... mucho.',
    ],
  },
  parroquiano2: {
    investigator: [
      'Mi primo tiene las grabaciones de su granja. Dos puntos rojos, ya te digo.',
      'Si sacas una foto buena, ponla en portada. Que se enteren en la capital.',
      'El cura sabe cosas. Pregúntale por el libro de difuntos.',
    ],
    hunter: [
      'Hueles a pólvora y a bosque. Vienes del fortín, ¿no?',
      'Si le das, que sea a la cabeza. Dicen que en el cuerpo ni lo nota.',
      'Mi marido salió a cazar una noche y no volvió. Ten cuidado.',
    ],
    mayor: [
      'Mire, alcalde, aquí todos sabemos lo que hay. Usted haga como que no.',
      'Dé un buen pleno, que la gente está nerviosa.',
      'Esos pasquines no los pongo yo. Pero me gustaría saber quién.',
    ],
  },
  alcalde: {
    investigator: [
      'Señorita, en Robledal no hay nada que investigar. Vuelva a su caravana.',
      'Si publica una sola foto del pueblo, le pongo una multa por acampar.',
      'Esas huellas son de oso. De oso grande. Punto.',
    ],
    hunter: [
      'Cace lo que quiera, pero no meta tiros cerca del pueblo.',
      'Si trae esa cosa muerta, no quiero fotos. Ni periodistas.',
      'El ayuntamiento no se hace responsable de sus cepos.',
    ],
  },
  cura: {
    investigator: [
      'Hija, hay cosas que es mejor no fotografiar.',
      'El libro de difuntos está abierto a quien quiera leerlo. Si tiene estómago.',
      'Rezo para que tu revista nunca publique lo que encuentres. Por tu bien.',
    ],
    hunter: [
      'Hijo, no todo lo que se mueve en el bosque se puede cazar.',
      'Rezo por que tu puntería sea buena. Por todos nosotros.',
      'Hubo un cazador antes que tú. Su cruz está detrás de la iglesia.',
    ],
    mayor: [
      'Alcalde, la mentira piadosa sigue siendo mentira.',
      'Si quiere, el domingo hablo en misa de los lobos. Que Dios me perdone.',
      'Cuide de su gente. Es lo único que le pedirá el pueblo al final.',
    ],
  },
};

// Lo que te dicen los tenderos al abrir la tienda
const VENDOR_ROLE_LINES = {
  anselmo: {
    investigator: [
      'A la prensa no le vendo armas. Tablones, pilas, lo que quiera.',
      'Las cámaras de fotos no paran balas, señorita. Por eso no le vendo ninguna.',
      'Si me saca en la revista, que sea de perfil.',
    ],
    hunter: [
      '¿Balas de rifle? Las mejores del valle. A ver si esta vez le das.',
      'Un buen cazador no gasta: apunta.',
      'Los cepos no los vendo yo: los haces tú, que para eso tienes fortín.',
    ],
    mayor: [
      'Alcalde, armas no. Si le ven con una escopeta, mañana el pueblo entero sabe que pasa algo.',
      'Tablones y pilas, alcalde. Las balas, para el guarda.',
      'Lo de siempre, ¿no? Discreción.',
    ],
  },
  julian: {
    investigator: [
      'Pilas para tu cámara, ¿no? Tengo de las buenas.',
      'Las bengalas son lo que más le asusta. Lo dice todo el que vuelve.',
    ],
    hunter: [
      'Bengalas: lo único que le asusta de verdad. Además del plomo.',
      'Cuerda, alambre y clavos para tus trampas, ¿no?',
    ],
    mayor: [
      'Más cámaras para el ayuntamiento, ¿eh? Ya le monté nueve, alcalde.',
      'Las farolas las pagué yo, alcalde. Y todavía espero la factura.',
    ],
  },
  remedios: {
    investigator: [
      'Vendas para esas rodillas, de tanto agacharte a mirar huellas.',
      'Esa sangre negra que buscas... no la toques sin guantes.',
    ],
    hunter: [
      'A ver ese hombro. El rifle da coces como una mula.',
      'Vendas para los arañazos de las zarzas. Y para lo otro.',
    ],
    mayor: [
      'Alcalde, sus mentiras no las cura ninguna hierba.',
      'Para los nervios del pueblo no tengo remedio. Para los suyos, sí.',
    ],
  },
  taberna: {
    investigator: [
      'Aquí no se graba, ¿eh? Ni una foto dentro.',
      'Café para la de la revista. Y no apuntes lo que oigas en la barra.',
    ],
    hunter: [
      '¡Un café bien cargado para el cazador!',
      'Siéntate, que traes cara de no haber dormido en el fortín.',
    ],
    mayor: [
      '¿Lo de siempre, alcalde? Invita la casa... esta vez.',
      'Aquí la gente habla, alcalde. Usted escuche y sonría.',
    ],
  },
};

// Frase de un vecino según el papel (o null para las de siempre)
function roleLines(npcId, role) {
  const r = ROLE_LINES[npcId];
  return (r && r[role]) || null;
}

function vendorLines(vendorId, role) {
  const r = VENDOR_ROLE_LINES[vendorId];
  return (r && r[role]) || null;
}

// ======================= Entrevistas de la investigadora =======================
// Cada vecino tiene un carácter: hay que empezar y convencerle de la forma que le va.
// Si aciertas las dos veces, te da su testimonio (prueba para el expediente).
const INTERVIEWS = {
  vecina: { type: 'miedoso', mood: 'Le tiemblan las manos y no deja de mirar hacia la puerta.', testimony: 'Hace años lo vi junto al pozo viejo. Andaba a cuatro patas... y luego se puso de pie. Era más alto que la puerta de la iglesia.' },
  vecino: { type: 'desconfiado', mood: 'Te mira de arriba abajo, con los brazos cruzados.', testimony: 'Mi perro no le ladra a los ciervos. A eso le ladra mirando al bosque viejo, siempre a la misma hora: pasadas las once.' },
  parroquiano1: { type: 'charlatan', mood: 'Habla por los codos y tiene el vaso vacío.', testimony: 'Tomás me lo contó aquí mismo: imita voces. La de su madre, la de su mujer. Por eso no abría a nadie de noche.' },
  parroquiano2: { type: 'miedoso', mood: 'Habla en susurros y se tapa la boca al hablar.', testimony: 'Mi marido encontró huesos ordenados de mayor a menor detrás del cementerio. Al día siguiente no volvió del bosque.' },
  cura: { type: 'devoto', mood: 'Te recibe con calma, con las manos juntas.', testimony: 'En el libro de difuntos hay un guarda forestal muerto cada treinta años, siempre en otoño. Siempre «por accidente».' },
  remedios: { type: 'devoto', mood: 'Te ofrece una infusión antes de decir nada.', testimony: 'La sangre que me trajeron no coagula. Y huele a tierra mojada, como la de las tumbas.' },
  tabernero: { type: 'charlatan', mood: 'Limpia el mismo vaso una y otra vez mientras te escucha.', testimony: 'La cabeza de la pared no es de un ciervo. Mi abuelo la cortó de algo que entró en la taberna en el cincuenta y ocho.' },
  julian: { type: 'desconfiado', mood: 'Sigue a lo suyo y apenas levanta la vista del mostrador.', testimony: 'Las cámaras que vendo graban dos puntos rojos a la altura de un segundo piso. Ningún oso es tan alto.' },
};

const INTERVIEW_TYPES = {
  miedoso: { r1: 'empatia', r2: 'anonimo', name: 'asustado' },
  charlatan: { r1: 'invitar', r2: 'tomas', name: 'charlatán' },
  desconfiado: { r1: 'directo', r2: 'pruebas', name: 'desconfiado' },
  devoto: { r1: 'empatia', r2: 'tomas', name: 'tranquilo' },
};

const INTERVIEW_ROUNDS = [
  {
    q: '¿Cómo empiezas la entrevista?',
    opts: {
      empatia: 'Con calma: «¿Cómo lo está llevando usted?»',
      directo: 'Al grano: «¿Qué vio exactamente, y cuándo?»',
      invitar: 'Invitando: «Esta ronda la pago yo.» (5 $)',
    },
  },
  {
    q: '¿Cómo le convences de que te lo cuente todo?',
    opts: {
      anonimo: '«No saldrá su nombre: será un testimonio anónimo.»',
      pruebas: '«Mire: tengo pruebas.» (le enseñas lo que ya has enviado)',
      tomas: '«¿Qué le pasó de verdad a Tomás?»',
    },
  },
];

const INTERVIEW_REACT = {
  miedoso: {
    good: ['Gracias por preguntar... Aquí nadie lo hace.', 'Si no sale mi nombre... vale. Se lo cuento.'],
    bad: ['No... no quiero hablar de eso. Váyase, por favor.', '¿Y si me oye alguien? ¡Ni hablar!'],
  },
  charlatan: {
    good: ['¡Eso es hablar mi idioma! Siéntate.', 'Tomás... Ay, Tomás. Te lo cuento, pero no digas que fui yo.'],
    bad: ['Bah. Con la boca seca no me acuerdo de nada.', 'Eso es muy aburrido. Pregúntale a otro.'],
  },
  desconfiado: {
    good: ['Así me gusta: sin rodeos.', 'Hum. Esto es de verdad. Está bien, escuche.'],
    bad: ['No me venga con cuentos de ciudad.', 'Palabras. Sin pruebas, no hablo con la prensa.'],
  },
  devoto: {
    good: ['Siéntese, hija. Aquí se habla sin prisa.', 'Tomás merecía que alguien preguntara. Escuche.'],
    bad: ['Hay cosas que no se compran, hija.', 'No es momento. Vuelva otro día.'],
  },
};
