/* V7 - the four simplicity acts (direction C hybridized with A's hero).
   Four languages in strict parallel. Copy follows the founder direction;
   station truth-labels reuse the published operating vocabulary so the
   walk never claims autonomous execution. */

export type SiteLang = "en" | "fr" | "es" | "tl";

export type V7ActsCopy = {
  act1: { h: string; sub: string; placeholder: string; note: string };
  solution: { h: string; sub: string };
  exampleIntro: string;
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
      h: "Endvera gets digital work done for your business.",
      sub: "You describe the result. We coordinate the right AI, tools and people, check the work, and deliver it back.",
      placeholder: "Describe the result you need…",
      note: "Nothing typed here is sent, stored or recorded.",
    },
    solution: { h: "Endvera takes it from here.", sub: "You hand over the request. Endvera organizes everything it needs." },
    exampleIntro: "One real request, end to end.",
    act2: {
      h: "AI, tools and people should not be yours to manage.",
      gauntlet: ["which prompt?", "which tool?", "who takes it?", "handoff lost", "who re-checks?"],
    },
    act3: {
      h: "Endvera scopes the work, runs it, handles problems, and checks the result.",
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
    srStory: "Your request becomes a slip. Endvera receives it, freezes the scope, coordinates the execution, reviews the work, and returns it finished and checked.",
  },
  fr: {
    act1: {
      h: "Endvera fait faire votre travail numérique.",
      sub: "Vous décrivez le résultat. On coordonne IA, outils et personnes, on vérifie le travail et on vous le livre.",
      placeholder: "Décrivez le résultat qu'il vous faut…",
      note: "Rien de ce qui est tapé ici n'est envoyé, stocké ou enregistré.",
    },
    solution: { h: "Endvera s'en charge.", sub: "Vous remettez la demande. Endvera organise tout ce qu'il faut." },
    exampleIntro: "Une vraie demande, de bout en bout.",
    act2: {
      h: "IA, outils et personnes : ce n'est pas à vous de tout gérer.",
      gauntlet: ["quel prompt?", "quel outil?", "qui le prend?", "transfert perdu", "qui revérifie?"],
    },
    act3: {
      h: "Endvera cadre le travail, l'exécute, gère les imprévus et vérifie le résultat.",
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
    srStory: "Votre demande devient un bordereau. Endvera le reçoit, gèle la portée, coordonne l'exécution, revoit le travail et vous le rend fini et vérifié.",
  },
  es: {
    act1: {
      h: "Endvera se encarga de su trabajo digital.",
      sub: "Usted describe el resultado. Coordinamos la IA, las herramientas y las personas adecuadas, verificamos el trabajo y se lo entregamos.",
      placeholder: "Describa el resultado que necesita…",
      note: "Nada de lo escrito aquí se envía, almacena o registra.",
    },
    solution: { h: "Endvera se encarga.", sub: "Usted entrega la solicitud. Endvera organiza todo lo necesario." },
    exampleIntro: "Una solicitud real, de principio a fin.",
    act2: {
      h: "IA, herramientas y personas: usted no debería gestionarlas.",
      gauntlet: ["¿qué prompt?", "¿qué herramienta?", "¿quién lo toma?", "traspaso perdido", "¿quién reverifica?"],
    },
    act3: {
      h: "Endvera delimita el trabajo, lo ejecuta, resuelve imprevistos y verifica el resultado.",
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
    srStory: "Su solicitud se convierte en un comprobante. Endvera lo recibe, congela el alcance, coordina la ejecución, revisa el trabajo y se lo devuelve terminado y verificado.",
  },
  tl: {
    act1: {
      h: "Ipinapagawa ng Endvera ang iyong digital na trabaho.",
      sub: "Ilarawan mo ang resulta. Kinokoordina namin ang AI, tools at tao, sinusuri ang trabaho, at inihahatid ito sa iyo.",
      placeholder: "Ilarawan ang resultang kailangan mo…",
      note: "Walang tinatype dito ang ipinapadala, iniimbak o naitatala.",
    },
    solution: { h: "Ang Endvera na ang bahala.", sub: "Iabot mo ang kahilingan. Aayusin ng Endvera ang lahat ng kailangan." },
    exampleIntro: "Isang totoong kahilingan, mula simula hanggang dulo.",
    act2: {
      h: "AI, tools at tao: hindi ikaw ang dapat mamahala.",
      gauntlet: ["aling prompt?", "aling tool?", "sino ang kukuha?", "nawalang handoff", "sino ang magre-recheck?"],
    },
    act3: {
      h: "Sinasaklaw ng Endvera ang trabaho, pinapatakbo, inaayos ang aberya, sinusuri ang resulta.",
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
    srStory: "Nagiging slip ang iyong kahilingan. Tinatanggap ito ng Endvera, nagyeyelo ng saklaw, nag-uugnay ng execution, nirerebyu ang trabaho, at ibinabalik itong tapos at beripikado.",
  },
};
