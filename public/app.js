const app = document.getElementById('app');
const state = { page: currentRoute(), toastTimer: null };

function currentRoute() {
  const hash = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  return hash.startsWith('/') ? hash : `/${hash}`;
}

function money(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
}

function dateText(value) {
  if (!value) return '';
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('en-IN', { day:'numeric', month:'short', year:'numeric' }).format(d);
}

function today() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function initials(name) {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0,2).map(s => s[0]).join('').toUpperCase() || '?';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[c]));
}

function navLinks() {
  return `
    <a href="#/" class="${state.page === '/' ? 'active' : ''}">Overview</a>
    <a href="#/customers" class="${state.page.startsWith('/customers') ? 'active' : ''}">Customers</a>
    <a href="#/entry" class="${state.page === '/entry' ? 'active' : ''}">Add entry</a>`;
}

function shell(content) {
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <a class="brand" href="#/">
          <span class="brand-mark">▣</span>
          <span><span class="brand-title">Khata</span><span class="brand-sub">CUSTOMER DUES TRACKER</span></span>
        </a>
        <p class="nav-label">Workspace</p>
        <nav class="nav">${navLinks()}</nav>
        <div class="sidebar-note"><strong>Keep it simple</strong><br><span>Record every bill and payment in one place.</span></div>
      </aside>
      <header class="mobile-header">
        <a class="mobile-brand" href="#/">Khata</a>
        <div class="mobile-menu">${navLinks()}</div>
      </header>
      <main class="main">${content}</main>
      <nav class="bottom-nav">${navLinks()}</nav>
    </div>`;
}

function pageHead(eyebrow, title, action = '') {
  return `<div class="page-head"><div>${eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ''}<h1>${escapeHtml(title)}</h1></div>${action}</div>`;
}

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.error || 'Something went wrong.');
  return body;
}

function showToast(message) {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.appendChild(node);
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => node.remove(), 2600);
}

function customerRow(customer) {
  const balanceClass = customer.balance > 0 ? 'collect' : customer.balance < 0 ? 'advance' : 'settled';
  const note = customer.balance > 0 ? 'to collect' : customer.balance < 0 ? 'advance held' : 'settled';
  return `<a class="customer-row" href="#/customers/${customer.id}">
    <span class="avatar">${escapeHtml(initials(customer.name))}</span>
    <span class="customer-main"><span class="customer-name">${escapeHtml(customer.name)}</span><span class="customer-meta">${escapeHtml(customer.phone || 'No phone added')}</span></span>
    <span class="balance ${balanceClass}">${money(Math.abs(customer.balance))}<span class="balance-note">${note}</span></span>
    <span class="chevron">›</span>
  </a>`;
}

function activityRow(t) {
  const bill = t.type === 'BILL';
  return `<div class="activity">
    <span class="activity-icon ${bill ? 'bill' : 'payment'}">${bill ? '↗' : '↙'}</span>
    <span class="activity-main"><span class="activity-title">${bill ? 'Bill for' : 'Payment from'} ${escapeHtml(t.customerName)}</span><span class="activity-meta">${dateText(t.date)}${t.billNumber ? ` · Bill ${escapeHtml(t.billNumber)}` : ''}</span></span>
    <span class="activity-amount ${bill ? 'bill' : 'payment'}">${bill ? '+' : '−'}${money(t.amount)}</span>
  </div>`;
}

async function renderDashboard() {
  shell(`<div id="page">${pageHead('Overview', 'Your ledger, at a glance', `<a class="btn btn-primary" href="#/entry">＋ Add entry</a>`)}<div class="muted">Loading...</div></div>`);
  try {
    const [dash, customers] = await Promise.all([api('/api/dashboard'), api('/api/customers?sort=highest_due')]);
    document.getElementById('page').innerHTML = `
      ${pageHead('Good morning', 'Your ledger, at a glance', `<a class="btn btn-primary" href="#/entry">＋ Add entry</a>`)}
      <section class="grid summary-grid">
        <div class="card summary-card summary-main"><div class="muted">Total outstanding</div><div class="money-large">${money(dash.totalOutstanding)}</div><div class="muted">${dash.customerCount} ${dash.customerCount === 1 ? 'customer' : 'customers'} on record</div><a class="btn btn-plain" href="#/customers" style="color:#f4ca9b">View customer book →</a></div>
        <div class="card summary-card"><div class="summary-icon">♙</div><p class="muted">Customers on record</p><div style="font-size:32px;font-weight:800;margin-top:6px">${dash.customerCount}</div></div>
        <div class="card summary-card"><div class="summary-icon" style="background:#e3eee8;color:#26706b">♥</div><p class="muted">Recent entries</p><div style="font-size:32px;font-weight:800;margin-top:6px">${dash.recentTransactions.length}</div><div class="small muted" style="margin-top:6px">Latest bills and payments</div></div>
      </section>
      <section class="section grid" style="grid-template-columns:minmax(0,1.5fr) minmax(280px,.8fr)">
        <div>
          <div class="section-head"><div><h2>Who owes what</h2><div class="small muted" style="margin-top:5px">Every customer balance in one place.</div></div><a class="btn btn-plain" href="#/customers">Manage customers</a></div>
          <div class="controls"><input class="input" id="dashboard-search" placeholder="Search customers" /><select class="select" id="dashboard-sort" style="max-width:190px"><option value="highest_due">Highest due first</option><option value="recently_updated">Recently updated</option><option value="name">Name A–Z</option></select></div>
          <div class="card customer-list" id="dashboard-customers">${customers.length ? customers.map(customerRow).join('') : '<div class="empty">No customers yet. Add your first customer.</div>'}</div>
        </div>
        <div><div class="section-head"><div><h2>Recent activity</h2><div class="small muted" style="margin-top:5px">The latest marks in your book.</div></div></div><div class="card recent">${dash.recentTransactions.length ? dash.recentTransactions.map(activityRow).join('') : '<div class="empty">No entries yet.</div>'}</div></div>
      </section>`;
    const search = document.getElementById('dashboard-search');
    const sort = document.getElementById('dashboard-sort');
    async function refreshCustomers() {
      const rows = await api(`/api/customers?search=${encodeURIComponent(search.value)}&sort=${sort.value}`);
      document.getElementById('dashboard-customers').innerHTML = rows.length ? rows.map(customerRow).join('') : '<div class="empty">No customer found.</div>';
    }
    search.addEventListener('input', refreshCustomers);
    sort.addEventListener('change', refreshCustomers);
  } catch (error) {
    document.getElementById('page').innerHTML += `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

async function renderCustomers() {
  shell(`<div id="page">${pageHead('Customers', 'Customer book', `<a class="btn btn-primary" href="#/customers/new">＋ Add customer</a>`)}<div class="muted">Loading...</div></div>`);
  const page = document.getElementById('page');
  try {
    page.innerHTML = `${pageHead('Customers', 'Customer book', `<a class="btn btn-primary" href="#/customers/new">＋ Add customer</a>`)}
      <div class="controls"><input class="input" id="customer-search" placeholder="Search by name or phone" /><select class="select" id="customer-sort" style="max-width:200px"><option value="highest_due">Highest due first</option><option value="recently_updated">Recently updated</option><option value="name">Name A–Z</option></select></div><div id="customer-list" class="card customer-list"></div>`;
    const search = document.getElementById('customer-search');
    const sort = document.getElementById('customer-sort');
    async function refresh() {
      const customers = await api(`/api/customers?search=${encodeURIComponent(search.value)}&sort=${sort.value}`);
      document.getElementById('customer-list').innerHTML = customers.length ? customers.map(customerRow).join('') : '<div class="empty">No customers found.</div>';
    }
    search.addEventListener('input', refresh);
    sort.addEventListener('change', refresh);
    await refresh();
  } catch (error) { page.innerHTML += `<div class="error">${escapeHtml(error.message)}</div>`; }
}

function customerForm(existing = null) {
  shell(`<div id="page">${pageHead('Customer', existing ? 'Edit customer' : 'Add customer')}<form class="card form-card" id="customer-form">
    <div class="form-grid">
      <div class="field full"><label for="name">Customer name *</label><input class="input" id="name" required value="${escapeHtml(existing?.name || '')}" placeholder="e.g. Amit Traders" /></div>
      <div class="field full"><label for="phone">Phone</label><input class="input" id="phone" value="${escapeHtml(existing?.phone || '')}" placeholder="e.g. 9876543210" /></div>
      <div class="actions full"><button class="btn btn-primary" type="submit">${existing ? 'Save changes' : 'Add customer'}</button><a class="btn btn-secondary" href="#/customers">Cancel</a></div>
    </div>
  </form></div>`);
  document.getElementById('customer-form').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = { name: document.getElementById('name').value, phone: document.getElementById('phone').value };
    try {
      if (existing) { await api(`/api/customers/${existing.id}`, { method:'PATCH', body:JSON.stringify(payload) }); showToast('Customer updated.'); location.hash = `#/customers/${existing.id}`; }
      else { const created = await api('/api/customers', { method:'POST', body:JSON.stringify(payload) }); showToast('Customer added.'); location.hash = `#/customers/${created.id}`; }
    } catch (error) { showToast(error.message); }
  });
}

function entryForm(prefillCustomer = '') {
  shell(`<div id="page">${pageHead('Ledger entry', 'Add bill or payment')}<form class="card form-card" id="entry-form">
    <div class="form-grid">
      <div class="field full"><label>Customer *</label><select class="select" id="customer"></select></div>
      <div class="field"><label>Entry type *</label><select class="select" id="type"><option value="BILL">Bill / Sale</option><option value="PAYMENT">Payment received</option></select></div>
      <div class="field"><label>Amount (₹) *</label><input class="input" id="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" /></div>
      <div class="field"><label>Date *</label><input class="input" id="date" type="date" value="${today()}" required /></div>
      <div class="field"><label>Bill number</label><input class="input" id="billNumber" placeholder="Required for bills" /></div>
      <div class="field full"><label>Note</label><textarea class="textarea" id="note" placeholder="Optional note"></textarea></div>
      <div class="actions full"><button class="btn btn-primary" type="submit">Save entry</button><a class="btn btn-secondary" href="#/">Cancel</a></div>
    </div>
  </form></div>`);
  const customerSelect = document.getElementById('customer');
  const type = document.getElementById('type');
  const billNumber = document.getElementById('billNumber');
  api('/api/customers?sort=name').then(customers => {
    customerSelect.innerHTML = customers.length ? customers.map(c => `<option value="${c.id}" ${c.id === prefillCustomer ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('') : '<option value="">No customers yet</option>';
  }).catch(err => showToast(err.message));
  function toggleBill() { billNumber.disabled = type.value !== 'BILL'; if (type.value !== 'BILL') billNumber.value = ''; }
  type.addEventListener('change', toggleBill); toggleBill();
  document.getElementById('entry-form').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = { customerId: customerSelect.value, type: type.value, amount: document.getElementById('amount').value, date: document.getElementById('date').value, billNumber: billNumber.value, note: document.getElementById('note').value };
    try { const t = await api('/api/transactions', { method:'POST', body:JSON.stringify(payload) }); showToast('Entry saved.'); location.hash = `#/customers/${t.customerId}`; }
    catch (error) { showToast(error.message); }
  });
}

async function renderCustomerDetail(id) {
  shell(`<div id="page">${pageHead('Customer', 'Loading...')}<div class="muted">Loading...</div></div>`);
  const page = document.getElementById('page');
  try {
    const customer = await api(`/api/customers/${id}`);
    const balClass = customer.balance > 0 ? 'collect' : customer.balance < 0 ? 'advance' : 'settled';
    page.innerHTML = `${pageHead('Customer', customer.name, `<div style="display:flex;gap:8px"><a class="btn btn-secondary" href="#/customers/${id}/edit">Edit customer</a><a class="btn btn-primary" href="#/entry?customer=${encodeURIComponent(id)}">＋ Add entry</a></div>`)}
      <div class="detail-top"><div><div class="muted">${escapeHtml(customer.phone || 'No phone added')}</div><div class="small muted" style="margin-top:7px">Billed: ${money(customer.totalBilled)} · Paid: ${money(customer.totalPaid)}</div></div><div class="card detail-balance"><div class="label">Current balance</div><div class="value ${balClass}">${money(Math.abs(customer.balance))}</div><div class="small muted" style="margin-top:4px">${customer.balance > 0 ? 'To collect' : customer.balance < 0 ? 'Advance held' : 'Settled'}</div></div></div>
      <section class="section"><div class="section-head"><div><h2>Ledger</h2><div class="small muted" style="margin-top:5px">Bills and payments for ${escapeHtml(customer.name)}.</div></div></div>
      <div class="card table-wrap">${customer.transactions.length ? `<table><thead><tr><th>Date</th><th>Type</th><th>Bill no.</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>${customer.transactions.map(t => `<tr><td>${dateText(t.date)}</td><td>${t.type === 'BILL' ? 'Bill' : 'Payment'}</td><td>${escapeHtml(t.billNumber || '—')}</td><td>${escapeHtml(t.note || '—')}</td><td class="num ${t.type === 'BILL' ? 'balance collect' : 'balance advance'}">${t.type === 'BILL' ? '+' : '−'}${money(t.amount)}</td><td><div class="actions-inline"><button class="btn btn-secondary edit-entry" data-id="${t.id}" type="button">Edit</button><button class="btn btn-danger delete-entry" data-id="${t.id}" type="button">Delete</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No entries for this customer yet.</div>'}</div></section>`;
    page.querySelectorAll('.edit-entry').forEach(btn => btn.addEventListener('click', () => editTransaction(id, btn.dataset.id)));
    page.querySelectorAll('.delete-entry').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Delete this entry?')) return;
      try { await api(`/api/transactions/${btn.dataset.id}`, { method:'DELETE' }); showToast('Entry deleted.'); renderCustomerDetail(id); } catch (error) { showToast(error.message); }
    }));
  } catch (error) { page.innerHTML = `${pageHead('Customer', 'Customer not found')}<div class="error">${escapeHtml(error.message)}</div>`; }
}

async function editTransaction(customerId, transactionId) {
  const t = await api(`/api/transactions/${transactionId}`);
  shell(`<div id="page">${pageHead('Ledger entry', 'Edit entry')}<form class="card form-card" id="edit-entry-form">
    <div class="form-grid">
      <div class="field full"><label>Customer</label><input class="input" value="${escapeHtml(t.customerName)}" disabled /></div>
      <div class="field"><label>Entry type *</label><select class="select" id="type"><option value="BILL" ${t.type === 'BILL' ? 'selected':''}>Bill / Sale</option><option value="PAYMENT" ${t.type === 'PAYMENT' ? 'selected':''}>Payment received</option></select></div>
      <div class="field"><label>Amount (₹) *</label><input class="input" id="amount" type="number" min="0.01" step="0.01" value="${t.amount}" required /></div>
      <div class="field"><label>Date *</label><input class="input" id="date" type="date" value="${t.date}" required /></div>
      <div class="field"><label>Bill number</label><input class="input" id="billNumber" value="${escapeHtml(t.billNumber || '')}" /></div>
      <div class="field full"><label>Note</label><textarea class="textarea" id="note">${escapeHtml(t.note || '')}</textarea></div>
      <div class="actions full"><button class="btn btn-primary" type="submit">Save changes</button><a class="btn btn-secondary" href="#/customers/${customerId}">Cancel</a></div>
    </div>
  </form></div>`);
  const type = document.getElementById('type');
  const billNumber = document.getElementById('billNumber');
  function toggle() { billNumber.disabled = type.value !== 'BILL'; if (type.value !== 'BILL') billNumber.value = ''; }
  type.addEventListener('change', toggle); toggle();
  document.getElementById('edit-entry-form').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api(`/api/transactions/${transactionId}`, { method:'PATCH', body:JSON.stringify({ customerId, type:type.value, amount:document.getElementById('amount').value, date:document.getElementById('date').value, billNumber:billNumber.value, note:document.getElementById('note').value }) }); showToast('Entry updated.'); location.hash = `#/customers/${customerId}`; }
    catch (error) { showToast(error.message); }
  });
}

async function route() {
  state.page = currentRoute();
  const raw = state.page;
  if (raw === '/') return renderDashboard();
  if (raw === '/customers') return renderCustomers();
  if (raw === '/customers/new') return customerForm();
  if (raw === '/entry') {
    const query = new URLSearchParams(location.hash.split('?')[1] || '');
    return entryForm(query.get('customer') || '');
  }
  const matchEditCustomer = raw.match(/^\/customers\/([^/]+)\/edit$/);
  if (matchEditCustomer) {
    try { return customerForm(await api(`/api/customers/${matchEditCustomer[1]}`)); } catch (e) { showToast(e.message); return; }
  }
  const matchCustomer = raw.match(/^\/customers\/([^/]+)$/);
  if (matchCustomer) return renderCustomerDetail(matchCustomer[1]);
  return renderDashboard();
}

window.addEventListener('hashchange', route);
route();
