# Kit de recette Gerimmo

Tout ce qu'il faut pour éprouver le produit à la main : les comptes, les
documents à déposer, les dossiers à saisir, et un parcours qui passe par
chaque écran qui compte.

> **Tout est fictif.** Les personnes, sociétés, IBAN, numéros fiscaux et
> numéros de pièce sont inventés et volontairement **hors format** : aucun ne
> peut servir ailleurs que dans ces essais. Chaque PDF porte « SPÉCIMEN » en
> travers et la mention « document fictif, sans valeur légale ».

---

## 1. L'adresse du site

**Je n'ai pas pu la vérifier depuis mon bac à sable** : l'accès web général y
est refusé par la politique réseau (403 sur toute adresse extérieure). Les
connecteurs GitHub et Supabase, eux, passent — c'est par là que je publie et
que j'ai vérifié la base.

Lisez-la sur **Vercel → projet `gerimmo-v4` → Overview → Domains** (l'onglet
que vous aviez ouvert). L'adresse `…vercel.app` est celle qui marche
aujourd'hui : `gerimmo.app` est acheté mais **pas encore branché** (domaine
Vercel + DNS, `NEXT_PUBLIC_SITE_URL`, URLs de redirection Supabase,
vérification du domaine chez Resend).

**Conséquence pour vos essais :** les e-mails partiront d'un expéditeur de
repli et les liens qu'ils contiennent pointeront vers l'adresse Vercel. Ce
n'est pas un défaut du produit, c'est la configuration qui manque.

---

## 2. Les comptes

**Mot de passe commun : `Gerimmo-Demo-2026`**

Les huit comptes sont **présents en production** (vérifié le 13/09).

| Adresse | Rôle | Organisation | Ce qu'il sert à éprouver |
|---|---|---|---|
| `admin.alpha@gerimmo-demo.fr` | Admin d'agence | Agence Alpha | Tout le parc, les mandats, l'abonnement, l'administration |
| `agent.alpha@gerimmo-demo.fr` | Agent | Agence Alpha | **Le portefeuille restreint** — il ne doit voir que ses lots |
| `proprietaire@gerimmo-demo.fr` | Propriétaire bailleur | Parc de Claire Moreau | L'espace propriétaire direct, en essai gratuit |
| `locataire.alpha@gerimmo-demo.fr` | Locataire | Agence Alpha | L'espace locataire côté agence |
| `locataire.pd@gerimmo-demo.fr` | Locataire | Parc de Claire Moreau | L'espace locataire côté propriétaire direct |
| `multi@gerimmo-demo.fr` | Agent **et** admin | Alpha **et** Beta | Le sélecteur « Mes espaces », le passage d'une agence à l'autre |
| `admin.beta@gerimmo-demo.fr` | Admin d'agence | Agence Beta | **L'étanchéité** : il ne doit RIEN voir d'Alpha |
| `superadmin@gerimmo-demo.fr` | Super admin | — | La console `/admin`, la supervision transverse |

L'artisan n'a pas d'adhésion posée d'avance : elle se crée quand une agence le
sollicite sur un incident. Son portail apparaît alors dans « Mes espaces ».

---

## 3. Les pièces à déposer

Dans `documents/` — 37 PDF, dans `photos/` — 5 images.

**Par locataire** (Sofia Moreau, Karim Benali, Léa Nguyen) :
pièce d'identité · **trois** bulletins de salaire · avis d'imposition ·
justificatif de domicile · attestation d'assurance · **la même attestation
périmée** · RIB.

**Par bien** (Lilas, Voltaire, Tilleuls) : DPE · état des risques (ERP).

**Par propriétaire** : un RIB. Plus un mandat de gestion signé.

**Photos** : trois signalements d'incident (fuite, volet, chaudière) et deux
vues d'état des lieux.

> L'attestation **périmée** est là pour une raison : déposez-la et l'alerte
> « attestation expirée » doit se poser toute seule, sans que vous ne fassiez
> rien. C'est un des rares endroits où le produit doit travailler sans vous.

---

## 4. Les dossiers à saisir

Les trois propriétaires, trois biens et trois locataires sont dans
[`donnees/dossiers.md`](donnees/dossiers.md), avec toutes les valeurs
attendues par les formulaires.

---

## 5. Le parcours de recette

Dans cet ordre — chaque étape prépare la suivante.

### A. L'agence monte un dossier (`admin.alpha`)

1. **Parc → + Ajouter un bien** : créez « Résidence des Lilas » avec ses
   valeurs. Vérifiez que le lot naît avec le bien.
2. Sur la fiche du lot : **surface, pièces, étage**, puis **Compléter la
   détention** → Alice Dupont, 100 %.
3. **Déposez le DPE et l'ERP.** L'écran doit cesser de réclamer ce qui est là.
4. **Personnes → créer Sofia Moreau**, puis déposez ses sept pièces.
5. **Mandats** → un mandat sur le lot, 7 % d'honoraires, déposez le mandat
   signé, activez-le.
6. **Bail** → créez-le, déposez-le signé, activez-le.
   *Le produit doit refuser d'activer tant qu'il manque une pièce obligatoire :
   c'est voulu, c'est le garde-fou.*
7. **État des lieux d'entrée** → la grille, deux photos, signez.

### B. Ce qui doit tourner tout seul

8. **Tableau de bord** : le plan du jour s'ouvre **replié**. Dépliez « À
   débloquer sur les baux ».
9. Déposez l'**attestation périmée** sur le bail → une alerte doit apparaître
   **sans action de votre part**.
10. **Comptabilité** : appelez le terme du mois, encaissez, vérifiez que la
    **quittance part seule**. Encaissez un **montant partiel** : vous devez
    obtenir un **reçu**, pas une quittance.

### C. Le locataire (`locataire.alpha`)

11. **Mes paiements** : le solde doit correspondre au centime près à ce que
    l'agence voit.
12. **Déclarer un incident** avec une photo — la photo est le premier champ.
13. **Mes documents** : la quittance est là, le bail signé aussi.

### D. L'agent, et l'étanchéité (`agent.alpha`, puis `admin.beta`)

14. `agent.alpha` : **Mon portefeuille** ne montre que ses lots. Il peut
    ajouter un bien ; « Reprendre un parc » ne lui est **pas** proposé.
15. `admin.beta` : **rien** d'Agence Alpha ne doit apparaître, nulle part.
16. `multi` : le menu de l'avatar → **Mes espaces** → passer d'Alpha à Beta.

### E. Le propriétaire (`proprietaire`)

17. Son parc, son bandeau d'essai gratuit, et **Mon abonnement**.
    *Sans compte Stripe configuré, le paiement doit refuser par une **phrase**,
    pas par une erreur technique. C'est ce qu'il faut vérifier aujourd'hui.*

### F. Le mobile

18. Reprenez A → E **sur votre téléphone**. Rien ne doit déborder
    horizontalement, et tout doit se toucher au doigt.

---

## 6. Ce qui ne marchera pas, et pourquoi

Ne le comptez pas comme un défaut :

- **Le paiement.** Aucun compte Stripe n'est configuré : le produit refuse
  proprement (« Paiement en ligne non configuré »). C'est ce refus-là qu'il
  faut éprouver, pas l'encaissement.
- **Les e-mails** partent d'un expéditeur de repli tant que `gerimmo.app`
  n'est pas vérifié chez Resend.
- **La reprise comptable** (soldes d'une agence qui arrive avec un parc déjà
  géré) n'a pas d'écran : les tables existent, rien ne les câble.
- **Les mentions légales** sont vides — les treize faits de votre société ne
  sont pas renseignés, et les pages le disent elles-mêmes.

---

## 7. Refabriquer les pièces

```bash
cd app
PLAYWRIGHT_CHROMIUM=/chemin/vers/chromium node kit-de-test/fabriquer.mjs
```

Modifiez `fabriquer.mjs` pour changer les personnes, les montants ou les
biens : tout part de trois tableaux en haut du fichier.
