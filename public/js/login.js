const form = document.getElementById('login-form');
const errorEl = document.getElementById('error');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const { user } = await api.fetchJSON('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (user.role === 'admin') {
      window.location.href = '/dashboard';
    } else {
      window.location.href = '/user';
    }
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

(async () => {
  const user = await api.currentUser();
  if (user) {
    window.location.href = user.role === 'admin' ? '/dashboard' : '/user';
  }
})();
