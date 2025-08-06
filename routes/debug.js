const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const fs = require('fs');

// Configuración de multer para debugging
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsDir = path.join(__dirname, '../uploads');
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const finalName = `debug-${Date.now()}-${file.originalname}`;
    cb(null, finalName);
  }
});
const upload = multer({ storage: storage });

// Endpoint de debugging para upload
router.post('/upload', upload.any(), async (req, res) => {
  console.log('[DEBUG] === INICIO DEBUG UPLOAD ===');
  console.log('[DEBUG] Files:', req.files);
  console.log('[DEBUG] Body:', req.body);
  
  try {
    let pdfFile = null;
    let originalFile = null;
    
    if (Array.isArray(req.files)) {
      for (const f of req.files) {
        console.log('[DEBUG] File:', f.fieldname, f.originalname, f.size, f.mimetype);
        if (f.fieldname === 'pdf') pdfFile = f;
        if (f.fieldname === 'original_pdf') originalFile = f;
      }
    }
    
    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF file found' });
    }
    
    console.log('[DEBUG] PDF file found:', pdfFile.path);
    console.log('[DEBUG] File exists:', fs.existsSync(pdfFile.path));
    console.log('[DEBUG] File stats:', fs.statSync(pdfFile.path));
    
    // Validar campos
    const { grupo, legajo, numero_documento } = req.body;
    console.log('[DEBUG] Form data:', { grupo, legajo, numero_documento });
    
    res.json({
      success: true,
      message: 'Debug successful - archivo recibido correctamente',
      fileInfo: {
        path: pdfFile.path,
        size: pdfFile.size,
        mimetype: pdfFile.mimetype,
        exists: fs.existsSync(pdfFile.path),
        originalFile: originalFile ? originalFile.originalname : null
      },
      formData: { grupo, legajo, numero_documento }
    });
    
  } catch (error) {
    console.error('[DEBUG] Error:', error);
    res.status(500).json({ 
      error: error.message, 
      stack: error.stack,
      details: 'Error en debugging endpoint'
    });
  }
});

module.exports = router;