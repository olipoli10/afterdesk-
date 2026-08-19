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
  engine: { title: string };
  exampleIntro: string;
  act2: AccentedCopy & { sub: string; fragments: [Fragment, Fragment, Fragment, Fragment, Fragment, Fragment] };
  act3: AccentedCopy & { stations: [Station, Station, Station, Station, Station, Station] };
  act4: AccentedCopy & { chips: [string, string, string, string]; cta: string; ctaNote: string };
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
      sub: "Describe the result. We coordinate the right AI models, tools, browser work and people—then check it against the brief before delivery.",
      placeholder: "Describe the result you need…",
      note: "This demo field does not send or save anything.",
    },
    instrument: {
      intake: "Request intake 01",
      awaiting: "Ready for a request",
      receiving: "Receiving",
      manifestTitle: "One request · one coordinated run",
      manifest: ["AI models", "Software & tools", "Browser work", "Human expertise", "Final verification"],
    },
    solution: {
      eyebrow: "ENDVERA",
      h: "One engine coordinates the whole run.",
      accent: "whole run.",
      sub: "Your request becomes a written scope. The engine selects the right capabilities, manages execution and exceptions, then routes the result for review.",
    },
    engine: { title: "Coordination engine · live run" },
    exampleIntro: "See what one request can become.",
    act2: {
      h: "The work breaks between the tools.",
      accent: "between the tools.",
      sub: "Choosing models, moving files, chasing handoffs and checking the output should not be your job.",
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
      h: "AI, software and people. One coordinated run.",
      accent: "One coordinated run.",
      stations: [
        { name: "Scope", truth: "defines the result, limits and fixed price" },
        { name: "AI models", truth: "chooses and combines the right capabilities" },
        { name: "Tools", truth: "creates, transforms and validates the work" },
        { name: "Browser", truth: "works across approved web interfaces" },
        { name: "Human expertise", truth: "handles judgment, exceptions and edge cases" },
        { name: "Verification", truth: "checks the result against the approved scope" },
      ],
    },
    act4: {
      h: "Approve the outcome—not the hours.",
      accent: "outcome",
      chips: ["One owner", "Written scope", "Fixed price", "Checked result"],
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
      lede: "A website, a market decision, a sales deck or a recurring operation—each starts with the result, not the tools.",
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
          title: "A recurring operation, organized",
          request: "a monthly process that stops leaking",
          coordinated: "intake, transformation, exception handling, human review",
          delivered: "a documented, repeatable run — set up and handed over",
        },
      ],
    },
    artifact: { request: "Your request", locked: "Scope locked", checked: "Checked result" },
    srStory:
      "Your request becomes a written scope. One coordination engine carries it through AI models, tools, browser work, human expertise and verification. A person checks the result against the approved scope before it returns finished and ready to use.",
  },
  fr: {
    act1: {
      h: "Votre travail numérique, terminé.",
      accent: "terminé.",
      sub: "Décrivez le résultat. Nous coordonnons les bons modèles d'IA, outils, actions dans le navigateur et spécialistes, puis vérifions le tout selon le mandat avant de vous le livrer.",
      placeholder: "Décrivez le résultat qu'il vous faut…",
      note: "Ce champ de démonstration n'envoie et n'enregistre rien.",
    },
    instrument: {
      intake: "Demande 01",
      awaiting: "Prêt à recevoir",
      receiving: "Réception",
      manifestTitle: "Une demande · une exécution coordonnée",
      manifest: ["Modèles d'IA", "Logiciels et outils", "Travail navigateur", "Expertise humaine", "Vérification finale"],
    },
    solution: {
      eyebrow: "ENDVERA",
      h: "Un moteur coordonne toute l'exécution.",
      accent: "toute l'exécution.",
      sub: "Votre demande devient un mandat écrit. Le moteur choisit les bonnes capacités, gère l'exécution et les exceptions, puis achemine le résultat en révision.",
    },
    engine: { title: "Moteur de coordination · exécution active" },
    exampleIntro: "Voyez ce qu'une seule demande peut devenir.",
    act2: {
      h: "Le travail se perd entre les outils.",
      accent: "entre les outils.",
      sub: "Choisir les modèles, déplacer les fichiers, relancer les transferts et vérifier la sortie ne devrait pas être votre travail.",
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
      h: "IA, logiciels et humains. Une seule exécution coordonnée.",
      accent: "Une seule exécution coordonnée.",
      stations: [
        { name: "Portée", truth: "définit le résultat, les limites et le prix fixe" },
        { name: "Modèles d'IA", truth: "choisit et combine les bonnes capacités" },
        { name: "Outils", truth: "crée, transforme et valide le travail" },
        { name: "Navigateur", truth: "agit dans les interfaces Web approuvées" },
        { name: "Expertise humaine", truth: "gère le jugement, les exceptions et les cas limites" },
        { name: "Vérification", truth: "vérifie le résultat contre la portée approuvée" },
      ],
    },
    act4: {
      h: "Approuvez le résultat, pas les heures.",
      accent: "résultat",
      chips: ["Un responsable", "Portée écrite", "Prix fixe", "Résultat vérifié"],
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
      lede: "Un site Web, une décision de marché, une présentation de vente ou une opération récurrente : tout commence par le résultat, pas par les outils.",
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
          title: "Une opération récurrente, organisée",
          request: "un processus mensuel qui cesse de fuir",
          coordinated: "admission, transformation, gestion des exceptions, revue humaine",
          delivered: "une course documentée et répétable — mise en place et remise",
        },
      ],
    },
    artifact: { request: "Votre demande", locked: "Portée gelée", checked: "Résultat vérifié" },
    srStory:
      "Votre demande devient une portée écrite. Un moteur de coordination la conduit à travers modèles d'IA, outils, travail navigateur, expertise humaine et vérification. Une personne vérifie le résultat contre la portée approuvée avant qu'il revienne fini et prêt à utiliser.",
  },
  es: {
    act1: {
      h: "Trabajo digital, terminado.",
      accent: "terminado.",
      sub: "Describa el resultado. Coordinamos los modelos de IA, herramientas, trabajo en navegador y personas adecuados; luego lo verificamos contra el encargo antes de entregarlo.",
      placeholder: "Describa el resultado que necesita…",
      note: "Este campo de demostración no envía ni guarda nada.",
    },
    instrument: {
      intake: "Solicitud 01",
      awaiting: "Listo para recibir",
      receiving: "Recibiendo",
      manifestTitle: "Una solicitud · una ejecución coordinada",
      manifest: ["Modelos de IA", "Software y herramientas", "Trabajo en navegador", "Experiencia humana", "Verificación final"],
    },
    solution: {
      eyebrow: "ENDVERA",
      h: "Un motor coordina toda la ejecución.",
      accent: "toda la ejecución.",
      sub: "Su solicitud se convierte en un alcance escrito. El motor elige las capacidades adecuadas, gestiona la ejecución y las excepciones, y encamina el resultado a revisión.",
    },
    engine: { title: "Motor de coordinación · ejecución activa" },
    exampleIntro: "Vea en qué puede convertirse una solicitud.",
    act2: {
      h: "El trabajo se rompe entre las herramientas.",
      accent: "entre las herramientas.",
      sub: "Elegir modelos, mover archivos, perseguir traspasos y verificar la salida no debería ser su trabajo.",
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
      h: "IA, software y personas. Una ejecución coordinada.",
      accent: "Una ejecución coordinada.",
      stations: [
        { name: "Alcance", truth: "define el resultado, los límites y el precio fijo" },
        { name: "Modelos de IA", truth: "elige y combina las capacidades adecuadas" },
        { name: "Herramientas", truth: "crea, transforma y valida el trabajo" },
        { name: "Navegador", truth: "trabaja en interfaces web aprobadas" },
        { name: "Experiencia humana", truth: "resuelve criterios, excepciones y casos límite" },
        { name: "Verificación", truth: "comprueba el resultado contra el alcance aprobado" },
      ],
    },
    act4: {
      h: "Apruebe el resultado, no las horas.",
      accent: "resultado",
      chips: ["Un responsable", "Alcance escrito", "Precio fijo", "Resultado verificado"],
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
      lede: "Un sitio web, una decisión de mercado, una presentación de ventas o una operación recurrente: todo empieza por el resultado, no por las herramientas.",
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
          title: "Una operación recurrente, organizada",
          request: "un proceso mensual que deje de fallar",
          coordinated: "admisión, transformación, gestión de excepciones, revisión humana",
          delivered: "una ejecución documentada y repetible — montada y entregada",
        },
      ],
    },
    artifact: { request: "Su solicitud", locked: "Alcance congelado", checked: "Resultado verificado" },
    srStory:
      "Su solicitud se convierte en un alcance escrito. Un motor de coordinación la conduce por modelos de IA, herramientas, trabajo en navegador, experiencia humana y verificación. Una persona comprueba el resultado contra el alcance aprobado antes de que vuelva terminado y listo para usar.",
  },
  tl: {
    act1: {
      h: "Digital na trabaho, tapos na.",
      accent: "tapos na.",
      sub: "Ilarawan ang resulta. Kinokoordina namin ang tamang AI models, tools, browser work at mga tao, saka sinusuri laban sa brief bago ihatid.",
      placeholder: "Ilarawan ang resultang kailangan mo…",
      note: "Walang ipinapadala o sine-save ang demo field na ito.",
    },
    instrument: {
      intake: "Request 01",
      awaiting: "Handang tumanggap",
      receiving: "Tinatanggap",
      manifestTitle: "Isang request · isang coordinated run",
      manifest: ["AI models", "Software at tools", "Browser work", "Human expertise", "Final verification"],
    },
    solution: {
      eyebrow: "ENDVERA",
      h: "Isang engine ang nagkokoordina ng buong run.",
      accent: "buong run.",
      sub: "Nagiging nakasulat na scope ang request. Pinipili ng engine ang tamang kakayahan, pinamamahalaan ang execution at exceptions, saka dinadala ang resulta sa review.",
    },
    engine: { title: "Coordination engine · active run" },
    exampleIntro: "Tingnan kung ano ang kayang maging resulta ng isang request.",
    act2: {
      h: "Nasira ang trabaho sa pagitan ng mga tool.",
      accent: "sa pagitan ng mga tool.",
      sub: "Hindi dapat ikaw ang pumili ng models, maglipat ng files, humabol sa handoffs at magsuri ng output.",
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
      h: "AI, software at tao. Isang coordinated run.",
      accent: "Isang coordinated run.",
      stations: [
        { name: "Scope", truth: "itinatakda ang resulta, limitasyon at fixed price" },
        { name: "AI models", truth: "pinipili at pinagsasama ang tamang kakayahan" },
        { name: "Tools", truth: "gumagawa, nagbabago at nagva-validate ng trabaho" },
        { name: "Browser", truth: "gumagawa sa aprubadong web interfaces" },
        { name: "Human expertise", truth: "humahawak ng judgment, exceptions at edge cases" },
        { name: "Verification", truth: "sinusuri ang resulta laban sa aprubadong scope" },
      ],
    },
    act4: {
      h: "Aprubahan ang resulta, hindi ang oras.",
      accent: "resulta",
      chips: ["Isang may-ari", "Nakasulat na saklaw", "Fixed na presyo", "Beripikadong resulta"],
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
      lede: "Website, market decision, sales deck o recurring operation—lahat ay nagsisimula sa resulta, hindi sa mga tool.",
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
          title: "Isang paulit-ulit na operasyon, inayos",
          request: "buwanang proseso na hindi na butas-butas",
          coordinated: "intake, transformation, pag-aayos ng exception, review ng tao",
          delivered: "dokumentado at nauulit na takbo — inihanda at ibinigay",
        },
      ],
    },
    artifact: { request: "Ang iyong kahilingan", locked: "Nakapirmi ang saklaw", checked: "Beripikadong resulta" },
    srStory:
      "Nagiging nakasulat na scope ang iyong request. Dinadala ito ng coordination engine sa AI models, tools, browser work, human expertise at verification. Sinusuri ng isang tao ang resulta laban sa aprubadong scope bago ito bumalik na tapos at handa nang gamitin.",
  },
};
