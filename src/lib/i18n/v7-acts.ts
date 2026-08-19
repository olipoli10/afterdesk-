/* V7 - the narrative acts (NARRATIVE phase: eight scenes, storyboard-
   validated). Four languages in strict parallel. Copy follows the founder
   direction and the mandated hierarchy: what -> why it is hard -> how the
   engine works -> where AI, tools and people participate -> how
   verification works -> what the customer receives -> examples -> CTA.
   Station truth-labels reuse the published operating vocabulary so the
   run never claims autonomous execution; browser work is "when permitted";
   human work is bounded; verification anchors to the WRITTEN standard. */

export type SiteLang = "en" | "fr" | "es" | "tl";

type Fragment = { label: string; meta: string };
type Station = { name: string; truth: string };
type OutcomeCase = { title: string; request: string; coordinated: string; delivered: string };

export type V7ActsCopy = {
  act1: { h: string; sub: string; placeholder: string; note: string };
  /* the intake console's machined labels + the path manifest: the in-hero
     answer to "what does Endvera handle", phrased as work done FOR the
     visitor, never as features they would configure */
  instrument: {
    intake: string;
    awaiting: string;
    receiving: string;
    manifestTitle: string;
    manifest: [string, string, string, string, string];
  };
  solution: { h: string; sub: string };
  engine: { title: string };
  exampleIntro: string;
  act2: { h: string; sub: string; fragments: [Fragment, Fragment, Fragment, Fragment, Fragment, Fragment] };
  act3: { h: string; stations: [Station, Station, Station, Station, Station, Station] };
  act4: { h: string; chips: [string, string, string, string]; cta: string; ctaNote: string };
  review: { h: string; sub: string; standard: string; draft: string; evidence: string; exception: string; mark: string };
  sealed: { h: string; seal: string; chips: [string, string, string, string] };
  outcomes: {
    h: string;
    example: string;
    request: string;
    coordinated: string;
    delivered: string;
    cases: [OutcomeCase, OutcomeCase, OutcomeCase, OutcomeCase];
  };
  artifact: { request: string; locked: string; checked: string };
  srStory: string;
};

export const V7_ACTS_I18N: Record<SiteLang, V7ActsCopy> = {
  en: {
    act1: {
      h: "Digital work, handled.",
      sub: "You describe the result. We coordinate the systems, tools and people needed to deliver it checked.",
      placeholder: "Describe the result you need…",
      note: "Nothing typed here is sent, stored or recorded.",
    },
    instrument: {
      intake: "Intake 01",
      awaiting: "Awaiting request",
      receiving: "Receiving",
      manifestTitle: "Coordinated for you",
      manifest: ["Models", "Tools", "Browsers", "Workflows", "Human review"],
    },
    solution: {
      h: "Endvera takes it from here.",
      sub: "Your request becomes a scoped run. The engine selects the right systems, coordinates execution, handles exceptions and routes the result for review.",
    },
    engine: { title: "The coordination engine" },
    exampleIntro: "One real request, end to end.",
    act2: {
      h: "AI, tools and people should not be yours to manage.",
      sub: "Most work breaks between tools, handoffs and reviews. Endvera coordinates the complete run.",
      fragments: [
        { label: "Model", meta: "draft 2 of 3" },
        { label: "Browser", meta: "task stalled" },
        { label: "Tool", meta: "raw export" },
        { label: "Handoff", meta: "unassigned" },
        { label: "Review", meta: "who checks?" },
        { label: "⚠", meta: "uncertain" },
      ],
    },
    act3: {
      h: "Endvera scopes the work, runs it, handles problems, and checks the result.",
      stations: [
        { name: "Scope", truth: "the request becomes a written standard · one fixed price" },
        { name: "Models", truth: "the right AI capabilities, chosen and combined" },
        { name: "Tools", truth: "files, code, research and transformation work" },
        { name: "Browser", truth: "acts in external interfaces when permitted" },
        { name: "Human work", truth: "bounded judgment, review and edge cases" },
        { name: "Verification", truth: "checked against the written standard" },
      ],
    },
    act4: {
      h: "You are not buying another tool or a block of hours. You approve one result, one scope and one fixed price.",
      chips: ["One owner", "Written scope", "Fixed price", "Checked result"],
      cta: "Describe your result",
      ctaNote: "Early Access — you approve the scope and the fixed price before any work begins.",
    },
    review: {
      h: "A person checks the delivery.",
      sub: "Against the written standard, before it goes out.",
      standard: "Written standard",
      draft: "Delivered draft",
      evidence: "Evidence",
      exception: "1 exception resolved",
      mark: "Human check",
    },
    sealed: {
      h: "One request in. One checked result out.",
      seal: "Delivered by Endvera",
      chips: ["Result", "Checked", "Evidence", "Ready to deliver"],
    },
    outcomes: {
      h: "One front door. Very different finished outcomes.",
      example: "Example",
      request: "Request",
      coordinated: "Coordinated",
      delivered: "Delivered",
      cases: [
        {
          title: "Local business website",
          request: "a website that wins local customers",
          coordinated: "scope, copy, build, browser checks, human review",
          delivered: "a live-ready site, checked against the scope",
        },
        {
          title: "Market research & comparison",
          request: "a clear read on a market",
          coordinated: "sources, extraction, structured comparison, human review",
          delivered: "a decision-ready comparison with evidence",
        },
        {
          title: "Sales presentation",
          request: "a deck that closes a specific room",
          coordinated: "narrative, data pulls, design pass, human review",
          delivered: "a finished deck, checked slide by slide",
        },
        {
          title: "A recurring operation, organized",
          request: "a monthly process that stops leaking",
          coordinated: "intake, transformation, exception handling, human review",
          delivered: "a documented, repeatable run — set up and handed over",
        },
      ],
    },
    artifact: { request: "Your request", locked: "Scope locked", checked: "Checked result" },
    srStory:
      "Your request becomes a slip. Endvera receives it, freezes the scope, conducts the run through scope, models, tools, browser, bounded human work and verification, a person checks the delivery against the written standard, and it returns finished and checked.",
  },
  fr: {
    act1: {
      h: "Le travail numérique, pris en charge.",
      sub: "Vous décrivez le résultat. Nous coordonnons les systèmes, les outils et les personnes qu'il faut pour le livrer vérifié.",
      placeholder: "Décrivez le résultat qu'il vous faut…",
      note: "Rien de ce qui est tapé ici n'est envoyé, stocké ou enregistré.",
    },
    instrument: {
      intake: "Admission 01",
      awaiting: "En attente",
      receiving: "Réception",
      manifestTitle: "Coordonné pour vous",
      manifest: ["Modèles", "Outils", "Navigateurs", "Flux de travail", "Revue humaine"],
    },
    solution: {
      h: "Endvera s'en charge.",
      sub: "Votre demande devient une course cadrée. Le moteur choisit les bons systèmes, coordonne l'exécution, gère les exceptions et achemine le résultat en revue.",
    },
    engine: { title: "Le moteur de coordination" },
    exampleIntro: "Une vraie demande, de bout en bout.",
    act2: {
      h: "IA, outils et personnes : ce n'est pas à vous de tout gérer.",
      sub: "La plupart du travail casse entre les outils, les transferts et les revues. Endvera coordonne la course complète.",
      fragments: [
        { label: "Modèle", meta: "brouillon 2 de 3" },
        { label: "Navigateur", meta: "tâche au point mort" },
        { label: "Outil", meta: "export brut" },
        { label: "Transfert", meta: "non assigné" },
        { label: "Revue", meta: "qui vérifie?" },
        { label: "⚠", meta: "incertain" },
      ],
    },
    act3: {
      h: "Endvera cadre le travail, l'exécute, gère les imprévus et vérifie le résultat.",
      stations: [
        { name: "Portée", truth: "la demande devient un standard écrit · un prix fixe" },
        { name: "Modèles", truth: "les bonnes capacités d'IA, choisies et combinées" },
        { name: "Outils", truth: "fichiers, code, recherche et transformation" },
        { name: "Navigateur", truth: "agit dans les interfaces externes quand c'est permis" },
        { name: "Travail humain", truth: "jugement borné, revue et cas limites" },
        { name: "Vérification", truth: "vérifié contre le standard écrit" },
      ],
    },
    act4: {
      h: "Vous n'achetez ni un autre outil ni un bloc d'heures. Vous approuvez un résultat, une portée et un prix fixe.",
      chips: ["Un responsable", "Portée écrite", "Prix fixe", "Résultat vérifié"],
      cta: "Décrivez votre résultat",
      ctaNote: "Early Access — vous approuvez la portée et le prix fixe avant tout début de travail.",
    },
    review: {
      h: "Une personne vérifie la livraison.",
      sub: "Contre le standard écrit, avant l'envoi.",
      standard: "Standard écrit",
      draft: "Brouillon livré",
      evidence: "Preuves",
      exception: "1 exception résolue",
      mark: "Contrôle humain",
    },
    sealed: {
      h: "Une demande entre. Un résultat vérifié ressort.",
      seal: "Livré par Endvera",
      chips: ["Résultat", "Vérifié", "Preuves", "Prêt à livrer"],
    },
    outcomes: {
      h: "Une seule porte d'entrée. Des résultats finis très différents.",
      example: "Exemple",
      request: "Demande",
      coordinated: "Coordonné",
      delivered: "Livré",
      cases: [
        {
          title: "Site d'entreprise locale",
          request: "un site qui gagne des clients locaux",
          coordinated: "portée, textes, construction, contrôles navigateur, revue humaine",
          delivered: "un site prêt à publier, vérifié contre la portée",
        },
        {
          title: "Recherche et comparaison de marché",
          request: "une lecture claire d'un marché",
          coordinated: "sources, extraction, comparaison structurée, revue humaine",
          delivered: "une comparaison prête à décider, avec preuves",
        },
        {
          title: "Présentation de vente",
          request: "un deck qui convainc une salle précise",
          coordinated: "narratif, extraction de données, passe de design, revue humaine",
          delivered: "un deck fini, vérifié diapo par diapo",
        },
        {
          title: "Une opération récurrente, organisée",
          request: "un processus mensuel qui cesse de fuir",
          coordinated: "admission, transformation, gestion des exceptions, revue humaine",
          delivered: "une course documentée et répétable — mise en place et remise",
        },
      ],
    },
    artifact: { request: "Votre demande", locked: "Portée gelée", checked: "Résultat vérifié" },
    srStory:
      "Votre demande devient un bordereau. Endvera le reçoit, gèle la portée, conduit la course à travers portée, modèles, outils, navigateur, travail humain borné et vérification, une personne vérifie la livraison contre le standard écrit, et il revient fini et vérifié.",
  },
  es: {
    act1: {
      h: "El trabajo digital, resuelto.",
      sub: "Usted describe el resultado. Nosotros coordinamos los sistemas, las herramientas y las personas necesarias para entregarlo verificado.",
      placeholder: "Describa el resultado que necesita…",
      note: "Nada de lo escrito aquí se envía, almacena o registra.",
    },
    instrument: {
      intake: "Admisión 01",
      awaiting: "En espera",
      receiving: "Recibiendo",
      manifestTitle: "Coordinado para usted",
      manifest: ["Modelos", "Herramientas", "Navegadores", "Flujos de trabajo", "Revisión humana"],
    },
    solution: {
      h: "Endvera se encarga.",
      sub: "Su solicitud se convierte en una ejecución delimitada. El motor elige los sistemas adecuados, coordina la ejecución, gestiona las excepciones y encamina el resultado a revisión.",
    },
    engine: { title: "El motor de coordinación" },
    exampleIntro: "Una solicitud real, de principio a fin.",
    act2: {
      h: "IA, herramientas y personas: usted no debería gestionarlas.",
      sub: "La mayoría del trabajo se rompe entre herramientas, traspasos y revisiones. Endvera coordina la ejecución completa.",
      fragments: [
        { label: "Modelo", meta: "borrador 2 de 3" },
        { label: "Navegador", meta: "tarea detenida" },
        { label: "Herramienta", meta: "exportación en bruto" },
        { label: "Traspaso", meta: "sin asignar" },
        { label: "Revisión", meta: "¿quién verifica?" },
        { label: "⚠", meta: "incierto" },
      ],
    },
    act3: {
      h: "Endvera delimita el trabajo, lo ejecuta, resuelve imprevistos y verifica el resultado.",
      stations: [
        { name: "Alcance", truth: "la solicitud se vuelve un estándar escrito · un precio fijo" },
        { name: "Modelos", truth: "las capacidades de IA adecuadas, elegidas y combinadas" },
        { name: "Herramientas", truth: "archivos, código, investigación y transformación" },
        { name: "Navegador", truth: "actúa en interfaces externas cuando está permitido" },
        { name: "Trabajo humano", truth: "juicio acotado, revisión y casos límite" },
        { name: "Verificación", truth: "verificado contra el estándar escrito" },
      ],
    },
    act4: {
      h: "No está comprando otra herramienta ni un bloque de horas. Aprueba un resultado, un alcance y un precio fijo.",
      chips: ["Un responsable", "Alcance escrito", "Precio fijo", "Resultado verificado"],
      cta: "Describa su resultado",
      ctaNote: "Early Access — usted aprueba el alcance y el precio fijo antes de que empiece cualquier trabajo.",
    },
    review: {
      h: "Una persona verifica la entrega.",
      sub: "Contra el estándar escrito, antes de enviarla.",
      standard: "Estándar escrito",
      draft: "Borrador entregado",
      evidence: "Evidencia",
      exception: "1 excepción resuelta",
      mark: "Verificación humana",
    },
    sealed: {
      h: "Entra una solicitud. Sale un resultado verificado.",
      seal: "Entregado por Endvera",
      chips: ["Resultado", "Verificado", "Evidencia", "Listo para entregar"],
    },
    outcomes: {
      h: "Una sola puerta de entrada. Resultados terminados muy distintos.",
      example: "Ejemplo",
      request: "Solicitud",
      coordinated: "Coordinado",
      delivered: "Entregado",
      cases: [
        {
          title: "Sitio web de negocio local",
          request: "un sitio que gane clientes locales",
          coordinated: "alcance, textos, construcción, controles de navegador, revisión humana",
          delivered: "un sitio listo para publicar, verificado contra el alcance",
        },
        {
          title: "Investigación y comparación de mercado",
          request: "una lectura clara de un mercado",
          coordinated: "fuentes, extracción, comparación estructurada, revisión humana",
          delivered: "una comparación lista para decidir, con evidencia",
        },
        {
          title: "Presentación de ventas",
          request: "una presentación que convenza a una sala concreta",
          coordinated: "narrativa, extracción de datos, pase de diseño, revisión humana",
          delivered: "una presentación terminada, verificada diapositiva por diapositiva",
        },
        {
          title: "Una operación recurrente, organizada",
          request: "un proceso mensual que deje de fallar",
          coordinated: "admisión, transformación, gestión de excepciones, revisión humana",
          delivered: "una ejecución documentada y repetible — montada y entregada",
        },
      ],
    },
    artifact: { request: "Su solicitud", locked: "Alcance congelado", checked: "Resultado verificado" },
    srStory:
      "Su solicitud se convierte en un comprobante. Endvera lo recibe, congela el alcance, conduce la ejecución por alcance, modelos, herramientas, navegador, trabajo humano acotado y verificación, una persona verifica la entrega contra el estándar escrito, y vuelve terminado y verificado.",
  },
  tl: {
    act1: {
      h: "Digital na trabaho, hawak na.",
      sub: "Ilarawan mo ang resulta. Kami ang magkokoordina ng mga system, tool at tao para maihatid itong siniyasat.",
      placeholder: "Ilarawan ang resultang kailangan mo…",
      note: "Walang tinatype dito ang ipinapadala, iniimbak o naitatala.",
    },
    instrument: {
      intake: "Intake 01",
      awaiting: "Naghihintay",
      receiving: "Tinatanggap",
      manifestTitle: "Kinokoordina para sa iyo",
      manifest: ["Mga modelo", "Mga tool", "Mga browser", "Mga workflow", "Pagsusuri ng tao"],
    },
    solution: {
      h: "Ang Endvera na ang bahala.",
      sub: "Nagiging saklaw na takbo ang iyong kahilingan. Pinipili ng makina ang tamang mga system, kinokoordina ang pagpapatakbo, inaayos ang mga exception, at dinadala ang resulta sa review.",
    },
    engine: { title: "Ang makina ng koordinasyon" },
    exampleIntro: "Isang totoong kahilingan, mula simula hanggang dulo.",
    act2: {
      h: "AI, tools at tao: hindi ikaw ang dapat mamahala.",
      sub: "Karamihan ng trabaho ay nasisira sa pagitan ng mga tool, handoff at review. Ang Endvera ang nagkokoordina ng buong takbo.",
      fragments: [
        { label: "Model", meta: "draft 2 ng 3" },
        { label: "Browser", meta: "tumigil ang task" },
        { label: "Tool", meta: "hilaw na export" },
        { label: "Handoff", meta: "walang nakatalaga" },
        { label: "Review", meta: "sino ang susuri?" },
        { label: "⚠", meta: "hindi tiyak" },
      ],
    },
    act3: {
      h: "Sinasaklaw ng Endvera ang trabaho, pinapatakbo, inaayos ang aberya, sinusuri ang resulta.",
      stations: [
        { name: "Saklaw", truth: "nagiging nakasulat na pamantayan ang kahilingan · isang fixed na presyo" },
        { name: "Mga modelo", truth: "ang tamang AI capabilities, pinili at pinagsama" },
        { name: "Mga tool", truth: "files, code, research at transformation" },
        { name: "Browser", truth: "kumikilos sa external na interface kapag pinahintulutan" },
        { name: "Trabaho ng tao", truth: "may hangganang paghatol, review at edge case" },
        { name: "Beripikasyon", truth: "sinusuri laban sa nakasulat na pamantayan" },
      ],
    },
    act4: {
      h: "Hindi ka bumibili ng panibagong tool o bloke ng oras. Inaaprubahan mo ang isang resulta, isang saklaw at isang fixed na presyo.",
      chips: ["Isang may-ari", "Nakasulat na saklaw", "Fixed na presyo", "Beripikadong resulta"],
      cta: "Ilarawan ang iyong resulta",
      ctaNote: "Early Access — inaaprubahan mo ang saklaw at ang fixed na presyo bago magsimula ang anumang trabaho.",
    },
    review: {
      h: "Isang tao ang sumusuri sa delivery.",
      sub: "Laban sa nakasulat na pamantayan, bago ito ipadala.",
      standard: "Nakasulat na pamantayan",
      draft: "Naihatid na draft",
      evidence: "Ebidensya",
      exception: "1 exception na nalutas",
      mark: "Suri ng tao",
    },
    sealed: {
      h: "Isang kahilingan ang pumapasok. Isang siniyasat na resulta ang lumalabas.",
      seal: "Inihatid ng Endvera",
      chips: ["Resulta", "Siniyasat", "Ebidensya", "Handang ihatid"],
    },
    outcomes: {
      h: "Isang pinto ng pagpasok. Ibang-iba ang mga tapos na resulta.",
      example: "Halimbawa",
      request: "Kahilingan",
      coordinated: "Kinoordina",
      delivered: "Naihatid",
      cases: [
        {
          title: "Website ng lokal na negosyo",
          request: "website na aakit ng lokal na customer",
          coordinated: "saklaw, teksto, build, browser check, review ng tao",
          delivered: "site na handang i-publish, siniyasat laban sa saklaw",
        },
        {
          title: "Research at paghahambing ng merkado",
          request: "malinaw na larawan ng isang merkado",
          coordinated: "mga source, extraction, structured na paghahambing, review ng tao",
          delivered: "paghahambing na handa sa desisyon, may ebidensya",
        },
        {
          title: "Sales presentation",
          request: "deck na kukumbinsi sa isang partikular na audience",
          coordinated: "narrative, data pull, design pass, review ng tao",
          delivered: "tapos na deck, siniyasat bawat slide",
        },
        {
          title: "Isang paulit-ulit na operasyon, inayos",
          request: "buwanang proseso na hindi na butas-butas",
          coordinated: "intake, transformation, pag-aayos ng exception, review ng tao",
          delivered: "dokumentado at nauulit na takbo — inihanda at ibinigay",
        },
      ],
    },
    artifact: { request: "Ang iyong kahilingan", locked: "Nakapirmi ang saklaw", checked: "Beripikadong resulta" },
    srStory:
      "Nagiging slip ang iyong kahilingan. Tinatanggap ito ng Endvera, nagyeyelo ng saklaw, inaakay ang takbo sa saklaw, mga modelo, mga tool, browser, may hangganang trabaho ng tao at beripikasyon, sinusuri ng isang tao ang delivery laban sa nakasulat na pamantayan, at ibinabalik itong tapos at siniyasat.",
  },
};
