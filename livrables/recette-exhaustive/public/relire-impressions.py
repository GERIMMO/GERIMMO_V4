"""Contrôler les documents que Chromium a enregistrés après le clic sur Imprimer."""
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
import json
from pathlib import Path
from pypdf import PdfReader

d = Path(__file__).resolve().parent / "preuves/impression"
verifications = []
for essai in json.loads((d / "resultats.json").read_text()):
    if essai["statut"] != "produit":
        continue
    fichier = d / essai["fichier"]
    document = PdfReader(fichier)
    texte = " ".join(" ".join((page.extract_text() or "") for page in document.pages).split())
    empreinte = sha256(fichier.read_bytes()).hexdigest()
    attendu = ["Camille des Tilleuls", "Alix des Lilas", "7 rue du Tilleul", "3 rue du Tilleul"]
    if essai["document"] == "quittance":
        attendu += ["Quittance de loyer", "970,00 €", "900,00 €", "70,00 €"]
    else:
        # Données d'exemple réellement affichées par la série IRL du banc.
        calcul = (Decimal("850") * Decimal("148.06") / Decimal("145.77")).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
        attendu += ["révision annuelle du loyer", "01/12/2026", str(calcul).replace(".", ",") + " €", "145,77", "148,06"]
    manquants = [mot for mot in attendu if mot not in texte]
    reserve = any(x in texte for x in ("[adresse du logement]", "[date d'effet]", "Outils gratuits", "Commencer mon essai gratuit"))
    statut = "réussi" if not manquants and not reserve and len(document.pages) == 1 else "échec"
    verifications.append(dict(viewport=essai["viewport"], fichier=fichier.name, pages=len(document.pages), montant=attendu[-3] if essai["document"]=="lettre" else "970,00 €", champsAttendus=attendu, manquants=manquants, reserveOuNavigation=reserve, sha256=empreinte, statut=statut))
(d / "relecture.json").write_text(json.dumps(verifications, ensure_ascii=False, indent=1) + "\n")
print([(r["fichier"],r["statut"],r["manquants"]) for r in verifications])
