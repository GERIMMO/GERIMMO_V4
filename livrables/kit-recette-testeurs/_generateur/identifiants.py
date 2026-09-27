"""Identifiants fictifs mais bien formés (clés de contrôle justes).

Ils passent les contrôles de format sans viser une entreprise, un compte ou
une ligne réels :
- SIREN commençant par 000, clé de Luhn juste (SIRET et TVA en découlent) ;
- IBAN français sur un code banque fictif (99999), clé RIB et clé IBAN
  calculées ;
- téléphones pris dans les plages que l'Arcep réserve aux œuvres de fiction
  (01 99 00 xx xx et 06 39 98 xx xx).
"""

from __future__ import annotations


def luhn_valide(chiffres: str) -> bool:
    total = 0
    for i, c in enumerate(reversed(chiffres)):
        n = int(c)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def completer_luhn(prefixe: str) -> str:
    """Ajoute le chiffre qui rend `prefixe + chiffre` valide selon Luhn."""
    for c in "0123456789":
        if luhn_valide(prefixe + c):
            return prefixe + c
    raise ValueError(prefixe)


def siren(graine: int) -> str:
    return completer_luhn(f"000{graine:05d}")


def siret(siren_: str, etablissement: int = 1) -> str:
    return completer_luhn(f"{siren_}{etablissement:04d}")


def format_siren(s: str) -> str:
    return f"{s[0:3]} {s[3:6]} {s[6:9]}"


def format_siret(s: str) -> str:
    return f"{s[0:3]} {s[3:6]} {s[6:9]} {s[9:14]}"


def tva_intracom(siren_: str) -> str:
    cle = (12 + 3 * (int(siren_) % 97)) % 97
    return f"FR{cle:02d}{siren_}"


def _lettres_en_chiffres(texte: str) -> str:
    return "".join(str(ord(c) - 55) if c.isalpha() else c for c in texte.upper())


def iban_fr(guichet: int, compte: int) -> dict:
    banque = "99999"
    guichet_s = f"{guichet:05d}"
    compte_s = f"{compte:011d}"
    cle_rib = 97 - ((89 * int(banque) + 15 * int(guichet_s) + 3 * int(compte_s)) % 97)
    bban = f"{banque}{guichet_s}{compte_s}{cle_rib:02d}"
    controle = 98 - int(_lettres_en_chiffres(bban + "FR00")) % 97
    iban = f"FR{controle:02d}{bban}"
    return {
        "iban": iban,
        "iban_lisible": " ".join(iban[i:i + 4] for i in range(0, len(iban), 4)),
        "banque": banque,
        "guichet": guichet_s,
        "compte": compte_s,
        "cle_rib": f"{cle_rib:02d}",
        "bic": "RCTEFRPPXXX",
        "domiciliation": "Banque Fictive de Recette — agence d'Évry",
    }


def iban_valide(iban: str) -> bool:
    iban = iban.replace(" ", "")
    return int(_lettres_en_chiffres(iban[4:] + iban[:4])) % 97 == 1


def telephone_fixe(n: int) -> str:
    return f"01 99 00 {n // 100:02d} {n % 100:02d}"


def telephone_mobile(n: int) -> str:
    return f"06 39 98 {n // 100:02d} {n % 100:02d}"


if __name__ == "__main__":
    s = siren(4217)
    print(s, luhn_valide(s), siret(s), luhn_valide(siret(s)), tva_intracom(s))
    i = iban_fr(1, 4217001)
    print(i["iban_lisible"], iban_valide(i["iban"]))
    print(telephone_fixe(1234), telephone_mobile(4217))
