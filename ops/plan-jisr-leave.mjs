import { readFileSync, writeFileSync } from 'node:fs';

const [snapshotFile, rowsFile, mappingFile, output, companyId, date] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw Error('Provide the effective ISO date');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const snapshot = read(snapshotFile);
const workspace = snapshot.partners.find(partner => partner.id === companyId)?.workspace;
if (!workspace) throw Error('Company not found');
const mapping = read(mappingFile);
const staff = new Map(workspace.staff.map(person => [person.id, person]));
const seen = new Set();
const archived = new Map();
for (const person of staff.values()) {
  for (const item of person.historicalLeave ?? []) {
    if (archived.has(item.id)) throw Error('Duplicate existing archive record');
    archived.set(item.id, { person, item });
  }
}
const counts = { added: 0, existing: 0, overlaps: 0, unmatched: 0 };
for (const row of read(rowsFile)) {
  const account = row.id.match(/^((?:1|wwse)\.jisr\.net):\d+$/)?.[1];
  if (!account || seen.has(row.id)) throw Error('Invalid or duplicate source identifier');
  seen.add(row.id);
  const target = mapping[account]?.[row.employeeNumber];
  if (!target) {
    counts.unmatched++;
    continue;
  }
  const person = staff.get(target.staffId);
  if (!person || person.status === 'Removed' || person.branchId !== target.branchId)
    throw Error('Staff mapping is stale');
  if (![row.date, row.end].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value)) ||
      row.date > row.end || row.end >= date || !Number.isFinite(row.days) || row.days < 0 ||
      typeof row.type !== 'string' || !row.type.trim()) throw Error('Invalid archived leave');
  const item = { id: row.id, source: 'jisr', type: row.type, date: row.date, end: row.end, days: row.days };
  const existing = archived.get(item.id);
  if (existing) {
    if (existing.person !== person || Object.keys(item).some(key => item[key] !== existing.item[key]))
      throw Error('Existing archive conflicts with source');
    counts.existing++;
    continue;
  }
  if (workspace.requests.some(request => request.staffId === person.id && request.status === 'Approved' &&
      request.date <= item.end && (request.end ?? request.date) >= item.date)) {
    counts.overlaps++;
    continue;
  }
  (person.historicalLeave ??= []).push(item);
  archived.set(item.id, { person, item });
  counts.added++;
}
writeFileSync(output, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
process.stdout.write(JSON.stringify(counts) + '\n');
