const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { requireAuth, requireRole } = require('../middleware/auth');
const router  = express.Router();

// Dossier de stockage
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'certificates');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Config multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `cert_${req.user.id}_${Date.now()}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Format non autorisé. PDF, JPG ou PNG uniquement.'));
  }
});

// POST /api/uploads/certificate — uploader un certificat
router.post('/certificate', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'Aucun fichier reçu' });
  res.json({
    success: true,
    filename: req.file.filename,
    path: `/api/uploads/certificate/${req.file.filename}`,
    message: 'Certificat uploadé avec succès'
  });
});

// GET /api/uploads/certificate/:filename — télécharger un certificat
router.get('/certificate/:filename', requireAuth, (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'Fichier introuvable' });
  }
  res.download(filePath);
});

module.exports = router;
