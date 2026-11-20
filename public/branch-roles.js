export const roleIsAdministrator=(workspace,role)=>typeof workspace?.rolePermissions?.[role]?.administrator==='boolean'?workspace.rolePermissions[role].administrator:['Manager','HR manager'].includes(role);
export const isAdministrator=(person,workspace)=>Boolean(person&&roleIsAdministrator(workspace,person.role));

export function roleBranches(person, role = person.role) {
  const explicit = person.roleBranchIds?.[role];
  return Array.isArray(explicit) ? explicit : person.branchId ? [person.branchId] : [];
}

export function managesBranch(person, branchId) {
  return Boolean(branchId && roleBranches(person).includes(branchId));
}

export function assignBranchRole(workspace, role, assignments) {
  const people = workspace.staff.filter(person => person.status !== 'Removed');
  const branches = new Set(workspace.locations.map(branch => branch.id));
  if (!Array.isArray(assignments) || assignments.some(item => !branches.has(item.branchId) ||
    !Array.isArray(item.staffIds) || item.staffIds.some(id => !people.some(person => person.id === id &&
      (isAdministrator(person,workspace) || person.branchId === item.branchId))))) {
    throw new Error('Choose valid employees and branches.');
  }
  if (new Set(assignments.map(item => item.branchId)).size !== assignments.length) throw new Error('Choose valid employees and branches.');
  for (const person of people) {
    const selected = assignments.filter(item => item.staffIds.includes(person.id)).map(item => item.branchId);
    const previous = roleBranches(person, role).filter(id => !assignments.some(item => item.branchId === id));
    if (selected.length || (person.role === role && roleBranches(person, role).some(id => assignments.some(item => item.branchId === id)))) {
      person.roleBranchIds = { ...person.roleBranchIds, [role]: [...new Set([...previous, ...selected])] };
      if (selected.length) person.role = role;
      else if (!person.roleBranchIds[role].length && role !== 'Employee') person.role = workspace.staffRoles.includes('Employee') ? 'Employee' : null;
    }
  }
}
