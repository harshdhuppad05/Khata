const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  writeData({ customers: [], transactions: [] });
}

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { customers: [], transactions: [] };
  }
}

function writeData(data) {
  const temp = DATA_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, DATA_FILE);
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function now() {
  return new Date().toISOString();
}

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function amount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function dateOnly(value) {
  const text = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function customerBalance(data, customerId) {
  return data.transactions.reduce((total, t) => {
    if (t.customerId !== customerId) return total;
    return total + (t.type === 'BILL' ? t.amount : -t.amount);
  }, 0);
}

function customerSummary(data, customer) {
  const transactions = data.transactions.filter(t => t.customerId === customer.id);
  let billed = 0;
  let paid = 0;
  for (const t of transactions) {
    if (t.type === 'BILL') billed += t.amount;
    else paid += t.amount;
  }
  return {
    ...customer,
    totalBilled: round(billed),
    totalPaid: round(paid),
    balance: round(billed - paid)
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function transactionView(data, t) {
  const customer = data.customers.find(c => c.id === t.customerId);
  return { ...t, customerName: customer ? customer.name : 'Unknown customer' };
}

function dashboard(data) {
  const customers = data.customers.map(c => customerSummary(data, c));
  const outstanding = customers.reduce((sum, c) => sum + Math.max(c.balance, 0), 0);
  const recent = [...data.transactions]
    .sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`))
    .slice(0, 8)
    .map(t => transactionView(data, t));
  customers.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  return { totalOutstanding: round(outstanding), customerCount: customers.length, customers, recentTransactions: recent };
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', ...headers });
  res.end(payload);
}

function json(res, status, body) {
  send(res, status, body, { 'Cache-Control': 'no-store' });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Invalid JSON');
  }
}

function validateCustomer(body) {
  const name = cleanText(body.name);
  if (!name) return 'Customer name is required.';
  return null;
}

function validateTransaction(body) {
  if (!['BILL', 'PAYMENT'].includes(body.type)) return 'Entry type must be Bill or Payment.';
  const money = amount(body.amount);
  if (money === null) return 'Amount must be greater than zero.';
  if (!dateOnly(body.date)) return 'A valid date is required.';
  if (body.type === 'BILL' && !cleanText(body.billNumber)) return 'Bill number is required for a bill.';
  return null;
}

async function handleApi(req, res, url) {
  const data = readData();
  const parts = url.pathname.split('/').filter(Boolean);
  const resource = parts[1];
  const itemId = parts[2];

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { status: 'ok' });
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard') {
    return json(res, 200, dashboard(data));
  }

  if (req.method === 'GET' && resource === 'customers' && !itemId) {
    const search = cleanText(url.searchParams.get('search')).toLowerCase();
    const sort = url.searchParams.get('sort') || 'highest_due';
    let customers = data.customers.map(c => customerSummary(data, c)).filter(c => {
      if (!search) return true;
      return c.name.toLowerCase().includes(search) || (c.phone || '').toLowerCase().includes(search);
    });
    if (sort === 'name') customers.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'recently_updated') customers.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    else customers.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
    return json(res, 200, customers);
  }

  if (req.method === 'GET' && resource === 'customers' && itemId) {
    const customer = data.customers.find(c => c.id === itemId);
    if (!customer) return json(res, 404, { error: 'Customer not found.' });
    const transactions = data.transactions
      .filter(t => t.customerId === itemId)
      .sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`))
      .map(t => transactionView(data, t));
    return json(res, 200, { ...customerSummary(data, customer), transactions });
  }

  if (req.method === 'POST' && url.pathname === '/api/customers') {
    let body;
    try { body = await readJson(req); } catch (e) { return json(res, 400, { error: e.message }); }
    const error = validateCustomer(body);
    if (error) return json(res, 400, { error });
    const created = { id: id('cust'), name: cleanText(body.name), phone: cleanText(body.phone), createdAt: now(), updatedAt: now() };
    data.customers.push(created);
    writeData(data);
    return json(res, 201, customerSummary(data, created));
  }

  if (req.method === 'PATCH' && resource === 'customers' && itemId) {
    const customer = data.customers.find(c => c.id === itemId);
    if (!customer) return json(res, 404, { error: 'Customer not found.' });
    let body;
    try { body = await readJson(req); } catch (e) { return json(res, 400, { error: e.message }); }
    if (body.name !== undefined && !cleanText(body.name)) return json(res, 400, { error: 'Customer name is required.' });
    if (body.name !== undefined) customer.name = cleanText(body.name);
    if (body.phone !== undefined) customer.phone = cleanText(body.phone);
    customer.updatedAt = now();
    writeData(data);
    return json(res, 200, customerSummary(data, customer));
  }

  if (req.method === 'GET' && resource === 'transactions' && !itemId) {
    const customerId = url.searchParams.get('customerId');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
    let transactions = data.transactions;
    if (customerId) transactions = transactions.filter(t => t.customerId === customerId);
    transactions = [...transactions].sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`)).slice(0, limit).map(t => transactionView(data, t));
    return json(res, 200, transactions);
  }

  if (req.method === 'GET' && resource === 'transactions' && itemId) {
    const transaction = data.transactions.find(t => t.id === itemId);
    if (!transaction) return json(res, 404, { error: 'Entry not found.' });
    return json(res, 200, transactionView(data, transaction));
  }

  if (req.method === 'POST' && url.pathname === '/api/transactions') {
    let body;
    try { body = await readJson(req); } catch (e) { return json(res, 400, { error: e.message }); }
    const error = validateTransaction(body);
    if (error) return json(res, 400, { error });
    const customer = data.customers.find(c => c.id === cleanText(body.customerId));
    if (!customer) return json(res, 404, { error: 'Customer not found.' });
    const created = {
      id: id('txn'),
      customerId: customer.id,
      type: body.type,
      billNumber: cleanText(body.billNumber),
      amount: amount(body.amount),
      date: body.date,
      note: cleanText(body.note),
      createdAt: now(),
      updatedAt: now()
    };
    data.transactions.push(created);
    customer.updatedAt = now();
    writeData(data);
    return json(res, 201, transactionView(data, created));
  }

  if (req.method === 'PATCH' && resource === 'transactions' && itemId) {
    const transaction = data.transactions.find(t => t.id === itemId);
    if (!transaction) return json(res, 404, { error: 'Entry not found.' });
    let body;
    try { body = await readJson(req); } catch (e) { return json(res, 400, { error: e.message }); }
    const merged = { ...transaction, ...body };
    const error = validateTransaction(merged);
    if (error) return json(res, 400, { error });
    if (merged.customerId !== transaction.customerId && !data.customers.some(c => c.id === merged.customerId)) return json(res, 404, { error: 'Customer not found.' });
    Object.assign(transaction, {
      customerId: cleanText(merged.customerId), type: merged.type, billNumber: cleanText(merged.billNumber), amount: amount(merged.amount), date: dateOnly(merged.date), note: cleanText(merged.note), updatedAt: now()
    });
    writeData(data);
    return json(res, 200, transactionView(data, transaction));
  }

  if (req.method === 'DELETE' && resource === 'transactions' && itemId) {
    const index = data.transactions.findIndex(t => t.id === itemId);
    if (index === -1) return json(res, 404, { error: 'Entry not found.' });
    data.transactions.splice(index, 1);
    writeData(data);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'Not found.' });
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' })[ext] || 'application/octet-stream';
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, 'Not found');
  }
  res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    try { await handleApi(req, res, url); }
    catch (error) { console.error(error); json(res, 500, { error: 'Something went wrong on the server.' }); }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  serveStatic(req, res, url);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Customer Dues Tracker running at http://localhost:${PORT}`);
});
