/**
 * Copy for /inside — the page that explains the operating model and carries
 * the public truth registry. Same four languages as the rest of the public
 * site, same rule: the VOICE translates, the MACHINE stays literal.
 *
 * TRUTH RULES this file is the enforcement point for (ADR-022, public-product
 * invariant 18 in the Project Brain):
 *
 *  - AVAILABLE TODAY may state only what released, customer-visible behavior
 *    already supports. Source-tree presence is not deployment evidence — an
 *    engine that exists in the repository is not an engine the client is
 *    being served by, and the AVAILABLE group may not claim one. The guard
 *    in test/public-site-truth.test.ts refuses engine-deployment vocabulary
 *    in this group outright until a release-evidence fixture exists.
 *  - No absolute detection promise. "Problems are caught, not delivered" and
 *    "the failed attempt never reaches you" claim a completeness no review
 *    can honour. The supportable shape is conditional: when a step fails or
 *    is flagged it is stopped, reworked, and reviewed against the approved
 *    standard before delivery — and review is not a guarantee that every
 *    possible error is detected.
 *  - Anything the engine will do but does not yet do for clients belongs in
 *    IN DEVELOPMENT. Anything architectural belongs in VISION.
 *  - Recurring operations appear ONLY in the vision group. Never in
 *    AVAILABLE, never on the homepage (test/public-site-truth.test.ts pins
 *    both).
 *  - No internal task numbers, no branch names, no engineering test counts:
 *    this page is for customers, not for the Project Brain.
 *
 * The tuple types are the parity gate: a language that misses one item or
 * one group fails typecheck, the same mechanism client.ts relies on.
 */

import { SITE_LANGS, siteLangOf, type SiteLang } from "./langs";

export { SITE_LANGS };

export function insideLangOf(value: string | undefined | null): SiteLang {
  return siteLangOf(value);
}

/** [claim, one-line detail] — one row of the registry. */
type RegistryItem = [string, string];

type InsideDict = {
  meta: { title: string; description: string };
  header: { signIn: string; start: string; how: string };
  kicker: string;
  h1: string;
  lede: string;
  /** The six statements of the operating model, in order. */
  model: { h2: string; items: [
    [string, string],
    [string, string],
    [string, string],
    [string, string],
    [string, string],
    [string, string],
  ] };
  /** The method sentence — the one place the full lane list lives. */
  method: { h2: string; body: string };
  registry: {
    h2: string;
    intro: string;
    available: { label: string; items: RegistryItem[] };
    building: { label: string; items: RegistryItem[] };
    vision: { label: string; items: RegistryItem[] };
  };
  boundaries: { h2: string; body: string };
  cta: { line: string; button: string };
  footer: { about: string; how: string; home: string };
};

const en: InsideDict = {
  meta: {
    title: "Inside Endvera: how a managed operation actually runs",
    description:
      "How Endvera turns a described result into a written scope, a managed plan and a verified delivery — and an honest registry of what is available today, what is in development and what is the longer-term architecture.",
  },
  header: { signIn: "Sign in", start: "Request a fixed-price quote", how: "How it works" },
  kicker: "Inside Endvera",
  h1: "One result, taken through a managed operation.",
  lede:
    "You describe the result that has to exist. Endvera clarifies it, freezes a written scope with one fixed price, organizes the work into a plan it is responsible for, and reviews the delivery before it reaches you. This page shows how that runs — and is honest about which parts are live today and which are still being built.",
  model: {
    h2: "The operating model",
    items: [
      [
        "You provide the result",
        "The outcome that has to exist, in plain language. Files attached if needed.",
      ],
      [
        "The scope freezes",
        "Endvera clarifies the request and freezes a written scope with one fixed price. You approve before anything starts, and nothing added later can quietly grow what you agreed to.",
      ],
      [
        "The work is organized",
        "The scope becomes a managed plan of bounded steps Endvera is responsible for — not a ticket handed to whoever is available.",
      ],
      [
        "The method is managed, step by step",
        "Endvera decides how each step of the approved scope is carried out and stays responsible for it. Today that means managed specialists working to the written standard, with software assistance where it is dependable. What is being built to extend that is listed in the registry below.",
      ],
      [
        "A flagged step is stopped, not delivered",
        "When a step fails or is flagged, it is stopped. It is reworked and reviewed against the approved standard before delivery. Review is careful, but it is not a guarantee that every possible error is detected.",
      ],
      [
        "You receive the result and its evidence",
        "The finished delivery, checked against the approved standard, with sources and exceptions recorded where the brief requires them.",
      ],
    ],
  },
  method: {
    h2: "About the method",
    body:
      "Today the approved scope is carried out by managed specialists working to the written standard, with software assistance where it is dependable, and a person reviews every delivery against that standard before it goes out. That review is ordinary quality control on every operation — it is not the same thing as the bounded-human-step architecture in the registry below, which is still being built. What never changes, whatever the method: the scope is frozen before execution, the price is fixed before execution, and Endvera answers for the result.",
  },
  registry: {
    h2: "What is live, what is being built",
    intro:
      "A claim on this site is worth exactly as much as this registry says it is. Three lists, kept honest on purpose.",
    available: {
      label: "Available today",
      items: [
        [
          "A written scope and one fixed price",
          "Approved before anything starts. The price does not move with the hours the work takes.",
        ],
        [
          "Authorize now, pay after review",
          "Your card is authorized at approval and charged only after the delivery passes review and your dispute window closes.",
        ],
        [
          "Managed execution to a written standard",
          "Endvera manages the execution of the approved scope, using managed specialists and software assistance where it is dependable.",
        ],
        [
          "A person reviews every delivery",
          "Quality review against the approved standard happens before release, on every operation. It is a review, not a proof that nothing was missed.",
        ],
        [
          "Evidence kept",
          "Sources and exceptions are recorded where the brief requires them, and delivered with the work.",
        ],
        [
          "Clear refusals",
          "Work we cannot verify or safely take is declined before you pay anything.",
        ],
      ],
    },
    building: {
      label: "In development",
      items: [
        [
          "Automated execution of plan steps",
          "Steps run by models, connected tools and browser automation inside the same reviewed plan, under per-account spending limits.",
        ],
        [
          "Bounded human work inside automated plans",
          "A machine plan that stops at a defined human step and resumes safely once the reviewed result is accepted. This is architecture being built; it is separate from the review that already happens on every delivery today.",
        ],
        [
          "Deeper verification",
          "Multi-source checks built into the plan itself, not only at final review.",
        ],
      ],
    },
    vision: {
      label: "Vision",
      items: [
        [
          "Recurring operations",
          "An approved operation that repeats on schedule, with the same scope, price rules and review.",
        ],
        [
          "A certified model gateway",
          "Every model call routed through one certified, budgeted, replayable boundary.",
        ],
        [
          "Safe writes into your systems",
          "Authorized, verified changes in client systems, with rollback — never before the verification for them exists.",
        ],
      ],
    },
  },
  boundaries: {
    h2: "What we refuse",
    body:
      "Not everything fits. We turn down live calls, anything that needs your identity to cross, high-stakes legal, medical or financial judgment, and anything we cannot check against a source. If your operation does not fit, we say so before you pay anything.",
  },
  cta: { line: "Describe the result. We take it from there.", button: "Request a fixed-price quote" },
  footer: { about: "About us", how: "How it works", home: "Home" },
};

const fr: InsideDict = {
  meta: {
    title: "Sous le capot d'Endvera : comment une opération prise en charge se déroule",
    description:
      "Comment Endvera transforme un résultat décrit en périmètre écrit, en plan pris en charge et en livraison vérifiée — avec un registre honnête de ce qui est disponible aujourd'hui, en développement, et de l'architecture à plus long terme.",
  },
  header: { signIn: "Connexion", start: "Demander un prix fixe", how: "Comment ça marche" },
  kicker: "Sous le capot",
  h1: "Un résultat, mené à travers une opération prise en charge.",
  lede:
    "Vous décrivez le résultat qui doit exister. Endvera le clarifie, gèle un périmètre écrit avec un prix fixe, organise le travail en un plan dont il est responsable, et révise la livraison avant qu'elle vous parvienne. Cette page montre comment ça se déroule — et dit honnêtement ce qui est en service aujourd'hui et ce qui se construit encore.",
  model: {
    h2: "Le modèle d'opération",
    items: [
      [
        "Vous fournissez le résultat",
        "Ce qui doit exister, en langage clair. Des fichiers joints au besoin.",
      ],
      [
        "Le périmètre gèle",
        "Endvera clarifie la demande et gèle un périmètre écrit avec un prix fixe. Vous approuvez avant que rien ne commence, et rien d'ajouté ensuite ne peut discrètement élargir ce que vous avez accepté.",
      ],
      [
        "Le travail est organisé",
        "Le périmètre devient un plan pris en charge, en étapes bornées dont Endvera est responsable — pas un billet remis au premier disponible.",
      ],
      [
        "La méthode est pilotée, étape par étape",
        "Endvera décide comment chaque étape du périmètre approuvé est réalisée et en reste responsable. Aujourd'hui, cela veut dire des spécialistes encadrés travaillant selon la norme écrite, avec de l'assistance logicielle là où elle est fiable. Ce qui se construit pour élargir cela est listé dans le registre ci-dessous.",
      ],
      [
        "Une étape signalée est arrêtée, pas livrée",
        "Quand une étape échoue ou est signalée, elle est arrêtée. Elle est reprise et révisée selon la norme approuvée avant livraison. La révision est rigoureuse, mais elle ne garantit pas que toute erreur possible sera détectée.",
      ],
      [
        "Vous recevez le résultat et sa preuve",
        "La livraison terminée, vérifiée selon la norme approuvée, avec les sources et exceptions notées là où le mandat l'exige.",
      ],
    ],
  },
  method: {
    h2: "À propos de la méthode",
    body:
      "Aujourd'hui, le périmètre approuvé est réalisé par des spécialistes encadrés travaillant selon la norme écrite, avec de l'assistance logicielle là où elle est fiable, et une personne révise chaque livraison selon cette norme avant qu'elle sorte. Cette révision est le contrôle qualité ordinaire de chaque opération — ce n'est pas la même chose que l'architecture d'étape humaine bornée du registre ci-dessous, qui se construit encore. Ce qui ne change jamais, quelle que soit la méthode : le périmètre est gelé avant l'exécution, le prix est fixé avant l'exécution, et Endvera répond du résultat.",
  },
  registry: {
    h2: "Ce qui est en service, ce qui se construit",
    intro:
      "Une affirmation sur ce site vaut exactement ce que ce registre en dit. Trois listes, tenues honnêtes exprès.",
    available: {
      label: "Disponible aujourd'hui",
      items: [
        [
          "Un périmètre écrit et un prix fixe",
          "Approuvés avant que rien ne commence. Le prix ne bouge pas selon les heures que le travail prend.",
        ],
        [
          "Autorisé maintenant, payé après révision",
          "Votre carte est autorisée à l'approbation et débitée seulement après que la livraison a passé la révision et que votre fenêtre de contestation est fermée.",
        ],
        [
          "Exécution prise en charge selon une norme écrite",
          "Endvera pilote l'exécution du périmètre approuvé, avec des spécialistes encadrés et de l'assistance logicielle là où elle est fiable.",
        ],
        [
          "Une personne révise chaque livraison",
          "La révision de qualité selon la norme approuvée a lieu avant la remise, sur chaque opération. C'est une révision, pas une preuve que rien n'a été manqué.",
        ],
        [
          "La preuve est conservée",
          "Les sources et exceptions sont notées là où le mandat l'exige, et livrées avec le travail.",
        ],
        [
          "Des refus clairs",
          "Le travail qu'on ne peut pas vérifier ou prendre sans risque est refusé avant que vous payiez quoi que ce soit.",
        ],
      ],
    },
    building: {
      label: "En développement",
      items: [
        [
          "Exécution automatisée des étapes du plan",
          "Des étapes menées par modèles, outils connectés et automatisation du navigateur dans le même plan révisé, sous plafonds de dépense par compte.",
        ],
        [
          "Travail humain borné dans les plans automatisés",
          "Un plan machine qui s'arrête à une étape humaine définie et reprend en sécurité une fois le résultat révisé accepté. C'est une architecture en construction ; elle est distincte de la révision qui a déjà lieu sur chaque livraison aujourd'hui.",
        ],
        [
          "Vérification plus profonde",
          "Des contrôles multi-sources intégrés au plan lui-même, pas seulement à la révision finale.",
        ],
      ],
    },
    vision: {
      label: "Vision",
      items: [
        [
          "Opérations récurrentes",
          "Une opération approuvée qui se répète selon un horaire, avec le même périmètre, les mêmes règles de prix et la même révision.",
        ],
        [
          "Une passerelle de modèles certifiée",
          "Chaque appel de modèle acheminé par une frontière unique, certifiée, budgétée et rejouable.",
        ],
        [
          "Des écritures sûres dans vos systèmes",
          "Des changements autorisés et vérifiés dans les systèmes clients, avec retour arrière — jamais avant que leur vérification existe.",
        ],
      ],
    },
  },
  boundaries: {
    h2: "Ce qu'on refuse",
    body:
      "Tout ne convient pas. On refuse les appels en direct, tout ce qui exige que votre identité circule, les décisions légales, médicales ou financières à enjeu élevé, et tout ce qu'on ne peut pas vérifier contre une source. Si votre opération ne convient pas, on vous le dit avant que vous payiez quoi que ce soit.",
  },
  cta: { line: "Décrivez le résultat. On s'occupe du reste.", button: "Demander un prix fixe" },
  footer: { about: "Qui nous sommes", how: "Comment ça marche", home: "Accueil" },
};

const es: InsideDict = {
  meta: {
    title: "Endvera por dentro: cómo funciona una operación gestionada",
    description:
      "Cómo Endvera convierte un resultado descrito en un alcance escrito, un plan gestionado y una entrega verificada — con un registro honesto de lo que está disponible hoy, lo que está en desarrollo y la arquitectura a más largo plazo.",
  },
  header: { signIn: "Iniciar sesión", start: "Pedir un precio fijo", how: "Cómo funciona" },
  kicker: "Por dentro",
  h1: "Un resultado, llevado por una operación gestionada.",
  lede:
    "Describes el resultado que debe existir. Endvera lo aclara, congela un alcance escrito con un precio fijo, organiza el trabajo en un plan del que es responsable, y revisa la entrega antes de que te llegue. Esta página muestra cómo funciona — y es honesta sobre qué partes están en servicio hoy y cuáles todavía se están construyendo.",
  model: {
    h2: "El modelo operativo",
    items: [
      [
        "Tú aportas el resultado",
        "Lo que debe existir, en lenguaje claro. Con archivos adjuntos si hace falta.",
      ],
      [
        "El alcance se congela",
        "Endvera aclara la solicitud y congela un alcance escrito con un precio fijo. Apruebas antes de que empiece nada, y nada añadido después puede ampliar en silencio lo que aceptaste.",
      ],
      [
        "El trabajo se organiza",
        "El alcance se convierte en un plan gestionado de pasos acotados de los que Endvera es responsable — no un ticket entregado al primero disponible.",
      ],
      [
        "El método se gestiona, paso a paso",
        "Endvera decide cómo se realiza cada paso del alcance aprobado y sigue siendo responsable de él. Hoy eso significa especialistas gestionados que trabajan según el estándar escrito, con asistencia de software donde es fiable. Lo que se está construyendo para ampliarlo figura en el registro de abajo.",
      ],
      [
        "Un paso marcado se detiene, no se entrega",
        "Cuando un paso falla o se marca, se detiene. Se rehace y se revisa contra el estándar aprobado antes de la entrega. La revisión es rigurosa, pero no garantiza que se detecte todo error posible.",
      ],
      [
        "Recibes el resultado y su evidencia",
        "La entrega terminada, verificada contra el estándar aprobado, con fuentes y excepciones registradas donde el encargo lo exige.",
      ],
    ],
  },
  method: {
    h2: "Sobre el método",
    body:
      "Hoy el alcance aprobado lo realizan especialistas gestionados que trabajan según el estándar escrito, con asistencia de software donde es fiable, y una persona revisa cada entrega contra ese estándar antes de que salga. Esa revisión es el control de calidad ordinario de cada operación — no es lo mismo que la arquitectura de paso humano acotado del registro de abajo, que todavía se está construyendo. Lo que nunca cambia, sea cual sea el método: el alcance se congela antes de la ejecución, el precio se fija antes de la ejecución, y Endvera responde por el resultado.",
  },
  registry: {
    h2: "Qué está en servicio, qué se está construyendo",
    intro:
      "Una afirmación en este sitio vale exactamente lo que este registro dice de ella. Tres listas, mantenidas honestas a propósito.",
    available: {
      label: "Disponible hoy",
      items: [
        [
          "Un alcance escrito y un precio fijo",
          "Aprobados antes de que empiece nada. El precio no se mueve con las horas que tome el trabajo.",
        ],
        [
          "Autorizado ahora, cobrado tras la revisión",
          "Tu tarjeta se autoriza al aprobar y se cobra solo después de que la entrega pase la revisión y se cierre tu ventana de disputa.",
        ],
        [
          "Ejecución gestionada según un estándar escrito",
          "Endvera gestiona la ejecución del alcance aprobado, con especialistas gestionados y asistencia de software donde es fiable.",
        ],
        [
          "Una persona revisa cada entrega",
          "La revisión de calidad contra el estándar aprobado ocurre antes de la entrega, en cada operación. Es una revisión, no una prueba de que no se pasó nada por alto.",
        ],
        [
          "Evidencia conservada",
          "Las fuentes y excepciones se registran donde el encargo lo exige, y se entregan con el trabajo.",
        ],
        [
          "Rechazos claros",
          "El trabajo que no podemos verificar o tomar con seguridad se rechaza antes de que pagues nada.",
        ],
      ],
    },
    building: {
      label: "En desarrollo",
      items: [
        [
          "Ejecución automatizada de pasos del plan",
          "Pasos ejecutados por modelos, herramientas conectadas y automatización de navegador dentro del mismo plan revisado, bajo límites de gasto por cuenta.",
        ],
        [
          "Trabajo humano acotado dentro de planes automatizados",
          "Un plan de máquina que se detiene en un paso humano definido y se reanuda con seguridad una vez aceptado el resultado revisado. Es arquitectura en construcción; es distinta de la revisión que ya ocurre hoy en cada entrega.",
        ],
        [
          "Verificación más profunda",
          "Comprobaciones multi-fuente integradas en el propio plan, no solo en la revisión final.",
        ],
      ],
    },
    vision: {
      label: "Visión",
      items: [
        [
          "Operaciones recurrentes",
          "Una operación aprobada que se repite según un calendario, con el mismo alcance, las mismas reglas de precio y la misma revisión.",
        ],
        [
          "Una pasarela de modelos certificada",
          "Cada llamada a un modelo enrutada por una frontera única, certificada, presupuestada y reproducible.",
        ],
        [
          "Escrituras seguras en tus sistemas",
          "Cambios autorizados y verificados en los sistemas del cliente, con vuelta atrás — nunca antes de que exista su verificación.",
        ],
      ],
    },
  },
  boundaries: {
    h2: "Lo que rechazamos",
    body:
      "No todo encaja. Rechazamos llamadas en vivo, cualquier cosa que necesite que tu identidad cruce, juicios legales, médicos o financieros de alto riesgo, y cualquier cosa que no podamos comprobar contra una fuente. Si tu operación no encaja, te lo decimos antes de que pagues nada.",
  },
  cta: { line: "Describe el resultado. Nosotros nos encargamos del resto.", button: "Pedir un precio fijo" },
  footer: { about: "Quiénes somos", how: "Cómo funciona", home: "Inicio" },
};

const tl: InsideDict = {
  meta: {
    title: "Sa loob ng Endvera: paano talaga tumatakbo ang isang managed na operasyon",
    description:
      "Paano ginagawa ng Endvera ang inilarawang resulta na nakasulat na scope, managed na plano at beripikadong delivery — na may tapat na registry ng kung ano ang available ngayon, ano ang ginagawa pa, at ano ang mas pangmatagalang arkitektura.",
  },
  header: { signIn: "Mag-sign in", start: "Humingi ng fixed na presyo", how: "Paano ito gumagana" },
  kicker: "Sa loob ng Endvera",
  h1: "Isang resulta, dinadala sa isang managed na operasyon.",
  lede:
    "Ilalarawan mo ang resultang dapat mabuo. Nililinaw ito ng Endvera, nagfi-freeze ng nakasulat na scope na may fixed na presyo, inaayos ang trabaho sa isang planong pananagutan nito, at nirerebyu ang delivery bago ito makarating sa iyo. Ipinapakita ng page na ito kung paano iyon tumatakbo — at tapat ito kung aling bahagi ang live na ngayon at alin ang ginagawa pa.",
  model: {
    h2: "Ang operating model",
    items: [
      [
        "Ikaw ang nagbibigay ng resulta",
        "Kung ano ang dapat mabuo, sa simpleng salita. May kalakip na files kung kailangan.",
      ],
      [
        "Nagfi-freeze ang scope",
        "Nililinaw ng Endvera ang request at nagfi-freeze ng nakasulat na scope na may fixed na presyo. Ikaw ang mag-a-approve bago magsimula ang kahit ano, at walang idinagdag pagkatapos ang tahimik na makakapagpalaki ng napagkasunduan mo.",
      ],
      [
        "Inaayos ang trabaho",
        "Nagiging managed na plano ang scope — mga hakbang na may hangganan na pananagutan ng Endvera, hindi ticket na iniaabot sa kung sinumang bakante.",
      ],
      [
        "Pinamamahalaan ang paraan, hakbang-hakbang",
        "Ang Endvera ang nagpapasya kung paano isasagawa ang bawat hakbang ng aprubadong scope at nananatiling responsable dito. Ngayon, ibig sabihin nito ay mga managed na espesyalista na sumusunod sa nakasulat na pamantayan, na may tulong ng software kung saan ito maaasahan. Ang ginagawa pa para palawakin ito ay nakalista sa registry sa ibaba.",
      ],
      [
        "Ang minarkahang hakbang ay hinihinto, hindi inihahatid",
        "Kapag pumalya o namarkahan ang isang hakbang, hinihinto ito. Inuulit ito at sinusuri laban sa aprubadong pamantayan bago ihatid. Maingat ang review, ngunit hindi ito garantiyang matutukoy ang bawat posibleng mali.",
      ],
      [
        "Natatanggap mo ang resulta at ang ebidensya nito",
        "Ang tapos na delivery, sinuri laban sa aprubadong pamantayan, na may mga source at exception na nakatala kung saan hinihingi ng brief.",
      ],
    ],
  },
  method: {
    h2: "Tungkol sa paraan",
    body:
      "Ngayon, ang aprubadong scope ay isinasagawa ng mga managed na espesyalista na sumusunod sa nakasulat na pamantayan, na may tulong ng software kung saan ito maaasahan, at may taong nagrerebyu ng bawat delivery laban sa pamantayang iyon bago ito lumabas. Ang review na iyon ay ordinaryong quality control sa bawat operasyon — hindi ito katulad ng arkitektura ng may-hangganang hakbang na pantao sa registry sa ibaba, na ginagawa pa. Ang hindi nagbabago, anuman ang paraan: naka-freeze ang scope bago ang execution, fixed ang presyo bago ang execution, at ang Endvera ang sumasagot sa resulta.",
  },
  registry: {
    h2: "Ano ang live, ano ang ginagawa pa",
    intro:
      "Ang isang claim sa site na ito ay katumbas lang ng sinasabi ng registry na ito. Tatlong listahan, sadyang pinapanatiling tapat.",
    available: {
      label: "Available ngayon",
      items: [
        [
          "Nakasulat na scope at isang fixed na presyo",
          "Aprubado bago magsimula ang kahit ano. Hindi gumagalaw ang presyo base sa oras na kinakain ng trabaho.",
        ],
        [
          "Authorize ngayon, bayad pagkatapos ng review",
          "Ina-authorize ang card mo sa pag-apruba at sinisingil lang matapos pumasa sa review ang delivery at magsara ang iyong dispute window.",
        ],
        [
          "Managed na execution ayon sa nakasulat na pamantayan",
          "Pinamamahalaan ng Endvera ang execution ng aprubadong scope, gamit ang mga managed na espesyalista at tulong ng software kung saan ito maaasahan.",
        ],
        [
          "May taong nagrerebyu ng bawat delivery",
          "Nangyayari ang quality review laban sa aprubadong pamantayan bago ang paghahatid, sa bawat operasyon. Isa itong review, hindi patunay na walang napalampas.",
        ],
        [
          "Nakatago ang ebidensya",
          "Nakatala ang mga source at exception kung saan hinihingi ng brief, at kasamang inihahatid sa trabaho.",
        ],
        [
          "Malinaw na pagtanggi",
          "Ang trabahong hindi namin mabeberipika o ligtas na makukuha ay tinatanggihan bago ka magbayad ng kahit ano.",
        ],
      ],
    },
    building: {
      label: "Ginagawa pa",
      items: [
        [
          "Automated na execution ng mga hakbang ng plano",
          "Mga hakbang na tinatakbo ng mga model, konektadong tools at browser automation sa loob ng parehong nirebyung plano, sa ilalim ng spending limit kada account.",
        ],
        [
          "May-hangganang trabahong pantao sa loob ng automated na plano",
          "Isang machine na plano na humihinto sa tinukoy na hakbang na pantao at ligtas na nagpapatuloy kapag tinanggap na ang nirebyung resulta. Arkitektura itong ginagawa pa; hiwalay ito sa review na nangyayari na sa bawat delivery ngayon.",
        ],
        [
          "Mas malalim na beripikasyon",
          "Mga multi-source na pagsusuri na nakapaloob sa plano mismo, hindi lang sa huling review.",
        ],
      ],
    },
    vision: {
      label: "Bisyon",
      items: [
        [
          "Paulit-ulit na operasyon",
          "Isang aprubadong operasyon na umuulit ayon sa iskedyul, na may parehong scope, parehong panuntunan sa presyo at parehong review.",
        ],
        [
          "Sertipikadong model gateway",
          "Bawat tawag sa model ay dumadaan sa iisang sertipikado, may budget at nare-replay na hangganan.",
        ],
        [
          "Ligtas na pagsusulat sa mga system mo",
          "Mga awtorisado at beripikadong pagbabago sa mga system ng kliyente, na may rollback — hindi kailanman bago pa umiral ang beripikasyon para rito.",
        ],
      ],
    },
  },
  boundaries: {
    h2: "Ang tinatanggihan namin",
    body:
      "Hindi lahat pasok. Tinatanggihan namin ang live na tawag, ang kahit anong nangangailangang tumawid ng iyong pagkakakilanlan, ang mga legal, medikal o pinansyal na desisyong may mataas na taya, at ang kahit anong hindi namin masusuri laban sa isang source. Kung hindi pasok ang operasyon mo, sasabihin namin bago ka magbayad ng kahit ano.",
  },
  cta: { line: "Ilarawan ang resulta. Kami na ang bahala sa iba.", button: "Humingi ng fixed na presyo" },
  footer: { about: "Tungkol sa amin", how: "Paano ito gumagana", home: "Home" },
};

export const INSIDE_I18N: Record<SiteLang, InsideDict> = { en, fr, es, tl };
