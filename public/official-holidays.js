export const officialHolidays = {
  adha: 'Eid al-Adha', fitr: 'Eid al-Fitr', foundation: 'Founding Day', national: 'National Day',
};
export function holidaySettings(workspace, branchId) {
  return Object.fromEntries(Object.keys(officialHolidays).map(id => [id, {
    enabled: false, days: null, ...workspace.officialHolidaySettings?.[id],
    ...(branchId ? workspace.branchOfficialHolidaySettings?.[branchId]?.[id] : {}),
  }]));
}
