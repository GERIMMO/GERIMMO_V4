"""Produit les fiches (PDF + Markdown) et les tableaux de suivi du kit."""

from __future__ import annotations

import shutil
from datetime import date
from pathlib import Path

import fiches as F
import gabarits as G
import textes_communs as TC
import textes_personnages as TP
import textes_remontee as TR
import tests_agence
import tests_artisan
import tests_locataire_agence
import tests_locataire_proprietaire
import tests_proprietaire
import univers as U
from rendu import html_vers_pdf

MODULES = {
    "agence": tests_agence,
    "locataire-agence": tests_locataire_agence,
    "proprietaire": tests_proprietaire,
    "locataire-proprietaire": tests_locataire_proprietaire,
    "artisan": tests_artisan,
}

PERSONNAGES = {
    "agence": TP.agence,
    "locataire-agence": TP.locataire_agence,
    "proprietaire": TP.proprietaire,
    "locataire-proprietaire": TP.locataire_proprietaire,
    "artisan": TP.artisan,
}

SLUGS = {
    "agence": "agence-immobiliere",
    "locataire-agence": "locataire-de-l-agence",
    "proprietaire": "proprietaire-bailleur",
    "locataire-proprietaire": "locataire-du-proprietaire",
    "artisan": "artisan",
}

EN_TETE_MD = "<!-- Fichier produit par _generateur/generer_kit.py — ne pas modifier à la main : modifier le générateur et relancer. -->\n\n"


def mode_emploi(prefixe: str) -> str:
    return f"""
## Comment utiliser cette fiche

- **Dans l'ordre** : les tests suivent le déroulé de la recette (J1, J2…). Chaque carte dit sur quel appareil la
  faire, combien de temps elle prend, et quel test doit avoir été fait avant.
- **Les données** à saisir sont dans la carte ou dans « Mon personnage » ; les **fichiers** partent du dossier
  `documents/` de votre dossier.
- <span class="pastille alerte">⏳ Dépend d'un autre testeur</span> : attendez que la personne citée ait fait son test
  (le coordinateur vous prévient). <span class="pastille paiement">💳 Paiement réel</span> : votre carte est
  réellement débitée — seulement avec l'accord du coordinateur. <span class="pastille claire">Facultatif</span> : à
  faire si vous avez le temps.
- **Cochez** OK, KO, Bloqué ou Non fait. **KO ou Bloqué** : signalez-le tout de suite dans Gerimmo par
  « Aide et retours » (voir la fiche de remontée), en commençant le titre par le numéro du test
  (ex. `[GÊNANT] {prefixe}-03 — …`), puis notez la **référence** donnée par Gerimmo.
- Un écart entre le résultat attendu et ce que vous voyez est **toujours** bon à signaler, même petit.
"""


def fiche_tests_html(module, couleur: str, titre_personnage: str) -> str:
    tests = module.TESTS
    nb_fac = sum(1 for t in tests if t.get("optionnel"))
    couverture = (
        f'<div class="couverture"><div class="sur">Kit de recette Gerimmo · fiche de tests</div>'
        f'<h1>{G.e(module.TITRE)}</h1><div class="sous">{G.e(module.SOUS_TITRE)} — {len(tests)} tests, dont {nb_fac} facultatifs. '
        f'Vos données : « Mon personnage ».</div></div>'
    )
    return (couverture + G.md_vers_html(mode_emploi(module.PREFIXE)) + '<h2>Sommaire</h2>' + F.sommaire_html(tests)
            + F.fiche_html(tests))


def fiche_tests_md(module) -> str:
    tests = module.TESTS
    tete = f"# Fiche de tests — {module.TITRE}\n\n*{module.SOUS_TITRE}* · {len(tests)} tests\n\n"
    return EN_TETE_MD + tete + G.raccourcis_md(mode_emploi(module.PREFIXE)) + "\n## Les tests\n\n" + F.fiche_md(tests)


def pdf(corps_html: str, titre: str, pied: str, couleur: str, destination: Path) -> Path:
    return html_vers_pdf(G.page_kit(titre, pied, corps_html, couleur), destination)


def md(texte: str, titre: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    corps = G.raccourcis_md(texte)
    # les blocs HTML de mise en page (couverture, grilles) restent lisibles en Markdown
    destination.write_text(EN_TETE_MD + f"# {titre}\n\n" + corps.strip() + "\n", encoding="utf-8")
    return destination


def produire(kit: Path, personas: dict) -> None:
    aujourd_hui = date.today().strftime("%d/%m/%Y")
    commun = kit / "00-commun"
    commun.mkdir(parents=True, exist_ok=True)
    bleu = G.COULEURS_PERSONA["commun"]

    print("· Textes communs")
    a_lire = pdf(G.md_vers_html(TC.a_lire()), TC.A_LIRE_TITRE, f"Kit de recette Gerimmo · À lire en premier · {aujourd_hui}",
                 bleu, commun / "00-A-lire-en-premier.pdf")
    remontee = pdf(G.md_vers_html(TR.texte()), TR.TITRE, f"Kit de recette Gerimmo · Fiche de remontée · {aujourd_hui}",
                   bleu, commun / "03-Fiche-de-remontee.pdf")
    md(TC.a_lire(), "À lire en premier", commun / "A lire en premier.md")
    md(TR.texte(), "Fiche de remontée d'information", commun / "Fiche de remontee.md")

    feuilles = []
    for cle, persona in personas.items():
        module = MODULES[cle]
        racine = kit / persona["dossier"]
        couleur = G.COULEURS_PERSONA[cle]
        slug = SLUGS[cle]
        print(f"· {persona['titre']} — fiches")
        pdf(fiche_tests_html(module, couleur, persona["titre"]), f"Fiche de tests — {persona['titre']}",
            f"Kit de recette Gerimmo · Fiche de tests · {persona['titre']}", couleur, racine / f"01-Fiche-de-tests-{slug}.pdf")
        texte_perso = PERSONNAGES[cle](racine)
        pdf(G.md_vers_html(texte_perso), f"Mon personnage — {persona['titre']}",
            f"Kit de recette Gerimmo · Mon personnage · {persona['titre']}", couleur, racine / f"02-Mon-personnage-{slug}.pdf")
        shutil.copy(a_lire, racine / "00-A-lire-en-premier.pdf")
        shutil.copy(remontee, racine / "03-Fiche-de-remontee.pdf")
        F.suivi_xlsx([(persona["titre"], f"Suivi des tests — {persona['titre']}", module.TESTS)],
                     racine / f"04-Suivi-des-tests-{slug}.xlsx")
        (racine / f"Fiche de tests - {persona['titre']}.md").write_text(fiche_tests_md(module), encoding="utf-8")
        md(texte_perso, f"Mon personnage — {persona['titre']}", racine / f"Mon personnage - {persona['titre']}.md")
        feuilles.append((persona["titre"], f"Suivi — {persona['titre']}", module.TESTS))

    print("· Coordinateur")
    coord = kit / "06-coordinateur"
    pdf(G.md_vers_html(TC.guide()), TC.GUIDE_TITRE, f"Kit de recette Gerimmo · Guide du coordinateur · {aujourd_hui}",
        G.COULEURS_PERSONA["coordinateur"], coord / "01-Guide-du-coordinateur.pdf")
    md(TC.guide(), "Guide du coordinateur", coord / "Guide du coordinateur.md")
    F.affectation_xlsx([
        ("01 Agence immobilière", "Nadia Bensaïd (Horizon Gestion)", "Ouverte par le coordinateur (console) avec l'e-mail du testeur"),
        ("01 — personnage secondaire", "Bernard Fontaine (mandant)", "Aucun compte : alias +mandant du testeur agence"),
        ("01 — personnage secondaire", "Philippe Roussel (garant)", "Aucun compte : alias +garant du testeur agence"),
        ("01 — facultatif", "Julien Marchetti (agent)", "Invité par l'agence : alias +agent du testeur agence"),
        ("02 Locataire de l'agence", "Camille Roussel", "Invitée par l'agence depuis sa fiche"),
        ("03 Propriétaire bailleur", "Sophie Lemaire", "Inscription en ligne (/inscription)"),
        ("04 Locataire du propriétaire", "Thomas Girard", "Invité par la propriétaire depuis sa fiche"),
        ("05 Artisan", "Karim Haddad (Haddad Plomberie Chauffage)", "Inscription en ligne (/artisan/inscription), validée par le coordinateur"),
    ], coord / "02-Tableau-d-affectation.xlsx")
    F.suivi_xlsx(feuilles, coord / "03-Suivi-consolide.xlsx")
    _ = U
