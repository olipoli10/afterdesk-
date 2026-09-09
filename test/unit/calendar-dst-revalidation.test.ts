import {describe,it,expect} from 'vitest';
import {interpretConstructionMessage} from '@/lib/construction-assistant-v1/interpreter';
import type {InterpreterContext} from '@/lib/construction-assistant-v1/contracts';
const context: InterpreterContext={referenceNow:'2026-10-30T16:00:00.000Z',timezone:'America/Toronto',locale:'fr-CA',projects:[{id:'synthetic-project',code:'LAVAL-001',name:'Laval'}],contacts:[{id:'synthetic-marc',displayName:'Marc',preferredLanguage:'fr'}]};
describe('Quebec appointment DST disambiguation',()=>{
 it('refuses the duplicate fall wall time without choosing one of the two offsets',()=>{
  const result=interpretConstructionMessage('Rendez-vous avec Marc dimanche à 1 h 30 pour Laval.',context);
  expect(result.intent).toBe('CLARIFICATION_REQUIRED');expect(result.startsAtUtc).toBeNull();expect(result.clarification?.question).toContain('deux fois');
 });
 it('retains a unique post-transition appointment',()=>{
  const result=interpretConstructionMessage('Rendez-vous avec Marc dimanche à 3 h 30 pour Laval.',context);
  expect(result.startsAtUtc).toBe('2026-11-01T08:30:00.000Z');
 });
});
