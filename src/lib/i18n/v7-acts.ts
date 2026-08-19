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

type AccentedCopy = { h: string; accent: string };

export type V7ActsCopy = {
  act1: AccentedCopy & { sub: string; placeholder: string; note: string };
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
  solution: AccentedCopy & { eyebrow: string; sub: string };
  engine: {
    title: string;
    handoff: string;
    boundary: string;
    boundaryItems: [string, string, string];
    core: string;
    coreSub: string;
    evidence: string;
    verification: string;
    result: string;
    standardStatus: string;
    continuity: [string, string, string];
    continuitySub: string;
  };
  exampleIntro: string;
  act2: AccentedCopy & { sub: string; fragments: [Fragment, Fragment, Fragment, Fragment, Fragment, Fragment] };
  act3: AccentedCopy & { stations: [Station, Station, Station, Station, Station, Station] };
  act4: AccentedCopy & { sub: string; chips: [string, string, string, string]; cta: string; ctaNote: string };
  review: AccentedCopy & { sub: string; standard: string; draft: string; evidence: string; exception: string; mark: string };
  sealed: AccentedCopy & { seal: string; chips: [string, string, string, string] };
  outcomes: {
    h: string;
    accent: string;
    lede: string;
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
      h: "Digital work, finished.",
      accent: "finished.",
      sub: "Bring us a demanding business workflow. We scope and coordinate the run end to end, then capture the approved scope, checks and exception path as its operating standard.",
      placeholder: "Describe the workflow or result you need…",
      note: "This demo field does not send or save anything.",
    },
    instrument: {
      intake: "Request intake 01",
      awaiting: "Ready for a request",
      receiving: "Receiving",
      manifestTitle: "One workflow · managed end to end",
      manifest: ["AI models", "Software & tools", "Browser work", "Human expertise", "Final verification"],
    },
    solution: {
      eyebrow: "ENDVERA",
      h: "One approved run becomes the standard.",
      accent: "becomes the standard.",
      sub: "The first approved run records the scope, quality bar, evidence and exception path in one operating standard.",
    },
    engine: {
      title: "The coordination core · first run",
      handoff: "Your workflow enters one managed run.",
      boundary: "Operating boundary",
      boundaryItems: ["Workflow scoped", "Quality bar written", "Price & access fixed"],
      core: "ENDVERA CORE",
      coreSub: "Routes each step, owns the handoffs and surfaces exceptions",
      evidence: "Evidence and exceptions return to the core",
      verification: "Checked against the approved standard",
      result: "Approved result",
      standardStatus: "EARLY ACCESS · OPERATING STANDARD",
      continuity: ["First run", "Checks recorded", "Operating standard"],
      continuitySub: "Scope, checks, evidence and exceptions—recorded in one operating standard.",
    },
    exampleIntro: "See what one managed workflow can deliver.",
    act2: {
      h: "Give us the workflow—not another task.",
      accent: "workflow",
      sub: "Prompts, tools, files, handoffs and review drain your team's time whenever the work starts over. ENDVERA takes responsibility for the whole path to a checked result.",
      fragments: [
        { label: "AI models", meta: "conflicting drafts" },
        { label: "Browser task", meta: "stopped mid-run" },
        { label: "Tool output", meta: "raw file · not usable" },
        { label: "Handoff", meta: "no owner" },
        { label: "Quality check", meta: "not assigned" },
        { label: "Unknown", meta: "needs judgment" },
      ],
    },
    act3: {
      h: "AI, software and people. One managed workflow.",
      accent: "One managed workflow.",
      stations: [
        { name: "AI models", truth: "reason · compare · draft" },
        { name: "Software & tools", truth: "create · transform · validate" },
        { name: "Browser work", truth: "research · approved interfaces" },
        { name: "Approved systems", truth: "authorized records · admin steps" },
        { name: "Human judgment", truth: "exceptions · decisions" },
        { name: "Verification gate", truth: "scope · evidence · status" },
      ],
    },
    act4: {
      h: "Approve the run. Keep the standard.",
      accent: "Keep the standard.",
      sub: "You approve the outcome, boundaries and fixed price. The finished run records the process in a written operating standard instead of leaving it scattered across prompts, files and handoffs.",
      chips: ["One owner", "Operating standard", "Exception path", "Checked result"],
      cta: "Describe what you need",
      ctaNote: "Early Access — you approve the scope and the fixed price before any work begins.",
    },
    review: {
      h: "Human judgment where it matters.",
      accent: "Human judgment",
      sub: "Before delivery, a person reviews the work against the approved scope and resolves anything the system could not confirm.",
      standard: "Approved scope",
      draft: "Working result",
      evidence: "Supporting evidence",
      exception: "Issue resolved",
      mark: "Human review complete",
    },
    sealed: {
      h: "Finished. Checked. Ready to use.",
      accent: "Ready to use.",
      seal: "ENDVERA DELIVERY",
      chips: ["Finished result", "Scope checked", "Evidence included", "Ready to use"],
    },
    outcomes: {
      h: "One front door. Many finished outcomes.",
      accent: "finished outcomes.",
      lede: "A website, a market decision, a sales deck or a complex operation—each starts with the result, not the tools.",
      example: "Illustrative outcome",
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
          title: "A complex operation, standardized",
          request: "a multi-step process that keeps breaking",
          coordinated: "intake, transformation, exception handling, human review",
          delivered: "an approved operating standard documenting scope, checks, evidence and exceptions",
        },
      ],
    },
    artifact: { request: "Your request", locked: "Scope locked", checked: "Checked result" },
    srStory:
      "A demanding workflow becomes a written scope. One coordination core carries the first run through AI models, tools, browser work, approved systems, human judgment and verification. The approved run records its operating standard.",
  },
  fr: {
    act1: {
      h: "Votre travail numérique, terminé.",
      accent: "terminé.",
      sub: "Confiez-nous un processus d'affaires exigeant. Nous cadrons et coordonnons l'exécution de bout en bout, puis consignons la portée, les contrôles et le chemin des exceptions comme standard d'exploitation.",
      placeholder: "Décrivez le processus ou le résultat qu'il vous faut…",
      note: "Ce champ de démonstration n'envoie et n'enregistre rien.",
    },
    instrument: {
      intake: "Demande 01",
      awaiting: "Prêt à recevoir",
      receiving: "Réception",
      manifestTitle: "Un processus · pris en charge de bout en bout",
      manifest: ["Modèles d'IA", "Logiciels et outils", "Travail navigateur", "Expertise humaine", "Vérification finale"],
    },
    solution: {
      eyebrow: "ENDVERA",
      h: "Une exécution approuvée devient le standard.",
      accent: "devient le standard.",
      sub: "La première exécution approuvée consigne la portée, le niveau de qualité, les preuves et le chemin des exceptions dans un même standard d'exploitation.",
    },
    engine: {
      title: "Le cœur de coordination · première exécution",
      handoff: "Votre processus entre dans une exécution prise en charge.",
      boundary: "Périmètre d'exploitation",
      boundaryItems: ["Processus cadré", "Niveau de qualité écrit", "Prix et accès fixés"],
      core: "CŒUR ENDVERA",
      coreSub: "Achemine chaque étape, prend les transferts en charge et signale les exceptions",
      evidence: "Preuves et exceptions reviennent au cœur",
      verification: "Vérifié selon le standard approuvé",
      result: "Résultat approuvé",
      standardStatus: "ACCÈS ANTICIPÉ · STANDARD D'EXPLOITATION",
      continuity: ["Première exécution", "Contrôles consignés", "Standard d'exploitation"],
      continuitySub: "Portée, contrôles, preuves et exceptions : tout est consigné dans un même standard.",
    },
    exampleIntro: "Voyez ce qu'un processus pris en charge peut livrer.",
    act2: {
      h: "Confiez-nous le processus, pas une autre tâche.",
      accent: "processus",
      sub: "Prompts, outils, fichiers, transferts et révision font perdre du temps à votre équipe chaque fois que le travail repart. ENDVERA prend tout le parcours en charge jusqu'au résultat vérifié.",
      fragments: [
        { label: "Modèles d'IA", meta: "versions contradictoires" },
        { label: "Tâche navigateur", meta: "arrêtée en cours" },
        { label: "Sortie d'outil", meta: "fichier brut · inutilisable" },
        { label: "Transfert", meta: "sans responsable" },
        { label: "Contrôle qualité", meta: "non assigné" },
        { label: "Inconnu", meta: "jugement requis" },
      ],
    },
    act3: {
      h: "IA, logiciels et humains. Un seul processus pris en charge.",
      accent: "Un seul processus pris en charge.",
      stations: [
        { name: "Modèles d'IA", truth: "raisonner · comparer · rédiger" },
        { name: "Logiciels et outils", truth: "créer · transformer · valider" },
        { name: "Travail navigateur", truth: "recherche · interfaces approuvées" },
        { name: "Systèmes approuvés", truth: "dossiers autorisés · tâches admin" },
        { name: "Jugement humain", truth: "exceptions · décisions" },
        { name: "Porte de vérification", truth: "mandat · preuves · statut" },
      ],
    },
    act4: {
      h: "Approuvez l'exécution. Gardez le standard.",
      accent: "Gardez le standard.",
      sub: "Vous approuvez le résultat, les limites et le prix fixe. L'exécution finie consigne le processus dans un standard écrit plutôt que de le laisser éparpillé entre prompts, fichiers et transferts.",
      chips: ["Un responsable", "Standard d'exploitation", "Chemin d'exception", "Résultat vérifié"],
      cta: "Décrivez votre besoin",
      ctaNote: "Early Access — vous approuvez la portée et le prix fixe avant tout début de travail.",
    },
    review: {
      h: "Du jugement humain, là où ça compte.",
      accent: "jugement humain",
      sub: "Avant la livraison, une personne révise le travail selon la portée approuvée et règle tout ce que le système n'a pas pu confirmer.",
      standard: "Portée approuvée",
      draft: "Résultat en travail",
      evidence: "Preuves à l'appui",
      exception: "Problème résolu",
      mark: "Révision humaine terminée",
    },
    sealed: {
      h: "Fini. Vérifié. Prêt à utiliser.",
      accent: "Prêt à utiliser.",
      seal: "LIVRAISON ENDVERA",
      chips: ["Résultat fini", "Portée vérifiée", "Preuves incluses", "Prêt à utiliser"],
    },
    outcomes: {
      h: "Une seule porte. Plusieurs résultats finis.",
      accent: "résultats finis.",
      lede: "Un site Web, une décision de marché, une présentation de vente ou une opération complexe : tout commence par le résultat, pas par les outils.",
      example: "Résultat illustratif",
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
          title: "Une opération complexe, standardisée",
          request: "un processus à plusieurs étapes qui bloque sans cesse",
          coordinated: "admission, transformation, gestion des exceptions, revue humaine",
          delivered: "un standard d'exploitation approuvé qui documente portée, contrôles, preuves et exceptions",
        },
      ],
    },
    artifact: { request: "Votre demande", locked: "Portée gelée", checked: "Résultat vérifié" },
    srStory:
      "Un processus exigeant devient une portée écrite. Un cœur de coordination conduit la première exécution à travers modèles d'IA, outils, travail navigateur, systèmes approuvés, jugement humain et vérification. L'exécution approuvée consigne son standard d'exploitation.",
  },
  es: {
    act1: {
      h: "Trabajo digital, terminado.",
      accent: "terminado.",
      sub: "Confíenos un proceso empresarial exigente. Definimos y coordinamos la ejecución de principio a fin, y registramos el alcance, los controles y la ruta de excepciones como estándar operativo.",
      placeholder: "Describa el proceso o el resultado que necesita…",
      note: "Este campo de demostración no envía ni guarda nada.",
    },
    instrument: {
      intake: "Solicitud 01",
      awaiting: "Listo para recibir",
      receiving: "Recibiendo",
      manifestTitle: "Un proceso · gestionado de principio a fin",
      manifest: ["Modelos de IA", "Software y herramientas", "Trabajo en navegador", "Experiencia humana", "Verificación final"],
    },
    solution: {
      eyebrow: "ENDVERA",
      h: "Una ejecución aprobada se convierte en el estándar.",
      accent: "se convierte en el estándar.",
      sub: "La primera ejecución aprobada registra el alcance, el nivel de calidad, la evidencia y la ruta de excepciones en un solo estándar operativo.",
    },
    engine: {
      title: "Núcleo de coordinación · primera ejecución",
      handoff: "Su proceso entra en una ejecución gestionada.",
      boundary: "Límite operativo",
      boundaryItems: ["Proceso definido", "Nivel de calidad escrito", "Precio y acceso fijados"],
      core: "NÚCLEO ENDVERA",
      coreSub: "Dirige cada paso, asume los traspasos y señala las excepciones",
      evidence: "La evidencia y las excepciones vuelven al núcleo",
      verification: "Verificado contra el estándar aprobado",
      result: "Resultado aprobado",
      standardStatus: "ACCESO ANTICIPADO · ESTÁNDAR OPERATIVO",
      continuity: ["Primera ejecución", "Controles registrados", "Estándar operativo"],
      continuitySub: "Alcance, controles, evidencia y excepciones: todo queda registrado en un solo estándar.",
    },
    exampleIntro: "Vea lo que puede entregar un proceso gestionado.",
    act2: {
      h: "Entréguenos el proceso, no otra tarea.",
      accent: "proceso",
      sub: "Prompts, herramientas, archivos, traspasos y revisión consumen el tiempo de su equipo cada vez que el trabajo vuelve a empezar. ENDVERA asume todo el recorrido hasta un resultado verificado.",
      fragments: [
        { label: "Modelos de IA", meta: "versiones contradictorias" },
        { label: "Tarea de navegador", meta: "detenida a mitad" },
        { label: "Salida de herramienta", meta: "archivo bruto · no utilizable" },
        { label: "Traspaso", meta: "sin responsable" },
        { label: "Control de calidad", meta: "no asignado" },
        { label: "Desconocido", meta: "requiere criterio" },
      ],
    },
    act3: {
      h: "IA, software y personas. Un solo proceso gestionado.",
      accent: "Un solo proceso gestionado.",
      stations: [
        { name: "Modelos de IA", truth: "razonar · comparar · redactar" },
        { name: "Software y herramientas", truth: "crear · transformar · validar" },
        { name: "Trabajo en navegador", truth: "investigar · interfaces aprobadas" },
        { name: "Sistemas aprobados", truth: "registros autorizados · tareas admin" },
        { name: "Criterio humano", truth: "excepciones · decisiones" },
        { name: "Puerta de verificación", truth: "alcance · evidencia · estado" },
      ],
    },
    act4: {
      h: "Apruebe la ejecución. Conserve el estándar.",
      accent: "Conserve el estándar.",
      sub: "Usted aprueba el resultado, los límites y el precio fijo. La ejecución terminada registra el proceso en un estándar escrito, en vez de dejarlo disperso entre prompts, archivos y traspasos.",
      chips: ["Un responsable", "Estándar operativo", "Ruta de excepciones", "Resultado verificado"],
      cta: "Describa lo que necesita",
      ctaNote: "Early Access — usted aprueba el alcance y el precio fijo antes de que empiece cualquier trabajo.",
    },
    review: {
      h: "Criterio humano donde importa.",
      accent: "Criterio humano",
      sub: "Antes de la entrega, una persona revisa el trabajo contra el alcance aprobado y resuelve lo que el sistema no pudo confirmar.",
      standard: "Alcance aprobado",
      draft: "Resultado en curso",
      evidence: "Evidencia de apoyo",
      exception: "Problema resuelto",
      mark: "Revisión humana completa",
    },
    sealed: {
      h: "Terminado. Verificado. Listo para usar.",
      accent: "Listo para usar.",
      seal: "ENTREGA ENDVERA",
      chips: ["Resultado terminado", "Alcance verificado", "Evidencia incluida", "Listo para usar"],
    },
    outcomes: {
      h: "Una sola puerta. Muchos resultados terminados.",
      accent: "resultados terminados.",
      lede: "Un sitio web, una decisión de mercado, una presentación de ventas o una operación compleja: todo empieza por el resultado, no por las herramientas.",
      example: "Resultado ilustrativo",
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
          title: "Una operación compleja, estandarizada",
          request: "un proceso de varios pasos que sigue fallando",
          coordinated: "admisión, transformación, gestión de excepciones, revisión humana",
          delivered: "un estándar operativo aprobado que documenta alcance, controles, evidencia y excepciones",
        },
      ],
    },
    artifact: { request: "Su solicitud", locked: "Alcance congelado", checked: "Resultado verificado" },
    srStory:
      "Un proceso exigente se convierte en un alcance escrito. Un núcleo de coordinación conduce la primera ejecución por modelos de IA, herramientas, trabajo en navegador, sistemas aprobados, criterio humano y verificación. La ejecución aprobada registra su estándar operativo.",
  },
  tl: {
    act1: {
      h: "Digital na trabaho, tapos na.",
      accent: "tapos na.",
      sub: "Ibigay sa amin ang mabigat na business workflow. Itatakda at iko-coordinate namin ang run end to end, saka itatala ang aprubadong scope, checks at exception path bilang operating standard.",
      placeholder: "Ilarawan ang workflow o resultang kailangan mo…",
      note: "Walang ipinapadala o sine-save ang demo field na ito.",
    },
    instrument: {
      intake: "Request 01",
      awaiting: "Handang tumanggap",
      receiving: "Tinatanggap",
      manifestTitle: "Isang workflow · managed end to end",
      manifest: ["AI models", "Software at tools", "Browser work", "Human expertise", "Final verification"],
    },
    solution: {
      eyebrow: "ENDVERA",
      h: "Ang aprubadong run ang nagiging standard.",
      accent: "nagiging standard.",
      sub: "Itinatala ng unang aprubadong run ang scope, quality bar, evidence at exception path sa iisang operating standard.",
    },
    engine: {
      title: "Coordination core · first run",
      handoff: "Pumapasok ang workflow sa isang managed run.",
      boundary: "Operating boundary",
      boundaryItems: ["Naka-scope ang workflow", "Nakasulat ang quality bar", "Fixed ang presyo at access"],
      core: "ENDVERA CORE",
      coreSub: "Dinadala ang bawat hakbang, inaako ang handoffs at inilalabas ang exceptions",
      evidence: "Bumabalik sa core ang evidence at exceptions",
      verification: "Sinuri laban sa aprubadong standard",
      result: "Aprubadong resulta",
      standardStatus: "EARLY ACCESS · OPERATING STANDARD",
      continuity: ["First run", "Naitala ang checks", "Operating standard"],
      continuitySub: "Scope, checks, evidence at exceptions—naitala sa iisang operating standard.",
    },
    exampleIntro: "Tingnan ang maihahatid ng isang managed workflow.",
    act2: {
      h: "Ibigay ang workflow, hindi panibagong task.",
      accent: "workflow",
      sub: "Prompts, tools, files, handoffs at review ang umuubos sa oras ng team sa tuwing nagsisimula ulit ang trabaho. Inaako ng ENDVERA ang buong landas hanggang sa beripikadong resulta.",
      fragments: [
        { label: "AI models", meta: "magkasalungat na versions" },
        { label: "Browser task", meta: "tumigil sa gitna" },
        { label: "Tool output", meta: "raw file · hindi magamit" },
        { label: "Handoff", meta: "walang may-ari" },
        { label: "Quality check", meta: "hindi nakatalaga" },
        { label: "Unknown", meta: "kailangan ng judgment" },
      ],
    },
    act3: {
      h: "AI, software at tao. Isang managed workflow.",
      accent: "Isang managed workflow.",
      stations: [
        { name: "AI models", truth: "reason · compare · draft" },
        { name: "Software at tools", truth: "create · transform · validate" },
        { name: "Browser work", truth: "research · approved interfaces" },
        { name: "Approved systems", truth: "authorized records · admin steps" },
        { name: "Human judgment", truth: "exceptions · decisions" },
        { name: "Verification gate", truth: "scope · evidence · status" },
      ],
    },
    act4: {
      h: "Aprubahan ang run. Panatilihin ang standard.",
      accent: "Panatilihin ang standard.",
      sub: "Inaaprubahan mo ang resulta, boundaries at fixed na presyo. Itinatala ng tapos na run ang proseso sa nakasulat na standard sa halip na manatili itong hiwa-hiwalay sa prompts, files at handoffs.",
      chips: ["Iisang responsable", "Operating standard", "Exception path", "Beripikadong resulta"],
      cta: "Ilarawan ang kailangan mo",
      ctaNote: "Early Access — inaaprubahan mo ang saklaw at ang fixed na presyo bago magsimula ang anumang trabaho.",
    },
    review: {
      h: "Human judgment kung saan mahalaga.",
      accent: "Human judgment",
      sub: "Bago ihatid, sinusuri ng isang tao ang trabaho laban sa aprubadong scope at nilulutas ang hindi nakumpirma ng system.",
      standard: "Aprubadong scope",
      draft: "Working result",
      evidence: "Supporting evidence",
      exception: "Nalutas ang issue",
      mark: "Tapos ang human review",
    },
    sealed: {
      h: "Tapos. Siniyasat. Handa nang gamitin.",
      accent: "Handa nang gamitin.",
      seal: "ENDVERA DELIVERY",
      chips: ["Tapos na resulta", "Nasuri ang scope", "May ebidensya", "Handa nang gamitin"],
    },
    outcomes: {
      h: "Isang pinto. Maraming tapos na resulta.",
      accent: "tapos na resulta.",
      lede: "Website, market decision, sales deck o complex operation—lahat ay nagsisimula sa resulta, hindi sa mga tool.",
      example: "Halimbawang resulta",
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
          title: "Isang complex operation, may standard",
          request: "multi-step process na laging may sabit",
          coordinated: "intake, transformation, pag-aayos ng exception, review ng tao",
          delivered: "aprubadong operating standard na nagtatala ng scope, checks, evidence at exceptions",
        },
      ],
    },
    artifact: { request: "Ang iyong kahilingan", locked: "Nakapirmi ang saklaw", checked: "Beripikadong resulta" },
    srStory:
      "Nagiging nakasulat na scope ang mabigat na workflow. Dinadala ng coordination core ang first run sa AI models, tools, browser work, approved systems, human judgment at verification. Itinatala ng aprubadong run ang operating standard nito.",
  },
};
