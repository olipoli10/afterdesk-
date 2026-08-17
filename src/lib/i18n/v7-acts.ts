/* V7 - the four simplicity acts (direction C hybridized with A's hero).
   Four languages in strict parallel. Copy follows the founder direction;
   station truth-labels reuse the published operating vocabulary so the
   walk never claims autonomous execution. */

export type SiteLang = "en" | "fr" | "es" | "tl";

export type V7ActsCopy = {
  act1: { h: string; sub: string; placeholder: string; note: string };
  act2: { h: string; gauntlet: [string, string, string, string, string] };
  act3: {
    h: string;
    stations: [
      { name: string; truth: string },
      { name: string; truth: string },
      { name: string; truth: string },
      { name: string; truth: string },
    ];
  };
  act4: { h: string; chips: [string, string, string, string]; cta: string };
  artifact: { request: string; locked: string; checked: string };
  srStory: string;
};

export const V7_ACTS_I18N: Record<SiteLang, V7ActsCopy> = {
  en: {
    act1: {
      h: "You describe the result. We handle the rest.",
      sub: "AfterDesk turns one request into finished, checked work.",
      placeholder: "Describe the result you need…",
      note: "Nothing typed here is sent, stored or recorded.",
    },
    act2: {
      h: "AI, tools, people, handoffs. You should not have to manage them.",
      gauntlet: ["which prompt?", "which tool?", "who takes it?", "handoff lost", "who re-checks?"],
    },
    act3: {
      h: "AfterDesk scopes the work, runs it, handles problems, and checks the result.",
      stations: [
        { name: "Scope", truth: "written scope · one fixed price" },
        { name: "Execution", truth: "managed to the written standard" },
        { name: "Review", truth: "a person reviews the delivery" },
        { name: "Delivery", truth: "result + evidence" },
      ],
    },
    act4: {
      h: "You are not buying another tool or a block of hours. You approve one result and one fixed boundary.",
      chips: ["One owner", "Written scope", "Fixed price", "Checked result"],
      cta: "Describe your result",
    },
    artifact: { request: "Your request", locked: "Scope locked", checked: "Checked result" },
    srStory: "Your request becomes a slip. AfterDesk receives it, freezes the scope, coordinates the execution, reviews the work, and returns it finished and checked.",
  },
  fr: {
    act1: {
      h: "Vous décrivez le résultat. On s'occupe du reste.",
      sub: "AfterDesk transforme une demande en travail fini et vérifié.",
      placeholder: "Décrivez le résultat qu'il vous faut…",
      note: "Rien de ce qui est tapé ici n'est envoyé, stocké ou enregistré.",
    },
    act2: {
      h: "IA, outils, personnes, transferts. Ce n'est pas à vous de les gérer.",
      gauntlet: ["quel prompt?", "quel outil?", "qui le prend?", "transfert perdu", "qui revérifie?"],
    },
    act3: {
      h: "AfterDesk cadre le travail, l'exécute, gère les imprévus et vérifie le résultat.",
      stations: [
        { name: "Portée", truth: "portée écrite · un prix fixe" },
        { name: "Exécution", truth: "gérée selon le standard écrit" },
        { name: "Revue", truth: "une personne revoit la livraison" },
        { name: "Livraison", truth: "résultat + preuves" },
      ],
    },
    act4: {
      h: "Vous n'achetez ni un autre outil ni un bloc d'heures. Vous approuvez un résultat et une frontière fixe.",
      chips: ["Un responsable", "Portée écrite", "Prix fixe", "Résultat vérifié"],
      cta: "Décrivez votre résultat",
    },
    artifact: { request: "Votre demande", locked: "Portée gelée", checked: "Résultat vérifié" },
    srStory: "Votre demande devient un bordereau. AfterDesk le reçoit, gèle la portée, coordonne l'exécution, revoit le travail et vous le rend fini et vérifié.",
  },
  es: {
    act1: {
      h: "Usted describe el resultado. Nosotros nos encargamos del resto.",
      sub: "AfterDesk convierte una solicitud en trabajo terminado y verificado.",
      placeholder: "Describa el resultado que necesita…",
      note: "Nada de lo escrito aquí se envía, almacena o registra.",
    },
    act2: {
      h: "IA, herramientas, personas, traspasos. Gestionarlos no es su trabajo.",
      gauntlet: ["¿qué prompt?", "¿qué herramienta?", "¿quién lo toma?", "traspaso perdido", "¿quién reverifica?"],
    },
    act3: {
      h: "AfterDesk delimita el trabajo, lo ejecuta, resuelve imprevistos y verifica el resultado.",
      stations: [
        { name: "Alcance", truth: "alcance escrito · un precio fijo" },
        { name: "Ejecución", truth: "gestionada según el estándar escrito" },
        { name: "Revisión", truth: "una persona revisa la entrega" },
        { name: "Entrega", truth: "resultado + evidencia" },
      ],
    },
    act4: {
      h: "No está comprando otra herramienta ni un bloque de horas. Aprueba un resultado y un límite fijo.",
      chips: ["Un responsable", "Alcance escrito", "Precio fijo", "Resultado verificado"],
      cta: "Describa su resultado",
    },
    artifact: { request: "Su solicitud", locked: "Alcance congelado", checked: "Resultado verificado" },
    srStory: "Su solicitud se convierte en un comprobante. AfterDesk lo recibe, congela el alcance, coordina la ejecución, revisa el trabajo y se lo devuelve terminado y verificado.",
  },
  tl: {
    act1: {
      h: "Ilarawan mo ang resulta. Kami ang bahala sa iba.",
      sub: "Ginagawa ng AfterDesk ang isang kahilingan na tapos at beripikadong trabaho.",
      placeholder: "Ilarawan ang resultang kailangan mo…",
      note: "Walang tinatype dito ang ipinapadala, iniimbak o naitatala.",
    },
    act2: {
      h: "AI, tools, tao, handoff. Hindi ikaw ang dapat mamahala ng lahat ng ito.",
      gauntlet: ["aling prompt?", "aling tool?", "sino ang kukuha?", "nawalang handoff", "sino ang magre-recheck?"],
    },
    act3: {
      h: "Sinasaklaw ng AfterDesk ang trabaho, pinapatakbo, inaayos ang aberya, sinusuri ang resulta.",
      stations: [
        { name: "Saklaw", truth: "nakasulat na saklaw · isang fixed na presyo" },
        { name: "Execution", truth: "pinamamahalaan ayon sa nakasulat na pamantayan" },
        { name: "Review", truth: "taong nagrerebyu ng delivery" },
        { name: "Delivery", truth: "resulta + ebidensya" },
      ],
    },
    act4: {
      h: "Hindi ka bumibili ng panibagong tool o bloke ng oras. Inaaprubahan mo ang isang resulta at isang tiyak na hangganan.",
      chips: ["Isang may-ari", "Nakasulat na saklaw", "Fixed na presyo", "Beripikadong resulta"],
      cta: "Ilarawan ang iyong resulta",
    },
    artifact: { request: "Ang iyong kahilingan", locked: "Nakapirmi ang saklaw", checked: "Beripikadong resulta" },
    srStory: "Nagiging slip ang iyong kahilingan. Tinatanggap ito ng AfterDesk, nagyeyelo ng saklaw, nag-uugnay ng execution, nirerebyu ang trabaho, at ibinabalik itong tapos at beripikado.",
  },
};
