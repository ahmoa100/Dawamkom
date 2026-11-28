const origin = process.env.EXPO_PUBLIC_DAWAMKOM_ORIGIN || 'https://www.dawamkom.net';

export async function request(path, data) {
  const response = await fetch(new URL(path, origin).href, {
    method: data === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: data === undefined ? undefined : {'Content-Type': 'application/json'},
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  return {...result, ok: response.ok, status: response.status};
}

export async function employeeWorkspaces(email) {
  const result = await request('/api/workspace-lookup', {email});
  if (!result.ok) throw new Error(result.error || 'تعذّر العثور على المنشأة.');
  return (result.matches ?? []).flatMap(item => {
    const path = typeof item.url === 'string' && item.url.match(/^(\/company\/[a-f0-9-]{36})\/employee$/i);
    return item.role === 'employee' && path ? [{name: item.name, prefix: path[1]}] : [];
  });
}

export const employeeRequest = (workspace, action, data) => request(workspace.prefix + '/api/employee/' + action, data);
