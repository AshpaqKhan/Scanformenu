// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'menu-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Serve uploaded images
app.use('/uploads', express.static(uploadsDir));

// --- Config for totals ---
const TAX_RATE = 0.05;       // 5% tax
const SERVICE_RATE = 0.10;   // 10% service charge

// Helper function to parse date range
function parseDateRange(req) {
  const { start, end } = req.query;
  if (!start || !end) return { startStr: null, endStr: null };
  
  const startDate = new Date(start);
  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999); // End of day
  
  return {
    startStr: startDate.toISOString(),
    endStr: endDate.toISOString()
  };
}

// --- DB setup ---
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  items_json TEXT NOT NULL,
  total_price REAL NOT NULL,
  time TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  orders_json TEXT NOT NULL,
  total_amount REAL NOT NULL,
  paid_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS archived_bills (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  orders_json TEXT NOT NULL,
  total_amount REAL NOT NULL,
  paid_at TEXT NOT NULL,
  paid_at_iso TEXT,
  totals_json TEXT,
  archived_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  order_types TEXT,
  is_active INTEGER DEFAULT 1
);
`);

// Try to evolve schema for bills
try { db.exec('ALTER TABLE bills ADD COLUMN totals_json TEXT'); } catch {}
try { db.exec('ALTER TABLE bills ADD COLUMN paid_at_iso TEXT'); } catch {}

// Try to evolve schema for menu_items
try { db.exec('ALTER TABLE menu_items ADD COLUMN image_url TEXT'); } catch {}
try { db.exec('ALTER TABLE menu_items ADD COLUMN order_types TEXT'); } catch {}

// Initialize menu if empty
const menuCount = db.prepare('SELECT COUNT(*) as count FROM menu_items').get();
if (menuCount.count === 0) {
  const defaultMenu = [
    { id: 'm1', name: 'Pizza', price: 200, category: 'Main Course', description: 'Delicious pizza', image_url: '', order_types: JSON.stringify(['Half', 'Full', '1 Plate']) },
    { id: 'm2', name: 'Burger', price: 120, category: 'Fast Food', description: 'Juicy burger', image_url: '', order_types: JSON.stringify(['Half', 'Full', '1 Plate']) },
    { id: 'm3', name: 'Pasta', price: 150, category: 'Main Course', description: 'Italian pasta', image_url: '', order_types: JSON.stringify(['Half', 'Full', '1 Plate']) },
    { id: 'm4', name: 'Fries', price: 80, category: 'Sides', description: 'Crispy fries', image_url: '', order_types: JSON.stringify(['Half', 'Full', '1 Plate']) }
  ];
  const insert = db.prepare('INSERT INTO menu_items (id, name, price, category, description, image_url, order_types) VALUES (?, ?, ?, ?, ?, ?, ?)');
  defaultMenu.forEach(item => {
    insert.run(item.id, item.name, item.price, item.category, item.description, item.image_url, item.order_types);
  });
}

// --- SSE ---
const sseClients = new Set();
function sendSse(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => {
    try { res.write(payload); } catch {}
  });
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write('retry: 3000\n\n');
  sseClients.add(res);
  const keepAlive = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch {} }, 25000);
  req.on('close', () => { clearInterval(keepAlive); sseClients.delete(res); });
});

// --- Image upload ---
app.post('/api/upload-image', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ 
      success: true, 
      imageUrl: imageUrl,
      filename: req.file.filename 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling for multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
    }
  }
  if (error.message === 'Only image files are allowed') {
    return res.status(400).json({ error: 'Only image files are allowed' });
  }
  next(error);
});

// --- Menu management ---
app.get('/api/menu', (req, res) => {
  const rows = db.prepare('SELECT * FROM menu_items WHERE is_active = 1 ORDER BY category, name').all();
  const menu = rows.map(r => ({
    id: r.id,
    name: r.name,
    price: r.price,
    category: r.category,
    description: r.description,
    image_url: r.image_url || '',
    order_types: r.order_types ? JSON.parse(r.order_types) : ['Half', 'Full', '1 Plate']
  }));
  res.json(menu);
});

app.get('/api/menu/admin', (req, res) => {
  const rows = db.prepare('SELECT * FROM menu_items ORDER BY category, name').all();
  const menu = rows.map(r => ({
    id: r.id,
    name: r.name,
    price: r.price,
    category: r.category,
    description: r.description,
    image_url: r.image_url || '',
    order_types: r.order_types ? JSON.parse(r.order_types) : ['Half', 'Full', '1 Plate'],
    isActive: r.is_active === 1
  }));
  res.json(menu);
});

app.post('/api/menu', (req, res) => {
  const { name, price, category, description, image_url, order_types } = req.body;
  if (!name || !price || !category) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const id = 'm' + Date.now();
  const orderTypesJson = order_types ? JSON.stringify(order_types) : JSON.stringify(['Half', 'Full', '1 Plate']);
  db.prepare('INSERT INTO menu_items (id, name, price, category, description, image_url, order_types) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, price, category, description || '', image_url || '', orderTypesJson);
  sendSse({ type: 'menu_updated' });
  res.status(201).json({ id, name, price, category, description, image_url, order_types: order_types || ['Half', 'Full', '1 Plate'] });
});

app.put('/api/menu/:id', (req, res) => {
  const { id } = req.params;
  const { name, price, category, description, image_url, order_types, isActive } = req.body;
  if (!name || !price || !category) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Menu item not found' });
  
  const orderTypesJson = order_types ? JSON.stringify(order_types) : JSON.stringify(['Half', 'Full', '1 Plate']);
  db.prepare('UPDATE menu_items SET name = ?, price = ?, category = ?, description = ?, image_url = ?, order_types = ?, is_active = ? WHERE id = ?')
    .run(name, price, category, description || '', image_url || '', orderTypesJson, isActive ? 1 : 0, id);
  sendSse({ type: 'menu_updated' });
  res.json({ id, name, price, category, description, image_url, order_types: order_types || ['Half', 'Full', '1 Plate'], isActive });
});

app.delete('/api/menu/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Menu item not found' });
  
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
  sendSse({ type: 'menu_updated' });
  res.status(204).end();
});

// --- Orders ---
app.get('/api/orders', (req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY time DESC').all();
  const orders = rows.map(r => ({
    id: r.id,
    table: r.table_name,
    items: JSON.parse(r.items_json),
    totalPrice: r.total_price,
    time: r.time,
    status: r.status
  }));
  res.json(orders);
});

app.delete('/api/orders', (req, res) => {
  db.prepare('DELETE FROM orders').run();
  sendSse({ type: 'orders_updated' });
  res.status(204).end();
});

app.post('/api/orders', (req, res) => {
  console.log('Received order payload:', req.body);
  // Log each item for debugging
  if (Array.isArray(req.body.items)) {
    req.body.items.forEach((it, idx) => {
      console.log(`Item[${idx}]:`, it);
    });
  }
  // Calculate and log totalPrice
  let totalPrice = 0;
  if (Array.isArray(req.body.items)) {
    totalPrice = req.body.items.reduce((sum, it) => sum + (it.price * (it.quantity || 1)), 0);
    console.log('Calculated totalPrice:', totalPrice);
  }
  const { table, items } = req.body;
  if (!table || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invalid order payload: missing table or items.' });
  }
  // Validate each item has price and quantity
  for (const it of items) {
    if (typeof it.price !== 'number' || isNaN(it.price) || typeof it.quantity !== 'number' || isNaN(it.quantity)) {
      return res.status(400).json({ error: 'Invalid item in order: missing or invalid price/quantity.' });
    }
  }
  totalPrice = items.reduce((sum, it) => sum + (it.price * (it.quantity || 1)), 0);
  if (typeof totalPrice !== 'number' || isNaN(totalPrice) || totalPrice <= 0) {
    return res.status(400).json({ error: 'Invalid total price calculated for order.' });
  }
  const newOrder = {
    id: 'ord_' + Date.now(),
    table,
    items,
    totalPrice,
    time: new Date().toLocaleString(),
    status: 'Placed'
  };
  try {
    db.prepare('INSERT INTO orders (id, table_name, items_json, total_price, time, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newOrder.id, newOrder.table, JSON.stringify(newOrder.items), newOrder.totalPrice, newOrder.time, newOrder.status);
    sendSse({ type: 'orders_updated' });
    res.status(201).json(newOrder);
  } catch (err) {
    console.error('Failed to insert order:', err, { payload: req.body });
    res.status(500).json({ error: 'Failed to place order. Please try again.' });
  }
});

app.patch('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Missing status' });
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
  sendSse({ type: 'orders_updated' });
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  res.json({
    id: updated.id,
    table: updated.table_name,
    items: JSON.parse(updated.items_json),
    totalPrice: updated.total_price,
    time: updated.time,
    status: updated.status
  });
});

// Helper: parse date range
function parseDateRange(req) {
  const { start, end } = req.query;
  let startIso = start ? new Date(start) : null;
  let endIso = end ? new Date(end) : null;
  if (startIso && isNaN(startIso)) startIso = null;
  if (endIso && isNaN(endIso)) endIso = null;
  const startStr = startIso ? startIso.toISOString() : null;
  const endStr = endIso ? endIso.toISOString() : null;
  return { startStr, endStr };
}

// --- Bills ---
app.get('/api/bills', (req, res) => {
  const { startStr, endStr } = parseDateRange(req);
  let rows;
  if (startStr && endStr) {
    rows = db.prepare('SELECT * FROM bills WHERE paid_at_iso BETWEEN ? AND ? ORDER BY paid_at_iso DESC').all(startStr, endStr);
  } else {
    rows = db.prepare('SELECT * FROM bills ORDER BY paid_at_iso DESC, paid_at DESC').all();
  }
  const bills = rows.map(r => ({
    id: r.id,
    table: r.table_name,
    orders: JSON.parse(r.orders_json),
    totalAmount: r.total_amount,
    paidAt: r.paid_at,
    totals: r.totals_json ? JSON.parse(r.totals_json) : undefined
  }));
  res.json(bills);
});

app.get('/api/bills.csv', (req, res) => {
  const { startStr, endStr } = parseDateRange(req);
  let rows;
  if (startStr && endStr) {
    rows = db.prepare('SELECT * FROM bills WHERE paid_at_iso BETWEEN ? AND ? ORDER BY paid_at_iso DESC').all(startStr, endStr);
  } else {
    rows = db.prepare('SELECT * FROM bills ORDER BY paid_at_iso DESC, paid_at DESC').all();
  }
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = ['id','table','paidAt','subtotal','tax','service','grandTotal'];
  const lines = [header.join(',')];
  rows.forEach(r => {
    const totals = r.totals_json ? JSON.parse(r.totals_json) : { subtotal: r.total_amount, tax: 0, service: 0, grandTotal: r.total_amount };
    lines.push([
      esc(r.id),
      esc(r.table_name),
      esc(r.paid_at),
      esc(totals.subtotal),
      esc(totals.tax),
      esc(totals.service),
      esc(totals.grandTotal)
    ].join(','));
  });
  const csv = lines.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="bills.csv"');
  res.send(csv);
});

app.get('/api/bills.xlsx', async (req, res) => {
  const { startStr, endStr } = parseDateRange(req);
  const { archived } = req.query;
  
  let rows;
  if (archived === 'true') {
    if (startStr && endStr) {
      rows = db.prepare('SELECT * FROM archived_bills WHERE paid_at_iso BETWEEN ? AND ? ORDER BY paid_at_iso DESC').all(startStr, endStr);
    } else {
      rows = db.prepare('SELECT * FROM archived_bills ORDER BY paid_at_iso DESC, paid_at DESC').all();
    }
  } else {
    if (startStr && endStr) {
      rows = db.prepare('SELECT * FROM bills WHERE paid_at_iso BETWEEN ? AND ? ORDER BY paid_at_iso DESC').all(startStr, endStr);
    } else {
      rows = db.prepare('SELECT * FROM bills ORDER BY paid_at_iso DESC, paid_at DESC').all();
    }
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Bills');
  sheet.columns = [
    { header: 'ID', key: 'id', width: 22 },
    { header: 'Table', key: 'table', width: 12 },
    { header: 'Paid At', key: 'paidAt', width: 20 },
    { header: 'Subtotal', key: 'subtotal', width: 14 },
    { header: 'Tax', key: 'tax', width: 12 },
    { header: 'Service', key: 'service', width: 12 },
    { header: 'Grand Total', key: 'grandTotal', width: 16 }
  ];
  rows.forEach(r => {
    const totals = r.totals_json ? JSON.parse(r.totals_json) : { subtotal: r.total_amount, tax: 0, service: 0, grandTotal: r.total_amount };
    sheet.addRow({ id: r.id, table: r.table_name, paidAt: r.paid_at, subtotal: totals.subtotal, tax: totals.tax, service: totals.service, grandTotal: totals.grandTotal });
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const filename = archived === 'true' ? 'archived_bills.xlsx' : 'bills.xlsx';
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

app.post('/api/bills', (req, res) => {
  let { table } = req.body;
  if (!table) return res.status(400).json({ error: 'Missing table' });
  table = String(table).trim();
  const normalizedTable = table.toLowerCase().startsWith('table ')
    ? table.replace(/\s+/g, ' ').trim()
    : `Table ${table}`;

  const orders = db.prepare('SELECT * FROM orders WHERE table_name = ?').all(normalizedTable);
  if (!orders || orders.length === 0) return res.status(404).json({ error: `No orders found for ${normalizedTable}` });

  const subtotal = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const service = +(subtotal * SERVICE_RATE).toFixed(2);
  const grandTotal = +(subtotal + tax + service).toFixed(2);

  const bill = {
    id: 'bill_' + Date.now(),
    table: normalizedTable,
    orders: orders.map(o => ({ id: o.id, items: JSON.parse(o.items_json), totalPrice: o.total_price, time: o.time })),
    totalAmount: grandTotal,
    paidAt: new Date().toLocaleString(),
    paidAtIso: new Date().toISOString(),
    totals: { subtotal, tax, service, grandTotal }
  };

  db.prepare('INSERT INTO bills (id, table_name, orders_json, total_amount, paid_at, paid_at_iso, totals_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(bill.id, bill.table, JSON.stringify(bill.orders), bill.totalAmount, bill.paidAt, bill.paidAtIso, JSON.stringify(bill.totals));
  db.prepare('UPDATE orders SET status = ? WHERE table_name = ?').run('Paid', normalizedTable);

  sendSse({ type: 'orders_updated' });
  sendSse({ type: 'bills_updated' });
  res.status(201).json(bill);
});

// --- Archived Bills ---
app.get('/api/archived-bills', (req, res) => {
  const { startStr, endStr } = parseDateRange(req);
  let rows;
  if (startStr && endStr) {
    rows = db.prepare('SELECT * FROM archived_bills WHERE paid_at BETWEEN ? AND ? ORDER BY paid_at DESC').all(startStr, endStr);
  } else {
    rows = db.prepare('SELECT * FROM archived_bills ORDER BY paid_at DESC').all();
  }
  const archivedBills = rows.map(r => ({
    id: r.id,
    table: r.table_name,
    orders: JSON.parse(r.orders_json),
    totalAmount: r.total_amount,
    paidAt: r.paid_at,
    archivedAt: r.archived_at,
    totals: r.totals_json ? JSON.parse(r.totals_json) : { subtotal: r.total_amount, tax: 0, service: 0, grandTotal: r.total_amount }
  }));
  res.json(archivedBills);
});

app.post('/api/archive-bills', (req, res) => {
  try {
    const { startStr, endStr } = parseDateRange(req);
    let rows;
    if (startStr && endStr) {
      rows = db.prepare('SELECT * FROM bills WHERE paid_at_iso BETWEEN ? AND ? ORDER BY paid_at_iso DESC').all(startStr, endStr);
    } else {
      rows = db.prepare('SELECT * FROM bills ORDER BY paid_at_iso DESC, paid_at DESC').all();
    }
    
    console.log('Found bills to archive:', rows.length);
    
    const billsToArchive = rows.map(r => ({
      id: r.id,
      table: r.table_name,
      orders: JSON.parse(r.orders_json),
      totalAmount: r.total_amount,
      paidAt: r.paid_at,
      paidAtIso: r.paid_at_iso,
      totals: r.totals_json ? JSON.parse(r.totals_json) : { subtotal: r.total_amount, tax: 0, service: 0, grandTotal: r.total_amount }
    }));

    const insert = db.prepare('INSERT INTO archived_bills (id, table_name, orders_json, total_amount, paid_at, paid_at_iso, totals_json, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const now = new Date().toISOString();
    
    billsToArchive.forEach(bill => {
      try {
        insert.run(bill.id, bill.table, JSON.stringify(bill.orders), bill.totalAmount, bill.paidAt, bill.paidAtIso, JSON.stringify(bill.totals), now);
      } catch (insertError) {
        console.error('Error inserting bill:', bill.id, insertError);
        throw insertError;
      }
    });

    // Clear archived bills from the main bills table
    if (startStr && endStr) {
      db.prepare('DELETE FROM bills WHERE paid_at_iso BETWEEN ? AND ?').run(startStr, endStr);
    } else {
      db.prepare('DELETE FROM bills').run();
    }

    sendSse({ type: 'bills_updated' });
    sendSse({ type: 'archived_bills_updated' });
    res.status(200).json({ message: `Archived ${billsToArchive.length} bills.` });
  } catch (error) {
    console.error('Archive bills error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/archived-bills', (req, res) => {
  db.prepare('DELETE FROM archived_bills').run();
  sendSse({ type: 'archived_bills_updated' });
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
