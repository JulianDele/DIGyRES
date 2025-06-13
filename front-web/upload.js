// upload.js
// Lógica para subir PDF al backend y mostrar estado/resultados

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('uploadForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const fileInput = this.elements['pdf'];
    const file = fileInput.files[0];
    if (!file) return;
    const resultDiv = document.getElementById('result');
    resultDiv.textContent = 'Subiendo...';

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const res = await fetch('/pdf/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        resultDiv.innerHTML = `
          Archivo subido correctamente.<br>
          <a href="${data.url_archivo_pdf}" target="_blank">Ver PDF original</a>
        `;
        renderPDFList();
      } else {
        resultDiv.textContent = 'Error al subir: ' + (data.error || 'Desconocido');
      }
    } catch (err) {
      resultDiv.textContent = 'Error al subir: ' + err.message;
    }
  });

  async function renderPDFList() {
    const pdfList = document.getElementById('pdfList');
    pdfList.innerHTML = 'Cargando...';
    try {
      // Obtener documentos de MongoDB y archivos reales
      const [docsRes, filesRes] = await Promise.all([
        fetch('/pdf/list-firestore'),
        fetch('/pdf/list')
      ]);
      const docs = await docsRes.json();
      const files = await filesRes.json();

      // Archivos que tienen metadatos en MongoDB
      const docsWithFile = docs.filter(f => {
        if (!f.url_archivo_pdf) return false;
        const filename = f.url_archivo_pdf.split('/').pop();
        return files.includes(filename);
      });

      // Archivos que existen en uploads pero NO están en MongoDB
      const filesInUploads = files.filter(filename => {
        return !docsWithFile.some(f => f.url_archivo_pdf.split('/').pop() === filename);
      });

      if (docsWithFile.length === 0 && filesInUploads.length === 0) {
        pdfList.innerHTML = '<div style="color:#888;">No hay documentos almacenados.</div>';
        return;
      }

      // Lista de documentos con metadatos
      let list = '';
      if (docsWithFile.length > 0) {
        list += docsWithFile.map(f => {
          const filename = f.url_archivo_pdf.split('/').pop();
          return `<li style='margin:8px 0;display:flex;align-items:center;gap:10px;'>
            <a href="${f.url_archivo_pdf}" target="_blank" style="color:#1976d2;text-decoration:underline;flex:1;">${f.titulo}</a>
            <button class="delete-btn" data-filename="${filename}" style="background:#e53935;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:0.95em;">Borrar</button>
          </li>`;
        }).join('');
      }

      // Lista de archivos huérfanos (solo en uploads)
      if (filesInUploads.length > 0) {
        list += filesInUploads.map(filename => {
          return `<li style='margin:8px 0;display:flex;align-items:center;gap:10px;'>
            <a href="/uploads/${filename}" target="_blank" style="color:#1976d2;text-decoration:underline;flex:1;">${filename}</a>
            <button class="delete-btn" data-filename="${filename}" style="background:#e53935;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:0.95em;">Borrar</button>
          </li>`;
        }).join('');
      }

      pdfList.innerHTML = `<ul style="list-style:none;padding:0;">${list}</ul>`;

      // Asignar eventos a los botones de borrar
      pdfList.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = async function() {
          if (confirm('¿Seguro que deseas borrar este documento?')) {
            const filename = this.getAttribute('data-filename');
            const res = await fetch('/pdf/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filename })
            });
            if (res.ok) {
              renderPDFList();
            } else {
              alert('No se pudo borrar el archivo');
            }
          }
        };
      });
    } catch (err) {
      pdfList.innerHTML = '<div style="color:#888;">Error al cargar documentos.</div>';
    }
  }

  renderPDFList();
});
