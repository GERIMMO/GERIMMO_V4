import {describe,expect,it} from 'vitest';
import {texteMentionCaution,mentionCautionConforme,expressionMentionCaution} from '@/lib/mention-caution';
const mention=texteMentionCaution({caution:'Robin Test',locataires:'Alex Test',plafond:'mille euros (1 000,00 €)',solidaire:true});
describe('mention personnelle de la caution',()=>{
 it.each(['ok','OK','lu et approuvé','','Je suis d’accord',undefined,null])('refuse %s',v=>expect(mentionCautionConforme(mention,v)).toBe(false));
 it('admet uniquement une reprise complète, avec les variantes typographiques mobiles',()=>{
  expect(mentionCautionConforme(mention,mention)).toBe(true);
  expect(mentionCautionConforme(mention,'\n'+mention.replaceAll("'",'’').replaceAll(' ', '\n').replaceAll('—','-')+'\n')).toBe(true);
 });
 it.each([
  mention.replace('mille euros','deux mille euros'),mention.replace('1 000','2 000'),
  mention.replace('Robin','Autre'),mention.replace('Alex','Autre'),
  mention.split(' Je reconnais')[0],mention.replace("m'engage","ne m'engage pas"),
  mention+' Je ne reconnais pas cet engagement.',
 ])('refuse une mention modifiée ou tronquée',v=>expect(mentionCautionConforme(mention,v)).toBe(false));
 it('ne reprend pas une ancienne mention inconnue',()=>expect(mentionCautionConforme(undefined,'ok')).toBe(false));
 it('échappe les caractères spéciaux des noms et des montants',()=>{
  const v=texteMentionCaution({caution:'Test (A+B)',locataires:'Test [C]',plafond:'mille euros (1 000,00 €)',solidaire:false});
  expect(new RegExp(expressionMentionCaution(v)).test(v)).toBe(true);
  expect(v).not.toContain('Je reconnais ne pouvoir');
 });
});
