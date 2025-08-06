const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const fs = require('fs');
const { addDocument, getDocsFromCollection } = require('./mongo');

// Configuración de multer para documentos reconstruidos
const uploadsDir = path.join(__dirname, '../uploads');
const originalesDir = path.join(__dirname, '../originales');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    let numeroDoc = '';
    if (req.body && req.body.numero_documento) {
      numeroDoc = req.body.numero_documento;
    }
    
    const originalBase = path.parse(file.originalname).name;
    const ext = path.extname(file.originalname);
    const finalName = numeroDoc
      ? `${originalBase}_${numeroDoc}${ext}`
      : `${Date.now()}-${file.originalname}`;
    cb(null, finalName);
  }
});
const upload = multer({ storage: storage });

// Endpoint específico para documentos reconstruidos (sin OCR)
router.post('/upload-reconstructed', function(req, res, next) {
  upload.any()(req, res, function(err) {
    if (err) {
      console.error('[ERROR] Multer:', err);
      return res.status(400).json({ error: 'Error de subida de archivos', details: err.message || err.toString() });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('[INFO] === SUBIDA DE DOCUMENTO RECONSTRUIDO ===');
    console.log('[DEBUG] req.files:', req.files);
    console.log('[DEBUG] req.body:', req.body);
    
    // Buscar archivos
    let pdfFile = null;
    let originalFile = null;
    if (Array.isArray(req.files)) {
      for (const f of req.files) {
        console.log('[DEBUG] Archivo encontrado:', f.fieldname, f.originalname, f.mimetype);
        if (f.fieldname === 'pdf') pdfFile = f;
        if (f.fieldname === 'original_pdf') originalFile = f;
      }
    }

    if (!pdfFile) {
      console.error('[ERROR] No se subió ningún archivo PDF');
      return res.status(400).json({ error: 'No se subió ningún archivo PDF' });
    }

    // Validar campos obligatorios
    const { grupo, legajo, numero_documento } = req.body;
    if (!grupo || !legajo || !numero_documento) {
      return res.status(400).json({ error: 'Faltan campos obligatorios de ubicación (grupo, legajo, número de documento)' });
    }
    
    // Validar que sean numéricos
    if (!/^\d+$/.test(legajo) || !/^\d+$/.test(numero_documento)) {
      return res.status(400).json({ error: 'Legajo y número de documento deben ser numéricos.' });
    }

    try {
      // Verificar si ya existe un documento con el mismo grupo, legajo y número de documento
      const docs = await getDocsFromCollection('documentos');
      const existe = docs.some(d =>
        d.grupo === grupo &&
        d.legajo === legajo &&
        d.numero_documento === numero_documento
      );
      if (existe) {
        return res.status(400).json({ error: 'El número de documento ya está ocupado para ese grupo y legajo.' });
      }

      // Si viene archivo original, muévelo a /originales
      let originalFileName = null;
      if (originalFile) {
        originalFileName = 'original_' + originalFile.originalname;
        const destPath = path.join(originalesDir, originalFileName);
        fs.renameSync(originalFile.path, destPath);
        console.log('[INFO] Archivo original guardado:', destPath);
      }

      console.log('[INFO] Archivo PDF reconstruido recibido:', pdfFile.path);
      console.log('[INFO] Tamaño del archivo:', pdfFile.size, 'bytes');
      
      // Para documentos reconstruidos, no hacer OCR
      const titulo = path.parse(pdfFile.originalname).name;
      const text = 'Documento reconstruido - texto ya procesado por OCR';
      
      // Construir documento para MongoDB
      const categoria = "";
      const fecha_subida = new Date().toISOString().slice(0, 10);
      const url_archivo_pdf = `/uploads/${pdfFile.filename}`;
      const doc = {
        titulo,
        categoria,
        fecha_subida,
        contenido_texto: text,
        url_archivo_pdf,
        url_original: originalFileName,
        grupo,
        legajo,
        numero_documento
      };
      
      await addDocument('documentos', doc);
      console.log('[INFO] Documento reconstruido guardado en MongoDB');

      // Respuesta exitosa
      res.json({
        message: 'Documento reconstruido subido correctamente',
        url_archivo_pdf,
        titulo,
        grupo,
        legajo,
        numero_documento
      });
      
    } catch (err) {
      console.error('[ERROR] Error en el proceso de subida de documento reconstruido:', err);
      res.status(500).json({
        error: 'Error al procesar el documento reconstruido',
        details: err.message || err.toString()
      });
    }
  } catch (err) {
    console.error('[ERROR] Error general en subida de documento reconstruido:', err);
    res.status(500).json({
      error: 'Error en la subida del documento reconstruido',
      details: err.message || err.toString()
    });
  }
});

module.exports = router;