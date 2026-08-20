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
      h: "Give ENDVERA the workflow. Get the finished result.",
      sub: "ENDVERA coordinates AI, software, browser work, authorized systems and human judgment. A person verifies the result before you receive it—finished and documented.",
      placeholder: "Describe the result you need…",
      note: "Nothing typed here is sent, stored or recorded.",
    },
    solution: { h: "ENDVERA coordinates the work.", sub: "You hand over a bounded request. ENDVERA coordinates the approved path; A2 explains the flow and the human verification step." },
    exampleIntro: "One real request, end to end.",
    act2: {
      h: "AI, tools and people should not be yours to manage.",
      gauntlet: ["which prompt?", "which tool?", "who takes it?", "handoff lost", "who re-checks?"],
    },
    act3: {
      h: "ENDVERA coordinates the scoped workflow, routes exceptions, and sends the result to a person for verification.",
      stations: [
        { name: "Scope", truth: "written scope · one fixed price" },
        { name: "Execution", truth: "managed to the written standard" },
        { name: "Review", truth: "a person reviews the delivery" },
        { name: "Delivery", truth: "result + evidence" },
      ],
    },
    act4: {
      h: "You receive one finished, documented result within the boundary you approved.",
      chips: ["One owner", "Written scope", "Fixed price", "Checked result"],
      cta: "Describe your result",
    },
    artifact: { request: "Your request", locked: "Scope locked", checked: "Checked result" },
    srStory: "Your request becomes a slip. ENDVERA freezes its boundary, coordinates AI, software, browser work, authorized systems and human judgment, then a person verifies the finished, documented result.",
  },
  fr: {
    act1: {
      h: "Confiez le workflow à ENDVERA. Recevez le résultat fini.",
      sub: "ENDVERA coordonne l’IA, les logiciels, le travail navigateur, les systèmes autorisés et le jugement humain. Une personne vérifie le résultat avant que vous le receviez—fini et documenté.",
      placeholder: "Décrivez le résultat qu'il vous faut…",
      note: "Rien de ce qui est tapé ici n'est envoyé, stocké ou enregistré.",
    },
    solution: { h: "ENDVERA coordonne le travail.", sub: "Vous remettez une demande bornée. ENDVERA coordonne le parcours approuvé; A2 explique le flux et l’étape de vérification humaine." },
    exampleIntro: "Une vraie demande, de bout en bout.",
    act2: {
      h: "IA, outils et personnes : ce n'est pas à vous de tout gérer.",
      gauntlet: ["quel prompt?", "quel outil?", "qui le prend?", "transfert perdu", "qui revérifie?"],
    },
    act3: {
      h: "ENDVERA coordonne le workflow cadré, dirige les imprévus et remet le résultat à une personne pour vérification.",
      stations: [
        { name: "Portée", truth: "portée écrite · un prix fixe" },
        { name: "Exécution", truth: "gérée selon le standard écrit" },
        { name: "Revue", truth: "une personne revoit la livraison" },
        { name: "Livraison", truth: "résultat + preuves" },
      ],
    },
    act4: {
      h: "Vous recevez un résultat fini et documenté dans la frontière que vous avez approuvée.",
      chips: ["Un responsable", "Portée écrite", "Prix fixe", "Résultat vérifié"],
      cta: "Décrivez votre résultat",
    },
    artifact: { request: "Votre demande", locked: "Portée gelée", checked: "Résultat vérifié" },
    srStory: "Votre demande devient un bordereau. ENDVERA gèle sa frontière, coordonne l’IA, les logiciels, le navigateur, les systèmes autorisés et le jugement humain, puis une personne vérifie le résultat fini et documenté.",
  },
  es: {
    act1: {
      h: "Entregue el flujo a ENDVERA. Reciba el resultado terminado.",
      sub: "ENDVERA coordina IA, software, trabajo de navegador, sistemas autorizados y criterio humano. Una persona verifica el resultado antes de que usted lo reciba—terminado y documentado.",
      placeholder: "Describa el resultado que necesita…",
      note: "Nada de lo escrito aquí se envía, almacena o registra.",
    },
    solution: { h: "ENDVERA coordina el trabajo.", sub: "Usted entrega una solicitud acotada. ENDVERA coordina la ruta aprobada; A2 explica el flujo y la verificación humana." },
    exampleIntro: "Una solicitud real, de principio a fin.",
    act2: {
      h: "IA, herramientas y personas: usted no debería gestionarlas.",
      gauntlet: ["¿qué prompt?", "¿qué herramienta?", "¿quién lo toma?", "traspaso perdido", "¿quién reverifica?"],
    },
    act3: {
      h: "ENDVERA coordina el flujo delimitado, dirige las excepciones y envía el resultado a una persona para su verificación.",
      stations: [
        { name: "Alcance", truth: "alcance escrito · un precio fijo" },
        { name: "Ejecución", truth: "gestionada según el estándar escrito" },
        { name: "Revisión", truth: "una persona revisa la entrega" },
        { name: "Entrega", truth: "resultado + evidencia" },
      ],
    },
    act4: {
      h: "Recibe un resultado terminado y documentado dentro del límite que aprobó.",
      chips: ["Un responsable", "Alcance escrito", "Precio fijo", "Resultado verificado"],
      cta: "Describa su resultado",
    },
    artifact: { request: "Su solicitud", locked: "Alcance congelado", checked: "Resultado verificado" },
    srStory: "Su solicitud se convierte en un comprobante. ENDVERA congela el límite, coordina IA, software, navegador, sistemas autorizados y criterio humano; después una persona verifica el resultado terminado y documentado.",
  },
  tl: {
    act1: {
      h: "Ibigay ang workflow sa ENDVERA. Tanggapin ang tapos na resulta.",
      sub: "Kino-coordinate ng ENDVERA ang AI, software, browser work, mga awtorisadong system, at paghatol ng tao. Isang tao ang sumusuri sa resulta bago mo ito matanggap—tapos at dokumentado.",
      placeholder: "Ilarawan ang resultang kailangan mo…",
      note: "Walang tinatype dito ang ipinapadala, iniimbak o naitatala.",
    },
    solution: { h: "Kino-coordinate ng ENDVERA ang trabaho.", sub: "Ibigay mo ang isang nakatakdang kahilingan. Kino-coordinate ng ENDVERA ang aprubadong ruta; ipinapaliwanag ng A2 ang daloy at pagsusuri ng tao." },
    exampleIntro: "Isang totoong kahilingan, mula simula hanggang dulo.",
    act2: {
      h: "AI, tools at tao: hindi ikaw ang dapat mamahala.",
      gauntlet: ["aling prompt?", "aling tool?", "sino ang kukuha?", "nawalang handoff", "sino ang magre-recheck?"],
    },
    act3: {
      h: "Kino-coordinate ng ENDVERA ang nakatakdang workflow, dinadala ang mga exception, at ipinapasa ang resulta sa isang tao para suriin.",
      stations: [
        { name: "Saklaw", truth: "nakasulat na saklaw · isang fixed na presyo" },
        { name: "Execution", truth: "pinamamahalaan ayon sa nakasulat na pamantayan" },
        { name: "Review", truth: "taong nagrerebyu ng delivery" },
        { name: "Delivery", truth: "resulta + ebidensya" },
      ],
    },
    act4: {
      h: "Tumatanggap ka ng tapos at dokumentadong resulta sa loob ng hangganang inaprubahan mo.",
      chips: ["Isang may-ari", "Nakasulat na saklaw", "Fixed na presyo", "Beripikadong resulta"],
      cta: "Ilarawan ang iyong resulta",
    },
    artifact: { request: "Ang iyong kahilingan", locked: "Nakapirmi ang saklaw", checked: "Beripikadong resulta" },
    srStory: "Nagiging slip ang iyong kahilingan. Itinatakda ng ENDVERA ang hangganan, kino-coordinate ang AI, software, browser work, awtorisadong system at paghatol ng tao; pagkatapos ay sinusuri ng isang tao ang tapos at dokumentadong resulta.",
  },
};
