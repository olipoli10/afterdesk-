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
      h: "Getting work done should not mean managing AI, tools, freelancers, handoffs and quality control yourself.",
      gauntlet: ["which prompt?", "which tool?", "who takes it?", "handoff lost", "who re-checks?"],
    },
    act3: {
      h: "AfterDesk freezes the scope, coordinates the work, handles exceptions and checks the result before it reaches you.",
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
      h: "Faire faire le travail ne devrait pas vouloir dire gérer soi-même l'IA, les outils, les pigistes, les transferts et le contrôle qualité.",
      gauntlet: ["quel prompt?", "quel outil?", "qui le prend?", "transfert perdu", "qui revérifie?"],
    },
    act3: {
      h: "AfterDesk gèle la portée, coordonne le travail, gère les exceptions et vérifie le résultat avant qu'il vous parvienne.",
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
      h: "Hacer el trabajo no debería significar gestionar usted mismo la IA, las herramientas, los freelancers, los traspasos y el control de calidad.",
      gauntlet: ["¿qué prompt?", "¿qué herramienta?", "¿quién lo toma?", "traspaso perdido", "¿quién reverifica?"],
    },
    act3: {
      h: "AfterDesk congela el alcance, coordina el trabajo, gestiona las excepciones y verifica el resultado antes de que le llegue.",
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
      h: "Ang pagpapagawa ng trabaho ay hindi dapat mangahulugan ng pamamahala mo mismo sa AI, mga tool, freelancer, handoff at quality control.",
      gauntlet: ["aling prompt?", "aling tool?", "sino ang kukuha?", "nawalang handoff", "sino ang magre-recheck?"],
    },
    act3: {
      h: "Nagyeyelo ang AfterDesk ng saklaw, nag-uugnay ng trabaho, humahawak ng exception at sinusuri ang resulta bago ito umabot sa iyo.",
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
    srStory: "Nagiging slip ang iyong kahilingan. Tinatanggap ito ng AfterDesk, nagyeyelo ng saklaw, nag-uugnay ng execution, nirerebyu ang trabaho, at ibinabalik itong tapos at beripikado.",
  },
};
