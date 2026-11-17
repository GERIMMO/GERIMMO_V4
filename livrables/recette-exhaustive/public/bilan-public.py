from collections import Counter
from pathlib import Path
import json
base=Path(__file__).resolve().parent
d=base/'preuves'
def get(p):return json.loads(p.read_text())
lignes=[]
for w in (390,768,1440):
    premier=get(d/f'public-{w}.json')
    visuel=get(d/f'public-{w}-visuel.json')
    rejeu=d/f'public-{w}-liens-rejoues.json'
    commandes={r['id']:r for r in premier['controles']}
    if rejeu.exists():
        for r in get(rejeu)['controles']:commandes[r['id']]=r
    statuts=Counter(r['statut'] for r in commandes.values())
    liens=[r for r in commandes.values() if r['balise']=='a']
    rendu=get(d/f'rendu-{w}.json')
    lignes.append({'largeur':w,'routesObservees':len({r['route'] for r in rendu if r['statut']=='rendu'}),'boutonsLiensChampsReperes':len(commandes),'statutsNavigationEtVolets':dict(statuts),'liensCliquesDestinationVerifiee':sum(r['statut']=='réussi' for r in liens),'liensExternesHorsBanc':sum(r['href'].startswith(('https:', 'mailto:')) and r['statut']=='bloqué' for r in liens),'liensARetester':sum(r['statut']=='échec' or (r['statut']=='bloqué' and not r['href'].startswith(('https:', 'mailto:'))) for r in liens),'debordements':sum(r.get('debordement',0)>0 for r in rendu),'controlesAccessibiliteAutomatiques':len([a for a in visuel['accessibilite'] if 'violations' in a]),'violationsSignalees':sum(len(a.get('violations',[])) for a in visuel['accessibilite']),'gestesSpecifiquesOutils':dict(Counter(x['statut'] for x in get(d/f'commandes-{w}.json')))})
doc={'referenceBanc':'9e347fa243f87fe3a43bdb88ba9db4fd7e9993c9','publicVisuel':'25 modèles publics et un chemin inconnu. Les liens de création et récupération ouverts depuis la boîte fictive et les invitations sont instruits dans des parcours supplémentaires.','essais':lignes,'inscription':all(e['etat']=='réussi' for e in get(d/'inscription-canonique.json')),'invitations':all(get(d/f'invitation-{w}.json')['statut']=='réussi' for w in (390,768,1440)), 'impressions':dict(Counter(x['statut'] for x in get(d/'impression/relecture.json'))),'mesure':'Une observation DOM compte un contrôle avec sa position et son état. Les mêmes contrôles sont répétés aux différentes largeurs. Les totaux d’actions d’outils, gestes contractuels et navigation ne s’additionnent pas.'}
(d/'bilan-public.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
