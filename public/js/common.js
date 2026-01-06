const api = {
  async fetchJSON(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...options
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Request failed');
    }
    return res.json();
  },

  async currentUser() {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    const body = await res.json();
    return body.user;
  },

  async logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
};

window.api = api;

window.initHeader = async ({ requireRole = null } = {}) => {
  const user = await api.currentUser();
  if (!user) {
    window.location.href = '/login';
    return null;
  }
  if (requireRole && user.role !== requireRole) {
    window.location.href = user.role === 'admin' ? '/dashboard' : '/user';
    return null;
  }

  const avatarEl = document.querySelector('.avatar');
  const nameEl = document.getElementById('admin-info-name');
  const roleEl = document.getElementById('admin-info-role');
  const userMenu = document.getElementById('user-menu');
  const userMenuToggle = document.getElementById('user-menu-toggle');
  const logoutMenu = document.getElementById('logout-menu');

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.role;

  // Update system status footer info
  const refreshEl = document.getElementById('last-refresh');
  const uptimeEl = document.getElementById('api-uptime');
  const healthEl = document.getElementById('health-status');
  const now = new Date().toLocaleString();
  if (refreshEl) refreshEl.textContent = now;
  if (uptimeEl) uptimeEl.textContent = '99.9%';
  if (healthEl) healthEl.textContent = 'Green';

  // Ensure menu starts closed
  userMenu?.setAttribute('hidden', '');
  userMenuToggle?.setAttribute('aria-expanded', 'false');

  const closeMenu = () => {
    userMenu?.setAttribute('hidden', '');
    userMenuToggle?.setAttribute('aria-expanded', 'false');
  };

  logoutMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    api.logout();
  });

  userMenuToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = userMenu?.hasAttribute('hidden');
    if (isHidden) {
      userMenu?.removeAttribute('hidden');
      userMenuToggle?.setAttribute('aria-expanded', 'true');
    } else {
      closeMenu();
    }
  });

  const menuItems = userMenu ? Array.from(userMenu.querySelectorAll('a, button')) : [];
  menuItems.forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
    });
  });

  document.addEventListener('click', (e) => {
    if (!userMenu || !userMenuToggle) return;
    if (userMenu.contains(e.target) || userMenuToggle.contains(e.target)) return;
    closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
    }
  });

  return user;
};
