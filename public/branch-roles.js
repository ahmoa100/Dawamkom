export const roleIsAdministrator=(workspace,role)=>typeof workspace?.rolePermissions?.[role]?.administrator==='boolean'?workspace.rolePermissions[role].administrator:['Manager','HR manager'].includes(role);
export const isAdministrator=(person,workspace)=>Boolean(person&&roleIsAdministrator(workspace,person.role));

export function roleBranches(person, role = person.role) {
  const explicit = person.roleBranchIds?.[role];
  return Array.isArray(explicit) ? explicit : person.branchId ? [person.branchId] : [];
}

export function managesBranch(person, branchId) {
  return Boolean(branchId && roleBranches(person).includes(branchId));
}
export const eligibleDirectManager=(workspace,person,branchId,employeeId)=>Boolean(person&&person.id!==employeeId&&
 person.status==='Active'&&isAdministrator(person,workspace)&&managesBranch(person,branchId));

export function updateBranchAdministrators(workspace,body){
  const branch=workspace.locations.find(item=>item.id===body.id),name=typeof body.name==='string'?body.name.trim():'';
  const admins=workspace.staff.filter(person=>person.status==='Active'&&isAdministrator(person,workspace));
  const current=admins.filter(person=>managesBranch(person,body.id)).map(person=>person.id).sort();
  if(!branch||!name||name.length>120||!Array.isArray(body.administratorIds)||new Set(body.administratorIds).size!==body.administratorIds.length||body.administratorIds.some(id=>!admins.some(p=>p.id===id)))throw Error('Choose valid branch administrators and a branch name.');
  if(body.expectedName!==branch.name||!Array.isArray(body.expectedAdministratorIds)||JSON.stringify([...body.expectedAdministratorIds].sort())!==JSON.stringify(current))throw Error('Branch settings changed. Reload and try again.');
  const selected=new Set(body.administratorIds);
  for(const person of admins){
    if(managesBranch(person,branch.id)===selected.has(person.id))continue;
    const branches=roleBranches(person).filter(id=>id!==branch.id);
    if(selected.has(person.id))branches.push(branch.id);
    person.roleBranchIds={...person.roleBranchIds,[person.role]:branches};
  }
  if(branch.name!==name||JSON.stringify(current)!==JSON.stringify([...selected].sort()))branch.administratorHistory=[...(branch.administratorHistory??[]).slice(-99),{at:new Date().toISOString(),by:'account-owner',from:{name:branch.name,administratorIds:current},to:{name,administratorIds:[...selected].sort()}}];
  branch.name=name;
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
