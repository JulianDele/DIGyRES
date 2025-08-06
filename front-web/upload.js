// upload.js
// Lógica para subir PDF al backend y mostrar estado/resultados

document.addEventListener('DOMContentLoaded', function() {
  // --- Fix Modal logic ---
  const openFixModalBtn = document.getElementById('openFixModalBtn');
  const fixModal = document.getElementById('fixModal');
  const closeFixModal = document.getElementById('closeFixModal');

  if (openFixModalBtn) {
    openFixModalBtn.style.display = 'block';
    openFixModalBtn.addEventListener('click', function() {
      fixModal.style.display = 'flex';
    });
  }
  if (closeFixModal) {
    closeFixModal.addEventListener('click', function() {
      fixModal.style.display = 'none';
      // Ocultar vista previa al cerrar
      const previewContainer = document.getElementById('fixedPdfPreviewContainer');
      const previewFrame = document.getElementById('fixedPdfPreview');
      if (previewContainer && previewFrame) {
        previewFrame.src = '';
        previewContainer.style.display = 'none';
      }
    });
  }

  // --- Lógica para el modal de arreglar documentos ---
  const fixUploadForm = document.getElementById('fixUploadForm');
  const fixResult = document.getElementById('fixResult');
  const downloadFixedPdf = document.getElementById('downloadFixedPdf');
  const downloadFixedDocx = document.getElementById('downloadFixedDocx');
  const uploadFixedForm = document.getElementById('uploadFixedForm');
  const uploadFixedResult = document.getElementById('uploadFixedResult');
  let fixedPdfBlob = null;
  let originalPdfBlob = null;
  let fixedPdfFilename = '';
  let originalPdfFilename = '';

  if (fixUploadForm) {
    fixUploadForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      fixResult.textContent = '';
      downloadFixedPdf.style.display = 'none';
      downloadFixedDocx.style.display = 'none';
      downloadFixedPdf.removeAttribute('href');
      downloadFixedDocx.removeAttribute('href');
      downloadFixedPdf.removeAttribute('download');
      downloadFixedDocx.removeAttribute('download');
      if (uploadFixedForm) {
        uploadFixedForm.style.display = 'none';
        uploadFixedResult.textContent = '';
      }
      fixedPdfBlob = null;
      originalPdfBlob = null;
      fixedPdfFilename = '';
      originalPdfFilename = '';

      const fileInput = this.elements['pdf'];
      const file = fileInput.files[0];
      if (!file) {
        fixResult.textContent = 'Selecciona un archivo PDF.';
        return;
      }
      originalPdfBlob = file;
      originalPdfFilename = file.name;
      const reconstruirBtn = document.getElementById('reconstruirBtn');
      reconstruirBtn.disabled = true;
      fixResult.textContent = 'Procesando y reparando documento...';
      try {
        const formData = new FormData();
        formData.append('pdf', file);
        const res = await fetch('/pdf/repair-ocr', {
          method: 'POST',
          body: formData
        });
        let data;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          data = await res.json();
        } else {
          const text = await res.text();
          throw new Error('Respuesta inesperada del servidor: ' + text.slice(0, 200));
        }
        if (res.ok) {
          fixResult.innerHTML = 'Documento procesado correctamente.';
          // Descargar el PDF generado como blob para subirlo después
          if (data.ocr_pdf) {
            downloadFixedPdf.style.display = 'block';
            downloadFixedPdf.href = data.ocr_pdf;
            downloadFixedPdf.download = '';
            // Vista previa visual del PDF generado
            const previewContainer = document.getElementById('fixedPdfPreviewContainer');
            const previewFrame = document.getElementById('fixedPdfPreview');
            if (previewContainer && previewFrame) {
              previewFrame.src = data.ocr_pdf;
              previewContainer.style.display = 'block';
            }
            // Descargar el PDF generado como blob
            const pdfRes = await fetch(data.ocr_pdf);
            fixedPdfBlob = await pdfRes.blob();
            fixedPdfFilename = data.ocr_pdf.split('/').pop();
          }
          if (data.ocr_docx) {
            downloadFixedDocx.style.display = 'block';
            downloadFixedDocx.href = data.ocr_docx;
            downloadFixedDocx.download = '';
          }
          // Mostrar el formulario para subir el PDF reconstruido
          if (uploadFixedForm && fixedPdfBlob) {
            uploadFixedForm.style.display = 'flex';
          }
        } else {
          fixResult.textContent = 'Error: ' + (data.error || 'No se pudo procesar el documento.');
        }
      } catch (err) {
        fixResult.textContent = 'Error: ' + err.message;
      } finally {
        reconstruirBtn.disabled = false;
      }
    });
  }

  if (uploadFixedForm) {
    uploadFixedForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      uploadFixedResult.textContent = '';
      if (!fixedPdfBlob || !originalPdfBlob) {
        uploadFixedResult.textContent = 'Primero debes reconstruir el documento.';
        return;
      }
      const grupo = document.getElementById('fixedGrupo').value.trim();
      const legajo = document.getElementById('fixedLegajo').value.trim();
      const numeroDoc = document.getElementById('fixedNumeroDoc').value.trim();
      if (!grupo || !legajo || !numeroDoc) {
        uploadFixedResult.textContent = 'Completa todos los campos.';
        return;
      }
      if (!/^\d+$/.test(legajo) || !/^\d+$/.test(numeroDoc)) {
        uploadFixedResult.textContent = 'Legajo y número de documento deben ser numéricos.';
        return;
      }
      const formData = new FormData();
      formData.append('pdf', fixedPdfBlob, fixedPdfFilename || 'reconstruido.pdf');
      formData.append('original_pdf', originalPdfBlob, originalPdfFilename || 'original.pdf');
      formData.append('grupo', grupo);
      formData.append('legajo', legajo);
      formData.append('numero_documento', numeroDoc);
      try {
        const res = await fetch('/pdf/upload-reconstructed', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (res.ok) {
          uploadFixedResult.textContent = '';
          uploadFixedResult.innerHTML = '<span style="color:#219a52;font-size:1.1em;font-weight:bold;">Documento reconstruido subido correctamente.</span>';
          uploadFixedForm.style.display = 'none';
        } else {
          uploadFixedResult.textContent = 'Error: ' + (data.error || 'No se pudo subir el documento.');
        }
      } catch (err) {
        uploadFixedResult.textContent = 'Error: ' + err.message;
      }
    });
  }

  document.getElementById('uploadForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const fileInput = this.elements['pdf'];
    const grupoInput = this.elements['grupo'];
    const legajoInput = this.elements['legajo'];
    const numeroDocInput = this.elements['numero_documento'];
    const file = fileInput.files[0];
    const errorDiv = document.getElementById('numero-ocupado-error');
    errorDiv.textContent = '';

    // Validación numérica
    if (!file) return;
    if (!grupoInput.value.trim() || !legajoInput.value.trim() || !numeroDocInput.value.trim()) {
      document.getElementById('result').textContent = 'Completa todos los campos de ubicación.';
      return;
    }
    if (!/^\d+$/.test(legajoInput.value.trim()) || !/^\d+$/.test(numeroDocInput.value.trim())) {
      errorDiv.textContent = 'Legajo y número de documento deben ser numéricos.';
      return;
    }

    const resultDiv = document.getElementById('result');
    resultDiv.textContent = 'Subiendo...';

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('grupo', grupoInput.value.trim());
    formData.append('legajo', legajoInput.value.trim());
    formData.append('numero_documento', numeroDocInput.value.trim());

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
        errorDiv.textContent = '';
        renderPDFList();
      } else {
        if (data.error && data.error.includes('ocupado')) {
          errorDiv.textContent = data.error;
        } else {
          resultDiv.textContent = 'Error al subir: ' + (data.error || 'Desconocido');
        }
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
      let docsWithFile = docs.filter(f => {
        if (!f.url_archivo_pdf) return false;
        const filename = f.url_archivo_pdf.split('/').pop();
        return files.includes(filename);
      });
      // Ordenar por grupo, legajo, número de documento
      docsWithFile.sort((a, b) => {
        if (a.grupo !== b.grupo) return a.grupo.localeCompare(b.grupo, undefined, { numeric: true });
        if (parseInt(a.legajo) !== parseInt(b.legajo)) return parseInt(a.legajo) - parseInt(b.legajo);
        return parseInt(a.numero_documento) - parseInt(b.numero_documento);
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
            <span style="font-size:0.95em;color:#444;">
              [Grupo: <b>${f.grupo || '-'}</b> | Legajo: <b>${f.legajo || '-'}</b> | Nº Doc: <b>${f.numero_documento || '-'}</b>]
            </span>
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
