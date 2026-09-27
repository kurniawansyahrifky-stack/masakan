const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer Upload File Fisik
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'public', 'uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'menu-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Database SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) console.error("Database error:", err.message);
  else console.log("SQLite connected.");
});

// Setup Struktur Tabel
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS menu (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kanji TEXT DEFAULT '料理',
      category TEXT NOT NULL,
      price INTEGER NOT NULL,
      discount_percent INTEGER DEFAULT 0,
      variants TEXT DEFAULT '',
      desc TEXT NOT NULL,
      image TEXT NOT NULL,
      is_ready INTEGER DEFAULT 1,
      sales_count INTEGER DEFAULT 0,
      rating_total REAL DEFAULT 5.0,
      rating_count INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS promo_banner (
      id INTEGER PRIMARY KEY DEFAULT 1,
      title TEXT DEFAULT '',
      caption TEXT DEFAULT '',
      image TEXT DEFAULT '',
      end_time TEXT DEFAULT '',
      is_active INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS atelier_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      maps_embed TEXT DEFAULT 'https://share.google/ERASWOAFTv6UFGwor',
      address_text TEXT DEFAULT 'Sabaku Kitchen: Atik Mahalla'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT UNIQUE,
      items_detail TEXT,
      total_price INTEGER,
      item_ids TEXT,
      status TEXT DEFAULT 'PENDING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// API Menu
app.get('/api/menu', (req, res) => {
  db.all("SELECT * FROM menu ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/menu', upload.single('imageFile'), (req, res) => {
  const { name, kanji, category, price, discount_percent, variants, desc } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : '/uploads/default.jpg';

  db.run(
    `INSERT INTO menu (name, kanji, category, price, discount_percent, variants, desc, image, is_ready, sales_count, rating_total, rating_count) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 5.0, 1)`,
    [
      name, 
      kanji || '料理', 
      category, 
      parseInt(price) || 0, 
      parseInt(discount_percent) || 0, 
      variants || '', 
      desc, 
      imagePath
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.put('/api/menu/:id', upload.single('imageFile'), (req, res) => {
  const { name, kanji, category, price, discount_percent, variants, desc } = req.body;
  if (req.file) {
    const imagePath = `/uploads/${req.file.filename}`;
    db.run(
      `UPDATE menu SET name = ?, kanji = ?, category = ?, price = ?, discount_percent = ?, variants = ?, desc = ?, image = ? WHERE id = ?`,
      [name, kanji || '料理', category, parseInt(price) || 0, parseInt(discount_percent) || 0, variants || '', desc, imagePath, req.params.id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  } else {
    db.run(
      `UPDATE menu SET name = ?, kanji = ?, category = ?, price = ?, discount_percent = ?, variants = ?, desc = ? WHERE id = ?`,
      [name, kanji || '料理', category, parseInt(price) || 0, parseInt(discount_percent) || 0, variants || '', desc, req.params.id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  }
});

app.delete('/api/menu/:id', (req, res) => {
  db.run("DELETE FROM menu WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/menu/toggle/:id', (req, res) => {
  db.run("UPDATE menu SET is_ready = CASE WHEN is_ready = 1 THEN 0 ELSE 1 END WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/menu/rate/:id', (req, res) => {
  const star = Math.min(5, Math.max(1, parseFloat(req.body.rating) || 5));
  db.run(
    "UPDATE menu SET rating_total = rating_total + ?, rating_count = rating_count + 1 WHERE id = ?",
    [star, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// Orders API
app.post('/api/orders/create', (req, res) => {
  const { orderCode, itemsDetail, totalPrice, itemIds } = req.body;
  db.run(
    "INSERT INTO orders (order_code, items_detail, total_price, item_ids, status) VALUES (?, ?, ?, ?, 'PENDING')",
    [orderCode, itemsDetail, totalPrice, JSON.stringify(itemIds)],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, orderId: this.lastID });
    }
  );
});

app.get('/api/orders/status/:code', (req, res) => {
  db.get("SELECT * FROM orders WHERE order_code = ?", [req.params.code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { status: 'NOT_FOUND' });
  });
});

app.get('/api/orders', (req, res) => {
  db.all("SELECT * FROM orders ORDER BY id DESC LIMIT 50", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/orders/confirm/:id', (req, res) => {
  db.get("SELECT * FROM orders WHERE id = ?", [req.params.id], (err, order) => {
    if (err || !order) return res.status(500).json({ error: "Order tidak ditemukan" });

    db.run("UPDATE orders SET status = 'COMPLETED' WHERE id = ?", [req.params.id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      try {
        const ids = JSON.parse(order.item_ids || '[]');
        if (Array.isArray(ids) && ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          db.run(`UPDATE menu SET sales_count = sales_count + 1 WHERE id IN (${placeholders})`, ids);
        }
      } catch(e) {}

      res.json({ success: true });
    });
  });
});

app.post('/api/orders/cancel/:id', (req, res) => {
  db.run("UPDATE orders SET status = 'CANCELLED' WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Promo Banner & Settings
app.get('/api/promo', (req, res) => {
  db.get("SELECT * FROM promo_banner WHERE id = 1", (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || {});
  });
});

app.post('/api/promo', upload.single('promoFile'), (req, res) => {
  const { title, caption, end_time, is_active } = req.body;
  if (req.file) {
    const imgPath = `/uploads/${req.file.filename}`;
    db.run(
      "UPDATE promo_banner SET title = ?, caption = ?, image = ?, end_time = ?, is_active = ? WHERE id = 1",
      [title, caption, imgPath, end_time, is_active === 'true' || is_active === '1' ? 1 : 0],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  } else {
    db.run(
      "UPDATE promo_banner SET title = ?, caption = ?, end_time = ?, is_active = ? WHERE id = 1",
      [title, caption, end_time, is_active === 'true' || is_active === '1' ? 1 : 0],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  }
});

app.get('/api/settings', (req, res) => {
  db.get("SELECT * FROM atelier_settings WHERE id = 1", (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || {});
  });
});

app.post('/api/settings', (req, res) => {
  const { maps_embed, address_text } = req.body;
  db.run(
    "UPDATE atelier_settings SET maps_embed = ?, address_text = ? WHERE id = 1",
    [maps_embed, address_text],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.get('/sabaku-atelier-portal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
