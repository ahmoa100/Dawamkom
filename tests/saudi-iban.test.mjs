import { test } from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIban, validSaudiIban, ibanBank} from '../public/saudi-iban.js';

test('Saudi IBAN validation accepts formatted values and detects altered check digits', () => {
  const sample='SA03 8000 0000 6080 1016 7519';
  assert.equal(validSaudiIban(sample),true);
  assert.equal(normalizeIban(sample.toLowerCase()),'SA0380000000608010167519');
  assert.equal(ibanBank(sample),'مصرف الراجحي');
  assert.equal(ibanBank(sample,'en'),'Al Rajhi Bank');
  assert.equal(validSaudiIban(sample.replace('SA03','SA04')),false);
  assert.equal(validSaudiIban('SA038000'),false);
  assert.equal(validSaudiIban('GB0380000000608010167519'),false);
  assert.equal(validSaudiIban(''),false);
  assert.equal(ibanBank('SA'),'');
});

test('Saudi IBAN supports Arabic numerals and does not guess an unknown bank', () => {
  assert.equal(normalizeIban('sa٠٣ ٨٠٠٠'),'SA038000');
  assert.equal(ibanBank('SA0399000000608010167519'),'');
  assert.equal(ibanBank('SA0310000000608010167519','en'),'Saudi National Bank');
  assert.equal(ibanBank('SA0360000000608010167519','en'),'Bank AlJazira');
});
