const form = document.querySelector('#company-auth');
const status = form.querySelector('[role="status"]');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const body = Object.fromEntries(new FormData(form));
  body.token = new URLSearchParams(location.hash.slice(1)).get('activate');
  try {
    const response = await fetch(location.pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    location.replace(result.url);
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
