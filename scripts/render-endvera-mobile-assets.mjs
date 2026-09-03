import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mobileRoot = join(repoRoot, "apps", "mobile");
const imageRoot = join(mobileRoot, "assets", "images");
const candidateRoot = join(repoRoot, "release", "endvera-construction-v1", "store-candidates");
const master = await readFile(join(mobileRoot, "assets", "brand", "endvera-mark.svg"));

const markPaths = `
  <path d="M6 8h8l6 6-4 4-4-4H9v10H6V8Z" fill="#D87526"/>
  <path d="M26 24h-8l-6-6 4-4 4 4h3V8h3v16Z" fill="#C9A76A"/>
  <path d="m14.8 15.2 2-2 2.4 2.4-2 2-2.4-2.4Z" fill="#E2C486"/>`;

function svg(size, body, background = "none") {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${background}"/>${body}</svg>`);
}

await mkdir(imageRoot, { recursive: true });
await sharp(master).resize(1024, 1024).png().toFile(join(imageRoot, "icon.png"));
await sharp(svg(512, `<circle cx="390" cy="100" r="300" fill="#201A14" opacity=".75"/><path d="M0 128H512M0 256H512M0 384H512M128 0V512M256 0V512M384 0V512" stroke="#272B33" stroke-width="1"/>`, "#09090B")).png().toFile(join(imageRoot, "android-icon-background.png"));
await sharp(svg(1024, `<g transform="translate(192 192) scale(20)">${markPaths}</g>`)).png().toFile(join(imageRoot, "android-icon-foreground.png"));
await sharp(svg(432, `<g transform="translate(86.4 86.4) scale(8.1)"><path d="M6 8h8l6 6-4 4-4-4H9v10H6V8Z" fill="#FFFFFF"/><path d="M26 24h-8l-6-6 4-4 4 4h3V8h3v16Z" fill="#FFFFFF"/></g>`)).png().toFile(join(imageRoot, "android-icon-monochrome.png"));
await sharp(svg(512, `<rect x="76" y="76" width="360" height="360" rx="88" fill="#0D0F13" stroke="#6F4C29" stroke-width="6"/><g transform="translate(96 96) scale(10)">${markPaths}</g>`)).png().toFile(join(imageRoot, "splash-icon.png"));
await sharp(master).resize(64, 64).png().toFile(join(imageRoot, "favicon.png"));

const shots = [
  { id: "today", fr: ["AUJOURD’HUI", "Une prochaine action claire."], en: ["TODAY", "One clear next action."] },
  { id: "assistant", fr: ["ASSISTANT", "Parle. Le contexte reste attaché."], en: ["ASSISTANT", "Talk. The job context stays attached."] },
  { id: "projects", fr: ["CHANTIERS", "Décisions, preuves et responsables."], en: ["PROJECTS", "Decisions, evidence and owners."] },
  { id: "calendar", fr: ["AGENDA", "Ce qui arrive, sans reconstruire le contexte."], en: ["CALENDAR", "What is next, without rebuilding context."] },
  { id: "approval", fr: ["TU GARDES L’AUTORITÉ", "Destinataire et texte visibles avant approbation."], en: ["YOU KEEP AUTHORITY", "Recipient and message visible before approval."] },
];

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

for (const locale of ["fr", "en"]) {
  await mkdir(join(candidateRoot, locale), { recursive: true });
  for (const [index, shot] of shots.entries()) {
    const [title, body] = shot[locale];
    const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1290" height="2796" viewBox="0 0 1290 2796">
      <defs><radialGradient id="g" cx="80%" cy="8%" r="85%"><stop offset="0" stop-color="#251D15"/><stop offset=".5" stop-color="#111318"/><stop offset="1" stop-color="#09090B"/></radialGradient></defs>
      <rect width="1290" height="2796" fill="url(#g)"/>
      <text x="96" y="160" fill="#D6B878" font-family="Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="7">ENDVERA</text>
      <text x="96" y="330" fill="#F7F6F3" font-family="Arial, sans-serif" font-size="82" font-weight="700">${escapeXml(title)}</text>
      <text x="96" y="430" fill="#A1A8B3" font-family="Arial, sans-serif" font-size="42">${escapeXml(body)}</text>
      <rect x="96" y="570" width="1098" height="1840" rx="72" fill="#121419" stroke="#343943" stroke-width="4"/>
      <rect x="146" y="650" width="998" height="260" rx="38" fill="#1B1E24" stroke="#6F4C29" stroke-width="3"/>
      <text x="196" y="735" fill="#D6B878" font-family="Arial, sans-serif" font-size="28" font-weight="700">LAVAL-001 · RÉNOVATION LAVAL</text>
      <text x="196" y="820" fill="#F7F6F3" font-family="Arial, sans-serif" font-size="46" font-weight="700">${escapeXml(title)}</text>
      <rect x="146" y="960" width="998" height="520" rx="38" fill="#17191E" stroke="#2A303B" stroke-width="3"/>
      <circle cx="224" cy="1050" r="34" fill="#D87526"/><text x="286" y="1070" fill="#F7F6F3" font-family="Arial, sans-serif" font-size="40" font-weight="700">ENDVERA</text>
      <text x="196" y="1175" fill="#A1A8B3" font-family="Arial, sans-serif" font-size="34">${locale === "fr" ? "Le contexte opérationnel du chantier est prêt." : "The job’s operational context is ready."}</text>
      <rect x="196" y="1280" width="580" height="110" rx="55" fill="#D87526"/><text x="246" y="1350" fill="#160E08" font-family="Arial, sans-serif" font-size="34" font-weight="700">${locale === "fr" ? "Continuer" : "Continue"}</text>
      <rect x="146" y="1530" width="998" height="380" rx="38" fill="#17191E" stroke="#2A303B" stroke-width="3"/>
      <text x="196" y="1630" fill="#D6B878" font-family="Arial, sans-serif" font-size="28" font-weight="700">${locale === "fr" ? "PROCHAINE DÉCISION" : "NEXT DECISION"}</text>
      <text x="196" y="1730" fill="#F7F6F3" font-family="Arial, sans-serif" font-size="38">${locale === "fr" ? "Vérifier puis approuver l’action préparée" : "Review and approve the prepared action"}</text>
      <text x="96" y="2595" fill="#78808B" font-family="Arial, sans-serif" font-size="28">LOCAL CANDIDATE · NOT REAL-DEVICE EVIDENCE</text>
    </svg>`);
    await sharp(frame).png().toFile(join(candidateRoot, locale, `${String(index + 1).padStart(2, "0")}-${shot.id}.png`));
  }
}

console.log("ENDVERA_MOBILE_ASSETS_RENDERED icons=6 candidateFrames=10 externalEffects=0");

