import { randomBytes, scryptSync } from 'node:crypto';
export function updatedCompanyCredentials(account, password, confirmation) {
  if (password === undefined || password === '') return account;
  if (!account?.passwordHash) throw new Error('Activate the company account before resetting its password.');
  if (typeof password !== 'string' || password.length < 10 || password.length > 128 ||
      !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[\p{P}\p{S}]/u.test(password))
    throw new Error('Use 10–128 characters with uppercase, lowercase, a number and a symbol.');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  const salt = randomBytes(32).toString('hex');
  const updated = { ...account, salt, passwordHash: scryptSync(password, salt, 64).toString('hex') };
  for (const key of ['sessionHash', 'sessionExpires', 'activationHash', 'activationExpires']) delete updated[key];
  return updated;
}
