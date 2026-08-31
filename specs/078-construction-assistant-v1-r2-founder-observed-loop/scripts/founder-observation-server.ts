import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { founderObservationSubmissionSchema, sha256Canonical } from "./observation-contract";

const host = "127.0.0.1";
const port = 4178;
const featureRoot = join(process.cwd(), "specs", "078-construction-assistant-v1-r2-founder-observed-loop");
const evidencePath = join(featureRoot, "evidence", "founder-observation.json");

function html() {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Observation ENDVERA R2</title>
  <style>body{font:16px system-ui;background:#111317;color:#f7f6f3;margin:0}main{max-width:860px;margin:auto;padding:32px}h1{font-size:30px}.card{background:#1a1d22;border:1px solid #343941;border-radius:14px;padding:18px;margin:14px 0}a{color:#e2c486}button{background:#d87526;color:white;border:0;border-radius:8px;padding:12px 18px;font-weight:700}button:disabled{opacity:.45}label{display:block;margin:12px 0}select,input,textarea{display:block;width:100%;max-width:520px;background:#101216;color:white;border:1px solid #4b515c;border-radius:7px;padding:9px;margin-top:5px;box-sizing:border-box}.step{display:flex;gap:10px}.step input{width:auto}.muted{color:#a1a8b3}.warn{border-left:4px solid #e2c486;padding-left:12px}.ok{color:#68e0af}</style></head><body><main>
  <h1>Test fondateur ENDVERA Construction</h1><p class="warn">Tout est local et synthétique. Aucun SMS ni courriel réel ne part. Clique d’abord sur « Commencer »: le chronomètre part seulement là.</p>
  <div class="card"><b>Portail produit</b><p><a href="http://127.0.0.1:3000/login" target="_blank">Ouvrir ENDVERA local</a></p><p class="muted">Compte: olivier.r2@example.invalid<br>Mot de passe synthétique local: Endvera-R2-Local-Only-2026!</p></div>
  <button id="start">Commencer le test</button><p id="timer" class="muted">Chronomètre arrêté.</p>
  <form id="observation">
  <div class="card"><h2>Les 8 actions</h2>
    <label class="step"><input required type="checkbox">1. Dans Projects, créer l’espace Construction et le chantier Laval.</label>
    <label class="step"><input required type="checkbox">2. Ouvrir Laval et vérifier Marc, Fournisseur.</label>
    <label class="step"><input required type="checkbox">3. Dire exactement: <code>Rendez-vous avec Marc mardi à 14 h pour Laval.</code></label>
    <label class="step"><input required type="checkbox">4. Dire: <code>Rendez-vous avec Marc mardi à 2 pour Laval.</code> Vérifier qu’aucun rendez-vous n’est créé.</label>
    <label class="step"><input required type="checkbox">5. Demander: <code>Qu’est-ce que j’ai demain?</code></label>
    <label class="step"><input required type="checkbox">6. Dans Inbox, copier l’ID provider, injecter <code>Le matériel de Laval est prêt pour mardi.</code>, puis recoller le même ID et réinjecter.</label>
    <label class="step"><input required type="checkbox">7. Dans Projects, dire: <code>Texte Marc que je serai 30 minutes en retard.</code></label>
    <label class="step"><input required type="checkbox">8. Dans Inbox, vérifier Marc/SMS/texte, approuver, puis regarder Projects, Calendar et Inbox.</label>
  </div>
  <div class="card"><h2>Ton observation réelle</h2>
    <label>La clarification était facile à comprendre (1–5)<select required name="clarification"><option value="">Choisir</option>${[1,2,3,4,5].map(x=>`<option>${x}</option>`).join("")}</select></label>
    <label>L’approbation du message était claire (1–5)<select required name="approval"><option value="">Choisir</option>${[1,2,3,4,5].map(x=>`<option>${x}</option>`).join("")}</select></label>
    <label>Le dossier était actionnable (1–5)<select required name="actionability"><option value="">Choisir</option>${[1,2,3,4,5].map(x=>`<option>${x}</option>`).join("")}</select></label>
    <label>Avantage sur une conversation sans mémoire (-2 à +2)<select required name="advantage"><option value="">Choisir</option>${[-2,-1,0,1,2].map(x=>`<option>${x}</option>`).join("")}</select></label>
    <label>Nombre de corrections que tu as dû demander<input required name="corrections" type="number" min="0" max="100" value="0"></label>
    <label>Combien de fois tu as dû réexpliquer le contexte<input required name="restatements" type="number" min="0" max="100" value="0"></label>
    <label class="step"><input required name="nextDecision" type="checkbox">Je peux identifier la prochaine décision sans reconstruire le contexte.</label>
    <fieldset><legend>Avantages réellement vus (au moins un)</legend>
      ${[["NO_MANUAL_CONTEXT_REPETITION","Pas besoin de répéter le contexte"],["PERSISTENT_STATE_AFTER_NAVIGATION","État présent après navigation"],["PROVENANCE_ACCESSIBLE","Provenance visible"],["DUPLICATE_REPLAY_REFUSAL","Duplicate/replay refusé"],["EXACT_APPROVAL","Approbation exacte"],["RECONSTRUCTIBLE_HISTORY","Historique reconstructible"]].map(([v,l])=>`<label class="step"><input type="checkbox" name="managed" value="${v}">${l}</label>`).join("")}
    </fieldset>
    <label>Notes (optionnel)<textarea name="notes" maxlength="2000" rows="4"></textarea></label>
  </div>
  <button id="finish" disabled>Terminer le test</button><p id="status"></p></form>
  <script>
    let startedAt=null; const start=document.querySelector('#start'), finish=document.querySelector('#finish'), timer=document.querySelector('#timer'), form=document.querySelector('#observation'), status=document.querySelector('#status');
    start.onclick=()=>{ if(startedAt)return; startedAt=new Date(); finish.disabled=false; start.disabled=true; timer.textContent='Chronomètre démarré à '+startedAt.toLocaleTimeString('fr-CA'); };
    form.onsubmit=async(e)=>{e.preventDefault(); if(!startedAt)return; const managed=[...document.querySelectorAll('input[name=managed]:checked')].map(x=>x.value); if(!managed.length){status.textContent='Choisis au moins un avantage réellement observé.';return;} const now=new Date(), data=new FormData(form); const payload={schemaVersion:1,observer:'Olivier',founderCompleted:true,sessionStartedAtUtc:startedAt.toISOString(),sessionCompletedAtUtc:now.toISOString(),clarificationUnderstandabilityRating:Number(data.get('clarification')),approvalComprehensionRating:Number(data.get('approval')),founderCorrectionCount:Number(data.get('corrections')),founderActiveMinutes:Math.max(.01,Math.round((now-startedAt)/600)/100),manualContextRestatementCount:Number(data.get('restatements')),nextDecisionIdentified:data.get('nextDecision')==='on',actionabilityRating:Number(data.get('actionability')),observableAdvantageRating:Number(data.get('advantage')),observedManagedAdvantages:managed,founderNotes:String(data.get('notes')||'')}; finish.disabled=true; const res=await fetch('/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}); const out=await res.json(); status.className=res.ok?'ok':''; status.textContent=res.ok?'Observation scellée. Tu peux fermer cette page.':('Refus: '+out.error); if(!res.ok)finish.disabled=false; };
  </script></main></body></html>`;
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return response.end(html());
  }
  if (request.method === "GET" && request.url === "/status") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return response.end(JSON.stringify({ complete: existsSync(evidencePath) }));
  }
  if (request.method === "POST" && request.url === "/complete") {
    if (existsSync(evidencePath)) {
      response.writeHead(409, { "content-type": "application/json" });
      return response.end(JSON.stringify({ error: "FOUNDER_OBSERVATION_ALREADY_SEALED" }));
    }
    let body = "";
    request.on("data", chunk => { body += chunk; if (body.length > 20_000) request.destroy(); });
    request.on("end", () => {
      try {
        const observation = founderObservationSubmissionSchema.parse(JSON.parse(body));
        const sealed = { ...observation, observationSha256: sha256Canonical(observation) };
        writeFileSync(evidencePath, `${JSON.stringify(sealed, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify({ sealed: true, observationSha256: sealed.observationSha256 }));
      } catch (error) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : "INVALID_OBSERVATION" }));
      }
    });
    return;
  }
  response.writeHead(404).end();
});

if (existsSync(evidencePath)) {
  const existing = JSON.parse(readFileSync(evidencePath, "utf8"));
  console.log(`Founder observation already sealed: ${existing.observationSha256}`);
}
server.listen(port, host, () => console.log(`FOUNDER_OBSERVATION_URL=http://${host}:${port}/`));
