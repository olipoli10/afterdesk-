import type { SiteLang } from "@/lib/i18n/langs";

/* -------------------------------------------------------------------------
   The homepage "Assembly Lock" dictionary (accepted V5.5, ported 1.4B).

   ISOLATED BY DESIGN. Nothing here is imported by any shipped route; the
   route that consumes it returns notFound() in production. The V4.1 line
   prototype and its dictionary stay untouched for comparison.

   TRUTH BOUNDARY, same rules as every shipped dictionary (ADR-022, Brain
   invariants 18/19): no recurrence vocabulary, no autonomy vocabulary, no
   "every model"/"every tool" totality claim, one quiet global Early Access
   marker and no per-capability status badges, and the verification copy
   states its own limit out loud. The fast-charging scenario is SYNTHETIC -
   a plausible mandate, not a customer or a metric anyone must stand behind.

   V5 SPECIFIC: the voice is technological, not editorial. Nothing here may
   describe the result as a document, report, page or paper - the outcome is
   a decision SYSTEM built for the request.
   ------------------------------------------------------------------------- */

export type Material = {
  /** Short uppercase-ish lane label. */
  label: string;
  /** One line describing what this material visibly does to the result. */
  behavior: string;
};

export type ScoredSite = {
  name: string;
  /** 0-100, rendered as bar geometry, tabular. */
  score: number;
  note: string;
};

export type LedgerRow = {
  source: string;
  /** "confirmed" renders a worded green check; "unconfirmed" renders amber. */
  state: "confirmed" | "unconfirmed";
};

export type ConceptAssemblyCopy = {
  meta: { title: string; description: string };
  nav: { outcomes: string; how: string; inside: string; earlyAccess: string };

  /** Micro-eyebrow above the promise: the machine's own name for itself. */
  kicker: string;
  /** The monumental promise: two lines only, per the V5.2 hero verdict. */
  headline: readonly [string, string];
  /** ONE line. The hero earns confidence through restraint, not explanation. */
  supporting: string;
  placeholder: string;
  cta: string;
  fieldNote: string;
  doorCta: string;
  /** Used when the visitor typed nothing: a credible localized example. */
  sampleRequest: string;

  intent: {
    title: string;
    outcomeLabel: string;
    rows: readonly (readonly [label: string, value: string])[];
    authorization: string;
    finishLineLabel: string;
    finishLine: string;
  };

  fabric: {
    title: string;
    materials: readonly Material[];
  };

  lockLabel: string;

  exception: {
    chip: string;
    fact: string;
    state: string;
    routed: string;
    resolved: string;
  };

  verification: {
    line: string;
    limit: string;
  };

  outcome: {
    lock: string;
    kicker: string;
    recommendation: string;
    detail: string;
    corridorLabel: string;
    /** The river's name, engraved on the coastline chart. */
    riverLabel: string;
    /** The chart's scale caption, e.g. "0 — 50 km". */
    scaleLabel: string;
    sites: readonly ScoredSite[];
    ledgerTitle: string;
    ledger: readonly LedgerRow[];
    /** Phone-width condensation of the ledger: one honest line. */
    ledgerCompact: string;
    unknownLabel: string;
    unknownNote: string;
    delivered: string;
    exports: string;
    closing: string;
  };

  range: {
    title: string;
    lede: string;
    outcomes: readonly (readonly [kicker: string, name: string, essence: string])[];
  };

  control: {
    title: string;
    lede: string;
    ring: readonly string[];
  };

  door: {
    line1: string;
    line2: string;
  };

  srJourney: string;
};

const en: ConceptAssemblyCopy = {
  meta: {
    title: "Concept — the assembly lock",
    description: "An internal design prototype for the Endvera public site. Not a public page.",
  },
  nav: { outcomes: "Outcomes", how: "How it works", inside: "Inside", earlyAccess: "Early access" },
  kicker: "The right system assembles itself",
  headline: ["One request in.", "One verified result out."],
  supporting:
    "Models, software, code, browser work and bounded human judgment — assembled, checked and delivered.",
  placeholder: "The result you need, in your words…",
  cta: "Describe your result",
  fieldNote: "Nothing typed here is sent, stored or recorded. When you are ready, start below.",
  doorCta: "Start in Early Access",
  sampleRequest: "Where should we build commercial fast chargers in eastern Québec?",
  intent: {
    title: "Intent & control",
    outcomeLabel: "Requested outcome",
    rows: [
      ["Format", "Interactive decision system · export files on delivery"],
      ["Fixed price", "$1,840"],
      ["Delivery", "4 business days"],
      ["Permissions", "Read-only public sources · no client systems touched"],
    ],
    authorization: "Card authorized, not charged",
    finishLineLabel: "Approved finish line",
    finishLine: "Every figure carries its source. Every unknown is declared, never estimated.",
  },
  fabric: {
    title: "Execution fabric",
    materials: [
      { label: "Model", behavior: "A draft condenses into a structured claim" },
      { label: "Software", behavior: "Exact fields attach to sources and confirm" },
      { label: "Code", behavior: "Invariants resolve deterministically" },
      { label: "Browser", behavior: "Reads where no API exists" },
      { label: "Human", behavior: "One bounded question, one decision" },
    ],
  },
  lockLabel: "System locked to the request",
  exception: {
    chip: "One fact would not confirm",
    fact: "Matane substation upgrade date",
    state: "Unconfirmed",
    routed: "One bounded question → a person",
    resolved: "Carried as a declared unknown, never estimated",
  },
  verification: {
    line: "Evidence is checked against the finish line you approved, and a person reviews the delivery against that standard before it goes out.",
    limit: "The review is careful — it is not a promise that every possible error is caught.",
  },
  outcome: {
    lock: "Verified outcome · locked",
    kicker: "Example run · site selection · 34 sites screened",
    recommendation: "Where should we build first? Rivière-du-Loup and Rimouski.",
    detail:
      "The system screened 34 sites against grid capacity, rebate timing and corridor fit. These two lead; Matane stays visible as the strongest next option.",
    corridorLabel: "South shore corridor · Route 132 · 34 sites screened",
    riverLabel: "St. Lawrence",
    scaleLabel: "0 — 50 km",
    sites: [
      { name: "Rivière-du-Loup", score: 92, note: "grid ready · no operator within 180 km" },
      { name: "Rimouski", score: 88, note: "rebate window · corridor anchor" },
      { name: "Matane", score: 71, note: "substation date unconfirmed" },
    ],
    ledgerTitle: "Evidence",
    ledgerCompact: "5 sources verified · readback complete",
    ledger: [
      { source: "MTQ traffic count, 2025-11", state: "confirmed" },
      { source: "Hydro-Québec capacity map", state: "confirmed" },
      { source: "Registre des entreprises", state: "confirmed" },
      { source: "HQ programme circular 04-26", state: "confirmed" },
      { source: "Six municipal filings, read", state: "confirmed" },
    ],
    unknownLabel: "Matane substation upgrade date",
    unknownNote: "declared unknown · carried, not estimated",
    delivered: "Delivered as agreed · $1,840 fixed",
    exports: "Exports on delivery: XLSX · GeoJSON · brief",
    closing: "You asked for the outcome. Endvera assembled and delivered it.",
  },
  range: {
    title: "One request. Different kinds of finished work.",
    lede: "A decision, a reconciled operation or completed digital work: you describe the finish line and the system assembles the run.",
    outcomes: [
      ["Decision intelligence", "Where to build next", "A scored, sourced decision system"],
      ["Reconciled operations", "Two systems, one truth", "12,480 accounts reconciled, exceptions declared"],
      ["Executed digital work", "From reading to done", "The work performed, verified and handed back"],
    ],
  },
  control: {
    title: "Controlled from request to delivery.",
    lede: "Scope, permissions, budget and fixed price are approved before work starts. Evidence and bounded human judgment stay inside the run.",
    ring: ["Permissions", "Scope", "Budget", "Fixed price", "Evidence", "Traceability", "Bounded escalation"],
  },
  door: {
    line1: "Describe the result.",
    line2: "Endvera assembles everything between.",
  },
  srJourney:
    "A request is described. Its scope, price and finish line are fixed. Two systems assemble around a gold axis: one carries intent and control, the other the execution fabric. One fact cannot be confirmed and becomes a bounded human question. Evidence is checked against the finish line, and the assembled system delivers one verified decision surface.",
};

const fr: ConceptAssemblyCopy = {
  meta: {
    title: "Concept — le verrou d'assemblage",
    description: "Prototype de design interne pour le site public d'Endvera. Ce n'est pas une page publique.",
  },
  nav: { outcomes: "Résultats", how: "Comment ça marche", inside: "Coulisses", earlyAccess: "Accès anticipé" },
  kicker: "Le bon système s'assemble de lui-même",
  headline: ["Une demande entre.", "Un résultat vérifié sort."],
  supporting:
    "Modèles, logiciels, code, navigateur et jugement humain borné — assemblés, vérifiés, livrés.",
  placeholder: "Le résultat qu'il vous faut…",
  cta: "Décrivez votre résultat",
  fieldNote: "Rien de ce qui est écrit ici n'est envoyé, stocké ou enregistré. Quand vous êtes prêt, commencez ci-dessous.",
  doorCta: "Commencer en accès anticipé",
  sampleRequest: "Où construire des bornes rapides commerciales dans l'est du Québec ?",
  intent: {
    title: "Intention & contrôle",
    outcomeLabel: "Résultat demandé",
    rows: [
      ["Format", "Système de décision interactif · fichiers exportés à la livraison"],
      ["Prix fixe", "1 840 $"],
      ["Livraison", "4 jours ouvrables"],
      ["Permissions", "Sources publiques en lecture seule · aucun système client touché"],
    ],
    authorization: "Carte autorisée, pas débitée",
    finishLineLabel: "Ligne d'arrivée approuvée",
    finishLine: "Chaque chiffre porte sa source. Chaque inconnue est déclarée, jamais estimée.",
  },
  fabric: {
    title: "Tissu d'exécution",
    materials: [
      { label: "Modèle", behavior: "Un brouillon se condense en affirmation structurée" },
      { label: "Logiciel", behavior: "Des champs exacts s'attachent aux sources et confirment" },
      { label: "Code", behavior: "Les invariants se résolvent avec certitude" },
      { label: "Navigateur", behavior: "Lit là où aucune API n'existe" },
      { label: "Humain", behavior: "Une question bornée, une décision" },
    ],
  },
  lockLabel: "Système verrouillé sur la demande",
  exception: {
    chip: "Un fait refusait d'être confirmé",
    fact: "Date de mise à niveau du poste de Matane",
    state: "Non confirmée",
    routed: "Une question bornée → une personne",
    resolved: "Portée comme inconnue déclarée, jamais estimée",
  },
  verification: {
    line: "Les preuves sont vérifiées contre la ligne d'arrivée que vous avez approuvée, et une personne révise la livraison selon ce standard avant qu'elle parte.",
    limit: "La révision est rigoureuse — ce n'est pas une promesse que toute erreur possible soit attrapée.",
  },
  outcome: {
    lock: "Résultat vérifié · verrouillé",
    kicker: "Exécution exemple · sélection de sites · 34 sites évalués",
    recommendation: "Où construire d'abord? Rivière-du-Loup et Rimouski.",
    detail:
      "Le système a évalué 34 sites selon la capacité du réseau, les remises et le corridor. Ces deux sites dominent; Matane demeure la meilleure option suivante.",
    corridorLabel: "Corridor rive sud · Route 132 · 34 sites évalués",
    riverLabel: "Saint-Laurent",
    scaleLabel: "0 — 50 km",
    sites: [
      { name: "Rivière-du-Loup", score: 92, note: "réseau prêt · aucun exploitant à moins de 180 km" },
      { name: "Rimouski", score: 88, note: "fenêtre de remise · ancrage du corridor" },
      { name: "Matane", score: 71, note: "date du poste non confirmée" },
    ],
    ledgerTitle: "Preuves",
    ledgerCompact: "5 sources vérifiées · relecture faite",
    ledger: [
      { source: "Comptage MTQ, 2025-11", state: "confirmed" },
      { source: "Carte de capacité d'Hydro-Québec", state: "confirmed" },
      { source: "Registre des entreprises", state: "confirmed" },
      { source: "Circulaire HQ 04-26", state: "confirmed" },
      { source: "Six dépôts municipaux, lus", state: "confirmed" },
    ],
    unknownLabel: "Date de mise à niveau du poste de Matane",
    unknownNote: "inconnue déclarée · portée, non estimée",
    delivered: "Livré comme convenu · 1 840 $ fixe",
    exports: "Exports à la livraison : XLSX · GeoJSON · synthèse",
    closing: "Vous avez demandé le résultat. Endvera l'a assemblé et livré.",
  },
  range: {
    title: "Une demande. Différentes formes de travail fini.",
    lede: "Une décision, une opération réconciliée ou du travail numérique accompli : vous décrivez la ligne d'arrivée et le système assemble l'exécution.",
    outcomes: [
      ["Intelligence de décision", "Où construire ensuite", "Un système de décision scoré et sourcé"],
      ["Opérations réconciliées", "Deux systèmes, une vérité", "12 480 comptes réconciliés, exceptions déclarées"],
      ["Travail numérique exécuté", "De la lecture au terminé", "Le travail accompli, vérifié et remis"],
    ],
  },
  control: {
    title: "Contrôlé de la demande à la livraison.",
    lede: "Portée, permissions, budget et prix fixe sont approuvés avant le travail. Les preuves et le jugement humain borné restent dans l'exécution.",
    ring: ["Permissions", "Portée", "Budget", "Prix fixe", "Preuves", "Traçabilité", "Escalade bornée"],
  },
  door: {
    line1: "Décrivez le résultat.",
    line2: "Endvera assemble tout le reste.",
  },
  srJourney:
    "Une demande est décrite. Sa portée, son prix et sa ligne d'arrivée sont fixés. Deux systèmes s'assemblent autour d'un axe or : l'un porte l'intention et le contrôle, l'autre le tissu d'exécution. Un fait ne peut pas être confirmé et devient une question humaine bornée. Les preuves sont vérifiées contre la ligne d'arrivée, et le système assemblé livre une surface de décision vérifiée.",
};

const es: ConceptAssemblyCopy = {
  meta: {
    title: "Concepto — el bloqueo de ensamblaje",
    description: "Prototipo de diseño interno para el sitio público de Endvera. No es una página pública.",
  },
  nav: { outcomes: "Resultados", how: "Cómo funciona", inside: "Por dentro", earlyAccess: "Acceso anticipado" },
  kicker: "El sistema adecuado se ensambla solo",
  headline: ["Entra una solicitud.", "Sale un resultado verificado."],
  supporting:
    "Modelos, software, código, navegador y juicio humano acotado — ensamblados, verificados y entregados.",
  placeholder: "El resultado que necesita…",
  cta: "Describa su resultado",
  fieldNote: "Nada de lo que se escriba aquí se envía, se almacena ni se registra. Cuando esté listo, empiece abajo.",
  doorCta: "Empezar en acceso anticipado",
  sampleRequest: "¿Dónde construir cargadores rápidos comerciales en el este de Quebec?",
  intent: {
    title: "Intención y control",
    outcomeLabel: "Resultado solicitado",
    rows: [
      ["Formato", "Sistema de decisión interactivo · archivos exportados en la entrega"],
      ["Precio fijo", "$1,840"],
      ["Entrega", "4 días hábiles"],
      ["Permisos", "Fuentes públicas de solo lectura · ningún sistema del cliente tocado"],
    ],
    authorization: "Tarjeta autorizada, no cobrada",
    finishLineLabel: "Meta aprobada",
    finishLine: "Cada cifra lleva su fuente. Cada incógnita se declara, nunca se estima.",
  },
  fabric: {
    title: "Tejido de ejecución",
    materials: [
      { label: "Modelo", behavior: "Un borrador se condensa en una afirmación estructurada" },
      { label: "Software", behavior: "Campos exactos se conectan a fuentes y confirman" },
      { label: "Código", behavior: "Los invariantes se resuelven con certeza" },
      { label: "Navegador", behavior: "Lee donde no existe una API" },
      { label: "Humano", behavior: "Una pregunta acotada, una decisión" },
    ],
  },
  lockLabel: "Sistema bloqueado a la solicitud",
  exception: {
    chip: "Un dato no se pudo confirmar",
    fact: "Fecha de mejora de la subestación de Matane",
    state: "Sin confirmar",
    routed: "Una pregunta acotada → una persona",
    resolved: "Registrada como incógnita declarada, nunca estimada",
  },
  verification: {
    line: "La evidencia se verifica contra la meta que usted aprobó, y una persona revisa la entrega según ese estándar antes de que salga.",
    limit: "La revisión es cuidadosa — no es una promesa de que se detecte todo error posible.",
  },
  outcome: {
    lock: "Resultado verificado · bloqueado",
    kicker: "Ejecución de ejemplo · selección de sitios · 34 evaluados",
    recommendation: "¿Dónde construir primero? Rivière-du-Loup y Rimouski.",
    detail:
      "El sistema evaluó 34 sitios según capacidad de red, incentivos y ubicación en el corredor. Estos dos lideran; Matane sigue visible como la mejor opción siguiente.",
    corridorLabel: "Corredor ribera sur · Ruta 132 · 34 sitios evaluados",
    riverLabel: "San Lorenzo",
    scaleLabel: "0 — 50 km",
    sites: [
      { name: "Rivière-du-Loup", score: 92, note: "red lista · sin operador a menos de 180 km" },
      { name: "Rimouski", score: 88, note: "ventana de reembolso · ancla del corredor" },
      { name: "Matane", score: 71, note: "fecha de subestación sin confirmar" },
    ],
    ledgerTitle: "Evidencia",
    ledgerCompact: "5 fuentes verificadas · relectura hecha",
    ledger: [
      { source: "Conteo del MTQ, 2025-11", state: "confirmed" },
      { source: "Mapa de capacidad de Hydro-Québec", state: "confirmed" },
      { source: "Registre des entreprises", state: "confirmed" },
      { source: "Circular HQ 04-26", state: "confirmed" },
      { source: "Seis expedientes municipales, leídos", state: "confirmed" },
    ],
    unknownLabel: "Fecha de mejora de la subestación de Matane",
    unknownNote: "incógnita declarada · registrada, no estimada",
    delivered: "Entregado según lo acordado · $1,840 fijo",
    exports: "Exportaciones en la entrega: XLSX · GeoJSON · síntesis",
    closing: "Pidió el resultado. Endvera lo ensambló y lo entregó.",
  },
  range: {
    title: "Una solicitud. Distintos tipos de trabajo terminado.",
    lede: "Una decisión, una operación conciliada o trabajo digital completado: usted define la meta y el sistema ensambla la ejecución.",
    outcomes: [
      ["Inteligencia de decisión", "Dónde construir después", "Un sistema de decisión puntuado y con fuentes"],
      ["Operaciones reconciliadas", "Dos sistemas, una verdad", "12,480 cuentas reconciliadas, excepciones declaradas"],
      ["Trabajo digital ejecutado", "De la lectura a lo hecho", "El trabajo realizado, verificado y devuelto"],
    ],
  },
  control: {
    title: "Controlado desde la solicitud hasta la entrega.",
    lede: "Alcance, permisos, presupuesto y precio fijo se aprueban antes de empezar. La evidencia y el criterio humano acotado permanecen dentro de la ejecución.",
    ring: ["Permisos", "Alcance", "Presupuesto", "Precio fijo", "Evidencia", "Trazabilidad", "Escalada acotada"],
  },
  door: {
    line1: "Describa el resultado.",
    line2: "Endvera ensambla todo lo demás.",
  },
  srJourney:
    "Se describe una solicitud. Su alcance, su precio y su meta quedan fijados. Dos sistemas se ensamblan alrededor de un eje dorado: uno lleva la intención y el control, el otro el tejido de ejecución. Un dato no puede confirmarse y se convierte en una pregunta humana acotada. La evidencia se verifica contra la meta, y el sistema ensamblado entrega una superficie de decisión verificada.",
};

const tl: ConceptAssemblyCopy = {
  meta: {
    title: "Konsepto — ang assembly lock",
    description: "Panloob na design prototype para sa pampublikong site ng Endvera. Hindi ito pampublikong pahina.",
  },
  nav: { outcomes: "Mga resulta", how: "Paano ito gumagana", inside: "Sa loob", earlyAccess: "Maagang akses" },
  kicker: "Kusang nabubuo ang tamang sistema",
  headline: ["Isang kahilingan ang pumapasok.", "Isang beripikadong resulta ang lumalabas."],
  supporting:
    "Mga modelo, software, code, browser at may hangganang paghatol ng tao — binuo, sinuri at inihatid.",
  placeholder: "Ang resultang kailangan mo…",
  cta: "Ilarawan ang resulta",
  fieldNote: "Walang isinusulat dito ang ipinapadala, iniimbak o itinatala. Kapag handa ka na, magsimula sa ibaba.",
  doorCta: "Magsimula sa Early Access",
  sampleRequest: "Saan magtatayo ng komersyal na mabilisang charger sa silangang Québec?",
  intent: {
    title: "Layunin at kontrol",
    outcomeLabel: "Hinihinging resulta",
    rows: [
      ["Format", "Interactive na sistema ng desisyon · mga export file sa paghahatid"],
      ["Takdang presyo", "$1,840"],
      ["Paghahatid", "4 na araw ng trabaho"],
      ["Mga permiso", "Read-only na pampublikong sanggunian · walang system ng kliyente ang gagalawin"],
    ],
    authorization: "Awtorisado ang card, hindi sinisingil",
    finishLineLabel: "Aprubadong linya ng tapos",
    finishLine: "Bawat datos ay may sanggunian. Bawat hindi alam ay idinedeklara, hindi kailanman tinatantiya.",
  },
  fabric: {
    title: "Tela ng ehekusyon",
    materials: [
      { label: "Modelo", behavior: "Ang burador ay nabubuo bilang istrukturadong pahayag" },
      { label: "Software", behavior: "Eksaktong field ang kumakabit sa sanggunian at kumukumpirma" },
      { label: "Code", behavior: "Ang mga invariant ay nareresolba nang tiyak" },
      { label: "Browser", behavior: "Nagbabasa kung saan walang API" },
      { label: "Tao", behavior: "Isang tiyak na tanong, isang desisyon" },
    ],
  },
  lockLabel: "Naka-lock ang sistema sa kahilingan",
  exception: {
    chip: "May isang datos na hindi makumpirma",
    fact: "Petsa ng pag-upgrade ng substation sa Matane",
    state: "Hindi nakumpirma",
    routed: "Isang tiyak na tanong → isang tao",
    resolved: "Itinala bilang deklaradong hindi alam, hindi kailanman tinantiya",
  },
  verification: {
    line: "Ang ebidensya ay sinusuri laban sa linya ng tapos na inaprubahan mo, at may taong nagrerebyu ng paghahatid ayon sa pamantayang iyon bago ito lumabas.",
    limit: "Maingat ang pagsusuri — hindi ito pangakong mahuhuli ang lahat ng posibleng mali.",
  },
  outcome: {
    lock: "Beripikadong resulta · naka-lock",
    kicker: "Halimbawang run · site selection · 34 site ang sinuri",
    recommendation: "Saan dapat unang magtayo? Rivière-du-Loup at Rimouski.",
    detail:
      "Sinuri ng system ang 34 site ayon sa grid capacity, rebate timing at corridor fit. Nangunguna ang dalawa; nananatiling nakikita ang Matane bilang susunod na opsyon.",
    corridorLabel: "Koridor sa timog na pampang · Ruta 132 · 34 na lugar ang sinuri",
    riverLabel: "Saint Lawrence",
    scaleLabel: "0 — 50 km",
    sites: [
      { name: "Rivière-du-Loup", score: 92, note: "handa ang grid · walang operator sa loob ng 180 km" },
      { name: "Rimouski", score: 88, note: "rebate window · angkla ng koridor" },
      { name: "Matane", score: 71, note: "hindi nakumpirma ang petsa ng substation" },
    ],
    ledgerTitle: "Ebidensya",
    ledgerCompact: "5 pinagmulan, beripikado · tapos ang readback",
    ledger: [
      { source: "Bilang ng trapiko ng MTQ, 2025-11", state: "confirmed" },
      { source: "Mapa ng kapasidad ng Hydro-Québec", state: "confirmed" },
      { source: "Registre des entreprises", state: "confirmed" },
      { source: "Sirkular ng HQ 04-26", state: "confirmed" },
      { source: "Anim na munisipal na file, binasa", state: "confirmed" },
    ],
    unknownLabel: "Petsa ng pag-upgrade ng substation sa Matane",
    unknownNote: "deklaradong hindi alam · dala-dala, hindi tinantiya",
    delivered: "Naihatid ayon sa napagkasunduan · $1,840 takda",
    exports: "Mga export sa paghahatid: XLSX · GeoJSON · buod",
    closing: "Hiningi mo ang resulta. Binuo at inihatid ito ng Endvera.",
  },
  range: {
    title: "Isang request. Iba't ibang uri ng tapos na trabaho.",
    lede: "Decision, reconciled operation o natapos na digital work: ikaw ang naglalarawan ng finish line at binubuo ng system ang run.",
    outcomes: [
      ["Katalinuhan sa desisyon", "Saan susunod magtatayo", "Isang may puntos at may sanggunian na sistema ng desisyon"],
      ["Pinagkasundong operasyon", "Dalawang sistema, isang katotohanan", "12,480 account ang pinagkasundo, deklarado ang mga eksepsyon"],
      ["Naisagawang digital na trabaho", "Mula pagbasa hanggang tapos", "Ang trabahong ginawa, beripikado at ibinalik"],
    ],
  },
  control: {
    title: "Kontrolado mula request hanggang delivery.",
    lede: "Aprubado muna ang scope, permissions, budget at fixed price. Nasa loob ng run ang ebidensya at bounded human judgment.",
    ring: ["Mga permiso", "Saklaw", "Badyet", "Takdang presyo", "Ebidensya", "Traceability", "May hangganang eskalasyon"],
  },
  door: {
    line1: "Ilarawan ang resulta.",
    line2: "Sagot ng Endvera ang lahat ng pagitan.",
  },
  srJourney:
    "Inilalarawan ang isang kahilingan. Naitatakda ang saklaw, presyo at linya ng tapos nito. Dalawang sistema ang nabubuo sa paligid ng gintong axis: dala ng isa ang layunin at kontrol, dala ng isa ang tela ng ehekusyon. May isang datos na hindi makumpirma at nagiging tiyak na tanong sa tao. Sinusuri ang ebidensya laban sa linya ng tapos, at ang nabuong sistema ay naghahatid ng isang beripikadong surface ng desisyon.",
};

export const CONCEPT_ASSEMBLY_I18N: Record<SiteLang, ConceptAssemblyCopy> = { en, fr, es, tl };

/** Same fallback rule as every other public dictionary: unknown becomes English. */
export function conceptAssemblyLangOf(value: string | undefined | null): SiteLang {
  return value === "fr" || value === "es" || value === "tl" ? value : "en";
}

/* ---- the A2 concierge: approved static answers, four languages ---------- */
export type HomeConciergeCopy = {
  ask: string; hail: string; title: string; intro: string;
  guide: {
    hero: string; problem: string; solution: string; run: string;
    review: string; outcome: string; example: string; final: string;
  };
  suggestions: [string, string, string];
  answers: { verified: string; verifiedCite: string; verifiedHref: string;
             unknown: string; unavailable: string };
  close: string;
};

export const HOME_CONCIERGE_I18N: Record<SiteLang, HomeConciergeCopy> = {
  en: {
    ask: "Ask Endvera",
    hail: "Ask Endvera",
    title: "Endvera guide",
    intro: "A site guide with approved answers and citations. It never invents; when it does not know, it says so.",
    guide: {
      hero: "One demanding workflow. Follow the first run.",
      problem: "This is where handoffs consume your team's time.",
      solution: "The approved run establishes its operating standard.",
      run: "AI, tools, systems and people follow one managed route.",
      review: "Exceptions surface here. A person checks the result.",
      outcome: "The approved run records its operating standard.",
      example: "Now watch one real workflow run end to end.",
      final: "That is the first-run standard. Ask me about any step.",
    },
    suggestions: ["Who checks the work?", "Can you handle any workflow?", "What if the guide is unavailable?"],
    answers: {
      verified: "A person reviews every delivery against the operating standard before it goes out.",
      verifiedCite: "endvera.com/inside · Operating standard",
      verifiedHref: "/inside",
      unknown: "That is not covered by the published pages yet, so I will not guess. A person answers at",
      unavailable: "The guide is offline right now and fails closed: no answer is better than an invented one. The site itself stays fully readable.",
    },
    close: "Close",
  },
  fr: {
    ask: "Demandez à Endvera",
    hail: "Demandez à Endvera",
    title: "Guide Endvera",
    intro: "Un guide du site aux réponses approuvées et citées. Il n'invente jamais; quand il ne sait pas, il le dit.",
    guide: {
      hero: "Un processus exigeant. Suivez la première exécution.",
      problem: "C'est ici que les transferts font perdre du temps à votre équipe.",
      solution: "L'exécution approuvée établit son standard d'exploitation.",
      run: "IA, outils, systèmes et humains suivent un seul parcours géré.",
      review: "Les exceptions remontent ici. Une personne vérifie le résultat.",
      outcome: "L'exécution approuvée consigne son standard d'exploitation.",
      example: "Maintenant, suivez un vrai processus de bout en bout.",
      final: "Voilà le standard de la première exécution. Posez-moi une question sur une étape.",
    },
    suggestions: ["Qui vérifie le travail?", "Pouvez-vous prendre en charge n'importe quel processus?", "Et si le guide est indisponible?"],
    answers: {
      verified: "Une personne révise chaque livraison selon le standard d'exploitation avant qu'elle parte.",
      verifiedCite: "endvera.com/inside · Standard d'exploitation",
      verifiedHref: "/inside",
      unknown: "Les pages publiées ne couvrent pas encore ce point, donc je ne devine pas. Une personne répond à",
      unavailable: "Le guide est hors ligne et échoue fermé : aucune réponse vaut mieux qu'une réponse inventée. Le site reste entièrement lisible.",
    },
    close: "Fermer",
  },
  es: {
    ask: "Pregunta a Endvera",
    hail: "Pregunta a Endvera",
    title: "Guía Endvera",
    intro: "Una guía del sitio con respuestas aprobadas y citadas. Nunca inventa; cuando no sabe, lo dice.",
    guide: {
      hero: "Un proceso exigente. Siga la primera ejecución.",
      problem: "Aquí es donde los traspasos consumen el tiempo de su equipo.",
      solution: "La ejecución aprobada establece su estándar operativo.",
      run: "IA, herramientas, sistemas y personas siguen una ruta gestionada.",
      review: "Las excepciones aparecen aquí. Una persona verifica el resultado.",
      outcome: "La ejecución aprobada documenta su estándar operativo.",
      example: "Ahora, siga un proceso real de principio a fin.",
      final: "Este es el estándar de la primera ejecución. Pregúnteme por cualquier paso.",
    },
    suggestions: ["¿Quién revisa el trabajo?", "¿Pueden asumir cualquier proceso?", "¿Y si la guía no está disponible?"],
    answers: {
      verified: "Una persona revisa cada entrega según el estándar operativo antes de que salga.",
      verifiedCite: "endvera.com/inside · Estándar operativo",
      verifiedHref: "/inside",
      unknown: "Las páginas publicadas aún no cubren ese punto, así que no adivino. Una persona responde en",
      unavailable: "La guía está fuera de línea y falla cerrada: ninguna respuesta es mejor que una inventada. El sitio sigue siendo legible.",
    },
    close: "Cerrar",
  },
  tl: {
    ask: "Magtanong sa Endvera",
    hail: "Magtanong sa Endvera",
    title: "Gabay ng Endvera",
    intro: "Isang gabay ng site na may aprubadong sagot at citation. Hindi ito nag-iimbento; kapag hindi alam, sinasabi nito.",
    guide: {
      hero: "Isang mabigat na workflow. Sundan ang first run.",
      problem: "Dito inuubos ng handoffs ang oras ng team mo.",
      solution: "Itinatatag ng aprubadong run ang operating standard nito.",
      run: "AI, tools, systems at mga tao ay sumusunod sa isang managed route.",
      review: "Dito lumalabas ang exceptions. May taong sumusuri sa resulta.",
      outcome: "Itinatala ng aprubadong run ang operating standard nito.",
      example: "Ngayon, sundan ang isang tunay na workflow end to end.",
      final: "Ito ang operating standard ng first run. Magtanong tungkol sa kahit anong hakbang.",
    },
    suggestions: ["Sino ang nagsusuri ng trabaho?", "Kaya ba ninyo ang anumang workflow?", "Paano kung offline ang gabay?"],
    answers: {
      verified: "May taong sumusuri sa bawat delivery ayon sa operating standard bago ito lumabas.",
      verifiedCite: "endvera.com/inside · Operating standard",
      verifiedHref: "/inside",
      unknown: "Hindi pa saklaw ng mga naka-publish na pahina ang puntong iyan, kaya hindi ako manghuhula. May taong sumasagot sa",
      unavailable: "Offline ang gabay ngayon at nagfa-fail closed: mas mabuti ang walang sagot kaysa imbentong sagot. Nananatiling ganap na mababasa ang site.",
    },
    close: "Isara",
  },
};
