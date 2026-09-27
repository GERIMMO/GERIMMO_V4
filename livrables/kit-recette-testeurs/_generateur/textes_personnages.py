"""Fiches « Mon personnage » : qui vous êtes et toutes les données à saisir.

Tout vient d'univers.py : les documents fictifs portent exactement les mêmes
valeurs que ce que ces fiches demandent de saisir.
"""

from __future__ import annotations

from pathlib import Path

import univers as U

P = U.PERSONNES
A = U.AGENCE
AR = U.ARTISAN_ENTREPRISE


def eur(x: float) -> str:
    entier, dec = f"{x:,.2f}".split(".")
    return entier.replace(",", " ") + "," + dec + " €"


def date_fr(iso: str) -> str:
    a, m, j = iso.split("-")
    return f"{j}/{m}/{a}"


def m2(x: float) -> str:
    return f"{x}".replace(".", ",") + " m²"


def couverture(titre_persona: str, cle: str, phrase: str) -> str:
    p = P[cle]
    return (
        f'<div class="couverture"><div class="sur">Kit de recette Gerimmo · {titre_persona}</div>'
        f"<h1>Mon personnage : {p['prenom']} {p['nom']}</h1><div class=\"sous\">{phrase}</div></div>"
    )


def identite(cle: str, extra: list[tuple[str, str]] | None = None) -> str:
    p = P[cle]
    lignes = [("Civilité", p["civilite"]), ("Prénom", p["prenom"]), ("Nom", p["nom"]),
              ("Date de naissance", date_fr(p["naissance"])), ("Commune de naissance", p["lieu_naissance"].split(" (")[0])]
    if p.get("adresse"):
        lignes.append(("Adresse (avant l'entrée dans les lieux)" if cle in ("camille", "thomas") else "Adresse",
                       f"{p['adresse']}, {p['code_postal']} {p['ville']}"))
    lignes.append(("Téléphone (fictif)", p["telephone"]))
    if p.get("profession"):
        lignes.append(("Profession", p["profession"]))
    lignes += extra or []
    return tableau(lignes)


def tableau(lignes: list[tuple[str, str]]) -> str:
    rangs = "\n".join(f"| {a} | {b} |" for a, b in lignes)
    return f"| Champ | Valeur à saisir |\n|---|---|\n{rangs}\n"


def fichiers(racine: Path, descriptions: dict[str, str]) -> str:
    """Liste automatique des fichiers du dossier documents/, avec leur usage."""
    doc = racine / "documents"
    if not doc.exists():
        return ""
    lignes = []
    for f in sorted(doc.rglob("*")):
        if f.is_file():
            rel = f.relative_to(doc).as_posix()
            usage = next((d for motif, d in descriptions.items() if motif in rel), "")
            lignes.append(f"| `{rel}` | {usage} |")
    return "| Fichier (dans documents/) | Usage |\n|---|---|\n" + "\n".join(lignes) + "\n"


def personnages_croises(lignes: list[tuple[str, str, str]]) -> str:
    rangs = "\n".join(f"| {a} | {b} | {c} |" for a, b, c in lignes)
    return f"| Personnage | Rôle | Joué par |\n|---|---|---|\n{rangs}\n"


ACCES_ALIAS = """> [!info] Les alias « + » de votre adresse
> Votre adresse `prenom.nom@gmail.com` accepte des variantes `prenom.nom+mandant@gmail.com`,
> `prenom.nom+garant@gmail.com`… : Gerimmo les voit comme des adresses différentes, mais les courriels arrivent dans
> votre boîte habituelle. Gmail, Outlook et Hotmail l'acceptent ; sinon, demandez une solution au coordinateur."""


# ------------------------------------------------------------------ agence

def agence(racine: Path) -> str:
    b = next(x for x in U.BIENS_AGENCE if x["cle"] == "essais")
    a12 = b["lots"][0]
    a05 = b["lots"][1]
    diag = U.DIAGNOSTICS["essais"]
    edl = U.EDL_ENTREE["A12"]

    def diag_lignes(liste, ou):
        return "\n".join(f"| {ou} | {d['type']} | {d['realise']} | {d['expire'] or 'vide (illimité)'} |" for d in liste)

    return f"""
{couverture("Agence immobilière", "nadia", "Vous dirigez Horizon Gestion, une agence de gestion locative à Évry-Courcouronnes. Vous gérez pour Bernard Fontaine deux appartements de la Résidence Les Essais, à Massy.")}

## 1. Qui êtes-vous

{identite("nadia", [("Fonction", "Gérante (administratrice d'agence)")])}

## 2. Vos accès

- **Adresse de connexion : votre vraie adresse e-mail.** Le coordinateur ouvre l'organisation « {A['nom_organisation']} »
  avec elle ; vous recevez « Votre accès Gerimmo » et choisissez votre mot de passe (12 caractères minimum).
- Vous faites aussi vivre trois personnages secondaires, avec des alias de votre adresse :
  **Bernard Fontaine** (+mandant), **Philippe Roussel** (+garant) et, si vous testez l'agent, **Julien Marchetti** (+agent).

{ACCES_ALIAS}

## 3. L'agence (écran « Profil de l'agence »)

| Champ | Valeur à saisir |
|---|---|
| Nom de l'agence / Nom affiché | {A['nom']} |
| Adresse | {A['adresse']} |
| Code postal · Ville | {A['code_postal']} · {A['ville']} |
| Téléphone | {A['telephone']} |
| Email de contact | votre adresse |
| SIRET | {A['siret_lisible']} (saisissable aussi sans espaces : {A['siret']}) |
| Carte professionnelle (n° et CCI) | {A['carte_pro']} — CCI Paris Île-de-France |
| Garantie financière (organisme, montant) | {A['garantie']} |
| N° de TVA intracommunautaire | {A['tva']} |
| IBAN | {A['iban']['iban_lisible']} (fictif) |
| Logo | documents/01-identite-de-l-agence/logo-horizon-gestion-600x150.png |
| Couleurs | principale #1F5FBF · foncée #0F2352 |
| Relances automatiques | première à 1 jour, seconde à 2 jours |

Forme juridique (pour mémoire, figure sur les documents fictifs) : {A['forme']}, {A['rcs']}. Assurance RCP : {A['rcp']}.

## 4. La Résidence Les Essais et ses lots

| Bien | Valeur |
|---|---|
| Référence interne | {b['reference']} |
| Type · année | {b['type_gerimmo']} · {b['annee']} |
| Adresse | {b['adresse']}, {b['code_postal']} {b['ville']} (fictive) |
| En copropriété · en zone tendue | oui · oui |
| Parties communes | {b['parties_communes']} |
| Accès internet, téléphone, TV (TIC) | {b['tic']} |

| Lot | A12 | A05 |
|---|---|---|
| Nom du lot | A12 | A05 |
| Étage | 2 | RDC |
| Identifiant fiscal du logement | {a12['id_fiscal']} | {a05['id_fiscal']} |
| Surface · pièces | {m2(a12['surface'])} · {a12['pieces']} | {m2(a05['surface'])} · {a05['pieces']} |
| Chauffage | Individuel — électricité | Individuel — électricité |
| Eau chaude | Individuelle — ballon électrique | Individuelle — ballon électrique |
| Locaux privatifs | {a12['annexes']} | Néant |
| Meublé | non | oui |
| Autres parties du logement | Néant | Néant |
| Classe DPE | {a12['dpe']['energie']} | {a05['dpe']['energie']} |
| Propriétaire | Bernard Fontaine, 100 % depuis le 01/09/2026 | idem |
| Mandat | 7 % des loyers encaissés | 7 % |

## 5. Les diagnostics à déposer

Diagnostiqueur : **Diag'Essai Expertises**. Pas de gaz dans l'immeuble : pas de diagnostic gaz.

| Où | Diagnostic | Réalisé le | Expire le |
|---|---|---|---|
{diag_lignes(diag['bien'], "Immeuble")}
{diag_lignes(diag['A12'], "Lot A12")}
{diag_lignes(diag['A05'], "Lot A05")}
| Immeuble (test négatif) | ERP périmé | {U.ERP_PERIME['realise']} | {U.ERP_PERIME['expire']} |

## 6. Les personnes et le bail

**Bernard FONTAINE** (propriétaire mandant, sans compte) — né le {date_fr(P['bernard']['naissance'])} à Orléans ;
{P['bernard']['adresse']}, {P['bernard']['code_postal']} {P['bernard']['ville']} ; {P['bernard']['telephone']} ; e-mail : votre adresse +mandant.
Mandat : date de rapport le **10** du mois, seuil de délégation **500 €**, lots A12 et A05 à **7 %**.

**Camille ROUSSEL** (locataire) — née le {date_fr(P['camille']['naissance'])} à Nantes ; {P['camille']['adresse']},
{P['camille']['code_postal']} {P['camille']['ville']} ; {P['camille']['telephone']} ; e-mail : **l'adresse réelle du testeur
« Locataire de l'agence »** (tableau du coordinateur).

**Philippe ROUSSEL** (garant, caution solidaire) — né le {date_fr(P['philippe']['naissance'])} à Rennes ;
{P['philippe']['adresse']}, {P['philippe']['code_postal']} {P['philippe']['ville']} ; {P['philippe']['telephone']} ; e-mail : votre adresse +garant.

| Bail de Camille (lot A12) | Valeur |
|---|---|
| Type de bail | Nu |
| Date d'entrée · jour d'échéance | 01/10/2026 · 1 |
| Loyer hors charges · charges | {eur(a12['loyer'])} · {eur(a12['charges'])} (provision) |
| Dépôt de garantie | {eur(a12['depot'])} (un mois de loyer hors charges, le plafond d'un bail nu) |
| Trimestre IRL · révision annuelle | T2 · oui |
| Fixation initiale · paiement | Librement fixé · À échoir (d'avance) |
| Lieu de paiement | Virement sur le compte de l'agence Horizon Gestion |
| Valeur de l'IRL de référence | 146,00 (valeur de test, pas l'indice officiel) |
| Honoraires (visite, dossier, bail) | 400 € part bailleur · 400 € part locataire |
| Dernier loyer du précédent locataire | 870 € (dernier versement le 31/07/2026, dernière révision le 01/01/2026) |

## 7. L'état des lieux d'entrée (lot A12)

Mentions : présents « Nadia Bensaïd (Horizon Gestion, pour le bailleur) ; Camille Roussel (locataire) » · détecteur de
fumée présent, fonctionne · attestation d'assurance fournie : oui · observations : Néant.

| Pièce | État | Commentaire |
|---|---|---|
{chr(10).join(f"| {p} | {e} | {c} |" for p, e, c in edl['pieces'])}

États proposés par Gerimmo : Neuf, Bon, Usagé, Mauvais, Absent. Utilisez « Toute la section : Bon », puis ajustez
l'élément cité en commentaire.

| Compteur | N° | Relevé |
|---|---|---|
{chr(10).join(f"| {t} | {n} | {r} |" for t, n, r in edl['releves'])}

Clés remises : {edl['cles']}.

## 8. Loyers, charges, incidents : les chiffres

| Quoi | Montant |
|---|---|
| Terme mensuel de Camille | {eur(a12['loyer'] + a12['charges'])} (890 + 90) |
| Appel de fonds du syndic, T4 2026 (lot A12) | 290,25 € dont 186,70 € récupérables |
| Charges réelles 2026, logement entier (régularisation) | 1 000,00 € |
| Devis et facture de l'artisan (fuite) | 177,65 € TTC (161,50 € HT) |
| Retenue de sortie (peinture du séjour) | 420 € TTC, durée de vie 10 ans, âge 3 ans |
| Trésorerie de la reprise comptable (facultatif) | 230,00 € |

## 9. Les personnages que vous croiserez

{personnages_croises([
    ("Camille Roussel", "votre locataire (T2 A12)", "le testeur « Locataire de l'agence »"),
    ("Karim Haddad", "l'artisan plombier-chauffagiste", "le testeur « Artisan »"),
    ("Bernard Fontaine", "votre mandant, sans compte", "vous (alias +mandant)"),
    ("Philippe Roussel", "le garant de Camille", "vous (alias +garant)"),
    ("Julien Marchetti", "votre agent (facultatif)", "vous (alias +agent, fenêtre privée)"),
    ("Tahir", "supervision Gerimmo", "le coordinateur"),
])}

## 10. Vos fichiers

{fichiers(racine, {
    "logo-horizon-gestion-600x150": "Logo à déposer (AGC-03)",
    "logo-horizon-gestion-1600x500": "Version grand format, sous 200 Ko (réserve)",
    "signature-nadia": "Signature préenregistrée (AGC-05)",
    "test-negatif/ERP": "ERP périmé : doit bloquer la mise en location (AGC-11)",
    "secours/": "Copie de secours, si un premier dépôt a échoué (AGC-10, AGC-11)",
    "ERP-immeuble.pdf": "ERP valide de l'immeuble (AGC-11)",
    "diagnostics/": "Diagnostic à déposer (AGC-10)",
    "03-mandant": "Pièces du mandant, sur sa fiche (AGC-09)",
    "04-dossier-camille": "Dossier de Camille déposé par l'agence (AGC-14)",
    "05-garant": "Pièces du garant (AGC-15)",
    "06-bail-signe": "Exemplaire signé à déposer (AGC-20)",
    "incident-fuite-evier-detail": "Photo ajoutée à l'incident de Camille (AGC-28)",
    "incident-moisissure": "Photo de l'incident que vous déclarez (AGC-32)",
    "appel-de-fonds": "Appel du syndic à joindre (AGC-37)",
    "decompte-charges": "Justificatif de régularisation (AGC-38)",
    "lettre-conge": "Congé reçu de Camille, à ranger en « Courrier » (AGC-47)",
    "devis-remise-en-peinture": "Justificatif de la retenue (AGC-49)",
    "import-parc-avec-erreurs": "Fichier à contrôler, pas à importer (AGC-44)",
    "import-parc-ateliers": "Parc à importer (AGC-45)",
    "reprise-comptable": "Balance d'ouverture (AGC-46)",
    "logo-trop-lourd": "Logo de plus de 200 Ko : doit être refusé (AGC-03)",
    "faux-document": "Faux PDF : doit être refusé (AGC-36)",
})}
"""


# ------------------------------------------------------------------ locataire de l'agence

def locataire_agence(racine: Path) -> str:
    c = P["camille"]
    b = U.BIENS_AGENCE[0]
    a12 = b["lots"][0]
    edl = U.EDL_ENTREE["A12"]
    emp = U.EMPLOYEURS["camille"]
    return f"""
{couverture("Locataire de l'agence", "camille", "Vous emménagez dans le T2 A12 de la Résidence Les Essais, à Massy, loué par l'agence Horizon Gestion pour le compte de Bernard Fontaine.")}

## 1. Qui êtes-vous

{identite("camille", [("Employeur", f"{emp['nom']} ({emp['forme']}), {emp['adresse']}"), ("Salaire net mensuel", eur(c['salaire_net']))])}

## 2. Vos accès

- **Adresse de connexion : votre vraie adresse e-mail**, que le coordinateur transmet à l'agence. Vous ne créez pas de
  compte vous-même : l'agence vous invite, vous recevez « Votre accès Gerimmo ». **Le lien vaut une heure** ; passé ce
  délai, « Mot de passe oublié ? » sur la page de connexion.
- Mot de passe : 12 caractères minimum, un mot de passe neuf.

## 3. Votre logement et votre bail

| | |
|---|---|
| Adresse | {b['adresse']}, {b['code_postal']} {b['ville']} — {a12['designation']} |
| Logement | {m2(a12['surface'])}, {a12['pieces']} pièces, cave n° 12, chauffage électrique individuel |
| Bail | nu, entrée le 01/10/2026, préavis d'un mois (zone tendue) |
| Loyer · charges | {eur(a12['loyer'])} + {eur(a12['charges'])} de provision = **{eur(a12['loyer'] + a12['charges'])} par mois**, le 1ᵉʳ |
| Dépôt de garantie | {eur(a12['depot'])} |
| Bailleur · gestionnaire | Bernard Fontaine · Horizon Gestion |
| Garant | Philippe Roussel (votre père), caution solidaire |

**Vous ne payez rien pour de vrai** : l'IBAN affiché dans « Mes paiements » est fictif. L'agence saisit vos paiements.

## 4. Votre dossier

| Pièce | Qui la dépose |
|---|---|
| Pièce d'identité, 3 bulletins de salaire, attestation d'employeur, justificatif de domicile | l'agence (vous n'avez rien à faire) |
| Avis d'imposition, RIB | **vous**, quand l'agence vous les réclame (LOA-04) |
| Attestation d'assurance habitation | **vous** (LOA-03) : contrat MFE-MRH-2026-51207, valable du {U.ASSURANCE_HABITATION['debut']} au {U.ASSURANCE_HABITATION['fin']} |
| Exemplaire signé du bail | **vous**, quand l'agence vous envoie le bail à signer (LOA-05) |

## 5. Ce que vous devez retrouver

- **État des lieux d'entrée** : compteurs {", ".join(f"{t.lower()} {r}" for t, _, r in edl['releves'])} ; {edl['cles']}.
- **Quittance d'octobre** : 890 € de loyer et 90 € de charges, séparés.
- **Dépôt** : 890 € encaissé.

## 6. Vos incidents

| Incident | Données |
|---|---|
| Fuite sous l'évier (LOA-10) | Plomberie — joint, siphon, robinetterie · Cuisine · « Fuite sous l'évier, ça goutte en continu, j'ai mis un seau » · depuis hier soir · **urgent** · photo incident-fuite-evier.jpg |
| Volet bloqué (LOA-14, facultatif) | Autre problème · Séjour · « Volet roulant bloqué à mi-hauteur, les lames sont sorties du rail » · pas urgent · photo incident-volet-bloque.jpg |

Copiez les photos sur votre téléphone avant le jour J.

## 7. Les personnages que vous croiserez

{personnages_croises([
    ("Nadia Bensaïd (Horizon Gestion)", "votre gestionnaire", "le testeur « Agence immobilière »"),
    ("Karim Haddad", "l'artisan qui répare la fuite", "le testeur « Artisan »"),
    ("Tahir", "supervision Gerimmo", "le coordinateur"),
])}

## 8. Vos fichiers

{fichiers(racine, {
    "attestation-assurance": "À déposer dans « Votre assurance habitation » (LOA-03)",
    "pieces-reclamees": "À déposer quand l'agence vous les réclame (LOA-04)",
    "exemplaire-signe": "Votre exemplaire signé du bail (LOA-05)",
    "incident-fuite-evier": "Photo de la fuite (LOA-10)",
    "incident-volet": "Photo du volet (LOA-14, facultatif)",
})}
"""


# ------------------------------------------------------------------ propriétaire

def proprietaire(racine: Path) -> str:
    s = P["sophie"]
    banc = next(x for x in U.BIENS_PROPRIETAIRE if x["cle"] == "banc")
    maq = next(x for x in U.BIENS_PROPRIETAIRE if x["cle"] == "maquette")
    b3 = banc["lots"][0]
    m1 = maq["lots"][0]
    edl = U.EDL_ENTREE["B3"]

    def diag_lignes(cle_bien, porte, libelle):
        return "\n".join(f"| {libelle} | {d['type']} | {d['realise']} | {d['expire'] or 'vide (illimité)'} |"
                         for d in U.DIAGNOSTICS[cle_bien][porte])

    return f"""
{couverture("Propriétaire bailleur", "sophie", "Vous possédez deux appartements en Essonne et les gérez vous-même, sans agence. Vous louez le T2 de Corbeil-Essonnes à Thomas Girard ; le studio d'Étampes est vide.")}

## 1. Qui êtes-vous

{identite("sophie", [("Vous louez en tant que", "Personne physique")])}

## 2. Vos accès et votre abonnement

- **Vous créez votre compte vous-même** sur www.gerimmo.app/inscription, avec votre vraie adresse e-mail, puis vous la
  confirmez (courriel « Confirmez votre adresse — Gerimmo », lien valable une heure). **Pas de code de parrainage.**
- Essai de {U.TARIFS['essai_jours']} jours. Premier bien offert à vie ; le second coûte **{str(U.TARIFS['proprietaire_par_bien']).replace('.', ',')} € par mois**
  (paiement réel par carte, débité à la fin de l'essai). Accord du coordinateur avant de payer.

## 3. Votre profil (« Mon profil »)

| Champ | Valeur à saisir |
|---|---|
| Nom de votre espace | {U.PROPRIETAIRE_ORG['nom_organisation']} |
| Adresse · code postal · ville | {s['adresse']} · {s['code_postal']} · {s['ville']} |
| Téléphone | {s['telephone']} |
| Email de contact | votre adresse |
| SIRET | vide (facultatif pour un particulier) |
| IBAN | {U.PROPRIETAIRE_ORG['iban']['iban_lisible']} (fictif) |
| Relances automatiques | première à 1 jour, seconde à 2 jours |

## 4. Vos deux biens

| | Appartement Banc-d'Essai | Studio Maquette |
|---|---|---|
| Référence interne | {banc['reference']} | {maq['reference']} |
| Type · année | {banc['type_gerimmo']} · {banc['annee']} | {maq['type_gerimmo']} · {maq['annee']} |
| Adresse | {banc['adresse']}, {banc['code_postal']} {banc['ville']} | {maq['adresse']}, {maq['code_postal']} {maq['ville']} |
| En copropriété · zone tendue | oui · oui | oui · non |
| Parties communes | {banc['parties_communes']} | {maq['parties_communes']} |
| TIC | {banc['tic']} | {maq['tic']} |
| Nom du lot · étage | B3 · 3 | M1 · 1 |
| Identifiant fiscal | {b3['id_fiscal']} | {m1['id_fiscal']} |
| Surface · pièces | {m2(b3['surface'])} · {b3['pieces']} | {m2(m1['surface'])} · {m1['pieces']} |
| Chauffage · eau chaude | Individuel — chaudière gaz · Individuelle — chaudière gaz | Individuel — électricité · Individuelle — ballon électrique |
| Locaux privatifs · autres parties | Néant · Néant | Place de parking n° 7 · Néant |
| Classe DPE | {b3['dpe']['energie']} | {m1['dpe']['energie']} |

## 5. Les diagnostics

Diagnostiqueur : **Diag'Essai Expertises**.

| Où | Diagnostic | Réalisé le | Expire le |
|---|---|---|---|
{diag_lignes("banc", "bien", "Immeuble du Banc-d'Essai")}
{diag_lignes("banc", "B3", "Lot B3")}
{diag_lignes("maquette", "bien", "Immeuble du Studio Maquette")}
{diag_lignes("maquette", "M1", "Lot M1")}

## 6. Votre locataire et son bail

**Thomas GIRARD** — né le {date_fr(P['thomas']['naissance'])} à Lille ; {P['thomas']['adresse']}, {P['thomas']['code_postal']} {P['thomas']['ville']} ;
{P['thomas']['telephone']} ; e-mail : **l'adresse réelle du testeur « Locataire du propriétaire »** (tableau du coordinateur).

| Bail de Thomas (lot B3) | Valeur |
|---|---|
| Type · date d'entrée · échéance | Nu · **16/09/2026** (entrée en cours de mois : premier mois au prorata) · le 1ᵉʳ |
| Loyer · charges | {eur(b3['loyer'])} · {eur(b3['charges'])} (provision) |
| Dépôt de garantie | {eur(b3['depot'])} |
| IRL | T2 · révision annuelle · valeur de référence 146,00 (valeur de test) |
| Fixation · paiement · lieu | Librement fixé · À échoir · Virement sur le compte de Sophie Lemaire |
| Dernier loyer du précédent locataire | 700 € (dernier versement le 31/08/2026, dernière révision le 01/03/2026) |
| Pièces que vous déposez | pièce d'identité, 3 bulletins de salaire, attestation d'employeur |
| Pièces que vous lui réclamez | justificatif de domicile, avis d'imposition, RIB |

## 7. L'état des lieux d'entrée (lot B3)

Présents « Sophie Lemaire (bailleuse) ; Thomas Girard (locataire) » · détecteur présent, fonctionne · assurance
fournie : oui · observations : Néant.

| Pièce | État | Commentaire |
|---|---|---|
{chr(10).join(f"| {p} | {e} | {c} |" for p, e, c in edl['pieces'])}

| Compteur | N° | Relevé |
|---|---|---|
{chr(10).join(f"| {t} | {n} | {r} |" for t, n, r in edl['releves'])}

Clés remises : {edl['cles']}.

## 8. Les chiffres de la recette

| Quoi | Montant |
|---|---|
| Septembre (du 16 au 30) | environ 390 € (moitié de 780 €) — lisez le montant exact sur l'échéancier |
| Octobre | 780 € : un premier paiement de 400 €, puis 380 € |
| Devis et facture de l'artisan (radiateur) | 205,59 € TTC (186,90 € HT) |
| Taxe foncière 2026 | 1 124 € dont TEOM 168 € (récupérable) |
| Assurance propriétaire non occupant | 118 € |
| Travaux de peinture (septembre) | 650 € |
| Intérêts d'emprunt 2026 | 2 846,15 € (assurance emprunteur 162 €) |
| Appel du syndic T4 2026 (lot B3) | 182,20 € dont 109,90 € récupérables |

## 9. Les personnages que vous croiserez

{personnages_croises([
    ("Thomas Girard", "votre locataire (T2 B3)", "le testeur « Locataire du propriétaire »"),
    ("Karim Haddad", "l'artisan qui répare le radiateur", "le testeur « Artisan »"),
    ("Tahir", "supervision Gerimmo", "le coordinateur"),
])}

## 10. Vos fichiers

{fichiers(racine, {
    "signature-sophie": "Signature préenregistrée (PRO-03)",
    "RIB-sophie": "Votre RIB fictif, pour mémoire (IBAN du profil)",
    "secours/": "Copie de secours, si un premier dépôt a échoué (PRO-05)",
    "02-appartement": "Diagnostic du Banc-d'Essai (PRO-05)",
    "03-studio": "Diagnostic du Studio Maquette (PRO-06)",
    "04-dossier-thomas": "Dossier de Thomas déposé par vous (PRO-09)",
    "05-bail-signe": "Exemplaire signé à déposer (PRO-11)",
    "incident-prise": "Photo de l'incident que vous déclarez (PRO-18)",
    "appel-de-fonds": "Appel du syndic à joindre (PRO-20)",
    "07-livre": "Justificatif à ranger dans Documents (PRO-19)",
})}
"""


# ------------------------------------------------------------------ locataire du propriétaire

def locataire_proprietaire(racine: Path) -> str:
    t = P["thomas"]
    banc = next(x for x in U.BIENS_PROPRIETAIRE if x["cle"] == "banc")
    b3 = banc["lots"][0]
    edl = U.EDL_ENTREE["B3"]
    emp = U.EMPLOYEURS["thomas"]
    return f"""
{couverture("Locataire du propriétaire", "thomas", "Vous louez le T2 de Sophie Lemaire à Corbeil-Essonnes. Pas d'agence : votre gestionnaire, c'est elle.")}

## 1. Qui êtes-vous

{identite("thomas", [("Employeur", f"{emp['nom']} ({emp['forme']}), {emp['adresse']}"), ("Salaire net mensuel", eur(t['salaire_net']))])}

## 2. Vos accès

- **Adresse de connexion : votre vraie adresse e-mail**, transmise par le coordinateur à la propriétaire, qui vous
  invite. « Votre accès Gerimmo » : **lien valable une heure** (sinon « Mot de passe oublié ? »).

## 3. Votre logement et votre bail

| | |
|---|---|
| Adresse | {banc['adresse']}, {banc['code_postal']} {banc['ville']} — T2, 3ᵉ étage sans ascenseur |
| Logement | {m2(b3['surface'])}, {b3['pieces']} pièces, chaudière gaz individuelle |
| Bail | nu, **entrée le 16/09/2026** (septembre est donc facturé au prorata), préavis d'un mois (zone tendue) |
| Loyer · charges | {eur(b3['loyer'])} + {eur(b3['charges'])} = **{eur(b3['loyer'] + b3['charges'])} par mois** |
| Dépôt de garantie | {eur(b3['depot'])} |
| Bailleuse et gestionnaire | Sophie Lemaire |

**Vous ne payez rien pour de vrai** : l'IBAN de Sophie est fictif ; elle saisit vos paiements (dont un paiement
partiel exprès, pour tester le reçu).

## 4. Votre dossier

| Pièce | Qui la dépose |
|---|---|
| Pièce d'identité, 3 bulletins, attestation d'employeur | la propriétaire |
| Justificatif de domicile, avis d'imposition, RIB | **vous**, quand elle vous les réclame (LOP-04) |
| Attestation d'assurance | **vous** (LOP-03) : contrat MFE-MRH-2026-60311, valable jusqu'au {U.ASSURANCE_HABITATION['fin']} |
| Exemplaire signé du bail | **vous** (LOP-05) |

## 5. Ce que vous devez retrouver

- **État des lieux d'entrée** : {", ".join(f"{t_.lower()} {r}" for t_, _, r in edl['releves'])} ; {edl['cles']}.
- **Échéancier** : septembre au prorata (environ 390 €), octobre 780 €.
- **Documents** : quittance de septembre, reçu partiel d'octobre (400 €), puis quittance d'octobre.

## 6. Votre incident

Radiateur en panne (LOP-09) : Chauffage — radiateur ou eau chaude en panne · Chambre · « Le radiateur de la chambre
reste froid, la tête thermostatique est cassée » · depuis trois jours · pas urgent · photo incident-radiateur-froid.jpg.
Pour le rendez-vous, **vous refusez les créneaux de l'artisan et proposez les vôtres** (LOP-10).

## 7. Les personnages que vous croiserez

{personnages_croises([
    ("Sophie Lemaire", "votre propriétaire et gestionnaire", "le testeur « Propriétaire bailleur »"),
    ("Karim Haddad", "l'artisan chauffagiste", "le testeur « Artisan »"),
    ("Tahir", "supervision Gerimmo", "le coordinateur"),
])}

## 8. Vos fichiers

{fichiers(racine, {
    "attestation-assurance": "À déposer dans « Votre assurance habitation » (LOP-03)",
    "pieces-reclamees": "À déposer quand la propriétaire vous les réclame (LOP-04)",
    "exemplaire-signe": "Votre exemplaire signé du bail (LOP-05)",
    "incident-radiateur": "Photo du radiateur (LOP-09)",
})}
"""


# ------------------------------------------------------------------ artisan

def artisan(racine: Path) -> str:
    def devis(lignes):
        total_ht = sum(q * pu for _, q, pu in lignes)
        rangs = "\n".join(f"| {l} | {str(q).replace('.', ',')} | {eur(pu)} | 10 % |" for l, q, pu in lignes)
        return (f"| Prestation ou fourniture | Quantité | Prix unitaire HT | TVA |\n|---|---|---|---|\n{rangs}\n"
                f"| **Total** | | **{eur(total_ht)} HT** | **{eur(round(total_ht * 1.1, 2))} TTC** |\n")

    FACTURE_SIPHON, FACTURE_RADIATEUR = U.FACTURE_SIPHON, U.FACTURE_RADIATEUR

    return f"""
{couverture("Artisan", "karim", "Vous dirigez une petite entreprise de plomberie-chauffage à Athis-Mons. Gerimmo vous apporte des missions : une fuite pour l'agence Horizon Gestion, un radiateur pour Sophie Lemaire.")}

## 1. Qui êtes-vous

{identite("karim", [("Fonction", "Gérant")])}

## 2. Vos accès

- **Vous créez votre compte vous-même** sur www.gerimmo.app/artisan/inscription avec votre vraie adresse e-mail, puis vous
  la confirmez. Renseignez-la aussi dans le champ « Adresse e-mail » de l'entreprise : c'est là que partent les
  notifications.
- Le coordinateur valide votre inscription : **aucun courriel ne vous le dit**, regardez « Mon entreprise ».

## 3. Votre entreprise

| Champ | Valeur à saisir |
|---|---|
| Nom de votre entreprise | {AR['raison_sociale']} |
| SIRET | {AR['siret']} (secours : {AR['siret_secours']}) |
| Mobile | {AR['telephone']} |
| Adresse e-mail | votre adresse |
| Vos métiers | {', '.join(AR['metiers'])} |
| Votre zone d'intervention | {', '.join(AR['zone'])} |

Pour mémoire (sur les documents) : {AR['forme']}, {AR['rcs']}, TVA {AR['tva']}, siège {AR['adresse']}, {AR['code_postal']} {AR['ville']}.

| Attestation | Émise le | Valable jusqu'au |
|---|---|---|
| Assurance décennale ({AR['police_decennale']}) | 05/01/2026 | 31/12/2026 |
| Responsabilité civile professionnelle ({AR['police_rc']}) | 05/01/2026 | 31/12/2026 |
| Attestation de vigilance URSSAF | 15/09/2026 | 15/03/2027 |
| Extrait Kbis | 10/09/2026 | 10/12/2026 |

## 4. Mission 1 — fuite sous l'évier (Horizon Gestion, Massy, lot A12)

Diagnostic : « Siphon PVC fissuré et joint usé : remplacement du siphon et des joints » · délai « Sous 48 heures » ·
durée « 1 h 30 » · contraintes « Vider le meuble sous l'évier avant mon passage ».

{devis(FACTURE_SIPHON)}
Facture **F2026-0142**, même montant.

## 5. Mission 2 — radiateur (Sophie Lemaire, Corbeil-Essonnes)

Diagnostic : « Tête thermostatique cassée, circuit à purger » · délai « Sous 3 jours » · durée « 1 heure ». Sur place,
vous signalez **une cause imprévue** : « Robinet de radiateur grippé, usure normale ».

{devis(FACTURE_RADIATEUR)}
Facture **F2026-0143**, même montant.

## 6. Les personnages que vous croiserez

{personnages_croises([
    ("Nadia Bensaïd (Horizon Gestion)", "agence cliente", "le testeur « Agence immobilière »"),
    ("Camille Roussel", "locataire chez qui vous réparez la fuite", "le testeur « Locataire de l'agence »"),
    ("Sophie Lemaire", "propriétaire cliente", "le testeur « Propriétaire bailleur »"),
    ("Thomas Girard", "locataire chez qui vous réparez le radiateur", "le testeur « Locataire du propriétaire »"),
    ("Tahir", "supervision Gerimmo (valide votre inscription)", "le coordinateur"),
])}

## 7. Vos fichiers

{fichiers(racine, {
    "attestation-decennale": "Assurance décennale (ART-03) — obligatoire pour la validation",
    "attestation-rc-pro": "RC professionnelle (ART-03) — obligatoire pour la validation",
    "urssaf": "Attestation de vigilance (ART-03)",
    "kbis": "Extrait Kbis (ART-03)",
    "RIB": "RIB de l'entreprise, pour mémoire (le paiement se fait hors de Gerimmo)",
    "avant-siphon": "Photo « avant » facultative (ART-09)",
    "apres-siphon": "Photo « après », depuis un ordinateur (ART-09)",
    "apres-radiateur": "Photo « après », depuis un ordinateur (ART-13)",
    "F2026-0142": "Facture de la mission 1 (ART-10)",
    "F2026-0143": "Facture de la mission 2 (ART-13)",
})}
"""
