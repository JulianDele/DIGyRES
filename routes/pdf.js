const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const fs = require('fs');
const { addDocument, getDocsFromCollection } = require('./mongo');
const { MongoClient } = require('mongodb');
const { createWorker } = require('tesseract.js');
const pdfPoppler = require('pdf-poppler');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

// Asegura que la carpeta uploads exista al iniciar el módulo
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Asegura que la carpeta temp_results exista antes de guardar archivos
function ensureTempResultsDir() {
  const tempResultsDir = path.join(__dirname, '../temp_results');
  if (!fs.existsSync(tempResultsDir)) {
    fs.mkdirSync(tempResultsDir, { recursive: true });
    console.log('[INFO] Carpeta temp_results creada:', tempResultsDir);
  } else {
    console.log('[INFO] Carpeta temp_results ya existe:', tempResultsDir);
  }
  return tempResultsDir;
}

// Asegura que la carpeta originales exista al iniciar el módulo
const originalesDir = path.join(__dirname, '../originales');
if (!fs.existsSync(originalesDir)) {
  fs.mkdirSync(originalesDir, { recursive: true });
}

// Guardar archivos en disco localmente
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Extrae el número de documento del body si está disponible
    let numeroDoc = '';
    if (req.body && req.body.numero_documento) {
      numeroDoc = req.body.numero_documento;
    }
    // Obtiene el nombre base del archivo original (sin extensión)
    const originalBase = path.parse(file.originalname).name;
    // Obtiene la extensión
    const ext = path.extname(file.originalname);
    // Si hay número de documento, lo agrega al nombre
    const finalName = numeroDoc
      ? `${originalBase}_${numeroDoc}${ext}`
      : `${Date.now()}-${file.originalname}`;
    cb(null, finalName);
  }
});
const upload = multer({ storage: storage });

// Nueva función para crear PDF a partir de texto con formato
function createPdfFromText(text, outputPath, title = "") {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 60, right: 60 }
    });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Título
    if (title) {
      doc.font('Times-Bold').fontSize(18).fillColor('#1976d2').text(title, { align: 'center', underline: true });
      doc.moveDown(1.5);
    }

    // Texto principal, con saltos de línea y fuente legible
    doc.font('Times-Roman').fontSize(12).fillColor('black');
    const paragraphs = text.split(/\n{2,}/); // párrafos separados por doble salto
    paragraphs.forEach(p => {
      doc.text(p.trim(), { align: 'justify', paragraphGap: 8 });
      doc.moveDown(0.5);
    });

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

// Nueva función para crear DOCX a partir de texto con formato
async function createDocxFromText(text, outputPath, title = "") {
  const children = [];

  // Título
  if (title) {
    children.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1,
        alignment: "center",
        spacing: { after: 200 },
        thematicBreak: true
      })
    );
  }

  // Texto principal, párrafos separados por doble salto de línea
  text.split(/\n{2,}/).forEach(p => {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: p.trim(), font: "Times New Roman", size: 24 })],
        spacing: { after: 120 }
      })
    );
  });

  const doc = new Document({
    sections: [{
      properties: {},
      children
    }]
  });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

// Modifica extractTextFromPDF para usar solo Tesseract.js (sin OpenCV)
async function extractTextFromPDF(pdfPath) {
  const outputDir = path.join(__dirname, '../temp_images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log('[INFO] Carpeta temp_images creada:', outputDir);
  }

  // Convierte PDF a imágenes (una por página)
  await pdfPoppler.convert(pdfPath, {
    format: 'jpeg',
    out_dir: outputDir,
    out_prefix: path.basename(pdfPath, path.extname(pdfPath)),
    page: null
  });
  console.log('[INFO] PDF convertido a imágenes en:', outputDir);

  // Obtén las imágenes generadas
  const images = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.jpg'))
    .map(f => path.join(outputDir, f));
  console.log('[INFO] Imágenes generadas:', images);

  const worker = await createWorker('spa');
  let fullText = '';
  for (let imgPath of images) {
    // OCR directamente sobre la imagen generada
    const { data: { text } } = await worker.recognize(imgPath);
    console.log('[INFO] Texto extraído de', imgPath, ':', text.slice(0, 100), '...');
    fullText += text + '\n';
    // Limpia imágenes temporales
    fs.unlinkSync(imgPath);
  }
  await worker.terminate();

  // Limpia la carpeta temp_images si está vacía
  if (fs.readdirSync(outputDir).length === 0) {
    fs.rmdirSync(outputDir, { recursive: true });
    console.log('[INFO] Carpeta temp_images eliminada:', outputDir);
  }

  return { text: fullText.trim(), baseName: path.basename(pdfPath, path.extname(pdfPath)) };
}

// Endpoint para subir PDF, mejorar imagen, extraer texto y devolver PDF/DOCX generados
router.post('/upload', function(req, res, next) {
  upload.any()(req, res, function(err) {
    if (err) {
      console.error('[ERROR] Multer:', err);
      return res.status(400).json({ error: 'Error de subida de archivos', details: err.message || err.toString() });
    }
    next();
  });
}, async (req, res) => {
  try {
    // Debug: mostrar qué archivos llegaron
    console.log('[DEBUG] req.files:', req.files);
    console.log('[DEBUG] req.body:', req.body);
    
    // Busca los archivos por su fieldname
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
      console.error('[ERROR] Archivos recibidos:', req.files);
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
      // Verifica si ya existe un documento con el mismo grupo, legajo y número de documento
      const docs = await getDocsFromCollection('documentos');
      const existe = docs.some(d =>
        d.grupo === grupo &&
        d.legajo === legajo &&
        d.numero_documento === numero_documento
      );
      if (existe) {
        // Elimina el archivo subido para evitar archivos huérfanos
        if (pdfFile && pdfFile.path && fs.existsSync(pdfFile.path)) {
          fs.unlinkSync(pdfFile.path);
        }
        return res.status(400).json({ error: 'Ya existe un documento en esa dirección.' });
      }

      // Si viene archivo original, muévelo a /originales
      let originalFileName = null;
      if (originalFile) {
        originalFileName = 'original_' + originalFile.originalname;
        const destPath = path.join(originalesDir, originalFileName);
        fs.renameSync(originalFile.path, destPath);
        console.log('[INFO] Archivo original guardado:', destPath);
      }

      const pdfPath = pdfFile.path;
      console.log('[INFO] Archivo recibido:', pdfPath);
      console.log('[INFO] Tamaño del archivo:', pdfFile.size, 'bytes');
      console.log('[INFO] Tipo MIME:', pdfFile.mimetype);
      
      // Verificar que el archivo existe
      if (!fs.existsSync(pdfPath)) {
        throw new Error('El archivo PDF no existe en el sistema de archivos');
      }
      
      // Extraer texto usando OCR
      console.log('[INFO] Iniciando extracción de texto...');
      const { text, baseName } = await extractTextFromPDF(pdfPath);
      console.log('[INFO] Texto extraído exitosamente, longitud:', text.length);

      // Crear archivos temporales PDF y DOCX con el texto extraído y formato
      const tempResultsDir = ensureTempResultsDir();
      const pdfOut = path.join(tempResultsDir, `${baseName}-ocr.pdf`);
      const docxOut = path.join(tempResultsDir, `${baseName}-ocr.docx`);
      const titulo = path.parse(pdfFile.originalname).name;
      await createPdfFromText(text, pdfOut, titulo);
      console.log('[INFO] PDF generado:', pdfOut);
      await createDocxFromText(text, docxOut, titulo);
      console.log('[INFO] DOCX generado:', docxOut);

      // Construir documento para MongoDB (ahora incluye ubicación)
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

      // Enviar los archivos generados como descargas temporales
      res.json({
        message: 'Archivo subido y procesado correctamente',
        url_archivo_pdf,
        ocr_pdf: `/pdf/ocr-result/${path.basename(pdfOut)}`,
        ocr_docx: `/pdf/ocr-result/${path.basename(docxOut)}`
      });
      console.log('[INFO] Respuesta enviada al frontend con enlaces de descarga.');
    } catch (err) {
      console.error('[ERROR] Error en el proceso de subida:', err);
      res.status(500).json({
        error: 'Error al procesar el PDF',
        details: err && err.stack ? err.stack : err
      });
    }
  } catch (err) {
    console.error('[ERROR] Error general:', err);
    res.status(500).json({
      error: 'Error en la subida',
      details: err && err.stack ? err.stack : err
    });
  }
});

// Nuevo endpoint SOLO para OCR y generación de PDF/DOCX desde el modal
router.post('/ocr', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }
  try {
    const pdfPath = req.file.path;
    console.log('[INFO] Archivo recibido para OCR:', pdfPath);
    const { text, baseName } = await extractTextFromPDF(pdfPath);

    const tempResultsDir = ensureTempResultsDir();
    const pdfOut = path.join(tempResultsDir, `${baseName}-ocr.pdf`);
    const docxOut = path.join(tempResultsDir, `${baseName}-ocr.docx`);
    // Usa el nombre del archivo original como título
    const titulo = path.parse(req.file.originalname).name;
    await createPdfFromText(text, pdfOut, titulo);
    await createDocxFromText(text, docxOut, titulo);

    // Elimina el archivo subido temporalmente (no se guarda en uploads ni MongoDB)
    fs.unlink(req.file.path, err => {
      if (err) {
        console.warn('[WARN] No se pudo eliminar el archivo temporal:', req.file.path);
      }
    });

    // NO guardar en MongoDB ni en uploads
    res.json({
      message: 'Documento procesado correctamente',
      ocr_pdf: `/pdf/ocr-result/${path.basename(pdfOut)}`,
      ocr_docx: `/pdf/ocr-result/${path.basename(docxOut)}`
    });
    console.log('[INFO] OCR y archivos generados para descarga.');
  } catch (err) {
    console.error('[ERROR] Error en OCR:', err);
    res.status(500).json({
      error: 'Error al procesar el PDF',
      details: err && err.stack ? err.stack : err
    });
  }
});

// Endpoint para borrar PDF y su original si existe
router.post('/delete', async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'Falta el nombre del archivo.' });
    const uploadsPath = path.join(uploadsDir, filename);
    const db = await (async () => {
      const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true });
      await client.connect();
      return client.db('digyres');
    })();
    // Buscar el documento en la base de datos
    const doc = await db.collection('documentos').findOne({ url_archivo_pdf: `/uploads/${filename}` });
    // Eliminar archivo de uploads
    if (fs.existsSync(uploadsPath)) {
      fs.unlinkSync(uploadsPath);
    }
    // Si existe en la base de datos, eliminar original y el registro
    if (doc) {
      if (doc.url_original) {
        const originalPath = path.join(originalesDir, doc.url_original);
        if (fs.existsSync(originalPath)) {
          fs.unlinkSync(originalPath);
        }
      }
      await db.collection('documentos').deleteOne({ _id: doc._id });
    } else {
      // Si es huérfano, intentar borrar el original correspondiente
      // Buscar original con el mismo nombre base
      const baseName = filename.replace(/^original_/, '');
      const possibleOriginals = [
        path.join(originalesDir, 'original_' + baseName),
        path.join(originalesDir, baseName)
      ];
      for (const origPath of possibleOriginals) {
        if (fs.existsSync(origPath)) {
          fs.unlinkSync(origPath);
        }
      }
    }
    res.json({ message: 'Documento y archivos eliminados correctamente.' });
  } catch (err) {
    console.error('[ERROR] Error al borrar documento:', err);
    res.status(500).json({ error: 'Error al borrar el documento', details: err && err.stack ? err.stack : err });
  }
});

// Endpoint para reparar PDF, extraer imágenes, aplicar OCR y devolver PDF/DOCX
const { execSync } = require('child_process');
router.post('/repair-ocr', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }
  try {
    const originalPdfPath = req.file.path;
    const repairedPdfPath = originalPdfPath.replace(/\.pdf$/i, '_repaired.pdf');

    // 1. Intentar reparar el PDF con qpdf
    try {
      execSync(`qpdf --repair --force "${originalPdfPath}" "${repairedPdfPath}"`);
      console.log('[INFO] PDF reparado con qpdf:', repairedPdfPath);
    } catch (err) {
      console.warn('[WARN] qpdf no pudo reparar el PDF, se usará el original:', err.message);
      fs.copyFileSync(originalPdfPath, repairedPdfPath);
    }

    // 2. Extraer texto usando OCR (flujo ya existente)
    const { text, baseName } = await extractTextFromPDF(repairedPdfPath);

    // 3. Generar PDF y DOCX con el texto extraído
    const tempResultsDir = ensureTempResultsDir();
    const pdfOut = path.join(tempResultsDir, `${baseName}-ocr.pdf`);
    const docxOut = path.join(tempResultsDir, `${baseName}-ocr.docx`);
    const titulo = path.parse(req.file.originalname).name;
    await createPdfFromText(text, pdfOut, titulo);
    await createDocxFromText(text, docxOut, titulo);

    // Limpieza de archivos temporales
    fs.unlinkSync(originalPdfPath);
    if (fs.existsSync(repairedPdfPath)) fs.unlinkSync(repairedPdfPath);

    res.json({
      message: 'Documento reparado y procesado correctamente',
      ocr_pdf: `/pdf/ocr-result/${path.basename(pdfOut)}`,
      ocr_docx: `/pdf/ocr-result/${path.basename(docxOut)}`
    });
    console.log('[INFO] OCR y archivos generados para descarga.');
  } catch (err) {
    console.error('[ERROR] Error en repair-ocr:', err);
    res.status(500).json({
      error: 'Error al reparar o procesar el PDF',
      details: err && err.stack ? err.stack : err
    });
  }
});

// Endpoint para servir archivos OCR generados
router.get('/ocr-result/:filename', (req, res) => {
  const file = path.join(__dirname, '../temp_results', req.params.filename);
  console.log('[INFO] Solicitud de descarga para:', file);
  if (fs.existsSync(file)) {
    res.download(file, err => {
      if (err) {
        console.error('[ERROR] Error al descargar el archivo:', err);
      } else {
        console.log('[INFO] Archivo descargado correctamente:', file);
      }
      // fs.unlinkSync(file); // Si quieres eliminar después de descargar
    });
  } else {
    console.error('[ERROR] Archivo no encontrado para descarga:', file);
    res.status(404).send('Archivo no encontrado');
  }
});

// Manejo global de errores para rutas no encontradas y errores de Express
router.use((err, req, res, next) => {
  console.error('[ERROR] Express:', err);
  if (req.originalUrl.startsWith('/pdf/')) {
    return res.status(500).json({ error: 'Error interno del servidor', details: err && err.stack ? err.stack : err });
  }
  res.status(500).send('Error interno del servidor');
});

module.exports = router;
