import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { updatedCompanyCredentials } from '../company-credentials.mjs';
test('blank password leaves existing company login untouched', () => {
 const old={salt:'old',passwordHash:'existing',sessionHash:'session'};
 assert.equal(updatedCompanyCredentials(old,''),old);
});
test('new password uses salted hash, invalidates old sessions and never stores plaintext', () => {
 const old={salt:'old',passwordHash:'existing',sessionHash:'session',sessionExpires:999,activationHash:'token'};
 const password='Example!123'; const updated=updatedCompanyCredentials(old,password,password);
 assert.equal(updated.passwordHash,scryptSync(password,updated.salt,64).toString('hex'));
 assert.equal(updated.sessionHash,undefined); assert.equal(updated.activationHash,undefined);
 assert.ok(!JSON.stringify(updated).includes(password)); assert.equal(old.sessionHash,'session');
});
test('rejects weak, mismatched and unactivated account resets', () => {
 assert.throws(()=>updatedCompanyCredentials({passwordHash:'old'},'weak','weak'));
 assert.throws(()=>updatedCompanyCredentials({passwordHash:'old'},'Example!123','different'));
 assert.throws(()=>updatedCompanyCredentials({},'Example!123','Example!123'));
});
