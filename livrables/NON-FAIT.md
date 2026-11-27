# Ce qui n'a pas été fait, et pourquoi

- **Rédigé le** 25/11/2026, pour la version préparée `062296e2` (branche `claude/palier-1-preproduction` ; `89cb87ff` plus les corrections RET-01, L-01, l'écran du bail sur iPhone, l'avertissement d'annulation de l'artisan, et des tests rendus indépendants de la machine). **Publiée en production le 25/11/2026 à 23:17Z (`main` `8f9dd9ce`) ; les réglages de la console R1 à R8 restent à faire.**
- **Pour chaque ligne** : quoi, pourquoi, le risque, ce qu'il faudrait pour le faire.
- **VÉRIFIÉ** veut dire lu ou rejoué, avec la source citée. **SUPPOSÉ** veut dire déduit, pas constaté.
- **Aucun point de droit n'est présenté ici comme conforme.** Les renvois « JURISTE » visent `JURISTE.md` (partie · point).
- **Aucun secret dans ce document.** Seuls des noms de réglages sont cités.
- Mots utiles : une *migration* change la base de données ; son *retour arrière* la défait ; le *banc* est la copie d'essai de l'agent, avec des données fictives ; un *parcours navigateur* est un robot qui clique dans l'application ; la *CI* est la vérification automatique de GitHub.

Seconde passe complète de vérification (IA activée, puis coupée), sur `89cb87ff` : 355 puis 354 parcours réussis au premier essai ; documents sans anomalie ; aucune fuite entre espaces ; un seul défaut majeur (L-01), corrigé dans `f78e3a3f` ; défauts mineurs reportés (§ 1). Deux points nés de cette passe attendent une réponse : outil public de quittance (Q123, complétée) et quittance avec une part payée par la CAF (Q124 ; JURISTE 9·44).

---

## 1. Reporté sur votre décision

| Quoi | Pourquoi | Risque | Ce qu'il faudrait |
|---|---|---|---|
| **Facture de l'artisan fabriquée par Gerimmo, avec acompte** (Q14) | Votre décision du 24/11 (nuit), mot pour mot : « Reporte la facture et les défaut mineurs mais retiens les. » Rien n'est codé. | Faible aujourd'hui : l'artisan dépose sa propre facture, comme avant. Pas d'acompte possible. | L'accord d'un expert-comptable (mandat de facturation, « au nom et pour le compte de », numérotation propre, facture d'acompte). Puis un lot sous interrupteur fermé, avec double relecture (argent). |
| **Défauts d'écran mineurs** des pages publiques, de l'espace du propriétaire et de la console | Même décision du 24/11 (nuit) : « Reporte la facture et les défaut mineurs mais retiens les. » Seuls les majeurs sont traités. La relecture comptait 27, 52 et 93 relevés pour ces trois espaces, majeurs compris, souvent comptés deux fois (téléphone et ordinateur) (JOURNAL, 24/11). | Gêne d'affichage ou de libellé. Aucun calcul faux connu dans ces relevés (SUPPOSÉ : ils ont été classés « mineurs » par la relecture). Exemple : « 24 moisaprès » sur la page de confidentialité. | Un lot après la publication, une seule relecture. La liste est gardée : lots 64 et 65 de la relecture des écrans pour la console (`DECISIONS-2026-11-24.md`) ; numéros des lots des pages publiques et du propriétaire : à vérifier. Changer la page de confidentialité oblige à relever sa date et son empreinte ensemble (`notes-majeurs.md`). |
| **Nettoyage de la base** (Q36) : cinq tables qui ne servent plus (`site_pages`, `liste_attente`, `signature_evenements`, `reseau_ouvertures`, `reseau_artisan_communes`), dix-sept fonctions que rien n'appelle, le code qu'aucun écran n'atteint, les fonctions laissées par l'ancien parcours de signature (lot D5), et « CAF / APL » absent du tableau de bord | Votre décision : « rien n'est supprimé pendant la mission », lot à part après la publication. Une suppression ne se défait pas simplement. | Un visiteur peut encore lire `site_pages` et écrire dans `liste_attente` (30 lignes par heure au plus). Du code mort à entretenir. Deux listes de modes de règlement différentes (5 et 6). | Un lot à part après la publication : sauvegarde, contrôle en lecture seule, puis retrait. **Ne jamais toucher à `liste_attente_agences`** (votre décision). |
| **Antivirus sur les fichiers déposés** (Q8) | Votre décision du 24/11 : pas maintenant. | Un fichier piégé n'est pas détecté. Seules limites : PDF, JPEG, PNG, 10 Mo. | Choisir un service (peut-être payant), puis le relier. |
| **Règles de conservation des données** (Q39) | Votre décision : « N'active aucune règle de conservation ». Activer une durée supprime des données : cela ne se défait pas. | Des données gardées plus longtemps que nécessaire. Point de droit non tranché. | Choisir les règles après lecture du bilan de la console (« Conservation »), avec l'avis d'un juriste. |
| **Copie de la base et lien d'aperçu** (Q1) | Votre décision du 24/11 (nuit) : « Pas de copie de base ». Un aperçu Vercel se brancherait sur la production. | Le premier vrai passage sera la production. Les envois et l'archivage des conditions ne s'y défont pas (plan, § 5.6). | Rien, sauf si vous changez d'avis : une copie coûte environ 10 $ par mois (Q1). |

## 2. En attente de votre réponse (l'option la plus prudente est appliquée)

| Quoi | Pourquoi | Risque | Ce qu'il faudrait |
|---|---|---|---|
| **Annonce des nouvelles conditions par e-mail** (Q93) | L'article 16 promet un e-mail un mois avant. L'envoi n'est pas écrit. En attendant, la console refuse d'archiver une nouvelle version dès qu'il existe un abonné actif. | Avec un seul abonné, aucune nouvelle version des conditions ne pourra être archivée. | Écrire cet envoi dans un lot, avant le premier abonné ou avant la prochaine version. |
| **Relance de loyer à la main partie à une partie des locataires, ou non confirmée** (Q117, Q118) | Pour ne jamais envoyer deux fois, le palier est fermé pour tous. La personne non servie est à prévenir hors de Gerimmo. | Un colocataire n'est pas relancé par Gerimmo à ce palier. Le palier suivant peut être proposé alors que l'e-mail n'est peut-être pas arrivé. | Votre choix. Un geste « terminer l'envoi » demanderait de changer la preuve en base. |
| **Bail de deux époux ou partenaires** (Q116, Q121, Q122) | Tiers ajouté accepté avec un avertissement ; avenant de remplacement refusé ; nouvelle signature après « Corriger » traitée comme la signature du bail. | Le gérant qui doit remplacer l'un des époux n'a pas de solution dans Gerimmo. | Votre choix, et la réponse du juriste (JURISTE 9·39 à 9·41). |
| **Répartition fiscale des paiements selon l'ordre de saisie** (Q73) | Découvert en passant ; hors de tout lot. | Le récapitulatif fiscal peut répartir des paiements selon leur ordre d'enregistrement, et non leur date. | Un lot à part, avec l'expert-comptable. |
| **Export de l'artisan incomplet** (Q90) | Le bouton ne promet plus « toutes mes données ». Un export complet et lisible serait une fonction nouvelle. | L'artisan ne retrouve ni ses messages, ni ses créneaux, ni ses photos. | Votre accord, puis un lot à part. |
| **Écran de simulation du nettoyage** (Q87) | Écart d'affichage seulement. | Un compte faux sur cet écran. | Un petit lot, si cela vous gêne. |
| **Les autres questions ouvertes** (Q54 à Q61, Q67 à Q74, Q78 à Q98, Q102 à Q124) | Elles attendent votre réponse. L'option la plus prudente est en place. | Variable ; la colonne « Ce que votre réponse changerait » de `QUESTIONS.md` le dit pour chacune. | Vos réponses. |

## 3. Bloqué par un texte non fourni ou par un point de droit

| Quoi | Pourquoi | Risque | Ce qu'il faudrait |
|---|---|---|---|
| **Lire les articles de loi mot à mot** (Q62) | Légifrance refuse les lectures automatiques. Les textes viennent du recueil que vous avez fourni, non recontrôlé sur Légifrance. | Une règle codée d'après un texte mal recopié. | Un compte PISTE (accès officiel et gratuit à Légifrance), ou les articles copiés par vous. |
| **`JURISTE.md` n'est pas allégé** | Les réponses reçues le 24/11 ne sont pas une consultation signée. Aucune question n'est retirée. La partie 9 compte 44 points. | Aucune règle de droit n'est garantie. Gerimmo avertit au lieu d'affirmer. | Une consultation d'un juriste (et d'un expert-comptable pour la partie 4), puis la relecture des textes. |
| **Vendre aux particuliers sans médiateur** (Q65, Q75 ; JURISTE 7·6 et 9·26) | Le recueil cite les articles L612-1 et L616-1 du code de la consommation, sans exception lue. La vente aux particuliers reste fermée par défaut. | Si vous l'ouvrez : une vente peut-être irrégulière ; la sanction n'est pas dans le recueil. | Adhérer à un médiateur référencé, ou l'avis d'un juriste. |
| **Mention de TVA et activité déclarée** (Q66 ; JURISTE 6·13 et 9·32) | L'activité déclarée est « formation continue d'adultes ». Une fiche officielle dit que la référence de la mention a changé le 01/09/2026. | Une mention fausse sur les factures d'abonnement. | L'avis d'un expert-comptable. |
| **Notice officielle du bail jointe par Gerimmo** (Q46, Q77) | Le texte du recueil vient d'un site miroir : adresses coupées, tableaux à refaire. Le bailleur dépose lui-même la notice. | Gerimmo ne vérifie ni le fichier déposé ni sa version. La signature sur papier n'est pas bloquée. | Le PDF de l'arrêté, téléchargé sur Légifrance. |
| **Notice jointe au congé pour vendre** (arrêté du 13/12/2017 ; Q102) | Le texte du recueil est douteux (« 30 0000 € », adresses coupées). La lettre l'annonce ; le bailleur la joint lui-même. | Gerimmo ne vérifie pas qu'elle est jointe. | Le texte officiel, puis votre choix : case obligatoire ou dépôt par le bailleur. |
| **Diagnostic énergétique : « le plus récent par sa date décide »** (Q28 ; JURISTE 6·15) | Aucune page officielle lue ne le dit. La règle n'est pas changée ; un avertissement s'affiche. | Un diagnostic plus ancien, saisi après coup, peut décider. | Le texte, et l'avis d'un juriste. |
| **Remplacement de l'un des deux époux ou partenaires** (Q121 ; JURISTE 9·39) | Le recueil ne dit pas la forme. L'avenant est refusé ; le message renvoie à un professionnel. | Pas de solution dans Gerimmo pour ce cas. | La réponse du juriste. |
| **Lecture seule automatique et RGPD, article 22** (Q82 ; JURISTE 9·30) | La phrase « une personne peut réexaminer » a été retirée : elle vous engageait. | Un réexamen humain est peut-être dû. | L'avis d'un juriste, puis qui répond et sous quel délai. |
| **Plafond du dépôt en meublé** (articles 25-4 et 25-6 ; Q111) | Ces articles manquent au recueil. Le plafond de deux mois, déjà dans le code, est gardé. | Un plafond non relu. | Les textes, avec leur date de version. |
| **Rubriques du contrat type et cas non couverts** : rubriques « le cas échéant », détail des honoraires (Q110), bail nu à durée réduite (Q107, refusé), vente à un parent, zone tendue à la date du congé (lot T1) | Données que Gerimmo n'a pas, ou texte qui ne tranche pas (`notes-T1.md`, `notes-T2.md`). | Des clauses à écrire à la main ; certains cas refusés. | Votre décision, le texte, puis un lot par sujet. |
| **Information de la caution sous un mois** (Q112) | Le recueil (article 2303 du code civil) demande d'informer la caution dès le premier incident. Gerimmo l'informe plus tard, et cet envoi est fermé. | La caution n'est pas informée à temps. | Votre décision (par exemple avancer la relance), puis ouvrir l'envoi. |
| **Espace artisan et règlement européen 2019/1150** (Q85) | Écrire les raisons du classement serait les inventer. L'application du règlement n'est pas tranchée. | Une obligation de transparence peut-être non remplie. | L'avis d'un juriste, puis une nouvelle version des conditions de l'espace artisan. |

## 4. Non vérifiable sans la production ou un service réel

| Quoi | Pourquoi | Risque | Ce qu'il faudrait |
|---|---|---|---|
| **Paiement Stripe réel et en-tête des factures** (Q80, Q92) | Service payant, non configuré au banc : la souscription y est ignorée. L'en-tête se règle dans votre compte Stripe. Le portail « Gérer mon abonnement » n'est pas examiné. | Premier encaissement raté, ou facture mal libellée. | Régler l'en-tête. Puis un premier paiement réel, remboursé, avant d'ouvrir les souscriptions (conseil de l'audit du 19/11). |
| **Vrais e-mails** | Aucun e-mail réel n'est parti : le service d'envoi est simulé au banc. | Un e-mail refusé, classé en indésirables, ou parti vers l'adresse d'un compte de test quand vous ouvrirez les envois (plan, R5). | Un essai avec une vraie boîte, avec vos adresses « + » (parcours de vérification), avant d'ouvrir les cinq envois. |
| **Lecture réelle de la Page Facebook** | Jamais exercée : la lecture est simulée dans les tests. | Un article reste « en attente » si la Page est mal lue. | Relier la Page en production, puis lire l'écran Marketing. |
| **Lecture réelle de l'indice chez l'Insee** | Le site de l'Insee n'est pas joignable depuis le banc. Seule la réponse « l'Insee ne répond pas » a été vue. | La recherche échoue ; la saisie à la main reste possible. | Un essai en production avec un bail de test. |
| **Signature électronique de bout en bout (Zoho Sign)** | Service payant. Les états sont posés à la main dans les tests. | Un circuit réel qui échoue. | Un essai réel, avec votre accord (payant). |
| **Appel réel à l'IA** | Au banc, le verrou « mode pilote » bloque tout appel : le fournisseur est simulé. | Une réponse inattendue du service. | Un essai en production, IA activée (Q12). |
| **Recommandé électronique (AR24)** | Aucun compte relié ; la fonction est masquée. | Aucun, tant qu'elle reste masquée. | Un contrat AR24, puis relier la fonction (Q10). |
| **État réel de la production** : version servie, abonnés actifs, versions des conditions archivées, texte de la fonction d'accord aux conditions, circuits de signature prêts, migrations déjà appliquées | Règle de la mission : aucune requête vers la production pendant ce travail. Derniers relevés : version servie les 21 et 22/11 ; comptes, signatures et circuits le 24/11. Abonnés actifs, versions archivées et texte de la fonction : jamais lus pendant cette mission (`JOURNAL.md`, 25/11). | Une surprise le jour J. Le plan dit où s'arrêter. | Les six contrôles en lecture seule du plan (§ 2.2), avec votre accord. |
| **Réglages chez Vercel et GitHub** : mode commercial (valeur masquée), domaine attribué tout seul ou non, autorisation de publier, approbateur, protection de `main`, ancienne version gardée pour le retour | Non lisibles par l'agent, ou non relus depuis le 21/11. | Une fusion qui met le code en ligne avant les migrations, ou un retour arrière impossible. | Les relire vous-même (plan, P4). |
| **Comptages en production à faire en lecture seule** : congés acceptés un jour trop tard avant le lot T1 (Q105) ; comptes payants fermés à prévenir des dix ans (Q86) | Pas d'accès à la production. Une requête est prête pour Q105 (`notes-T1.md`). | Un client mal informé (SUPPOSÉ peu probable : la production n'a que des comptes de test). | Votre accord pour une lecture seule. |
| **Photo d'état des lieux sur un vrai téléphone ; vrai relevé de banque** | Le banc utilise une image fabriquée et des fichiers d'essai. | Un appareil ou un format d'export qui ne passe pas. | Un essai avec un vrai téléphone et un vrai relevé. |
| **Recette de production et retour arrière chez Vercel** | Jamais joués sur cette version. | Un écart découvert seulement le jour J. | Le jour J, selon le plan (étapes É11 à É13, et § 5 pour le retour). |

## 5. Contrôles techniques non faits (faisables sans toucher la production)

| Quoi | Pourquoi | Risque | Ce qu'il faudrait |
|---|---|---|---|
| **La CI de GitHub sur la version préparée** | verte sur `062296e2` sans aucune reprise (exécution n° 45591695035 : 16 620 tests, 355 parcours au premier essai, 75 parcours WebKit mobile, envois, vrai PostgREST et invitation artisan). | Un écart entre le banc et GitHub, vu le jour J. | La CI de la PR et celle de `main`, exigées par le plan (É2, É4). |
| **Les 52 migrations d'un seul bloc** | Joué au banc le 25/11 (essai « bloc ») : réussi, même schéma qu'une base migrée une par une. Jamais sur la vraie instance Supabase. | Un arrêt au milieu (la simulation du jour J l'attraperait). | Rien de plus avant le jour J (plan, P6 a). |
| **L'ancien code `81740dec` sur la base migrée** | Essayé au banc le 25/11 (essai « ancien ») : 282 parcours réussis. Un risque trouvé : la lettre de révision de loyer (A-01). Restent supposés : objets créés par le nouveau code puis lus par l'ancien, IA, e-mails, tâches planifiées (A-05). | Entre les migrations et la mise en ligne, ou après un retour du site seul, l'ancien code tourne sur la nouvelle base. | La consigne A-01 du plan (É8, § 5.3), et votre accord écrit sur les points supposés, ou l'essai ciblé (plan, P6 b). |
| **La chaîne complète des 52 retours arrière, et les retours à plusieurs instructions** | Jouée au banc le 25/11 (essai « retours ») : les 52 passent ; 11 laissaient leur version au registre, corrigé (RET-01, `140f4216`) et rejoué. La relecture de la fusion compte une trentaine de retours à plusieurs instructions, du 12/11 au 25/11 ; parmi les 52 du lot, 7 ont plusieurs instructions de fond (plan, § 5.4). Ils n'ont pas été relus un par un (seuls les deux de la chaîne T3 ont été corrigés) ; leur effet en cas d'erreur au milieu n'est pas essayé. Jamais joués en production. | Un retour qui s'applique à moitié. | La relecture de ces retours (plan, § 5.4). |
| **Les nouveaux avertissements regardés à la main** (téléphone 390 px et ordinateur 1 440 px) | Seuls des tests et des parcours les vérifient. Des captures restent à prendre (`notes-majeurs.md`). | Un texte mal placé sur téléphone. | Les regarder à la main, aux deux tailles. |

## 6. Fonctions sans test, ou sans parcours navigateur

| Quoi | Pourquoi | Risque | Ce qu'il faudrait |
|---|---|---|---|
| **« 75 actions jamais déclenchées par un parcours ni citées par un test »** | Ce relevé figure dans la liste de suivi de la mission (phase 3), encore à faire : classer palier 1 ou palier 2, puis essayer chaque bouton du palier 1. Les notes du banc lues n'en parlent pas et ne donnent pas la liste. Je ne peux donc pas dire lesquelles. | Un bouton cassé que rien ne détecte. | Refaire le relevé (actions × tests et parcours), le classer, puis écrire un test ou un parcours pour chaque action du palier 1. |
| **Parcours « première location continue » et « pilote »** (inscription, bien, bail, activation) | Exclus de la suite générale (passe dédiée). Non lancés les 24 et 25/11. | Un champ de plus demandé, ou un blocage dans l'enchaînement. | Les lancer dans leur passe dédiée. |
| **« Corriger » un bail puis le déposer signé de nouveau ; relance « non confirmée »** | Couverts par des tests seulement, sans parcours navigateur. | Un écran qui ne suit pas la base. | Un parcours navigateur pour chacun. |
| **Décompte des retenues** (Q49) | Il n'a pas de parcours navigateur à lui. | Un blocage d'écran non vu. | Un parcours dédié. |
| **Résiliation et rétractation de l'abonnement ; export complet d'un espace** | Aucun parcours navigateur (relevé du 22/11 : `AUDIT.md` pour l'export complet, son annexe `audit-palier-1/a1-modules-bailleur.md` pour la résiliation et la rétractation ; non recontrôlé depuis). | Un geste client rare, cassé sans qu'on le voie. | Un parcours pour chacun. |

## 7. Palier 2 (agences) : non commencé

| Quoi | Pourquoi | Risque | Ce qu'il faudrait |
|---|---|---|---|
| **Tout ce qui ne concerne que les agences** : seuil de délégation du mandat ; invitation d'un artisan par une agence ; domicile du bailleur sur les documents et l'état des lieux ; second facteur obligatoire pour les administrateurs d'agence ; relance à la main (Q95) ; activité du mandataire (Q108) ; honoraires (Q110) | Le palier 1 se limite au propriétaire, au locataire, à l'artisan et au super admin (`AUDIT.md`, « Hors plan »). Le code des agences existe mais n'a pas été revu. Les documents d'agence ne sont vérifiés que par des tests, sans dossier fictif d'agence (JOURNAL, lot 36). | Une agence qui utiliserait Gerimmo rencontrerait des écrans non revus. SUPPOSÉ faible aujourd'hui : une liste d'attente des agences existe (`liste_attente_agences`, à ne jamais toucher, Q36). | Une mission « palier 2 » à part, avec son propre audit, son plan et ses vérifications. |

## 8. À faire avant la publication (fait le 25/11 : voir `PLAN-DE-PUBLICATION.md`, « Résultat de la publication »)

| Quoi | Pourquoi | Risque | Ce qu'il faudrait |
|---|---|---|---|
| **Nouvelle clé des sauvegardes et sauvegarde relue** (Q9) | Votre réponse du 24/11 (nuit) : « q9 pas encore ». Une sauvegarde neuve et relisible doit exister avant la publication (`DECISIONS-2026-11-24.md`). | Sans copie de la clé hors de GitHub, aucune sauvegarde ne se restaure hors de GitHub. Remplacer la clé rend les anciennes copies illisibles (SUPPOSÉ) : ce geste ne se défait pas. | Plan, P1 puis P2, le même jour. |
| **Qui joue les retours de la base** | Non décidé. Le mot de passe de la base n'est que dans un secret GitHub, illisible. | Le niveau 2 du retour arrière ne se joue pas vite. | Votre décision (plan, P3). Bloquant. |
| **Ancien code `81740dec` sur la base migrée** | Essayé au banc (voir § 5) ; des points restent supposés. Le plan vous fait cocher « base compatible » (É10). | Vous déclareriez une chose prouvée seulement en partie. | Votre accord écrit sur ces points (plan, P6 b), ou l'essai ciblé. |
| **Restauration complète vers un projet Supabase de secours** | Jamais éprouvée : bascule, tâches planifiées, délai de quatre heures (plan, § 5.5). | En cas de perte grave, la durée de remise en service est inconnue. | Un exercice à part, avec votre accord. |

---

## Sources lues

`livrables/notes-banc/` (dont `PLAN-PUBLICATION-NOTES.md`, `PETITES-REPRISES.md`, `LOTS-TEXTES.md`, `notes-T1.md` à `notes-T3.md`, `notes-majeurs.md`), `livrables/notes-banc/fusion/` (`PLAN-PUBLICATION-NOTES.md`, `fusion-notes.md`, `corrections-fusion-notes.md`), `livrables/PLAN-DE-PUBLICATION.md`, `livrables/PARCOURS-15-MINUTES.md`, `GUIDE-DE-REPRISE.md`, `JOURNAL.md`, `QUESTIONS.md`, `JURISTE.md` (en-tête, partie 9), `DECISIONS-2026-11-24.md`, `AUDIT.md` (plan, « Hors plan », errata). Code de `89cb87ff` en lecture seule (`git show`, `git diff`, `git merge-base`) ; `livrables/notes-banc/essais/` et `passe2/` ; écarts jusqu'à `ee28d874` (`git diff`). Aucune requête vers la production.
