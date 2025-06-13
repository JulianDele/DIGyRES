// Endpoint para manejar uploads de PDF
const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const fs = require('fs');
const { addDocument } = require('./mongo');
const { createWorker } = require('tesseract.js');
const pdfPoppler = require('pdf-poppler');
const sharp = require('sharp'); // <-- Agrega sharp
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun } = require('docx');

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

// Guardar archivos en disco localmente
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Nueva función para crear PDF a partir de texto
function createPdfFromText(text, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    doc.font('Times-Roman').fontSize(12).text(text, { align: 'left' });
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

// Nueva función para crear DOCX a partir de texto
async function createDocxFromText(text, outputPath) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [new Paragraph({ children: [new TextRun(text)] })]
    }]
  });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

// Modifica extractTextFromPDF para devolver el texto y el nombre base
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
    // Procesa la imagen con sharp (escala de grises + binarización)
    const improvedImgPath = imgPath.replace('.jpg', '-sharp.jpg');
    await sharp(imgPath)
      .grayscale()
      .threshold(180) // Puedes ajustar el umbral
      .toFile(improvedImgPath);
    console.log('[INFO] Imagen mejorada con sharp:', improvedImgPath);

    // OCR sobre la imagen mejorada
    const { data: { text } } = await worker.recognize(improvedImgPath);
    console.log('[INFO] Texto extraído de', improvedImgPath, ':', text.slice(0, 100), '...');
    fullText += text + '\n';

    // Limpia imágenes temporales
    fs.unlinkSync(imgPath);
    fs.unlinkSync(improvedImgPath);
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
router.post('/upload', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    console.error('[ERROR] No se subió ningún archivo');
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }
  try {
    const pdfPath = req.file.path;
    console.log('[INFO] Archivo recibido:', pdfPath);
    // Extraer texto usando OCR
    const { text, baseName } = await extractTextFromPDF(pdfPath);

    // Crear archivos temporales PDF y DOCX con el texto extraído
    const tempResultsDir = ensureTempResultsDir();
    const pdfOut = path.join(tempResultsDir, `${baseName}-ocr.pdf`);
    const docxOut = path.join(tempResultsDir, `${baseName}-ocr.docx`);
    await createPdfFromText(text, pdfOut);
    console.log('[INFO] PDF generado:', pdfOut);
    await createDocxFromText(text, docxOut);
    console.log('[INFO] DOCX generado:', docxOut);

    // Construir documento para MongoDB (opcional, puedes omitir si solo quieres devolver los archivos)
    const titulo = path.parse(req.file.originalname).name;
    const categoria = "";
    const fecha_subida = new Date().toISOString().slice(0, 10);
    const url_archivo_pdf = `/uploads/${req.file.filename}`;
    const doc = {
      titulo,
      categoria,
      fecha_subida,
      contenido_texto: text,
      url_archivo_pdf
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
    res.status(500).json({ error: 'Error al procesar el PDF', details: err.message });
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
    await createPdfFromText(text, pdfOut);
    await createDocxFromText(text, docxOut);

    res.json({
      message: 'Documento procesado correctamente',
      ocr_pdf: `/pdf/ocr-result/${path.basename(pdfOut)}`,
      ocr_docx: `/pdf/ocr-result/${path.basename(docxOut)}`
    });
    console.log('[INFO] OCR y archivos generados para descarga.');
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar el PDF', details: err.message });
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

module.exports = router;
