const express = require('express')
const cors = require('cors') 
const path = require('path');
const fs = require('fs');
const app = express()
const pdfRoutes = require('./routes/pdf');
const uploadReconstructedRoutes = require('./routes/upload-reconstructed');
const { getDocsFromCollection } = require('./routes/mongo'); 

app.use(cors()); 
app.use(express.json());

app.use('/pdf', pdfRoutes);
app.use('/pdf', uploadReconstructedRoutes); 

app.use(express.static(path.join(__dirname, 'front-web')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/originales', express.static(path.join(__dirname, 'originales')));

const port = 3000

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'front-web', 'index.html'));
})

// Endpoint para listar PDFs
app.get('/pdf/list', (req, res) => {
  const dir = path.join(__dirname, 'uploads');
  fs.readdir(dir, (err, files) => {
    if (err) return res.status(500).json([]);
    const pdfs = files.filter(f => f.toLowerCase().endsWith('.pdf'));
    res.json(pdfs);
  });
});

// Endpoint para listar PDFs desde MongoDB
app.get('/pdf/list-firestore', async (req, res) => {
  try {
    const docs = await getDocsFromCollection('documentos');
    res.json(docs);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Endpoint para borrar PDF
app.post('/pdf/delete', (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'Archivo no especificado' });
  const filePath = path.join(__dirname, 'uploads', filename);
  fs.unlink(filePath, err => {
    if (err) return res.status(500).json({ error: 'No se pudo borrar el archivo' });
    res.json({ message: 'Archivo borrado correctamente' });
  });
});

app.listen(port, () => {
  console.log(`andamos en el puerto: ${port} pibe`)
})