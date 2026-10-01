// Les quatre PDF de lecture d'un kit : « À lire en premier », la fiche de
// tests, « Mon personnage » et la fiche de remontée. Même charte que
// l'application (bleu nuit, Inter), cartes de test numérotées.
import { CSS_POLICES, baliser, echapper, htmlVersPdf } from "./commun.mjs";

const CSS_KIT = `${CSS_POLICES}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { font: 9.6pt/1.5 "Inter", "Liberation Sans", sans-serif; color: #1e293b; }
p { margin: 4px 0; }
ul, ol { margin: 4px 0 4px 2px; padding-left: 18px; }
li { margin: 3px 0; }
code { font: 8.8pt "DejaVu Sans Mono", monospace; background: #f1f5f9; border-radius: 4px; padding: 0 4px; }
.hero { background: linear-gradient(120deg, #172554, #1e3a8a 60%, #1d4ed8); color: #fff; border-radius: 14px; padding: 22px 26px; position: relative; overflow: hidden; margin-bottom: 18px; }
.hero::after { content: ""; position: absolute; right: -60px; top: -70px; width: 260px; height: 260px; border-radius: 50%; background: rgba(255,255,255,0.08); }
.hero .kicker { font-size: 8pt; letter-spacing: 3px; text-transform: uppercase; color: #bfdbfe; font-weight: 600; }
.hero h1 { font-size: 22pt; margin: 6px 0 6px; font-weight: 800; }
.hero p { color: #dbeafe; max-width: 540px; margin: 0; }
h2 { font-size: 13.5pt; color: #172554; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #2563eb; font-weight: 800; }
h3 { font-size: 11pt; color: #172554; margin: 14px 0 6px; }
.carte { border: 1px solid #dbe2ec; border-radius: 12px; padding: 12px 14px 10px; margin: 10px 0; break-inside: avoid; background: #fff; }
.carte .entete { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
.carte .entete .titre { font-weight: 700; font-size: 10.8pt; flex: 1; }
.carte .entete .duree { color: #64748b; font-size: 8.8pt; white-space: nowrap; }
.num { background: #1d4ed8; color: #fff; font-weight: 700; border-radius: 6px; padding: 2px 8px; font-size: 9pt; white-space: nowrap; }
.badge { display: inline-block; border-radius: 999px; padding: 1px 9px; font-size: 8pt; font-weight: 700; white-space: nowrap; vertical-align: middle; }
.badge.attente { background: #fef3c7; color: #92400e; }
.badge.paiement { background: #fee2e2; color: #991b1b; }
.badge.facultatif { background: #dbeafe; color: #1e40af; }
.appareil { font-size: 8.8pt; color: #334155; font-weight: 600; margin: 2px 0 4px; }
.callout { border-left: 4px solid; border-radius: 8px; padding: 6px 10px; margin: 6px 0; }
.callout.attente { border-color: #f59e0b; background: #fffbeb; }
.callout.alerte { border-color: #ef4444; background: #fef2f2; }
.callout.resultat { border-color: #22c55e; background: #f0fdf4; }
.callout.info { border-color: #3b82f6; background: #eff6ff; }
.champ { font-weight: 600; text-decoration: underline; text-decoration-color: #94a3b8; text-underline-offset: 2px; }
.valeur { background: #e0e7ff; color: #1e3a8a; font-weight: 700; border-radius: 4px; padding: 0 5px; }
.bouton { background: #1d4ed8; color: #fff; border-radius: 999px; padding: 0 8px; font-weight: 600; font-size: 8.8pt; white-space: nowrap; }
.fichier { font: 8.6pt "DejaVu Sans Mono", monospace; background: #f1f5f9; border-radius: 4px; padding: 0 5px; white-space: nowrap; }
.coches { color: #475569; font-size: 8.8pt; margin-top: 8px; display: flex; gap: 14px; flex-wrap: wrap; }
.coches span::before { content: ""; display: inline-block; width: 10px; height: 10px; border: 1.3px solid #64748b; border-radius: 3px; margin-right: 4px; vertical-align: -1px; }
.coches .ref::before { display: none; }
.coches .ref { flex: 1; border-bottom: 1px dotted #94a3b8; }
table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; }
th, td { text-align: left; padding: 5px 8px; vertical-align: top; border-bottom: 1px solid #e2e8f0; }
th { background: #172554; color: #fff; font-weight: 700; font-size: 8.8pt; }
tr.phase td { background: #eef2ff; font-weight: 700; color: #172554; }
td.num-col { color: #1d4ed8; font-weight: 700; white-space: nowrap; }
td.duree-col { color: #64748b; white-space: nowrap; font-size: 8.8pt; }
tbody tr:nth-child(even) td { background: #f8fafc; }
.deux { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
.role { border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; break-inside: avoid; }
.role b { color: #172554; }
.section { break-inside: avoid; }
.brouillon td { height: 34px; }
.petit { font-size: 8.6pt; color: #64748b; }
`;

function pied(texte) {
  return `<div style="width:100%;font:7.5pt 'Inter','Liberation Sans',sans-serif;color:#64748b;display:flex;justify-content:space-between;padding:0 14mm;"><span>${echapper(texte)}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}

function page(corps, titre) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(titre)}</title><style>${CSS_KIT}</style></head><body>${corps}</body></html>`;
}

function hero(kicker, titre, sous) {
  return `<div class="hero"><div class="kicker">${echapper(kicker)}</div><h1>${echapper(titre)}</h1><p>${baliser(sous)}</p></div>`;
}

const BADGES = {
  attente: '<span class="badge attente">⏳ Dépend d\'un autre testeur</span>',
  paiement: '<span class="badge paiement">💳 Paiement réel</span>',
  facultatif: '<span class="badge facultatif">Facultatif</span>',
};
const APPAREILS = { ordinateur: "💻 Ordinateur", telephone: "📱 Téléphone", les_deux: "💻 📱 Ordinateur ou téléphone" };

function carte(t) {
  const badges = (t.badges ?? []).map((b) => BADGES[b]).join(" ");
  return `<div class="carte"><div class="entete"><span class="num">${t.id}</span><span class="titre">${baliser(t.titre)}</span>${badges}<span class="duree">⏱ ${echapper(t.duree)}</span></div>
<div class="appareil">${APPAREILS[t.appareil ?? "ordinateur"]}</div>
${t.prerequis ? `<div class="callout attente">⏳ ${baliser(t.prerequis)}</div>` : ""}
${t.donnees ? `<p><b>Données :</b> ${baliser(t.donnees)}</p>` : ""}
${t.fichiers ? `<p><b>Fichiers :</b> ${t.fichiers.map((f) => `<span class="fichier">📎 ${echapper(f)}</span>`).join(" ")}</p>` : ""}
<ol>${t.etapes.map((e) => `<li>${baliser(e)}</li>`).join("")}</ol>
${t.alerte ? `<div class="callout alerte">${baliser(t.alerte)}</div>` : ""}
${t.info ? `<div class="callout info">${baliser(t.info)}</div>` : ""}
<div class="callout resultat"><b>Résultat attendu :</b> ${baliser(t.resultat)}</div>
<div class="coches"><span>OK</span><span>KO</span><span>Bloqué</span><span>Non fait</span><span class="ref">Réf. Gerimmo :</span></div></div>`;
}

export async function pdfFiche(chemin, k) {
  const total = k.phases.reduce((s, p) => s + p.tests.length, 0);
  const facultatifs = k.phases.reduce((s, p) => s + p.tests.filter((t) => (t.badges ?? []).includes("facultatif")).length, 0);
  const corps = `${hero("Kit de recette Gerimmo · Fiche de tests", k.role, `${k.heroFiche} — ${total} tests, dont ${facultatifs} facultatif${facultatifs > 1 ? "s" : ""}. Vos données : « Mon personnage ».`)}
<h2>Comment utiliser cette fiche</h2><ul>
<li><b>Dans l'ordre</b> : les tests suivent le déroulé de la recette (J1, J2…). Chaque carte dit sur quel appareil la faire, combien de temps elle prend, et quel test doit avoir été fait avant.</li>
<li><b>Les données</b> à saisir sont dans la carte ou dans « Mon personnage » ; les <b>fichiers</b> partent du dossier <code>documents/</code> de votre dossier.</li>
<li>${BADGES.attente} : attendez que la personne citée ait fait son test (le coordinateur vous prévient). ${BADGES.paiement} : votre carte est réellement débitée — seulement avec l'accord du coordinateur. ${BADGES.facultatif} : à faire si vous avez le temps.</li>
<li><b>Cochez</b> OK, KO, Bloqué ou Non fait. <b>KO ou Bloqué</b> : signalez-le tout de suite dans Gerimmo par « Aide et retours » (voir la fiche de remontée), en commençant le titre par le numéro du test (ex. <code>[GÊNANT] ${k.prefixe}-03 — …</code>), puis notez la <b>référence</b> donnée par Gerimmo.</li>
<li>Un écart entre le résultat attendu et ce que vous voyez est <b>toujours</b> bon à signaler, même petit.</li></ul>
<h2>Sommaire</h2><table><thead><tr><th>N°</th><th>Test</th><th>Durée</th></tr></thead><tbody>
${k.phases.map((p) => `<tr class="phase"><td colspan="3">${echapper(p.titre)}</td></tr>${p.tests.map((t) => `<tr><td class="num-col">${t.id}</td><td>${(t.badges ?? []).map((b) => ({ attente: "⏳ ", paiement: "💳 ", facultatif: "(facultatif) " })[b]).join("")}${echapper(t.titre)}</td><td class="duree-col">${echapper(t.duree)}</td></tr>`).join("")}`).join("")}
</tbody></table>
${k.phases.map((p) => `<h2>${echapper(p.titre)}</h2>${p.tests.map(carte).join("")}`).join("")}`;
  await htmlVersPdf(page(corps, `Fiche de tests — ${k.role}`), chemin, { pied: pied(`Kit de recette Gerimmo · Fiche de tests · ${k.role}`) });
}

function tableau(colonnes, lignes) {
  return `<table><thead><tr>${colonnes.map((c) => `<th>${echapper(c)}</th>`).join("")}</tr></thead><tbody>${lignes.map((l) => `<tr>${l.map((c) => `<td>${baliser(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

export async function pdfPersonnage(chemin, k) {
  const corps = `${hero(`Kit de recette Gerimmo · ${k.role}`, `Mon personnage : ${k.persona.prenom} ${k.persona.nom.toUpperCase()}`, k.heroPersonnage)}
${k.sections.map((s) => `<div class="section"><h2>${echapper(s.titre)}</h2>${s.intro ? `<p>${baliser(s.intro)}</p>` : ""}${s.tableau ? tableau(s.tableau.colonnes, s.tableau.lignes) : ""}${s.puces ? `<ul>${s.puces.map((p) => `<li>${baliser(p)}</li>`).join("")}</ul>` : ""}${s.callout ? `<div class="callout info"><b>${echapper(s.callout.titre)}</b><br>${baliser(s.callout.texte)}</div>` : ""}${s.apres ? `<p>${baliser(s.apres)}</p>` : ""}</div>`).join("")}`;
  await htmlVersPdf(page(corps, `Mon personnage — ${k.role}`), chemin, { pied: pied(`Kit de recette Gerimmo · Mon personnage · ${k.role}`) });
}

export async function pdfLire(chemin, g) {
  const corps = `${hero("Kit de recette Gerimmo · Pour tous les testeurs", "Merci de tester Gerimmo !", "Tout est prêt pour vous : un personnage fictif, tous ses documents, et une fiche qui dit quoi faire, écran par écran. Vous n'avez rien à fournir de personnel — sauf votre adresse e-mail.")}
<h2>1. Gerimmo en deux phrases</h2><p>Gerimmo est une application de gestion locative : une agence immobilière ou un propriétaire y gère ses biens, ses baux, ses loyers et quittances, ses incidents et les artisans qui les réparent ; le locataire y retrouve son bail, ses quittances et signale ses problèmes ; l'artisan y reçoit ses missions. Elle est en ligne sur <b>https://www.gerimmo.app</b>, et c'est la vraie application que vous allez tester.</p>
<h2>2. Ce qu'on vous demande</h2><ul><li>Jouer un rôle pendant environ une semaine : 3 à 6 heures au total, par petites séances.</li><li>Dérouler votre fiche de tests dans l'ordre, et cocher OK, KO ou Bloqué (sur papier ou dans le tableau Excel).</li><li>Signaler tout ce qui cloche — un bug, une phrase incompréhensible, un bouton introuvable, une idée — avec la fonction « Aide et retours » de Gerimmo (voir la fiche de remontée). Un doute compte : signalez-le.</li></ul>
<h2>3. Ce que contient votre dossier</h2>${tableau(["Fichier", "À quoi il sert"], [["00-A-lire-en-premier.pdf", "Ce document"], ["01-Fiche-de-tests-….pdf", "Vos tests numérotés, pas à pas, avec le résultat attendu"], ["02-Mon-personnage-….pdf", "Qui vous êtes, et toutes les données à saisir (noms, adresses, montants, dates)"], ["03-Fiche-de-remontee.pdf", "Comment signaler un problème depuis Gerimmo"], ["04-Suivi-des-tests-….xlsx", "Votre tableau de suivi (statut, référence de signalement, commentaire)"], ["documents/", "Les pièces fictives à déposer dans Gerimmo, rangées dans l'ordre des tests"]])}
<h2>4. Les cinq rôles et comment ils se croisent</h2><div class="deux">${g.roles.map((r) => `<div class="role">${r.icone} <b>${echapper(r.titre)}</b> — ${baliser(r.texte)}</div>`).join("")}</div>
<p style="margin-top:8px">Les tests sont enchaînés : un locataire ne peut pas se connecter avant d'avoir été invité, l'artisan ne peut pas faire de devis avant qu'un incident existe… Chaque test qui attend quelqu'un porte la pastille ${BADGES.attente} et dit qui attendre.</p>
<h2>5. Les règles du jeu</h2><ol>
<li><b>Vous êtes votre personnage.</b> Nom, date de naissance, adresse, pièces : tout vient de « Mon personnage ». Ne saisissez jamais vos vraies pièces, vos vrais bulletins ni votre vrai RIB.</li>
<li><b>Seule votre adresse e-mail est réelle</b> : Gerimmo envoie de vrais courriels (invitation, confirmation, quittances…). Pour les personnages secondaires, on utilise des alias « + » de votre adresse, par exemple <code>prenom.nom+garant@gmail.com</code> : le courriel arrive dans votre boîte habituelle. Ça marche avec Gmail, Outlook et Hotmail ; si votre messagerie ne l'accepte pas, dites-le au coordinateur.</li>
<li><b>Mot de passe</b> : 12 caractères minimum, et pas un mot de passe connu des fuites de données (Gerimmo le refuse). Prenez-en un nouveau, que vous n'utilisez nulle part ailleurs.</li>
<li><b>Les liens reçus par courriel</b> (accès, confirmation d'adresse, mot de passe oublié) ouvrent une page avec un bouton : c'est le clic sur ce bouton qui vaut. Un lien ne sert qu'une fois et reste valable une durée limitée ; expiré, redemandez-en un depuis la page de connexion.</li>
<li><b>Ordinateur ET téléphone</b> : certains tests se font au téléphone (déclarer un incident avec une photo, faire le compte rendu d'une intervention). Transférez les photos du dossier sur votre téléphone à l'avance (AirDrop, e-mail à vous-même, Drive…).</li>
<li><b>Aucun virement de loyer</b> : le loyer ne se paie pas dans Gerimmo. Les IBAN affichés sont fictifs (banque 99999). C'est le gestionnaire qui saisit le paiement « comme s'il avait été reçu ».</li>
<li><b>Un fichier = un dépôt</b> : Gerimmo refuse de ranger deux fois le même fichier. Si un dépôt échoue, ne réessayez pas le même fichier en boucle : utilisez la copie de secours prévue, ou signalez-le.</li>
<li><b>Ne cassez pas le travail des autres</b> : ne supprimez rien qui ne vous appartient pas, sauf si le test le dit. Pour le reste, n'ayez pas peur : trouver ce qui casse, c'est le but.</li>
<li><b>Certaines choses arrivent le lendemain matin</b> : envoi automatique des quittances, rappels de rendez-vous, relances. Si un résultat « n'arrive pas », vérifiez le lendemain avant de signaler.</li></ol>
<h2>6. Le calendrier de la recette</h2>${tableau(["Jour", "Ce qui se passe"], g.calendrier)}<p class="petit">Le coordinateur fixe les vraies dates et prévient chacun quand son tour arrive.</p>
<h2>7. Les paiements sont réels</h2><div class="callout alerte"><b>Qui paie quoi</b><ul>${g.paiements.map((p) => `<li>${baliser(p)}</li>`).join("")}</ul></div>
<p>Le paiement se fait par carte sur la page sécurisée de Stripe. Pendant l'essai (<b>2 mois</b> pour toute inscription jusqu'au 31 décembre 2026, offre de lancement ; 1 mois ensuite), la carte est enregistrée et débitée à la fin de l'essai — la date exacte est affichée ; l'abonnement apparaît « actif » tout de suite. On résilie à tout moment depuis Mon abonnement → <span class="bouton">Gérer mon abonnement</span>.</p>
<p>Le coordinateur vous dit, avant le test, comment ces sommes sont prises en charge (il peut rembourser depuis Stripe) : en cas de doute, demandez-lui avant de payer.</p>
<h2>8. Les courriels que vous allez recevoir</h2><p>Expéditeur Gerimmo (ou le nom de l'agence, pour les locataires de l'agence). Regardez aussi dans les indésirables et ajoutez l'expéditeur à vos contacts.</p>
${tableau(["Courriel", "Qui le reçoit"], [["« Votre accès Gerimmo » (lien pour choisir son mot de passe)", "agence, locataires invités, agent"], ["« Confirmez votre adresse — Gerimmo »", "propriétaire, artisan (inscription en ligne)"], ["Avis d'échéance, quittance ou reçu, relance d'impayé", "locataires"], ["Rappel d'intervention (la veille)", "locataire et artisan"], ["Votre bail signé est disponible", "locataires"], ["Votre rapport de gestion", "le mandant (alias « +mandant » du testeur agence)"], ["Reçus Stripe, prélèvement non passé", "propriétaire (et agence si elle paie)"]])}
<h2>9. En cas de souci</h2><ul><li>Un problème, une question, une idée : « Aide et retours », dans Gerimmo (fiche de remontée).</li><li>Vous êtes bloqué et ne pouvez même pas signaler : prévenez le coordinateur (plan B de la fiche de remontée).</li><li>Vous avez un doute sur une donnée : tout est dans « Mon personnage ».</li></ul>`;
  await htmlVersPdf(page(corps, "À lire en premier"), chemin, { pied: pied(`Kit de recette Gerimmo · À lire en premier · ${g.date}`) });
}

export async function pdfRemontee(chemin, g) {
  const corps = `${hero("Kit de recette Gerimmo · Pour tous les testeurs", "Remonter un problème, une question ou une idée", "Tout passe par « Aide et retours », la fonction intégrée à Gerimmo. Cette fiche dit où la trouver, quoi écrire, et comment suivre la réponse.")}
<h2>1. La règle</h2><p>Chaque problème, chaque question, chaque idée se déclare dans Gerimmo, par « Aide et retours ». Pas de message WhatsApp, pas d'e-mail — sauf si « Aide et retours » est lui-même inaccessible (voir le plan B, § 7).</p>
<p>Pourquoi : la demande arrive directement dans la console de supervision, avec la page d'où vous écrivez ; elle y est triée, suivie jusqu'à sa résolution, et vous lisez la réponse dans votre propre espace. Rien ne se perd dans une conversation.</p>
<div class="callout info"><b>Le bon réflexe</b><br>Signalez sur le moment, depuis la page où le problème se produit : Gerimmo joint automatiquement l'adresse de cette page à votre demande. Si vous attendez la fin de la journée, notez au moins l'essentiel dans le brouillon du § 8.</div>
<h2>2. Où trouver « Aide et retours »</h2>${tableau(["Vous testez…", "Sur ordinateur", "Sur téléphone"], [["l'agence immobilière ou le propriétaire bailleur", "Barre du haut : lien Aide et retours (icône seule si la fenêtre est étroite, libellé à partir de 1024 px de large)", "Barre du bas -> Menu -> dernière ligne Aide et retours"], ["un locataire (de l'agence ou du propriétaire)", "Menu de gauche -> dernière entrée Aide et retours", "Barre du bas -> Menu -> Aide et retours"], ["l'artisan", "Bouton rond flottant, en bas à droite de l'écran", "Le même bouton rond : il apparaît quand on arrive en bas de la page"], ["n'importe qui", "Une page d'erreur propose le lien et affiche une « réf. » à recopier", "idem"]])}
<p>Adresse directe, si vous ne trouvez pas : <b>https://www.gerimmo.app/assistance</b> (il faut être connecté).</p>
<h2>3. Envoyer une demande, en quatre gestes</h2><ol>
<li><b>Ouvrir</b> « Aide et retours » depuis la page qui pose problème. Vous arrivez sur l'onglet Mes demandes, formulaire Nouvelle demande.</li>
<li><b>Choisir le type</b> dans {Votre demande} : [Signaler un problème] (quelque chose ne marche pas, un message d'erreur, un résultat faux) · [Demander une explication] (vous ne comprenez pas comment faire) · [Proposer une idée] (une amélioration).</li>
<li><b>Vérifier</b> {Espace concerné}. Si vous n'avez qu'un espace, il est déjà choisi. Sinon, prenez celui du test (par exemple [${g.espaceExemple}]). C'est ce choix qui décide qui voit la demande.</li>
<li><b>Remplir</b> les champs avec le gabarit du § 4, puis <<Envoyer ma demande>>. Le message « Votre demande est enregistrée. » s'affiche : notez la référence (8 caractères) dans la colonne « Réf. Gerimmo » de votre tableau de suivi.</li></ol>
<h2>4. Le gabarit : quoi écrire dans chaque champ</h2>${tableau(["Champ dans Gerimmo", "Ce qu'on y met", "Limites"], [["Titre (pour une idée : Le besoin en une phrase)", "__[GRAVITÉ]__ N° du test — ce qui ne va pas, en une phrase", "5 à 160 caractères"], ["Ce qui se passe", "Le test, les étapes suivies, ce que vous constatez, votre appareil, l'heure, la « réf. » d'erreur s'il y en a une", "15 à 6 000 caractères"], ["Le résultat attendu (problèmes seulement)", "Recopiez le « Résultat attendu » de votre fiche de tests, ou dites ce qui vous semblait logique", "5 à 3 000 caractères"]])}
<p>La gravité, en tête du titre (la supervision la reprend pour trier) : <code>[BLOQUANT]</code> — je ne peux pas continuer le test ; <code>[GÊNANT]</code> — je contourne, mais c'est faux, lent ou pénible ; <code>[DÉTAIL]</code> — faute d'orthographe, libellé peu clair, affichage décalé.</p>
<div class="callout info"><b>Modèle à recopier dans Ce qui se passe :</b><br><code style="white-space:pre-wrap;display:block;background:none;padding:0">${echapper(g.modele)}</code></div>
<h2>5. Bon à savoir</h2><ul>
<li><b>Une demande = un problème.</b> Deux soucis sur la même page : deux demandes.</li>
<li><b>Pas de pièce jointe, pas de capture d'écran</b> dans « Aide et retours » : décrivez avec des mots. Gardez tout de même la capture sur votre téléphone ; le coordinateur vous la demandera si elle est utile.</li>
<li>Gerimmo joint seul l'adresse de la page (sans son contenu) et votre dernier geste (clic, envoi de formulaire…). Il ne joint pas votre appareil ni votre navigateur : écrivez-les.</li>
<li>Une page d'erreur affiche une « réf. » : recopiez-la, c'est ce qui permet de retrouver la panne.</li>
<li><b>Aucune donnée personnelle réelle</b> : vous jouez un personnage fictif, gardez ses données dans vos descriptions.</li>
<li>20 demandes par heure au maximum par personne ; au-delà, Gerimmo demande d'attendre une heure.</li>
<li>Une idée demande de cocher une case : elle sera visible des membres de l'espace choisi (y compris les locataires de cet espace) et de la supervision.</li>
<li><b>Qui voit quoi</b> : vous, la supervision et l'administrateur de l'espace choisi. Si vous êtes locataire, votre gestionnaire voit donc vos signalements : c'est normal.</li>
<li>Rien n'est bloqué par l'abonnement : même si un espace passe en lecture seule, « Aide et retours » reste ouvert.</li></ul>
<h2>6. Suivre la réponse</h2><div class="callout attente"><b>Aucun e-mail ne vous prévient.</b> Quand la supervision répond, Gerimmo n'envoie pas de courriel : retournez dans Aide et retours → Mes demandes. Chaque carte montre le statut, la date, la référence et la dernière réponse (« Réponse de la supervision · date et heure ») ; les étapes plus anciennes sont repliées.</div>
${tableau(["Statut (problème, question)", "Ce que ça veut dire", "Ce que vous faites"], [["Reçu", "La demande est arrivée", "Rien, continuez vos tests"], ["En examen", "La supervision l'étudie", "Répondez si une question vous est posée"], ["En cours de traitement", "Une correction est en cours", "Contournez ou passez au test suivant"], ["Résolu", "Corrigé ou expliqué", "Refaites le test et notez le résultat dans votre suivi"]])}
<p>Pour une idée : [Idée retenue], [Non retenue pour le moment] (avec une date de réexamen) ou [Déjà couverte]. Toujours cassé après « Résolu » ? Nouvelle demande, en citant la référence de l'ancienne dans le titre.</p>
<h2>7. Plan B : si « Aide et retours » est inaccessible</h2><p>Vous ne pouvez pas vous connecter, ou la page « Aide et retours » ne s'ouvre pas : écrivez au coordinateur (WhatsApp, SMS ou e-mail) avec le même gabarit, en commençant par <b>PLAN B —</b>. C'est le seul cas où l'on sort de Gerimmo.</p>
<h2>8. Brouillon à imprimer (si vous testez loin de votre ordinateur)</h2><table class="brouillon"><thead><tr><th>N° du test</th><th>Ce qui ne va pas (titre)</th><th>Étapes · constaté · attendu</th><th>Gravité</th><th>Appareil · heure</th><th>Réf. Gerimmo</th></tr></thead><tbody>${"<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>".repeat(6)}</tbody></table>
<h2>9. Deux exemples</h2><div class="callout resultat"><b>Utile</b><br><b>Titre :</b> ${echapper(g.exempleUtile.titre)}<br><b>Ce qui se passe :</b> ${echapper(g.exempleUtile.corps)}<br><b>Le résultat attendu :</b> ${echapper(g.exempleUtile.attendu)}</div>
<div class="callout alerte"><b>Inutilisable</b><br><b>Titre :</b> Ça marche pas<br><b>Ce qui se passe :</b> J'ai essayé plusieurs fois, rien.<br><span class="petit">On ne sait ni quel test, ni quelle page, ni ce qui était attendu : la supervision devra vous recontacter, et le problème attendra.</span></div>`;
  await htmlVersPdf(page(corps, "Fiche de remontée"), chemin, { pied: pied(`Kit de recette Gerimmo · Fiche de remontée · ${g.date}`) });
}
