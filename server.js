const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'documents.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    config: { name: '', subtitle: 'БОЖХОНА ЮК ДЕКЛАРАЦИЯСИ', publicUrl: '' },
    docs: []
  }, null, 2));
}

function readDB() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function writeDB(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
function genId() {
  return 'HJ' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
}

app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, crypto.randomBytes(6).toString('hex') + '-' + safe);
  }
});
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } });

// ---------- CONFIG ----------
app.get('/api/config', (req, res) => {
  res.json(readDB().config);
});
app.post('/api/config', (req, res) => {
  const db = readDB();
  db.config = { ...db.config, ...req.body };
  writeDB(db);
  res.json(db.config);
});
app.post('/api/config/logo', upload.single('logo'), (req, res) => {
  const db = readDB();
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  if (db.config.logoFile) { try { fs.unlinkSync(path.join(UPLOAD_DIR, db.config.logoFile)); } catch (e) {} }
  db.config.logoFile = req.file.filename;
  writeDB(db);
  res.json(db.config);
});

// ---------- DOCS ----------
app.get('/api/docs', (req, res) => {
  const db = readDB();
  res.json([...db.docs].sort((a, b) => b.createdAt - a.createdAt));
});

app.get('/api/docs/:id', (req, res) => {
  const db = readDB();
  const doc = db.docs.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'not_found' });
  res.json(doc);
});

app.post('/api/docs', upload.single('pdf'), (req, res) => {
  try {
    const db = readDB();
    const fields = JSON.parse(req.body.data || '{}');
    const doc = { id: genId(), ...fields, createdAt: Date.now() };
    if (req.file) { doc.pdfFile = req.file.filename; doc.pdfName = req.file.originalname; }
    db.docs.push(doc);
    writeDB(db);
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/docs/:id', upload.single('pdf'), (req, res) => {
  try {
    const db = readDB();
    const idx = db.docs.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    const fields = JSON.parse(req.body.data || '{}');
    const old = db.docs[idx];
    const doc = { ...old, ...fields };
    if (req.file) {
      if (old.pdfFile) { try { fs.unlinkSync(path.join(UPLOAD_DIR, old.pdfFile)); } catch (e) {} }
      doc.pdfFile = req.file.filename;
      doc.pdfName = req.file.originalname;
    }
    db.docs[idx] = doc;
    writeDB(db);
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/docs/:id', (req, res) => {
  const db = readDB();
  const idx = db.docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  const doc = db.docs[idx];
  if (doc.pdfFile) { try { fs.unlinkSync(path.join(UPLOAD_DIR, doc.pdfFile)); } catch (e) {} }
  db.docs.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

// ---------- QR CODE (server-generated, no external dependency) ----------
app.get('/api/qrcode', async (req, res) => {
  const text = req.query.text;
  if (!text) return res.status(400).send('missing text');
  try {
    const buf = await QRCode.toBuffer(text, { width: parseInt(req.query.size) || 220, margin: 1 });
    res.type('png').send(buf);
  } catch (e) { res.status(500).send('qr_error'); }
});

app.listen(PORT, () => {
  console.log('');
  console.log('==============================================');
  console.log(' Server ishga tushdi!');
  console.log(' Admin panel:  http://localhost:' + PORT + '/admin.html');
  console.log('==============================================');
  console.log('');
});
