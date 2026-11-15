export const defaultPeriodIds = person => person.periodIds ?? (person.periodId ? [person.periodId] : []);

export function effectivePeriodIds(workspace, person, day) {
  const overrides = (workspace.workAssignments ?? []).filter(entry => entry.staffId === person.id && entry.date === day);
  if (overrides.length) return overrides.map(entry => entry.periodId).filter(Boolean);
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
  return (!person.joinDate || day >= person.joinDate) && workspace.workSchedule?.days?.includes(weekday)
    ? defaultPeriodIds(person) : [];
}
