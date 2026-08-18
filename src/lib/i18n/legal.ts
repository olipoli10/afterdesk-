/**
 * The five trust/policy pages — Security, Privacy, Terms, Acceptable use,
 * and the Ledger — in the same four languages and on the same shared
 * ss-lang-doc cookie/fallback chain as /about, /how-it-works and /services
 * (see docLangOf in ./docs and the LANG_COOKIE map in src/proxy.ts). They
 * had no i18n at all until now: English only, regardless of which language
 * the footer link that led here was rendered in — the exact gap a
 * from-the-source bug report caught.
 *
 * TERMINOLOGY, reused verbatim from the rest of the site rather than
 * reinvented: "opérateur"/"operador"/operator, "spécialiste"/"especialista"/
 * espesyalista, "révision"/"revisión" for the QC review, "fenêtre de
 * contestation"/"ventana de disputa" for the dispute window, "norme écrite"/
 * "estándar escrito" for the written standard, "autorisée, pas débitée"/
 * "autorizada, no cobrada" for the authorize-not-charge guarantee (all from
 * src/lib/i18n/client.ts and docs.ts). A term with no prior translation
 * anywhere on the site (refund, chargeback, subcontractor) gets a plain,
 * standard business-register choice in the same voice as everything around
 * it — never invented jargon.
 *
 * TAGALOG: the rest of the site's TL voice is Taglish — English nouns for
 * specific technical/legal concepts embedded in Tagalog sentence structure
 * (see docs.ts's own pTl: "Review" stays English even mid-Tagalog-sentence).
 * That convention is followed here too, rather than forcing a from-scratch
 * formal Tagalog legal glossary that risks a mistranslation. What changed
 * from before is that these pages now render real Tagalog sentences at all
 * — previously the fallback was the entire page in English.
 */

import type { DocLang } from "./docs";

export type { DocLang };

/* ═══════════════════════════════════════════════════════════════════════
   Shared across all four PolicyPage-wrapped pages (Security, Privacy,
   Terms, Acceptable use): the header's "How it works" link and the
   "Trust center · Updated …" stamp under the H1.
   ═══════════════════════════════════════════════════════════════════════ */

export const POLICY_NAV_HOW: Record<DocLang, string> = {
  en: "How it works",
  fr: "Comment ça marche",
  es: "Cómo funciona",
  tl: "Paano ito gumagana",
};

export const POLICY_TRUST_CENTER: Record<DocLang, string> = {
  en: "Trust center · Updated July 30, 2026",
  fr: "Centre de confiance · Mis à jour le 30 juillet 2026",
  es: "Centro de confianza · Actualizado el 30 de julio de 2026",
  tl: "Sentro ng tiwala · Na-update noong Hulyo 30, 2026",
};

/* ═══════════════════════════════════════════════════════════════════════
   SECURITY
   ═══════════════════════════════════════════════════════════════════════ */

type SecurityDict = {
  meta: { title: string; description: string };
  title: string;
  intro: string;
  access: { h2: string; body: string };
  /**
   * Added when the execution engine went live. The page described a world
   * where only people touched the work, and a reader could reasonably conclude
   * that nothing left Endvera and Stripe. Automated steps now start on the
   * payment webhook, before any human sees the task.
   */
  automation: { h2: string; body: string };
  files: { h2: string; body1: string; body2: string };
  payments: { h2: string; body: string };
  reporting: { h2: string; pre: string; post: string };
};

export const SECURITY_I18N: Record<DocLang, SecurityDict> = {
  en: {
    meta: {
      title: "Security",
      description:
        "How Endvera protects the files you send: uploads are inspected and scrubbed of author metadata, access ends with the task, and every delivery is reviewed by one operator before it reaches you.",
    },
    title: "Security",
    intro:
      "The identity wall, payment gate and quality review are enforced at the data and transaction layers, not only hidden in the interface.",
    access: {
      h2: "Access and identity",
      body: "Every protected read and mutation rechecks the signed-in user, role and resource ownership. Password accounts must verify their email. Workers lose task-file access as soon as a task leaves their hands or their approval is suspended.",
    },
    automation: {
      h2: "Automated processing",
      body: "Some tasks run automated steps after payment, before a person is involved. Those steps are restricted to an allowlist held in our code: they can read, search and prepare, and none of them can send a message, sign in anywhere, buy anything or write into a client's system. Each research step is capped at a fixed number of searches and is blocked from a named list of data-broker and profile-scraping domains. Each contract carries its own spending ceiling, fixed when you approved the price and unchangeable afterwards, and the run stops and alerts an operator rather than exceed it. Whatever produced the work, the delivery is still reviewed before it is released to you.",
    },
    files: {
      h2: "Files",
      body1: "Uploads are size-limited, signature-checked, hashed and unavailable until scanning passes. Office documents with macros, external relationships, comments, hidden sheets or embedded objects are refused. Common author metadata is removed from Office and image files. Production scanning fails closed when the malware service is unavailable.",
      body2: "No automated system can remove identifying information written into the visible content itself. Clients and workers must remove names, contacts and account identifiers before upload; the operator performs a second content review before release.",
    },
    payments: {
      h2: "Payments and audit",
      body: "Card details are collected by Stripe. No work on a task begins until the approved amount is confirmed as received, by a signed payment webhook or by an operator recording a transfer. State changes, payouts, refunds and administrative decisions are recorded with idempotency controls and database-enforced invariants.",
    },
    reporting: {
      h2: "Reporting",
      pre: "Report a suspected vulnerability to",
      post: ". Do not access other users’ data or disrupt the service while testing.",
    },
  },
  fr: {
    meta: {
      title: "Sécurité",
      description:
        "Comment Endvera protège les fichiers que vous envoyez : les téléversements sont inspectés et nettoyés de leurs métadonnées d'auteur, l'accès prend fin avec la tâche, et chaque livraison est vérifiée par un opérateur avant de vous parvenir.",
    },
    title: "Sécurité",
    intro:
      "Le mur d'identité, la barrière de paiement et la révision qualité sont appliqués au niveau des données et des transactions, pas seulement cachés dans l'interface.",
    access: {
      h2: "Accès et identité",
      body: "Chaque lecture et modification protégée revérifie l'utilisateur connecté, son rôle et la propriété de la ressource. Les comptes par mot de passe doivent vérifier leur courriel. Un travailleur perd l'accès aux fichiers d'une tâche dès qu'elle quitte ses mains ou que son approbation est suspendue.",
    },
    automation: {
      h2: "Traitement automatisé",
      body: "Certaines tâches exécutent des étapes automatisées après le paiement, avant toute intervention humaine. Ces étapes sont limitées à une liste blanche inscrite dans notre code : elles peuvent lire, chercher et préparer, et aucune ne peut envoyer un message, se connecter quelque part, acheter quoi que ce soit ni écrire dans le système d'un client. Chaque étape de recherche est plafonnée à un nombre fixe de requêtes et bloquée sur une liste nommée de domaines de courtiers de données et de profils aspirés. Chaque contrat porte son propre plafond de dépense, fixé au moment où vous avez approuvé le prix et immuable ensuite ; l'exécution s'arrête et alerte un opérateur plutôt que de le dépasser. Quelle que soit la méthode, la livraison est révisée avant de vous être remise.",
    },
    files: {
      h2: "Fichiers",
      body1: "Les téléversements sont limités en taille, vérifiés par signature, hachés et indisponibles tant que l'analyse n'est pas passée. Les documents Office avec macros, relations externes, commentaires, feuilles cachées ou objets intégrés sont refusés. Les métadonnées d'auteur courantes sont retirées des fichiers Office et images. En production, l'analyse échoue de façon fermée si le service antivirus est indisponible.",
      body2: "Aucun système automatisé ne peut retirer une information identifiante écrite dans le contenu visible lui-même. Clients et travailleurs doivent retirer noms, coordonnées et identifiants de compte avant le téléversement; l'opérateur effectue une seconde révision du contenu avant la remise.",
    },
    payments: {
      h2: "Paiements et audit",
      body: "Les détails de carte sont recueillis par Stripe. Aucun travail ne commence sur une tâche tant que le montant approuvé n'est pas confirmé comme reçu, par un webhook de paiement signé ou par un opérateur qui enregistre un virement. Les changements d'état, paiements, remboursements et décisions administratives sont enregistrés avec des contrôles d'idempotence et des invariants appliqués par la base de données.",
    },
    reporting: {
      h2: "Signalement",
      pre: "Signalez une vulnérabilité soupçonnée à",
      post: ". N'accédez pas aux données d'autres utilisateurs et ne perturbez pas le service pendant vos tests.",
    },
  },
  es: {
    meta: {
      title: "Seguridad",
      description:
        "Cómo protege Endvera los archivos que envías: las subidas se inspeccionan y se limpian de metadatos de autor, el acceso termina con la tarea, y cada entrega es revisada por un operador antes de llegar a ti.",
    },
    title: "Seguridad",
    intro:
      "El muro de identidad, la barrera de pago y la revisión de calidad se aplican en las capas de datos y transacciones, no solo ocultos en la interfaz.",
    access: {
      h2: "Acceso e identidad",
      body: "Cada lectura y modificación protegida vuelve a verificar al usuario conectado, su rol y la propiedad del recurso. Las cuentas con contraseña deben verificar su correo. Un trabajador pierde el acceso a los archivos de una tarea en cuanto esta sale de sus manos o se suspende su aprobación.",
    },
    automation: {
      h2: "Procesamiento automatizado",
      body: "Algunas tareas ejecutan pasos automatizados después del pago, antes de que intervenga una persona. Esos pasos se limitan a una lista blanca escrita en nuestro código: pueden leer, buscar y preparar, y ninguno puede enviar un mensaje, iniciar sesión en ningún sitio, comprar nada ni escribir en el sistema de un cliente. Cada paso de investigación tiene un tope fijo de búsquedas y está bloqueado para una lista nombrada de dominios de intermediarios de datos y de perfiles extraídos. Cada contrato lleva su propio límite de gasto, fijado cuando aprobaste el precio e inalterable después; la ejecución se detiene y avisa a un operador antes que superarlo. Sea cual sea el método, la entrega se revisa antes de llegar a ti.",
    },
    files: {
      h2: "Archivos",
      body1: "Las subidas tienen límite de tamaño, se verifican por firma, se calculan por hash y no están disponibles hasta pasar el escaneo. Se rechazan documentos de Office con macros, relaciones externas, comentarios, hojas ocultas u objetos incrustados. Se elimina el metadato de autor común de archivos de Office e imágenes. En producción, el escaneo falla de forma cerrada cuando el servicio antivirus no está disponible.",
      body2: "Ningún sistema automatizado puede eliminar información identificativa escrita en el propio contenido visible. Clientes y trabajadores deben eliminar nombres, contactos e identificadores de cuenta antes de subir el archivo; el operador realiza una segunda revisión de contenido antes de la entrega.",
    },
    payments: {
      h2: "Pagos y auditoría",
      body: "Stripe recopila los datos de la tarjeta. Ningún trabajo comienza en una tarea hasta que el monto aprobado se confirma como recibido, por un webhook de pago firmado o por un operador que registra una transferencia. Los cambios de estado, pagos, reembolsos y decisiones administrativas se registran con controles de idempotencia e invariantes aplicados por la base de datos.",
    },
    reporting: {
      h2: "Reportes",
      pre: "Reporta una vulnerabilidad sospechada a",
      post: ". No accedas a los datos de otros usuarios ni interrumpas el servicio mientras haces pruebas.",
    },
  },
  tl: {
    meta: {
      title: "Seguridad",
      description:
        "Paano pinoprotektahan ng Endvera ang mga file na ipinapadala mo: sinusuri at nililinis ang mga upload sa author metadata, natatapos ang access kasabay ng task, at sinusuri ng isang operator ang bawat delivery bago ito makarating sa iyo.",
    },
    title: "Seguridad",
    intro:
      "Ang identity wall, payment gate, at quality review ay ipinapatupad sa data at transaction layer, hindi lang nakatago sa interface.",
    access: {
      h2: "Access at identity",
      body: "Bawat protected na read at mutation ay muling sinusuri ang naka-sign-in na user, role, at ownership ng resource. Kailangang i-verify ng mga password account ang kanilang email. Nawawalan ng access ang isang worker sa mga file ng task sa sandaling umalis ito sa kanyang mga kamay o ma-suspend ang kanyang approval.",
    },
    automation: {
      h2: "Automated na pagproseso",
      body: "May mga task na nagpapatakbo ng automated na hakbang pagkatapos ng bayad, bago pa may taong sumali. Nakakulong ang mga hakbang na ito sa allowlist na nasa aming code: nakakabasa, nakakahanap at nakakapaghanda sila, at wala ni isa sa kanila ang makakapagpadala ng mensahe, makaka-sign in kahit saan, makakabili ng kahit ano, o makakasulat sa sistema ng kliyente. May takdang bilang ng paghahanap ang bawat research step at naka-block ito sa isang nakalistang mga domain ng data broker at scraped na profile. May sariling spending ceiling ang bawat kontrata, itinakda noong inaprubahan mo ang presyo at hindi na mababago; humihinto ang run at nag-a-alerto sa operator sa halip na lumampas. Anuman ang gumawa, sinusuri pa rin ang delivery bago ito ipadala sa iyo.",
    },
    files: {
      h2: "Mga File",
      body1: "May size limit ang mga upload, sini-signature-check, hina-hash, at hindi available hangga't hindi pumapasa sa scanning. Tinatanggihan ang mga Office document na may macro, external relationship, comment, hiding na sheet, o embedded object. Tinatanggal ang karaniwang author metadata sa Office at image file. Sa production, nabibigo nang closed ang scanning kapag hindi available ang malware service.",
      body2: "Walang automated system na makakatanggal ng identifying information na nakasulat mismo sa visible na content. Kailangang tanggalin ng mga client at worker ang mga pangalan, contact, at account identifier bago mag-upload; nagsasagawa ang operator ng pangalawang content review bago i-release.",
    },
    payments: {
      h2: "Mga Bayad at Audit",
      body: "Kinokolekta ng Stripe ang mga detalye ng card. Walang trabahong nagsisimula sa isang task hangga't hindi nakumpirmang natanggap ang inaprubahang halaga, sa pamamagitan ng signed payment webhook o ng operator na nagtala ng transfer. Naitatala ang mga pagbabago sa status, payout, refund, at desisyon ng admin gamit ang idempotency control at mga invariant na ipinapatupad ng database.",
    },
    reporting: {
      h2: "Pag-report",
      pre: "I-report ang pinaghihinalaang vulnerability sa",
      post: ". Huwag i-access ang data ng ibang user o gambalain ang serbisyo habang nagtetest.",
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   PRIVACY
   ═══════════════════════════════════════════════════════════════════════ */

type PrivacyDict = {
  meta: { title: string; description: string };
  title: string;
  intro: string;
  processed: { h2: string; body: string };
  used: { h2: string; body: string };
  providers: { h2: string; body: string };
  retention: { h2: string; pre: string; unit: string; mid: string; post: string };
};

export const PRIVACY_I18N: Record<DocLang, PrivacyDict> = {
  en: {
    meta: {
      title: "Privacy",
      description:
        "What Endvera collects, why, how long it is kept, and who can see it. The service is built so that client and worker do not learn each other's identity, and that separation is enforced in the data layer, not just the interface.",
    },
    title: "Privacy",
    intro:
      "We aim to collect no more than is needed to quote, perform, review, pay for and support a task.",
    processed: {
      h2: "Information processed",
      body: "Account details, task briefs, uploaded files, delivery files, payment references, quality decisions, security logs and support communications. Worker applications also include experience, specialties, availability and an optional work-sample URL.",
    },
    used: {
      h2: "How it is used",
      body: "To operate the task, prevent fraud, enforce the identity boundary, provide support, satisfy financial recordkeeping and improve aggregate service quality. Automated systems and AI providers are used across the task, not only at intake: to structure a draft brief, to classify and plan the work and prepare a price for an operator to approve, and — on some tasks after payment — to perform steps of the work itself, including automated web searches whose queries are derived from your brief and, where a task requires it, reading the files you attached. That reading is done by Endvera's own software, and it does not send the contents of your files to an AI provider. Human specialists carry out the work that automation cannot, and every delivery is reviewed by Endvera before it reaches you. Do not submit secrets that are unnecessary for the task.",
    },
    providers: {
      h2: "Service providers",
      body: "The configured infrastructure, database and object-storage providers process service data. Stripe processes card payments and Resend delivers transactional email. Anthropic processes the task text for intake, classification, planning, pricing preparation and, where a task is automated, execution steps; those steps can run web searches through that provider's own search tool. Voyage AI converts a task's title and description into a numeric representation used to find comparable past tasks when preparing a price; that representation stays in our database and is never sent on, and no text from another client's brief is ever used to price yours. Google processes sign-in for accounts that choose it. A task's title travels to Stripe as the payment line item, and text a specialist types into our internal assistant is processed by Anthropic. Each provider receives only the data needed for its function.",
    },
    retention: {
      h2: "Retention and requests",
      pre: "Uploaded and delivered task files are purged after the retention period shown in the task protocol, currently",
      unit: "days",
      mid: "The task record itself — its brief, its history and the numeric representation used for price comparison — is kept beyond that period. What a past mandate contributes to pricing a later one is measurement only: its category, its unit count, how long it took and what it cost. Its brief is not part of that. Financial, fraud-prevention and audit records may be retained longer where operational or legal obligations require it. For access, correction or deletion requests, email",
      post: ".",
    },
  },
  fr: {
    meta: {
      title: "Confidentialité",
      description:
        "Ce qu'Endvera recueille, pourquoi, combien de temps c'est conservé, et qui peut le voir. Le service est conçu pour que client et travailleur ne connaissent pas l'identité l'un de l'autre, et cette séparation est appliquée au niveau des données, pas seulement de l'interface.",
    },
    title: "Confidentialité",
    intro:
      "Nous visons à ne recueillir rien de plus que ce qui est nécessaire pour chiffrer, réaliser, réviser, payer et soutenir une tâche.",
    processed: {
      h2: "Information traitée",
      body: "Détails du compte, mandats de tâche, fichiers téléversés, fichiers de livraison, références de paiement, décisions de qualité, journaux de sécurité et communications de soutien. Les candidatures de travailleurs incluent aussi l'expérience, les spécialités, la disponibilité et une URL facultative d'échantillon de travail.",
    },
    used: {
      h2: "Comment c'est utilisé",
      body: "Pour réaliser la tâche, prévenir la fraude, appliquer la frontière d'identité, fournir du soutien, satisfaire aux obligations comptables et améliorer la qualité globale du service. Des systèmes automatisés et des fournisseurs d'IA interviennent tout au long de la tâche, pas seulement à la prise en charge : pour structurer un brouillon de brief, pour classer et planifier le travail et préparer un prix qu'un opérateur approuve, et — sur certaines tâches, après paiement — pour exécuter des étapes du travail, y compris des recherches web automatisées dont les requêtes dérivent de votre brief et, lorsque la tâche l'exige, la lecture des fichiers que vous avez joints. Cette lecture est faite par les logiciels d'Endvera, et elle n'envoie pas le contenu de vos fichiers à un fournisseur d'IA. Des spécialistes humains réalisent ce que l'automatisation ne peut pas faire, et chaque livraison est révisée par Endvera avant de vous parvenir. N'envoyez pas de secrets inutiles à la tâche.",
    },
    providers: {
      h2: "Fournisseurs de services",
      body: "Les fournisseurs configurés d'infrastructure, de base de données et de stockage d'objets traitent les données du service. Stripe traite les paiements par carte et Resend achemine les courriels transactionnels. Anthropic traite le texte de la tâche pour la prise en charge, la classification, la planification, la préparation du prix et, lorsqu'une tâche est automatisée, des étapes d'exécution ; ces étapes peuvent lancer des recherches web via l'outil de recherche de ce même fournisseur. Voyage AI convertit le titre et la description d'une tâche en représentation numérique servant à retrouver des tâches comparables lors de la préparation d'un prix ; cette représentation reste dans notre base et n'est jamais transmise, et aucun texte du brief d'un autre client ne sert à chiffrer le vôtre. Google traite la connexion des comptes qui la choisissent. Le titre d'une tâche est transmis à Stripe comme libellé de paiement, et le texte qu'un spécialiste saisit dans notre assistant interne est traité par Anthropic. Chaque fournisseur ne reçoit que les données nécessaires à sa fonction.",
    },
    retention: {
      h2: "Conservation et demandes",
      pre: "Les fichiers téléversés et livrés sont purgés après la période de conservation indiquée dans le protocole, actuellement de",
      unit: "jours",
      mid: "Le dossier de la tâche lui-même — son brief, son historique et la représentation numérique servant à la comparaison de prix — est conservé au-delà de cette période. Ce qu'un mandat passé apporte au chiffrage d'un mandat ultérieur n'est que de la mesure : sa catégorie, son nombre d'unités, le temps qu'il a pris et ce qu'il a coûté. Son brief n'en fait pas partie. Les dossiers financiers, de prévention de la fraude et d'audit peuvent être conservés plus longtemps lorsque des obligations opérationnelles ou légales l'exigent. Pour une demande d'accès, de correction ou de suppression, écrivez à",
      post: ".",
    },
  },
  es: {
    meta: {
      title: "Privacidad",
      description:
        "Qué recopila Endvera, por qué, cuánto tiempo se conserva y quién puede verlo. El servicio está diseñado para que cliente y trabajador no conozcan la identidad del otro, y esa separación se aplica en la capa de datos, no solo en la interfaz.",
    },
    title: "Privacidad",
    intro:
      "Buscamos no recopilar más de lo necesario para cotizar, realizar, revisar, pagar y dar soporte a una tarea.",
    processed: {
      h2: "Información procesada",
      body: "Datos de la cuenta, encargos de tarea, archivos subidos, archivos de entrega, referencias de pago, decisiones de calidad, registros de seguridad y comunicaciones de soporte. Las solicitudes de trabajador también incluyen experiencia, especialidades, disponibilidad y una URL opcional de muestra de trabajo.",
    },
    used: {
      h2: "Cómo se usa",
      body: "Para realizar la tarea, prevenir fraude, aplicar el límite de identidad, dar soporte, cumplir con registros financieros y mejorar la calidad general del servicio. Se usan sistemas automatizados y proveedores de IA a lo largo de la tarea, no solo en la recepción: para estructurar un borrador del brief, para clasificar y planificar el trabajo y preparar un precio que un operador aprueba, y — en algunas tareas, tras el pago — para ejecutar pasos del trabajo, incluidas búsquedas web automatizadas cuyas consultas derivan de tu brief y, cuando la tarea lo requiere, la lectura de los archivos que adjuntaste. Esa lectura la hace el propio software de Endvera, y no envía el contenido de tus archivos a un proveedor de IA. Los especialistas humanos hacen lo que la automatización no puede, y cada entrega es revisada por Endvera antes de llegar a ti. No envíes secretos innecesarios para la tarea.",
    },
    providers: {
      h2: "Proveedores de servicio",
      body: "Los proveedores configurados de infraestructura, base de datos y almacenamiento de objetos procesan los datos del servicio. Stripe procesa los pagos con tarjeta y Resend entrega el correo transaccional. Anthropic procesa el texto de la tarea para recepción, clasificación, planificación, preparación del precio y, cuando una tarea se automatiza, pasos de ejecución; esos pasos pueden lanzar búsquedas web mediante la herramienta de búsqueda del propio proveedor. Voyage AI convierte el título y la descripción de una tarea en una representación numérica que sirve para encontrar tareas comparables al preparar un precio; esa representación permanece en nuestra base de datos y nunca se transmite, y ningún texto del brief de otro cliente se usa para cotizar el tuyo. Google procesa el inicio de sesión de las cuentas que lo eligen. El título de una tarea viaja a Stripe como concepto del pago, y el texto que un especialista escribe en nuestro asistente interno lo procesa Anthropic. Cada proveedor recibe solo los datos necesarios para su función.",
    },
    retention: {
      h2: "Conservación y solicitudes",
      pre: "Los archivos subidos y entregados se purgan después del período de conservación indicado en el protocolo, actualmente de",
      unit: "días",
      mid: "El registro de la tarea en sí — su brief, su historial y la representación numérica usada para comparar precios — se conserva más allá de ese período. Lo que una tarea pasada aporta a la cotización de una posterior es solo medición: su categoría, su número de unidades, cuánto tardó y cuánto costó. Su brief no forma parte de eso. Los registros financieros, de prevención de fraude y de auditoría pueden conservarse más tiempo cuando lo exijan obligaciones operativas o legales. Para solicitudes de acceso, corrección o eliminación, escribe a",
      post: ".",
    },
  },
  tl: {
    meta: {
      title: "Privacy",
      description:
        "Ano ang kinokolekta ng Endvera, bakit, gaano katagal itinatago, at sino ang makakakita nito. Dinisenyo ang serbisyo upang hindi malaman ng client at worker ang identity ng isa't isa, at ipinapatupad ang paghihiwalay na iyon sa data layer, hindi lang sa interface.",
    },
    title: "Privacy",
    intro:
      "Layunin naming huwag mangolekta ng higit pa sa kailangan para mag-quote, gumawa, mag-review, magbayad, at mag-suporta sa isang task.",
    processed: {
      h2: "Impormasyong pinoproseso",
      body: "Mga detalye ng account, brief ng task, mga na-upload na file, mga file ng delivery, reference ng bayad, desisyon sa kalidad, security log, at komunikasyon sa suporta. Kasama rin sa aplikasyon ng worker ang karanasan, mga specialty, availability, at opsyonal na URL ng work sample.",
    },
    used: {
      h2: "Paano ito ginagamit",
      body: "Para paganahin ang task, pigilan ang fraud, ipatupad ang identity boundary, magbigay ng suporta, tuparin ang financial recordkeeping at pahusayin ang pangkalahatang kalidad ng serbisyo. Gumagamit ng automated systems at AI providers sa buong task, hindi lang sa intake: para bumuo ng draft brief, para i-classify at planuhin ang trabaho at maghanda ng presyong inaaprubahan ng operator, at — sa ilang task, pagkatapos ng bayad — para magsagawa ng mga hakbang ng trabaho, kasama ang automated web searches na ang mga query ay galing sa iyong brief at, kapag kailangan ng task, ang pagbabasa ng mga file na inilakip mo. Ang pagbabasang iyon ay ginagawa ng sariling software ng Endvera, at hindi nito ipinapadala ang laman ng mga file mo sa isang AI provider. Ginagawa ng human specialists ang hindi kayang i-automate, at sinusuri ng Endvera ang bawat delivery bago ito makarating sa iyo. Huwag magpadala ng sikreto na hindi kailangan ng task.",
    },
    providers: {
      h2: "Mga Service Provider",
      body: "Pinoproseso ng naka-configure na infrastructure, database, at object-storage provider ang data ng serbisyo. Pinoproseso ng Stripe ang card payments at ng Resend ang transactional email. Pinoproseso ng Anthropic ang teksto ng task para sa intake, classification, planning, paghahanda ng presyo, at — kapag automated ang task — mga hakbang ng execution; maaaring magpatakbo ang mga hakbang na ito ng web search sa pamamagitan ng sariling search tool ng provider na iyon. Kino-convert ng Voyage AI ang pamagat at deskripsyon ng task sa numeric na representasyon na ginagamit para maghanap ng katulad na nakaraang task kapag naghahanda ng presyo; nananatili ang representasyong iyon sa aming database at hindi ipinapasa, at walang tekstong galing sa brief ng ibang kliyente ang ginagamit para presyuhan ang sa iyo. Pinoproseso ng Google ang sign-in para sa mga account na pipili nito. Napupunta sa Stripe ang pamagat ng task bilang payment line item, at pinoproseso ng Anthropic ang tekstong ini-type ng specialist sa aming internal assistant. Tumatanggap lamang ang bawat provider ng datos na kailangan ng kanyang gawain.",
    },
    retention: {
      h2: "Retention at mga Kahilingan",
      pre: "Nabubura ang mga na-upload at naihatid na file ng task pagkatapos ng retention period na nakasaad sa protocol, kasalukuyang",
      unit: "araw",
      mid: "Ang record mismo ng task — ang brief, ang kasaysayan nito, at ang numeric na representasyong ginagamit sa paghahambing ng presyo — ay itinatago lampas sa panahong iyon. Ang naiaambag ng nakaraang mandato sa pagpepresyo ng susunod ay sukatan lamang: ang kategorya nito, bilang ng units, gaano ito katagal, at magkano ang nagastos. Hindi kabilang ang brief nito. Maaaring itago nang mas matagal ang mga financial, fraud-prevention, at audit record kung kinakailangan ito ng operational o legal na obligasyon. Para sa mga kahilingan na access, correction, o deletion, mag-email sa",
      post: ".",
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   TERMS
   ═══════════════════════════════════════════════════════════════════════ */

type TermsDict = {
  meta: { title: string; description: string };
  title: string;
  intro: string;
  scope: { h2: string; body: string };
  review: { h2: string; body: string };
  payments: { h2: string; body: string };
  operator: { h2: string; body: string };
  rights: { h2: string; body: string };
};

export const TERMS_I18N: Record<DocLang, TermsDict> = {
  en: {
    meta: {
      title: "Terms",
      description:
        "The operational agreement behind Endvera work: approved scope, review standards, revisions, disputes and refunds.",
    },
    title: "Service terms",
    intro:
      "These terms describe the operational agreement shown before work is purchased: what you are buying, and what happens when a delivery is wrong. Accounts opened under the earlier standing-capacity arrangement remain governed by the allocation shown in the account.",
    scope: {
      h2: "A task is a fixed scope",
      body: "For one-off work, the approved brief, quantity, file set, delivery standard, deadline and fixed price form the task. Standing-capacity work is governed by the weekly allocation shown in the account. Work begins only after payment confirmation. New one-off scope requires a new quote.",
    },
    review: {
      h2: "Quality review and recourse",
      body: "The operator reviews each delivery against the written brief and category standard. Review means a check against that standard; it is not a warranty that a delivery is free of every error or complete beyond what the standard requires. Clients may use the task page to request the included revision rounds or open a dispute during the displayed review window. Disputes are decided against the written standard, not an undisclosed preference, and the recourse is the revision or refund described in these terms.",
    },
    payments: {
      h2: "Payments and refunds",
      body: "Clients purchase a deliverable from Endvera, not hours of work or access to an individual; anyone performing part of it is an independent subcontractor engaged and paid by Endvera. An upheld dispute queues a refund to the original payment method. Fraudulent chargebacks, unlawful tasks and material misrepresentation may result in suspension.",
    },
    operator: {
      h2: "How Endvera operates",
      body: "Endvera chooses and manages how an approved scope is carried out, and may use software, automation, AI providers and independent specialists to do it. Responsibility for the result stays with Endvera whatever the method. Pricing, quality review, dispute and payout decisions are owned by an authorized Endvera operator through the recorded task workflow.",
    },
    rights: {
      h2: "Confidentiality and rights",
      body: "Users must upload only material they are authorized to share. Workers may use task data only to complete the assigned work and may not contact or identify the client. On full payment, the client receives the rights Endvera can transfer in the commissioned deliverable, excluding third-party materials and pre-existing tools.",
    },
  },
  fr: {
    meta: {
      title: "Conditions",
      description:
        "L'entente opérationnelle derrière le travail Endvera : périmètre et prix des tâches ponctuelles, révision, litiges et remboursements.",
    },
    title: "Conditions de service",
    intro:
      "Ces conditions décrivent l'entente opérationnelle présentée avant l'achat : ce que vous achetez et ce qui se passe quand une livraison est incorrecte. Les comptes ouverts sous l'ancienne formule de capacité permanente restent régis par l'allocation affichée dans le compte.",
    scope: {
      h2: "Une tâche est un périmètre fixe",
      body: "Pour un travail ponctuel, le mandat approuvé, la quantité, l'ensemble de fichiers, le standard de livraison, l'échéance et le prix fixe composent la tâche. La capacité permanente est régie par l'allocation hebdomadaire affichée dans le compte. Le travail commence seulement après la confirmation du paiement. Un nouveau périmètre ponctuel exige un nouveau devis.",
    },
    review: {
      h2: "Révision qualité et recours",
      body: "L'opérateur vérifie chaque livraison contre le mandat écrit et le standard de la catégorie. La révision est un contrôle contre ce standard ; ce n'est pas une garantie qu'une livraison soit exempte de toute erreur ou complète au-delà de ce que le standard exige. Le client peut, depuis la page de la tâche, demander les rondes de correction incluses ou ouvrir un litige pendant la fenêtre affichée. Les litiges sont tranchés contre le standard écrit, pas contre une préférence non divulguée, et le recours est la correction ou le remboursement décrits aux présentes.",
    },
    payments: {
      h2: "Paiements et remboursements",
      body: "Les clients achètent un livrable d'Endvera, pas des heures de travail ni l'accès à une personne; quiconque en réalise une partie est un sous-traitant indépendant engagé et payé par Endvera. Un litige maintenu met en file un remboursement vers le moyen de paiement d'origine. Des rétrofacturations frauduleuses, des tâches illégales et une fausse représentation matérielle peuvent entraîner une suspension.",
    },
    operator: {
      h2: "Comment Endvera fonctionne",
      body: "Endvera choisit et gère la façon dont un mandat approuvé est réalisé, et peut recourir à des logiciels, à l'automatisation, à des fournisseurs d'IA et à des spécialistes indépendants pour y arriver. La responsabilité du résultat demeure celle d'Endvera, quelle que soit la méthode. Les décisions de prix, de contrôle qualité, de litige et de paiement relèvent d'un opérateur Endvera autorisé, via le flux de tâche enregistré.",
    },
    rights: {
      h2: "Confidentialité et droits",
      body: "Les utilisateurs ne doivent téléverser que du matériel qu'ils sont autorisés à partager. Les travailleurs ne peuvent utiliser les données d'une tâche que pour réaliser le travail assigné et ne peuvent contacter ou identifier le client. Sur paiement complet, le client reçoit les droits qu'Endvera peut transférer dans le livrable commandé, à l'exclusion du matériel de tiers et des outils préexistants.",
    },
  },
  es: {
    meta: {
      title: "Términos",
      description:
        "El acuerdo operativo de Endvera: alcance y precio de tareas puntuales, revisión, disputas y reembolsos.",
    },
    title: "Términos del servicio",
    intro:
      "Estos términos describen el acuerdo operativo mostrado antes de comprar: qué compras y qué pasa cuando una entrega está mal. Las cuentas abiertas bajo el esquema anterior de capacidad fija siguen rigiéndose por la asignación mostrada en la cuenta.",
    scope: {
      h2: "Una tarea es un alcance fijo",
      body: "Para un trabajo puntual, el encargo aprobado, la cantidad, el conjunto de archivos, el estándar de entrega, la fecha límite y el precio fijo componen la tarea. El trabajo de capacidad permanente se rige por la asignación semanal mostrada en la cuenta. El trabajo empieza solo tras confirmarse el pago. Un alcance puntual nuevo requiere una cotización nueva.",
    },
    review: {
      h2: "Revisión de calidad y recurso",
      body: "El operador revisa cada entrega contra el encargo escrito y el estándar de la categoría. La revisión es un control contra ese estándar; no es una garantía de que la entrega esté libre de todo error ni de que sea completa más allá de lo que el estándar exige. El cliente puede, desde la página de la tarea, pedir las rondas de corrección incluidas o abrir una disputa durante la ventana mostrada. Las disputas se deciden contra el estándar escrito, no contra una preferencia no divulgada, y el recurso es la corrección o el reembolso descritos aquí.",
    },
    payments: {
      h2: "Pagos y reembolsos",
      body: "Los clientes compran un entregable a Endvera, no horas de trabajo ni acceso a una persona; quien realice parte de él es un subcontratista independiente contratado y pagado por Endvera. Una disputa confirmada pone en cola un reembolso al método de pago original. Contracargos fraudulentos, tareas ilegales y tergiversación material pueden resultar en suspensión.",
    },
    operator: {
      h2: "Cómo opera Endvera",
      body: "Endvera elige y gestiona cómo se lleva a cabo un encargo aprobado, y puede usar software, automatización, proveedores de IA y especialistas independientes para hacerlo. La responsabilidad del resultado sigue siendo de Endvera, sea cual sea el método. Las decisiones de precio, revisión de calidad, disputas y pagos pertenecen a un operador autorizado de Endvera a través del flujo de tarea registrado.",
    },
    rights: {
      h2: "Confidencialidad y derechos",
      body: "Los usuarios deben subir solo material que están autorizados a compartir. Los trabajadores pueden usar los datos de la tarea solo para completar el trabajo asignado y no pueden contactar o identificar al cliente. Con el pago completo, el cliente recibe los derechos que Endvera puede transferir en el entregable encargado, excluyendo material de terceros y herramientas preexistentes.",
    },
  },
  tl: {
    meta: {
      title: "Terms",
      description:
        "Ang operational agreement ng Endvera: scope at presyo ng one-off work, review, dispute, at refund.",
    },
    title: "Mga Tuntunin ng Serbisyo",
    intro:
      "Inilalarawan ng mga tuntuning ito ang operational agreement bago bumili: ano ang binibili mo at ano ang mangyayari kapag mali ang delivery. Ang mga account na binuksan sa dating standing-capacity na ayos ay patuloy na pinamamahalaan ng allocation na nakalagay sa account.",
    scope: {
      h2: "Ang isang task ay may fixed na scope",
      body: "Para sa one-off work, binubuo ang task ng aprubadong brief, dami, set ng file, delivery standard, deadline, at fixed na presyo. Ang standing-capacity work ay saklaw ng weekly allocation na ipinapakita sa account. Nagsisimula lang ang trabaho pagkatapos ma-kumpirma ang bayad. Kailangan ng bagong quote para sa bagong one-off scope.",
    },
    review: {
      h2: "Quality Review at Recourse",
      body: "Sinusuri ng operator ang bawat delivery laban sa nakasulat na brief at pamantayan ng kategorya. Ang review ay pagsusuri laban sa pamantayang iyon; hindi ito garantiya na walang anumang mali ang delivery o kumpleto ito lampas sa hinihingi ng pamantayan. Maaaring gamitin ng kliyente ang task page para hilingin ang kasamang revision rounds o magbukas ng dispute sa loob ng ipinapakitang window. Ang mga dispute ay pinapasyahan laban sa nakasulat na pamantayan, hindi sa hindi ipinaalam na kagustuhan, at ang recourse ay ang revision o refund na nakasaad dito.",
    },
    payments: {
      h2: "Mga Bayad at Refund",
      body: "Bumibili ang mga client ng deliverable mula sa Endvera, hindi oras ng trabaho o access sa isang tao; sinumang gumagawa ng bahagi nito ay independiyenteng subcontractor na kinuha at binabayaran ng Endvera. Ang na-uphold na dispute ay nagpapapila ng refund papunta sa orihinal na paraan ng pagbayad. Ang mapanlinlang na chargeback, ilegal na task, at material na maling representasyon ay maaaring magresulta sa suspensyon.",
    },
    operator: {
      h2: "Paano Nag-ooperate ang Endvera",
      body: "Ang Endvera ang pumipili at namamahala kung paano isasagawa ang inaprubahang scope, at maaari nitong gamitin ang software, automation, AI providers at independent na specialist para gawin ito. Nananatili sa Endvera ang pananagutan sa resulta anuman ang paraan. Ang pricing, quality review, dispute, at payout decisions ay pag-aari ng authorized na Endvera operator sa pamamagitan ng naitalang task workflow.",
    },
    rights: {
      h2: "Confidentiality at mga Karapatan",
      body: "Dapat lang mag-upload ang mga user ng materyal na may pahintulot silang ibahagi. Puwede lang gamitin ng mga worker ang data ng task para tapusin ang inatas na trabaho at hindi sila puwedeng makipag-ugnayan o mag-identify sa client. Sa buong bayad, natatanggap ng client ang mga karapatang maipapasa ng Endvera sa in-commission na deliverable, hindi kasama ang materyal ng third-party at mga umiiral nang tool.",
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   ACCEPTABLE USE
   ═══════════════════════════════════════════════════════════════════════ */

type AcceptableUseDict = {
  meta: { title: string; description: string };
  title: string;
  intro: string;
  notAccepted: { h2: string; items: string[] };
  sensitive: { h2: string; body: string };
  enforcement: { h2: string; body: string };
};

export const ACCEPTABLE_USE_I18N: Record<DocLang, AcceptableUseDict> = {
  en: {
    meta: {
      title: "Acceptable use",
      description:
        "What Endvera will and will not take on. Some tasks we turn down. This page says which, and why, in plain language.",
    },
    title: "Acceptable use",
    intro:
      "Endvera handles bounded administrative work. Some tasks are refused even when they can be described.",
    notAccepted: {
      h2: "Not accepted",
      items: [
        "Illegal activity, fraud, impersonation, harassment or deceptive outreach.",
        "Credential sharing, account takeovers, bypassing access controls or malware.",
        "High-stakes legal, medical, financial or employment decisions.",
        "Payment-card data, authentication secrets or unnecessary government identifiers.",
        "Copyright infringement, doxxing, surveillance or re-identification of people.",
        "Work that would require reaching you, or anyone else, outside the operator channel.",
      ],
    },
    sensitive: {
      h2: "Sensitive material",
      body: "Remove personal and confidential information not needed for the result. If a task cannot be completed without unusually sensitive data, contact support before uploading it. We only accept research about people that seeks business contact details already published, and we cite the source each value came from. We refuse work that profiles private individuals, and our automated research is blocked from a named list of data-broker and profile-scraping domains.",
    },
    enforcement: {
      h2: "Enforcement",
      body: "The operator may refuse, cancel or pause a task that creates safety, confidentiality, legality or scope risk. A cancelled unpaid task is not charged; paid-task remedies follow the service terms and the task’s recorded status.",
    },
  },
  fr: {
    meta: {
      title: "Utilisation acceptable",
      description:
        "Ce qu'Endvera accepte et refuse de prendre en charge. Certaines tâches sont refusées. Cette page dit lesquelles, et pourquoi, en langage clair.",
    },
    title: "Utilisation acceptable",
    intro:
      "Endvera traite du travail administratif borné. Certaines tâches sont refusées même lorsqu'elles peuvent être décrites.",
    notAccepted: {
      h2: "Non accepté",
      items: [
        "Activité illégale, fraude, usurpation d'identité, harcèlement ou démarchage trompeur.",
        "Partage d'identifiants, prise de contrôle de comptes, contournement des contrôles d'accès ou logiciels malveillants.",
        "Décisions à fort enjeu en matière légale, médicale, financière ou d'emploi.",
        "Données de carte de paiement, secrets d'authentification ou identifiants gouvernementaux non nécessaires.",
        "Violation de droit d'auteur, doxxing, surveillance ou réidentification de personnes.",
        "Travail qui exigerait de vous joindre, ou de joindre quiconque, en dehors du canal de l'opérateur.",
      ],
    },
    sensitive: {
      h2: "Matériel sensible",
      body: "Retirez l'information personnelle et confidentielle qui n'est pas nécessaire au résultat. Si une tâche ne peut être complétée sans des données inhabituellement sensibles, contactez le soutien avant de les téléverser. Nous n'acceptons de recherche sur des personnes que pour des coordonnées professionnelles déjà publiées, et nous citons la source de chaque valeur. Nous refusons le travail qui profile des particuliers, et notre recherche automatisée est bloquée sur une liste nommée de domaines de courtiers de données et de profils aspirés.",
    },
    enforcement: {
      h2: "Application",
      body: "L'opérateur peut refuser, annuler ou suspendre une tâche qui crée un risque de sécurité, de confidentialité, de légalité ou de périmètre. Une tâche annulée non payée n'est pas facturée; les recours pour une tâche payée suivent les conditions de service et le statut enregistré de la tâche.",
    },
  },
  es: {
    meta: {
      title: "Uso aceptable",
      description:
        "Qué acepta y qué rechaza Endvera. Rechazamos algunas tareas. Esta página dice cuáles, y por qué, en lenguaje claro.",
    },
    title: "Uso aceptable",
    intro:
      "Endvera maneja trabajo administrativo acotado. Se rechazan algunas tareas incluso cuando se pueden describir.",
    notAccepted: {
      h2: "No aceptado",
      items: [
        "Actividad ilegal, fraude, suplantación de identidad, acoso o contacto engañoso.",
        "Compartir credenciales, toma de control de cuentas, evasión de controles de acceso o malware.",
        "Decisiones legales, médicas, financieras o laborales de alto riesgo.",
        "Datos de tarjeta de pago, secretos de autenticación o identificadores gubernamentales innecesarios.",
        "Infracción de derechos de autor, doxxing, vigilancia o reidentificación de personas.",
        "Trabajo que exigiría contactarte, o contactar a cualquiera, fuera del canal del operador.",
      ],
    },
    sensitive: {
      h2: "Material sensible",
      body: "Elimina la información personal y confidencial que no se necesite para el resultado. Si una tarea no puede completarse sin datos inusualmente sensibles, contacta al soporte antes de subirlos. Solo aceptamos investigación sobre personas que busque datos de contacto profesional ya publicados, y citamos la fuente de cada valor. Rechazamos el trabajo que perfila a particulares, y nuestra investigación automatizada está bloqueada para una lista nombrada de dominios de intermediarios de datos y de perfiles extraídos.",
    },
    enforcement: {
      h2: "Aplicación",
      body: "El operador puede rechazar, cancelar o pausar una tarea que genere riesgo de seguridad, confidencialidad, legalidad o alcance. Una tarea cancelada sin pagar no se cobra; los remedios de una tarea pagada siguen los términos del servicio y el estado registrado de la tarea.",
    },
  },
  tl: {
    meta: {
      title: "Katanggap-tanggap na Paggamit",
      description:
        "Kung ano ang tatanggapin at hindi tatanggapin ng Endvera. May mga task kaming tinatanggihan. Sinasabi ng page na ito kung alin, at bakit, sa simpleng wika.",
    },
    title: "Katanggap-tanggap na Paggamit",
    intro:
      "Hinahandle ng Endvera ang naka-bound na administrative work. May mga task na tinatanggihan kahit ilarawan pa ito.",
    notAccepted: {
      h2: "Hindi Tinatanggap",
      items: [
        "Ilegal na aktibidad, fraud, pagpapanggap, panliligalig, o mapanlinlang na outreach.",
        "Pagbabahagi ng credential, account takeover, pag-bypass sa access control, o malware.",
        "High-stakes na legal, medikal, pinansyal, o employment na desisyon.",
        "Payment-card na data, authentication secret, o hindi kailangang government identifier.",
        "Paglabag sa copyright, doxxing, surveillance, o re-identification ng mga tao.",
        "Trabahong mangangailangang makaabot sa iyo, o kaninuman, sa labas ng channel ng operator.",
      ],
    },
    sensitive: {
      h2: "Sensitibong Materyal",
      body: "Tanggalin ang personal at kumpidensyal na impormasyon na hindi kailangan para sa resulta. Kung hindi matatapos ang isang task nang walang di-pangkaraniwang sensitibong data, makipag-ugnayan sa suporta bago ito i-upload. Tinatanggap lang namin ang pagsasaliksik tungkol sa mga tao na naghahanap ng business contact details na nakalathala na, at binabanggit namin ang pinagkunan ng bawat halaga. Tinatanggihan namin ang trabahong nagpo-profile ng pribadong indibidwal, at naka-block ang aming automated research sa nakalistang mga domain ng data broker at profile-scraping.",
    },
    enforcement: {
      h2: "Pagpapatupad",
      body: "Maaaring tanggihan, kanselahin, o i-pause ng operator ang isang task na lumilikha ng panganib sa kaligtasan, kumpidensyalidad, legalidad, o scope. Hindi sisingilin ang kinanselang task na hindi pa bayad; sinusunod ng mga remedyo para sa bayad na task ang service terms at ang naitalang status ng task.",
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   LEDGER — its own layout, not PolicyPage, so its own strings live here.
   ═══════════════════════════════════════════════════════════════════════ */

type LedgerDict = {
  meta: { title: string; description: string };
  back: string;
  eyebrow: string;
  h1: string;
  lede: string;
  totalLabel: string;
  totalPending: string;
  reliability: { onTime: string; qcFirstTry: string; disputed: string };
  historyLabel: string;
  emptyState: string;
  olderEntries: string;
  kind: Record<string, string>;
};

export const LEDGER_I18N: Record<DocLang, LedgerDict> = {
  en: {
    meta: {
      title: "Public Ledger",
      description:
        "A privacy-protected record of settled Endvera transaction events, corrections and reliability data when enough activity exists to publish safely.",
    },
    back: "← Back",
    eyebrow: "Public Ledger",
    h1: "A public transaction record, without customer identities.",
    lede: "Published entries show transaction type, category and settlement date without client or worker names. The underlying record is append-only: corrections are recorded as new entries rather than overwrites. This page is a privacy-protected history, not an independent audit of the database hash chain.",
    totalLabel: "Total processed to date",
    totalPending:
      "Published once enough transactions have settled that the total cannot be traced back to any single one.",
    reliability: {
      onTime: "On-time delivery",
      qcFirstTry: "Passes QC on the first try",
      disputed: "Disputed after delivery",
    },
    historyLabel: "History",
    emptyState:
      "No entries yet. This list updates automatically once the first task completes.",
    olderEntries: "Older entries →",
    kind: {
      sale: "Payment processed",
      refund: "Refund",
      payout: "Worker payout",
      fee: "Platform fee",
      chargeback: "Chargeback",
      chargeback_reversal: "Chargeback reversed",
      correction: "Correction",
    },
  },
  fr: {
    meta: {
      title: "Registre public",
      description:
        "Un registre protégé des transactions réglées d'Endvera : écritures, corrections et données de fiabilité, publiées lorsque l'activité suffit pour le faire sans risque.",
    },
    back: "← Retour",
    eyebrow: "Registre public",
    h1: "Un registre public de transactions, sans identité client.",
    lede: "Les écritures publiées indiquent le type, la catégorie et la date de règlement sans nom de client ni de travailleur. Le registre sous-jacent est en ajout seul : les corrections deviennent de nouvelles écritures. Cette page est un historique protégé, pas un audit indépendant de la chaîne de hachage.",
    totalLabel: "Total traité à ce jour",
    totalPending:
      "Publié une fois qu'assez de transactions se sont réglées pour que le total ne puisse être retracé jusqu'à une seule d'entre elles.",
    reliability: {
      onTime: "Livraison à temps",
      qcFirstTry: "Passe la révision au premier essai",
      disputed: "Contestée après livraison",
    },
    historyLabel: "Historique",
    emptyState:
      "Aucune écriture encore. Cette liste se met à jour automatiquement dès que la première tâche est complétée.",
    olderEntries: "Écritures plus anciennes →",
    kind: {
      sale: "Paiement traité",
      refund: "Remboursement",
      payout: "Paiement au travailleur",
      fee: "Frais de plateforme",
      chargeback: "Rétrofacturation",
      chargeback_reversal: "Rétrofacturation annulée",
      correction: "Correction",
    },
  },
  es: {
    meta: {
      title: "Registro público",
      description:
        "Un registro protegido de las transacciones liquidadas de Endvera: entradas, correcciones y datos de fiabilidad, publicados cuando hay actividad suficiente para hacerlo con seguridad.",
    },
    back: "← Volver",
    eyebrow: "Registro público",
    h1: "Un registro público de transacciones, sin identidades.",
    lede: "Las entradas publicadas muestran tipo, categoría y fecha de liquidación sin nombres de clientes ni trabajadores. El registro subyacente es de solo adición: las correcciones se añaden como entradas nuevas. Esta página es un historial protegido, no una auditoría independiente de la cadena hash.",
    totalLabel: "Total procesado a la fecha",
    totalPending:
      "Se publica una vez que suficientes transacciones se han liquidado como para que el total no se pueda rastrear hasta una sola de ellas.",
    reliability: {
      onTime: "Entrega a tiempo",
      qcFirstTry: "Pasa la revisión al primer intento",
      disputed: "Disputada después de la entrega",
    },
    historyLabel: "Historial",
    emptyState:
      "Aún no hay entradas. Esta lista se actualiza automáticamente en cuanto se complete la primera tarea.",
    olderEntries: "Entradas anteriores →",
    kind: {
      sale: "Pago procesado",
      refund: "Reembolso",
      payout: "Pago al trabajador",
      fee: "Comisión de plataforma",
      chargeback: "Contracargo",
      chargeback_reversal: "Contracargo revertido",
      correction: "Corrección",
    },
  },
  tl: {
    meta: {
      title: "Pampublikong Ledger",
      description:
        "Isang protektadong tala ng mga settled na transaksyon ng Endvera: mga entry, correction, at reliability data, inilalathala kapag sapat na ang aktibidad para gawin ito nang ligtas.",
    },
    back: "← Bumalik",
    eyebrow: "Pampublikong Ledger",
    h1: "Public transaction record na walang client identity.",
    lede: "Ipinapakita ng published entries ang transaction type, category, at settlement date nang walang pangalan ng client o worker. Append-only ang underlying record: bagong entry ang correction, hindi overwrite. Protected history ang page na ito, hindi independent audit ng database hash chain.",
    totalLabel: "Kabuuang naiproseso hanggang ngayon",
    totalPending:
      "Ipinapaskil kapag sapat na ang na-settle na transaksyon para hindi na maisubaybayan ang total pabalik sa isang solong transaksyon.",
    reliability: {
      onTime: "On-time na delivery",
      qcFirstTry: "Pumapasa sa QC sa unang subok",
      disputed: "Na-dispute pagkatapos ng delivery",
    },
    historyLabel: "History",
    emptyState:
      "Wala pang entry. Awtomatikong nag-a-update ang listahang ito sa sandaling matapos ang unang task.",
    olderEntries: "Mas lumang entry →",
    kind: {
      sale: "Naiprosesong bayad",
      refund: "Refund",
      payout: "Payout ng worker",
      fee: "Bayad sa platform",
      chargeback: "Chargeback",
      chargeback_reversal: "Naibalik na chargeback",
      correction: "Pagwawasto",
    },
  },
};
