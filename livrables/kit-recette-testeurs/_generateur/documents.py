"""Les documents fictifs à déposer dans Gerimmo pendant la recette.

Chaque fonction rend le HTML d'un document ; `produire(...)` l'imprime en PDF.
Tous portent un filigrane « SPÉCIMEN — DOCUMENT FICTIF » sur chaque page et
une mention en pied : ils servent à alimenter les écrans de dépôt, jamais à
tromper qui que ce soit. Aucun ne reprend l'apparence d'un document officiel
réel (pas d'emblème, pas de logo d'administration, pas de bande de lecture
optique).
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

from gabarits import doc_fictif, e
from images import signature_svg_en_ligne
from rendu import html_vers_pdf
import univers as U

MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]


def eur(montant: float) -> str:
    entier, dec = f"{montant:,.2f}".split(".")
    return entier.replace(",", " ") + "," + dec + " €"


def date_fr(iso: str) -> str:
    a, m, j = iso.split("-")
    return f"{j}/{m}/{a}"


def _logo(initiales: str, couleur: str) -> str:
    return f'<div class="logo-fictif" style="background:{couleur}">{e(initiales)}</div>'


def _entete(initiales: str, couleur: str, lignes: list[str], droite: str = "") -> str:
    return (
        f'<div class="entete"><div style="display:flex;gap:10px;align-items:center">{_logo(initiales, couleur)}'
        f'<div class="emetteur">{"<br>".join(lignes)}</div></div><div class="emetteur" style="text-align:right">{droite}</div></div>'
    )


def _signe(nom: str, graine: int, qualite: str, lieu_date: str) -> str:
    return (
        f'<div class="signature"><div class="bloc">{e(lieu_date)}<br>{signature_svg_en_ligne(nom, graine, 190)}'
        f'<br><b>{e(nom)}</b><br><span class="gris">{e(qualite)}</span></div></div>'
    )


def _adresse_personne(p: dict) -> str:
    return f"{e(p['adresse'])}<br>{e(p['code_postal'])} {e(p['ville'])}"


# ================================================================ identité & ressources

def piece_identite(cle: str) -> str:
    p = U.PERSONNES[cle]
    silhouette = (
        '<svg viewBox="0 0 120 150" width="112" height="140"><rect width="120" height="150" rx="8" fill="#dfe5ee"/>'
        '<circle cx="60" cy="56" r="28" fill="#9aa8bd"/><path d="M14 150 C18 104 102 104 106 150 Z" fill="#9aa8bd"/></svg>'
    )
    numero = f"SPEC-{p['nom_fichier'][:3].upper()}-{p['naissance'][:4]}-RCT"
    corps = f"""
<h1>Pièce d'identité — spécimen de recette</h1>
<p class="gris">Ce spécimen tient lieu de pièce d'identité pour les essais de Gerimmo. Il ne reproduit aucun titre
officiel et n'a aucune valeur.</p>
<div class="cadre" style="display:flex;gap:18px;align-items:flex-start;border-width:2px;border-radius:14px;padding:16px;background:#f7f9fc;max-width:640px">
  {silhouette}
  <table style="margin:0;border:none">
    <tr><th style="width:42%">Nom</th><td><b>{e(p['nom'])}</b></td></tr>
    <tr><th>Prénom(s)</th><td>{e(p['prenom'])}</td></tr>
    <tr><th>Né(e) le</th><td>{date_fr(p['naissance'])}</td></tr>
    <tr><th>À</th><td>{e(p['lieu_naissance'])}</td></tr>
    <tr><th>Numéro du spécimen</th><td>{numero}</td></tr>
    <tr><th>Valable jusqu'au</th><td>31/12/2034</td></tr>
  </table>
</div>
<p style="margin-top:14px"><span class="tampon">SPÉCIMEN — NE PAS UTILISER HORS RECETTE</span></p>
<p class="petit gris" style="margin-top:14px">Recto et verso sont réunis sur cette page : un seul fichier suffit au dépôt.</p>
"""
    return doc_fictif(f"Pièce d'identité — {p['prenom']} {p['nom']}", corps)


def bulletin_salaire(cle: str, annee: int, mois: int) -> str:
    p = U.PERSONNES[cle]
    emp = U.EMPLOYEURS[p["employeur"]]
    brut = p["salaire_brut"]
    lignes = [
        ("Salaire de base", "151,67 h", eur(brut)),
        ("Santé — complémentaire (part salariale)", "", "-" + eur(round(brut * 0.012, 2))),
        ("Retraite de base et complémentaire", "", "-" + eur(round(brut * 0.1105, 2))),
        ("Assurance chômage et autres contributions", "", "-" + eur(round(brut * 0.0048, 2))),
        ("CSG déductible", "", "-" + eur(round(brut * 0.9825 * 0.068, 2))),
        ("CSG/CRDS non déductibles", "", "-" + eur(round(brut * 0.9825 * 0.029, 2))),
    ]
    net_avant = p["salaire_net"] + round(p["salaire_net"] * 0.047, 2)
    pas = round(p["salaire_net"] * 0.047, 2)
    rangs = "".join(f"<tr><td>{a}</td><td class='n'>{b}</td><td class='n'>{c}</td></tr>" for a, b, c in lignes)
    periode = f"{MOIS[mois - 1]} {annee}"
    corps = f"""
{_entete("SP" if cle == "camille" else "MF", "#475569", [f"<b>{e(emp['nom'])}</b> ({e(emp['forme'])})", e(emp['adresse']), f"SIRET {e(emp['siret'])} — NAF {e(emp['naf'])}"],
         f"<b>BULLETIN DE PAIE</b><br>Période : {periode}<br>Paiement le 28/{mois:02d}/{annee}")}
<div class="cadre" style="display:flex;justify-content:space-between">
  <div><b>{e(p['civilite'])} {e(p['prenom'])} {e(p['nom'])}</b><br>{_adresse_personne(p)}</div>
  <div class="petit">Emploi : {e(p['profession'])}<br>Convention : {e(emp['convention'])}<br>Matricule : RCT-{p['naissance'][2:4]}{mois:02d}</div>
</div>
<table><tr><th>Rubrique</th><th class="n">Base</th><th class="n">Montant</th></tr>{rangs}
<tr><th>Net à payer avant impôt sur le revenu</th><th></th><th class="n">{eur(net_avant)}</th></tr>
<tr><td>Impôt sur le revenu prélevé à la source (taux 4,7 %)</td><td></td><td class="n">-{eur(pas)}</td></tr>
<tr><th>NET PAYÉ (virement)</th><th></th><th class="n">{eur(p['salaire_net'])}</th></tr></table>
<p class="petit gris">Cumul imposable et détail des cotisations patronales omis : bulletin simplifié, fictif, pour les essais de dépôt de pièces.</p>
"""
    return doc_fictif(f"Bulletin de paie {periode} — {p['prenom']} {p['nom']}", corps)


def avis_impot(cle: str) -> str:
    p = U.PERSONNES[cle]
    rfr = p["revenu_fiscal"]
    corps = f"""
<h1>Avis d'impôt sur le revenu {U.ANNEE} — revenus {U.ANNEE - 1}</h1>
<p class="gris">Spécimen de recette : ne reproduit pas l'avis officiel ; les numéros sont remplacés par « SPÉCIMEN ».</p>
<div class="cadre" style="display:flex;justify-content:space-between">
  <div><b>{e(p['civilite'])} {e(p['prenom'])} {e(p['nom'])}</b><br>{_adresse_personne(p)}</div>
  <div class="petit">Numéro fiscal : SPÉCIMEN<br>Référence de l'avis : SPÉCIMEN<br>Date d'établissement : 29/07/{U.ANNEE}</div>
</div>
<table>
<tr><th>Élément</th><th class="n">Montant</th></tr>
<tr><td>Revenu fiscal de référence</td><td class="n"><b>{rfr:,} €</b></td></tr>
<tr><td>Nombre de parts</td><td class="n">1</td></tr>
<tr><td>Situation de famille</td><td class="n">Célibataire</td></tr>
<tr><td>Impôt sur le revenu net</td><td class="n">{p['impot']:,} €</td></tr>
<tr><td>Prélèvement à la source déjà versé</td><td class="n">{p['impot']:,} €</td></tr>
<tr><td>Reste à payer</td><td class="n">0 €</td></tr>
</table>
""".replace(",", " ")
    return doc_fictif(f"Avis d'impôt — {p['prenom']} {p['nom']}", corps)


def attestation_employeur(cle: str) -> str:
    p = U.PERSONNES[cle]
    emp = U.EMPLOYEURS[p["employeur"]]
    corps = f"""
{_entete("SP" if cle == "camille" else "MF", "#475569", [f"<b>{e(emp['nom'])}</b> ({e(emp['forme'])})", e(emp['adresse']), f"SIRET {e(emp['siret'])}"])}
<h1>Attestation d'employeur</h1>
<p>Je soussigné(e), responsable des ressources humaines de la société <b>{e(emp['nom'])}</b>, atteste que
<b>{e(p['civilite'])} {e(p['prenom'])} {e(p['nom'])}</b>, né(e) le {date_fr(p['naissance'])}, est employé(e) au sein de
notre société en qualité de <b>{e(p['profession'])}</b>.</p>
<p>Contrat à durée indéterminée, période d'essai terminée, aucune procédure de licenciement ou de démission en cours.
Rémunération brute mensuelle : <b>{eur(p['salaire_brut'])}</b>.</p>
<p>Attestation délivrée à l'intéressé(e) pour faire valoir ce que de droit.</p>
{_signe("R. Moreau", 41 if cle == "camille" else 42, "Responsable RH (personnage fictif)", "Fait le 15/09/" + str(U.ANNEE))}
"""
    return doc_fictif(f"Attestation d'employeur — {p['prenom']} {p['nom']}", corps)


def justificatif_domicile(cle: str) -> str:
    p = U.PERSONNES[cle]
    corps = f"""
{_entete("VR", "#0e7490", ["<b>Volt Recette Énergie</b> (fournisseur fictif)", "Service clients — BP 000, 91000 Évry-Courcouronnes"],
         "<b>FACTURE D'ÉLECTRICITÉ</b><br>N° SPÉCIMEN-" + p['naissance'][:4] + "<br>Émise le 05/08/" + str(U.ANNEE))}
<div class="cadre"><b>{e(p['civilite'])} {e(p['prenom'])} {e(p['nom'])}</b><br>{_adresse_personne(p)}</div>
<p>Adresse de consommation : {_adresse_personne(p).replace('<br>', ', ')}</p>
<table><tr><th>Période</th><th>Consommation</th><th class="n">Montant TTC</th></tr>
<tr><td>01/06/{U.ANNEE} — 31/07/{U.ANNEE}</td><td>412 kWh (option base, 6 kVA)</td><td class="n">{eur(118.42)}</td></tr></table>
<p class="petit gris">Justificatif de domicile fictif (ancien logement du personnage).</p>
"""
    return doc_fictif(f"Justificatif de domicile — {p['prenom']} {p['nom']}", corps)


def rib(titulaire: str, adresse: str, banque: dict) -> str:
    corps = f"""
{_entete("BF", "#1e3a8a", ["<b>Banque Fictive de Recette</b>", e(banque['domiciliation'])], "<b>RELEVÉ D'IDENTITÉ BANCAIRE</b>")}
<div class="cadre"><b>Titulaire du compte</b><br>{e(titulaire)}<br>{adresse}</div>
<table>
<tr><th>Code banque</th><th>Code guichet</th><th>N° de compte</th><th>Clé RIB</th></tr>
<tr><td>{banque['banque']}</td><td>{banque['guichet']}</td><td>{banque['compte']}</td><td>{banque['cle_rib']}</td></tr>
</table>
<table>
<tr><th style="width:30%">IBAN</th><td><b style="font-family:'DejaVu Sans Mono',monospace">{banque['iban_lisible']}</b></td></tr>
<tr><th>BIC</th><td style="font-family:'DejaVu Sans Mono',monospace">{banque['bic']}</td></tr>
</table>
<p class="petit gris">Clés de contrôle justes mais banque fictive (code 99999) : aucun virement réel n'est possible vers ce compte.</p>
"""
    return doc_fictif(f"RIB — {titulaire}", corps)


def attestation_pension(cle: str) -> str:
    p = U.PERSONNES[cle]
    corps = f"""
{_entete("CR", "#6d28d9", ["<b>Caisse de Retraite Fictive</b>", "10 rue des Annuités, 35000 Rennes"], "<b>ATTESTATION DE PAIEMENT</b><br>Année " + str(U.ANNEE))}
<div class="cadre"><b>{e(p['civilite'])} {e(p['prenom'])} {e(p['nom'])}</b><br>{_adresse_personne(p)}</div>
<p>Nous certifions que l'intéressé(e) perçoit une pension de retraite de base et complémentaire d'un montant net
mensuel de <b>{eur(p['pension_mensuelle'])}</b>, versée le 9 de chaque mois.</p>
{_signe("Service des pensions", 51, "Caisse de Retraite Fictive", "Rennes, le 02/09/" + str(U.ANNEE))}
"""
    return doc_fictif(f"Attestation de pension — {p['prenom']} {p['nom']}", corps)


def attestation_assurance_habitation(cle: str, adresse_logement: str, numero: str) -> str:
    p = U.PERSONNES[cle]
    a = U.ASSURANCE_HABITATION
    corps = f"""
{_entete("MFE", "#0f766e", [f"<b>{e(a['assureur'])}</b>", e(a['adresse'])], "<b>ATTESTATION D'ASSURANCE</b><br>Multirisque habitation")}
<p>Nous soussignés, <b>{e(a['assureur'])}</b>, attestons que :</p>
<div class="cadre"><b>{e(p['civilite'])} {e(p['prenom'])} {e(p['nom'])}</b> — locataire<br>
Logement assuré : <b>{e(adresse_logement)}</b></div>
<p>est titulaire du contrat <b>n° {e(numero)}</b>, en vigueur du <b>{a['debut']}</b> au <b>{a['fin']}</b>
inclus, sous réserve du paiement des cotisations.</p>
<table><tr><th>Garanties souscrites</th><th>Statut</th></tr>
<tr><td>Risques locatifs : incendie, explosion, dégât des eaux</td><td>Acquise</td></tr>
<tr><td>Recours des voisins et des tiers</td><td>Acquise</td></tr>
<tr><td>Responsabilité civile vie privée</td><td>Acquise</td></tr>
<tr><td>Vol et vandalisme</td><td>Acquise</td></tr></table>
<p>La présente attestation est délivrée pour servir et valoir ce que de droit ; elle ne peut engager l'assureur
au-delà des conditions du contrat.</p>
{_signe("Service contrats", 61 if cle == "camille" else 62, a['assureur'], "Évry-Courcouronnes, le 20/09/" + str(U.ANNEE))}
"""
    return doc_fictif(f"Attestation d'assurance habitation — {p['prenom']} {p['nom']}", corps)


def lettre_conge_locataire(cle: str, adresse_logement: str, destinataire: str, adresse_dest: str, date_lettre: str, date_fin: str) -> str:
    p = U.PERSONNES[cle]
    corps = f"""
<div class="serif">
<p><b>{e(p['prenom'])} {e(p['nom'])}</b><br>{e(adresse_logement)}</p>
<p style="margin-left:55%"><b>{e(destinataire)}</b><br>{adresse_dest}</p>
<p style="margin-left:55%">Le {e(date_lettre)}</p>
<p><b>Lettre recommandée avec accusé de réception</b><br><b>Objet : congé du logement loué</b></p>
<p>Madame, Monsieur,</p>
<p>Par la présente, je vous notifie mon congé du logement situé {e(adresse_logement)}, que je loue en vertu du
bail qui nous lie. Conformément aux dispositions applicables, mon préavis court à compter de la réception de
cette lettre ; je libérerai le logement au plus tard le <b>{e(date_fin)}</b>.</p>
<p>Je vous propose de convenir ensemble de la date de l'état des lieux de sortie et de la remise des clés, et
vous remercie de me restituer le dépôt de garantie dans les délais légaux.</p>
<p>Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.</p>
{_signe(p['prenom'][0] + '. ' + p['nom'].title(), 71, p['prenom'] + ' ' + p['nom'], '')}
</div>
"""
    return doc_fictif(f"Lettre de congé — {p['prenom']} {p['nom']}", corps)


# ================================================================ diagnostics

def _entete_diag(titre: str, numero: str, bien: dict, lot: dict | None, date_diag: str, validite: str) -> str:
    d = U.DIAGNOSTIQUEUR
    lot_txt = f" — {e(lot['designation'])}" if lot else ""
    return f"""
{_entete("DE", "#0369a1", [f"<b>{e(d['nom'])}</b> (cabinet fictif)", e(d['adresse']), f"SIRET {e(d['siret'])}"],
         f"<b>{e(titre)}</b><br>N° {e(numero)}<br>Établi le {e(date_diag)}")}
<table>
<tr><th style="width:30%">Bien</th><td>{e(bien['reference'])}{lot_txt}<br>{e(bien['adresse'])}, {e(bien['code_postal'])} {e(bien['ville'])}</td></tr>
<tr><th>Année de construction</th><td>{bien['annee']}</td></tr>
<tr><th>Opérateur</th><td>{e(d['technicien'])} — {e(d['certification'])}</td></tr>
<tr><th>Validité</th><td>{e(validite)}</td></tr>
</table>
"""


def dpe(bien: dict, lot: dict, numero: str, date_diag: str, fin_validite: str) -> str:
    classes = [("A", "#009c6d", "≤ 70"), ("B", "#52b153", "71 à 110"), ("C", "#a5cc74", "111 à 180"),
               ("D", "#f4e70f", "181 à 250"), ("E", "#f0b40f", "251 à 330"), ("F", "#eb8235", "331 à 420"),
               ("G", "#d7221f", "> 420")]
    barres = ""
    for i, (c, couleur, plage) in enumerate(classes):
        actif = c == lot["dpe"]["energie"]
        largeur = 150 + i * 42
        fleche = f'<span style="margin-left:12px;font-weight:700">◀ {lot["dpe"]["conso"]} kWh/m²/an · {lot["dpe"]["emissions"]} kg CO₂/m²/an</span>' if actif else ""
        barres += (
            f'<div style="display:flex;align-items:center;margin:3px 0">'
            f'<div style="width:{largeur}px;background:{couleur};color:#1d2330;font-weight:700;padding:3px 8px;'
            f'clip-path:polygon(0 0,calc(100% - 12px) 0,100% 50%,calc(100% - 12px) 100%,0 100%);'
            f'{"outline:3px solid #1d2330;" if actif else ""}">{c} <span style="font-weight:400;font-size:8pt">{plage}</span></div>{fleche}</div>'
        )
    corps = f"""
<h1>Diagnostic de performance énergétique (logement)</h1>
{_entete_diag("DPE", numero, bien, lot, date_diag, f"Jusqu'au {fin_validite} (10 ans)")}
<table>
<tr><th style="width:30%">Surface habitable</th><td>{str(lot['surface']).replace('.', ',')} m²</td></tr>
<tr><th>Chauffage / eau chaude</th><td>{e(bien['chauffage'])} / {e(bien['eau_chaude'])}</td></tr>
<tr><th>Classe énergie</th><td><b style="font-size:13pt">{lot['dpe']['energie']}</b></td></tr>
<tr><th>Classe climat (GES)</th><td><b>{lot['dpe']['ges']}</b></td></tr>
<tr><th>Estimation des coûts annuels</th><td>entre {lot['dpe']['cout_min']} € et {lot['dpe']['cout_max']} € par an (prix de l'énergie de référence)</td></tr>
</table>
<h2>Étiquette (valeurs fictives)</h2>
{barres}
<p class="petit gris" style="margin-top:10px">Numéro fictif : il ne figure dans aucune base publique. Ce spécimen sert à renseigner la fiche du lot et à
tester les règles liées à la classe énergie.</p>
"""
    return doc_fictif(f"DPE — {bien['reference']} {lot['cle']}", corps)


def erp(bien: dict, numero: str, date_diag: str) -> str:
    corps = f"""
<h1>État des risques et pollutions (ERP)</h1>
{_entete_diag("ERP", numero, bien, None, date_diag, "6 mois — à renouveler à chaque nouveau bail")}
<p class="gris">Valeurs FICTIVES, saisies pour les essais : elles ne décrivent pas la situation réelle de la commune.</p>
<table><tr><th>Risque ou information</th><th>Situation déclarée</th></tr>
<tr><td>Plan de prévention des risques naturels</td><td>Non concerné</td></tr>
<tr><td>Plan de prévention des risques technologiques</td><td>Non concerné</td></tr>
<tr><td>Zone de sismicité</td><td>Zone 1 — très faible</td></tr>
<tr><td>Potentiel radon</td><td>Catégorie 1</td></tr>
<tr><td>Retrait-gonflement des argiles</td><td>Exposition moyenne</td></tr>
<tr><td>Secteur d'information sur les sols</td><td>Non concerné</td></tr>
<tr><td>Recul du trait de côte</td><td>Non concerné</td></tr>
<tr><td>Sinistre indemnisé (catastrophe naturelle) pendant l'occupation du bailleur</td><td>Aucun</td></tr>
</table>
{_signe("Le bailleur ou son mandataire", 81, "Déclaration fictive", "Établi le " + date_diag)}
"""
    return doc_fictif(f"ERP — {bien['reference']}", corps)


def amiante(bien: dict, lot: dict | None, numero: str, date_diag: str) -> str:
    corps = f"""
<h1>Repérage amiante — dossier amiante parties privatives (DAPP)</h1>
{_entete_diag("DAPP", numero, bien, lot, date_diag, "Illimitée en l'absence d'amiante")}
<h2>Conclusion</h2>
<div class="cadre"><b>Il n'a pas été repéré de matériaux et produits contenant de l'amiante</b> dans les parties
privatives visitées (listes A et B).</div>
<table><tr><th>Local visité</th><th>Matériaux examinés</th><th>Résultat</th></tr>
<tr><td>Séjour</td><td>Dalles de sol, enduits</td><td>Absence</td></tr>
<tr><td>Cuisine</td><td>Faïence, colles</td><td>Absence</td></tr>
<tr><td>Salle d'eau</td><td>Conduits, joints</td><td>Absence</td></tr></table>
"""
    return doc_fictif(f"Amiante — {bien['reference']}", corps)


def crep(bien: dict, lot: dict, numero: str, date_diag: str) -> str:
    corps = f"""
<h1>Constat de risque d'exposition au plomb (CREP)</h1>
{_entete_diag("CREP", numero, bien, lot, date_diag, "Illimitée : aucune concentration ≥ 1 mg/cm²")}
<h2>Conclusion</h2>
<div class="cadre"><b>Absence de revêtement contenant du plomb à une concentration supérieure ou égale au seuil
de 1 mg/cm².</b> Aucune situation de risque de saturnisme ni de dégradation du bâti relevée.</div>
<table><tr><th>Unités de diagnostic mesurées</th><th>Mesures</th><th>Classement</th></tr>
<tr><td>Menuiseries, plinthes, murs</td><td>58 mesures, maximum 0,3 mg/cm²</td><td>Classe 0</td></tr></table>
"""
    return doc_fictif(f"CREP — {bien['reference']}", corps)


def electricite(bien: dict, lot: dict, numero: str, date_diag: str, fin: str) -> str:
    corps = f"""
<h1>État de l'installation intérieure d'électricité</h1>
{_entete_diag("ÉLECTRICITÉ", numero, bien, lot, date_diag, f"Jusqu'au {fin} (6 ans en location)")}
<h2>Synthèse</h2>
<div class="cadre">L'installation intérieure d'électricité <b>ne comporte aucune anomalie</b> nécessitant une
intervention immédiate. Deux points d'information sont notés ci-dessous.</div>
<table><tr><th>Point de contrôle</th><th>Constat</th></tr>
<tr><td>Appareil général de commande et de protection</td><td>Présent, accessible</td></tr>
<tr><td>Dispositif différentiel 30 mA</td><td>Présent sur l'ensemble des circuits</td></tr>
<tr><td>Liaison équipotentielle salle d'eau</td><td>Conforme</td></tr>
<tr><td>Information</td><td>Prévoir le remplacement d'un cache de prise fêlé (chambre)</td></tr></table>
"""
    return doc_fictif(f"Électricité — {bien['reference']}", corps)


def gaz(bien: dict, lot: dict, numero: str, date_diag: str, fin: str) -> str:
    corps = f"""
<h1>État de l'installation intérieure de gaz</h1>
{_entete_diag("GAZ", numero, bien, lot, date_diag, f"Jusqu'au {fin} (6 ans en location)")}
<h2>Synthèse</h2>
<div class="cadre">L'installation <b>ne comporte aucune anomalie</b>. Chaudière murale entretenue (dernière
attestation d'entretien : 14/03/{U.ANNEE}).</div>
<table><tr><th>Appareil</th><th>Constat</th></tr>
<tr><td>Chaudière murale gaz naturel (production chauffage + eau chaude)</td><td>Conforme</td></tr>
<tr><td>Tuyauterie fixe et robinet de commande</td><td>Conforme</td></tr>
<tr><td>Ventilation du local</td><td>Conforme</td></tr></table>
"""
    return doc_fictif(f"Gaz — {bien['reference']}", corps)


# ================================================================ artisan

def kbis() -> str:
    a = U.ARTISAN_ENTREPRISE
    k = U.PERSONNES["karim"]
    corps = f"""
<h1>Extrait d'immatriculation au registre du commerce — spécimen</h1>
<p class="gris">Spécimen de recette : ne reproduit pas l'extrait délivré par un greffe ; aucune valeur.</p>
<table>
<tr><th style="width:36%">Immatriculation</th><td>{e(a['rcs'])} — immatriculée le {a['creation']}</td></tr>
<tr><th>Dénomination</th><td><b>{e(a['raison_sociale'].upper())}</b></td></tr>
<tr><th>Forme juridique</th><td>{e(a['forme'])}</td></tr>
<tr><th>SIREN / SIRET du siège</th><td>{a['siren_lisible']} / {a['siret_lisible']}</td></tr>
<tr><th>Adresse du siège</th><td>{e(a['adresse'])}, {a['code_postal']} {e(a['ville'])}</td></tr>
<tr><th>Activité</th><td>Plomberie, installations sanitaires, chauffage, dépannage</td></tr>
<tr><th>Code NAF</th><td>{e(a['naf'])}</td></tr>
<tr><th>Gérant</th><td>{e(k['prenom'])} {e(k['nom'])}, né le {date_fr(k['naissance'])} à {e(k['lieu_naissance'])}</td></tr>
<tr><th>Date de l'extrait</th><td>10/09/{U.ANNEE}</td></tr>
</table>
"""
    return doc_fictif("Extrait d'immatriculation — Haddad Plomberie Chauffage", corps)


def attestation_decennale() -> str:
    a = U.ARTISAN_ENTREPRISE
    corps = f"""
{_entete("AFB", "#b45309", [f"<b>{e(a['assureur_decennale'])}</b> (assureur fictif)", "5 quai des Garanties, 91100 Corbeil-Essonnes"],
         "<b>ATTESTATION D'ASSURANCE</b><br>Responsabilité civile décennale")}
<p>L'assureur soussigné atteste que l'entreprise :</p>
<div class="cadre"><b>{e(a['raison_sociale'])}</b> — {e(a['forme'])}<br>{e(a['adresse'])}, {a['code_postal']} {e(a['ville'])}<br>SIRET {a['siret_lisible']}</div>
<p>est titulaire du contrat <b>n° {e(a['police_decennale'])}</b> garantissant sa responsabilité décennale pour
les chantiers ouverts <b>du 01/01/{U.ANNEE} au 31/12/{U.ANNEE}</b>.</p>
<table><tr><th>Activités garanties</th><th>Plafond</th></tr>
<tr><td>Plomberie — installations sanitaires</td><td>Coût de réparation des dommages</td></tr>
<tr><td>Installations de chauffage (hors géothermie)</td><td>Coût de réparation des dommages</td></tr></table>
<p>Zone géographique : France métropolitaine. Effectif déclaré : 2 personnes.</p>
{_signe("Service construction", 91, a['assureur_decennale'], "Corbeil-Essonnes, le 05/01/" + str(U.ANNEE))}
"""
    return doc_fictif("Attestation décennale — Haddad Plomberie Chauffage", corps)


def attestation_rc_pro() -> str:
    a = U.ARTISAN_ENTREPRISE
    corps = f"""
{_entete("AFB", "#b45309", [f"<b>{e(a['assureur_rc'])}</b> (assureur fictif)", "5 quai des Garanties, 91100 Corbeil-Essonnes"],
         "<b>ATTESTATION D'ASSURANCE</b><br>Responsabilité civile professionnelle")}
<p>L'assureur soussigné atteste que l'entreprise <b>{e(a['raison_sociale'])}</b> (SIRET {a['siret_lisible']}) est
titulaire du contrat <b>n° {e(a['police_rc'])}</b> couvrant sa responsabilité civile professionnelle
(exploitation et après travaux) <b>du 01/01/{U.ANNEE} au 31/12/{U.ANNEE}</b>.</p>
<table><tr><th>Garantie</th><th class="n">Plafond par sinistre</th></tr>
<tr><td>Dommages corporels, matériels et immatériels consécutifs</td><td class="n">{eur(1500000)}</td></tr>
<tr><td>Dommages immatériels non consécutifs</td><td class="n">{eur(150000)}</td></tr></table>
{_signe("Service entreprises", 92, a['assureur_rc'], "Corbeil-Essonnes, le 05/01/" + str(U.ANNEE))}
"""
    return doc_fictif("Attestation RC professionnelle — Haddad Plomberie Chauffage", corps)


def attestation_urssaf() -> str:
    a = U.ARTISAN_ENTREPRISE
    corps = f"""
<h1>Attestation de vigilance — spécimen</h1>
<p class="gris">Spécimen de recette : ne reproduit pas l'attestation délivrée par l'organisme de recouvrement ; aucune valeur.</p>
<table>
<tr><th style="width:36%">Entreprise</th><td><b>{e(a['raison_sociale'])}</b> — SIREN {a['siren_lisible']}</td></tr>
<tr><th>Adresse</th><td>{e(a['adresse'])}, {a['code_postal']} {e(a['ville'])}</td></tr>
<tr><th>Situation au 15/09/{U.ANNEE}</th><td>À jour de ses déclarations et de ses paiements</td></tr>
<tr><th>Effectif déclaré</th><td>2 salariés</td></tr>
<tr><th>Code de sécurité</th><td>SPÉCIMEN-RCT-7314</td></tr>
<tr><th>Validité</th><td>6 mois à compter de la date d'édition</td></tr>
</table>
"""
    return doc_fictif("Attestation de vigilance — Haddad Plomberie Chauffage", corps)


def facture_artisan(numero: str, date_facture: str, client: str, adresse_client: str, lieu: str, lignes: list[tuple[str, float, float]]) -> str:
    a = U.ARTISAN_ENTREPRISE
    rangs = ""
    total_ht = 0.0
    for libelle, qte, pu in lignes:
        montant = round(qte * pu, 2)
        total_ht += montant
        rangs += f"<tr><td>{e(libelle)}</td><td class='n'>{str(qte).replace('.', ',')}</td><td class='n'>{eur(pu)}</td><td class='n'>{eur(montant)}</td></tr>"
    tva = round(total_ht * 0.10, 2)
    corps = f"""
{_entete("HP", "#0e7c86", [f"<b>{e(a['raison_sociale'])}</b> — {e(a['forme'])}", f"{e(a['adresse'])}, {a['code_postal']} {e(a['ville'])}",
                          f"SIRET {a['siret_lisible']} — TVA {a['tva']}", f"Tél. {a['telephone']}"],
         f"<b>FACTURE N° {e(numero)}</b><br>Date : {e(date_facture)}<br>Échéance : à réception")}
<div class="cadre" style="margin-left:50%"><b>{e(client)}</b><br>{adresse_client}</div>
<p><b>Lieu d'intervention :</b> {e(lieu)}</p>
<table><tr><th>Désignation</th><th class="n">Qté</th><th class="n">PU HT</th><th class="n">Total HT</th></tr>{rangs}
<tr><td colspan="3" class="n"><b>Total HT</b></td><td class="n"><b>{eur(total_ht)}</b></td></tr>
<tr><td colspan="3" class="n">TVA 10 % (travaux dans un logement de plus de 2 ans)</td><td class="n">{eur(tva)}</td></tr>
<tr><th colspan="3" class="n">TOTAL TTC</th><th class="n">{eur(total_ht + tva)}</th></tr></table>
<p class="petit">Assurance décennale : {e(a['assureur_decennale'])}, contrat {e(a['police_decennale'])}, couverture France métropolitaine.<br>
Règlement par virement : IBAN {a['iban']['iban_lisible']} — BIC {a['iban']['bic']}. Pénalités de retard : 3 fois le taux d'intérêt légal ;
indemnité forfaitaire pour frais de recouvrement : 40 €.</p>
"""
    return doc_fictif(f"Facture {numero} — Haddad Plomberie Chauffage", corps), round(total_ht + tva, 2)


# ================================================================ gestion (agence / propriétaire)

def appel_fonds_syndic(bien: dict, lot_designation: str, coproprietaire: str, adresse: str, lignes: list[tuple[str, float, bool]]) -> str:
    s = U.SYNDIC
    rangs = ""
    total = 0.0
    recup = 0.0
    for libelle, montant, recuperable in lignes:
        total += montant
        recup += montant if recuperable else 0
        rangs += f"<tr><td>{e(libelle)}</td><td>{'Oui' if recuperable else 'Non'}</td><td class='n'>{eur(montant)}</td></tr>"
    corps = f"""
{_entete("SF", "#334155", [f"<b>{e(s['nom'])}</b> (syndic fictif)", e(s['adresse']), f"SIRET {e(s['siret'])}"],
         f"<b>APPEL DE FONDS</b><br>4ᵉ trimestre {U.ANNEE}<br>Émis le 01/10/{U.ANNEE}")}
<div class="cadre" style="margin-left:48%"><b>{e(coproprietaire)}</b><br>{adresse}</div>
<p><b>Copropriété :</b> {e(bien['reference'])} — {e(bien['adresse'])}, {e(bien['code_postal'])} {e(bien['ville'])}<br>
<b>Lot :</b> {e(lot_designation)}</p>
<table><tr><th>Poste (budget voté)</th><th>Récupérable (indicatif)</th><th class="n">Quote-part du lot</th></tr>{rangs}
<tr><th colspan="2">Total appelé</th><th class="n">{eur(total)}</th></tr></table>
<p class="petit gris">Dont part indiquée comme récupérable sur le locataire : {eur(recup)} (indication du syndic fictif, à vérifier
par le gestionnaire). Date limite de paiement : 15/10/{U.ANNEE}.</p>
"""
    return doc_fictif(f"Appel de fonds syndic — {bien['reference']}", corps)


def facture_fournisseur(emetteur: str, initiales: str, couleur: str, numero: str, date_facture: str, client: str,
                        adresse_client: str, objet: str, lignes: list[tuple[str, float]], note: str = "") -> str:
    total = sum(m for _, m in lignes)
    rangs = "".join(f"<tr><td>{e(l)}</td><td class='n'>{eur(m)}</td></tr>" for l, m in lignes)
    corps = f"""
{_entete(initiales, couleur, [f"<b>{e(emetteur)}</b> (entreprise fictive)"], f"<b>FACTURE N° {e(numero)}</b><br>Date : {e(date_facture)}")}
<div class="cadre" style="margin-left:48%"><b>{e(client)}</b><br>{adresse_client}</div>
<p><b>Objet :</b> {e(objet)}</p>
<table><tr><th>Désignation</th><th class="n">Montant TTC</th></tr>{rangs}
<tr><th>Total TTC</th><th class="n">{eur(total)}</th></tr></table>
<p class="petit gris">{e(note)}</p>
"""
    return doc_fictif(f"Facture {numero} — {emetteur}", corps)


def avis_taxe_fonciere(proprietaire: str, adresse: str, bien: dict, total: float, teom: float) -> str:
    corps = f"""
<h1>Avis de taxe foncière {U.ANNEE} — spécimen</h1>
<p class="gris">Spécimen de recette : ne reproduit pas l'avis officiel ; les identifiants sont remplacés par « SPÉCIMEN ».</p>
<div class="cadre" style="display:flex;justify-content:space-between"><div><b>{e(proprietaire)}</b><br>{adresse}</div>
<div class="petit">Référence de l'avis : SPÉCIMEN<br>Date limite de paiement : 15/10/{U.ANNEE}</div></div>
<p><b>Bien imposé :</b> {e(bien['adresse'])}, {e(bien['code_postal'])} {e(bien['ville'])}</p>
<table><tr><th>Élément</th><th class="n">Montant</th></tr>
<tr><td>Taxe foncière sur les propriétés bâties (commune, intercommunalité)</td><td class="n">{eur(total - teom)}</td></tr>
<tr><td><b>Taxe d'enlèvement des ordures ménagères (TEOM)</b> — récupérable sur le locataire</td><td class="n"><b>{eur(teom)}</b></td></tr>
<tr><th>Montant à payer</th><th class="n">{eur(total)}</th></tr></table>
"""
    return doc_fictif(f"Taxe foncière {U.ANNEE} — {bien['reference']}", corps)


def echeancier_pret(emprunteur: str, bien: dict, capital: float, taux: float, mensualite: float, interets_annee: float) -> str:
    rangs = ""
    restant = capital - 21400
    for m in range(1, 13):
        interet = round(restant * taux / 12, 2)
        amorti = round(mensualite - interet, 2)
        restant = round(restant - amorti, 2)
        rangs += f"<tr><td>{m:02d}/{U.ANNEE}</td><td class='n'>{eur(mensualite)}</td><td class='n'>{eur(interet)}</td><td class='n'>{eur(amorti)}</td><td class='n'>{eur(restant)}</td></tr>"
    corps = f"""
{_entete("BF", "#1e3a8a", ["<b>Banque Fictive de Recette</b>", "Service crédit immobilier"], f"<b>TABLEAU D'AMORTISSEMENT</b><br>Année {U.ANNEE}")}
<div class="cadre"><b>Emprunteur :</b> {e(emprunteur)}<br><b>Objet :</b> acquisition — {e(bien['adresse'])}, {e(bien['code_postal'])} {e(bien['ville'])}<br>
<b>Capital emprunté :</b> {eur(capital)} — <b>Taux :</b> {str(taux * 100).replace('.', ',')} % — <b>Durée :</b> 20 ans</div>
<table><tr><th>Échéance</th><th class="n">Mensualité</th><th class="n">Intérêts</th><th class="n">Capital amorti</th><th class="n">Capital restant</th></tr>{rangs}</table>
<p><b>Intérêts payés en {U.ANNEE} (à reporter en « intérêts d'emprunt ») : {eur(interets_annee)}</b> — assurance emprunteur : {eur(162.00)}.</p>
"""
    return doc_fictif(f"Tableau d'amortissement {U.ANNEE} — {bien['reference']}", corps)


def attestation_pno(proprietaire: str, adresse: str, bien: dict, numero: str) -> str:
    corps = f"""
{_entete("MFE", "#0f766e", ["<b>Mutuelle Fictive de l'Essonne (MFE)</b>", "1 place des Garanties, 91000 Évry-Courcouronnes"],
         "<b>ATTESTATION D'ASSURANCE</b><br>Propriétaire non occupant")}
<div class="cadre"><b>{e(proprietaire)}</b><br>{adresse}</div>
<p>Contrat <b>n° {e(numero)}</b> — bien assuré : <b>{e(bien['adresse'])}, {e(bien['code_postal'])} {e(bien['ville'])}</b>,
du 01/01/{U.ANNEE} au 31/12/{U.ANNEE}. Cotisation annuelle : {eur(118.00)}.</p>
<table><tr><th>Garanties</th><th>Statut</th></tr>
<tr><td>Responsabilité civile propriétaire</td><td>Acquise</td></tr>
<tr><td>Dégâts des eaux, incendie (en complément de l'assurance de l'immeuble)</td><td>Acquise</td></tr>
<tr><td>Carence ou défaut d'assurance du locataire</td><td>Acquise</td></tr></table>
{_signe("Service contrats", 63, "Mutuelle Fictive de l'Essonne", "Le 03/01/" + str(U.ANNEE))}
"""
    return doc_fictif(f"Assurance PNO — {bien['reference']}", corps)


# ================================================================ baux signés (dépôt manuel : la signature électronique est coupée)

def bail_signe(bailleur: str, representant: str | None, adresse_bailleur: str, locataire_cle: str, bien: dict, lot: dict,
               date_effet: str, lieu_signature: str, date_signature: str, graine_bailleur: int, graine_locataire: int,
               exemplaire: str = "Exemplaire du bailleur", signataires: tuple[bool, bool] = (True, True)) -> str:
    """Un exemplaire « signé » à déposer à la place du PDF généré par Gerimmo.

    Gerimmo refuse de ranger deux fois le même fichier : redéposer le bail
    qu'il vient de générer comme « bail signé » serait refusé comme doublon.
    Ce spécimen, différent octet par octet, joue le rôle du papier signé.
    """
    p = U.PERSONNES[locataire_cle]
    meuble = "meublé" in lot["usage"]
    nature = "logement meublé" if meuble else "logement vide (non meublé)"
    duree = "1 an, reconductible" if meuble else "3 ans, reconductible tacitement"
    representation = f"<br>représenté(e) par son mandataire <b>{e(representant)}</b>" if representant else ""
    sig_b = signature_svg_en_ligne(bailleur.split(" ")[0][0] + ". " + bailleur.split(" ")[-1].title(), graine_bailleur, 190) if signataires[0] else "<i class='gris'>(signature attendue)</i>"
    sig_l = signature_svg_en_ligne(p["prenom"][0] + ". " + p["nom"].title(), graine_locataire, 190) if signataires[1] else "<i class='gris'>(signature attendue)</i>"
    equipements = "".join(f"<li>{e(x)}</li>" for x in lot["equipements"])
    corps = f"""
<div class="serif">
<p style="text-align:right" class="gris">{e(exemplaire)} — spécimen de recette</p>
<h1 style="text-align:center">Contrat de location — {e(nature)}</h1>
<p style="text-align:center" class="gris">Soumis au titre Iᵉʳ{' bis' if meuble else ''} de la loi n° 89-462 du 6 juillet 1989 · exemplaire signé (spécimen)</p>
<h2>I. Les parties</h2>
<p><b>Le bailleur :</b> {e(bailleur)}, {adresse_bailleur}{representation}.</p>
<p><b>Le locataire :</b> {e(p['civilite'])} {e(p['prenom'])} {e(p['nom'])}, né(e) le {date_fr(p['naissance'])} à {e(p['lieu_naissance'])}.</p>
<h2>II. Le logement</h2>
<p>{e(bien['adresse'])}, {e(bien['code_postal'])} {e(bien['ville'])} — {e(lot['designation'])} — {str(lot['surface']).replace('.', ',')} m²,
{lot['pieces']} pièce(s) principale(s). Annexe : {e(lot['annexes'])}. Construction : {bien['annee']}. Chauffage : {e(bien['chauffage'])}.</p>
<ul>{equipements}</ul>
<h2>III. Durée et prise d'effet</h2>
<p>Prise d'effet le <b>{e(date_effet)}</b>, pour une durée de {duree}.</p>
<h2>IV. Conditions financières</h2>
<table><tr><th>Loyer mensuel hors charges</th><td class="n">{eur(lot['loyer'])}</td></tr>
<tr><th>{'Forfait' if False else 'Provision'} pour charges (régularisation annuelle)</th><td class="n">{eur(lot['charges'])}</td></tr>
<tr><th>Total mensuel</th><td class="n"><b>{eur(lot['loyer'] + lot['charges'])}</b></td></tr>
<tr><th>Dépôt de garantie</th><td class="n">{eur(lot['depot'])}</td></tr>
<tr><th>Paiement</th><td class="n">mensuel, d'avance, le 1ᵉʳ du mois</td></tr></table>
<p>Révision annuelle selon l'indice de référence des loyers publié par l'INSEE. Annexes remises : notice d'information,
dossier de diagnostic technique, état des lieux d'entrée{', inventaire du mobilier' if meuble else ''}.</p>
</div>
<div class="serif" style="break-before:page">
<h2>Signatures</h2>
<p>Fait à {e(lieu_signature)}, le {e(date_signature)}, en autant d'exemplaires originaux que de parties.</p>
<div style="display:flex;justify-content:space-between;gap:24px;margin-top:18px">
  <div class="cadre" style="flex:1;min-height:170px"><b>Le bailleur</b>{' (par son mandataire)' if representant else ''}<br><span class="gris">« Lu et approuvé »</span><br>{sig_b}</div>
  <div class="cadre" style="flex:1;min-height:170px"><b>Le locataire</b><br><span class="gris">« Lu et approuvé »</span><br>{sig_l}</div>
</div>
<p class="petit gris" style="margin-top:18px">Chaque page du contrat original est paraphée par les parties. Ce spécimen résume le contrat que Gerimmo
génère : il sert uniquement à tester le dépôt du bail signé.</p>
</div>
"""
    return doc_fictif(f"Bail signé — {p['prenom']} {p['nom']}", corps)


def devis_peintre(client: str, adresse_client: str, lieu: str, montant_ht: float) -> str:
    lignes = [("Rebouchage de 3 trous de cheville et ponçage", 1, 60.0),
              ("Impression et deux couches de peinture acrylique — séjour (32 m² de murs)", 1, montant_ht - 60.0)]
    rangs = "".join(f"<tr><td>{e(l)}</td><td class='n'>{q}</td><td class='n'>{eur(pu)}</td></tr>" for l, q, pu in lignes)
    tva = round(montant_ht * 0.10, 2)
    corps = f"""
{_entete("PF", "#7c2d12", ["<b>Peinture Fictive Pro</b> (entreprise fictive)", "6 rue du Nuancier, 91000 Évry-Courcouronnes"],
         "<b>DEVIS N° D-2026-0311</b><br>Valable 30 jours")}
<div class="cadre" style="margin-left:48%"><b>{e(client)}</b><br>{adresse_client}</div>
<p><b>Chantier :</b> {e(lieu)} — remise en état du séjour après départ du locataire.</p>
<table><tr><th>Désignation</th><th class="n">Qté</th><th class="n">Montant HT</th></tr>{rangs}
<tr><td colspan="2" class="n">Total HT</td><td class="n">{eur(montant_ht)}</td></tr>
<tr><td colspan="2" class="n">TVA 10 %</td><td class="n">{eur(tva)}</td></tr>
<tr><th colspan="2" class="n">Total TTC</th><th class="n">{eur(montant_ht + tva)}</th></tr></table>
"""
    return doc_fictif("Devis de remise en peinture", corps)


def decompte_charges(bien: dict, lot: dict, annee: int, postes: list[tuple[str, float]]) -> str:
    s_ = U.SYNDIC
    total = sum(m for _, m in postes)
    rangs = "".join(f"<tr><td>{e(l)}</td><td class='n'>{eur(m)}</td></tr>" for l, m in postes)
    corps = f"""
{_entete("SF", "#334155", [f"<b>{e(s_['nom'])}</b> (syndic fictif)", e(s_['adresse'])], f"<b>DÉCOMPTE DES CHARGES</b><br>Exercice {annee}")}
<p><b>Copropriété :</b> {e(bien['reference'])} — {e(bien['adresse'])}, {e(bien['code_postal'])} {e(bien['ville'])}<br>
<b>Lot :</b> {e(lot['designation'])} — charges récupérables de l'exercice, <b>logement entier, année complète</b></p>
<table><tr><th>Poste récupérable</th><th class="n">Montant</th></tr>{rangs}
<tr><th>Total des charges récupérables</th><th class="n">{eur(total)}</th></tr></table>
<p class="petit gris">Justificatif de régularisation fictif. Le locataire peut en demander le détail pendant six mois.</p>
"""
    return doc_fictif(f"Décompte des charges {annee} — {bien['reference']}", corps), total


def variante_secours(html: str) -> str:
    """Copie de secours d'un document : mêmes informations, octets différents.

    À utiliser si un premier dépôt a échoué alors que le fichier est resté
    dans les documents de l'organisation (le même fichier serait alors
    refusé comme doublon)."""
    return html.replace('<div class="contenu">', '<div class="contenu"><p class="petit" style="text-align:right;color:#9f1239">Copie de secours</p>', 1)


def produire(html: str, destination: Path) -> Path:
    return html_vers_pdf(html, destination)


def aujourd_hui() -> str:
    return date.today().strftime("%d/%m/%Y")
