// search.js
// Lógica para el modal de login antes de subir documento

document.addEventListener('DOMContentLoaded', function() {
  const goToUploadBtn = document.getElementById('goToUploadBtn');
  const uploadLoginModal = document.getElementById('uploadLoginModal');
  const uploadLoginForm = document.getElementById('uploadLoginForm');
  const modalUsername = document.getElementById('modalUsername');
  const modalPassword = document.getElementById('modalPassword');
  const modalLoginError = document.getElementById('modalLoginError');
  const closeUploadLoginModal = document.getElementById('closeUploadLoginModal');

  if (goToUploadBtn) {
    goToUploadBtn.addEventListener('click', function(e) {
      e.preventDefault();
      uploadLoginModal.style.display = 'flex';
      modalLoginError.textContent = '';
      modalUsername.value = '';
      modalPassword.value = '';
      modalUsername.focus();
    });
  }

  if (closeUploadLoginModal) {
    closeUploadLoginModal.addEventListener('click', function() {
      uploadLoginModal.style.display = 'none';
    });
  }

  if (uploadLoginForm) {
    uploadLoginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const user = modalUsername.value.trim();
      const pass = modalPassword.value;
      if (user === 'ADMIN' && pass === 'AYTM-M0') {
        window.location.href = 'upload.html';
      } else {
        modalLoginError.textContent = 'Usuario o contraseña incorrectos';
      }
    });
  }
});
// Lógica para buscar y mostrar documentos PDF desde Firestore

document.addEventListener('DOMContentLoaded', function() {
  const pdfList = document.getElementById('pdfList');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');

  async function fetchPDFs(query = "") {
    pdfList.innerHTML = 'Buscando...';
    try {
      // Obtener documentos de MongoDB y archivos reales
      const [docsRes, filesRes] = await Promise.all([
        fetch('/pdf/list-firestore'),
        fetch('/pdf/list')
      ]);
      let docs = await docsRes.json();
      const files = await filesRes.json();

      // Archivos que tienen metadatos en MongoDB
      let docsWithFile = docs.filter(f => {
        if (!f.url_archivo_pdf) return false;
        const filename = f.url_archivo_pdf.split('/').pop();
        return files.includes(filename);
      });

      // Archivos que existen en uploads pero NO están en MongoDB
      let filesInUploads = files.filter(filename => {
        return !docsWithFile.some(f => f.url_archivo_pdf.split('/').pop() === filename);
      });

      // Filtrar por búsqueda en título (metadatos)
      if(query) {
        docsWithFile = docsWithFile.filter(f => f.titulo && f.titulo.toLowerCase().includes(query.toLowerCase()));
        filesInUploads = filesInUploads.filter(f => f.toLowerCase().includes(query.toLowerCase()));
      }

      if(docsWithFile.length === 0 && filesInUploads.length === 0) {
        pdfList.innerHTML = '<div style="color:#888;">No se encontraron documentos.</div>';
        return;
      }

      let list = '';
      if (docsWithFile.length > 0) {
        list += docsWithFile.map(f =>
          `<li style='margin:8px 0;display:flex;align-items:center;gap:10px;justify-content:space-between;'>
            <div>
              <a href="${f.url_archivo_pdf}" target="_blank" style="color:#1976d2;text-decoration:underline;flex:1;">${f.titulo}</a>
              <span style="font-size:0.97em;color:#1976d2;">
                G,${f.grupo || '-'} L${f.legajo || '-'}, N°${f.numero_documento || '-'}
              </span>
            </div>
            <div style="min-width:120px;text-align:right;">
              ${f.url_original && typeof f.url_original === 'string' && f.url_original.trim() !== '' 
                ? `<a href="/originales/${f.url_original}" target="_blank" style="color:#666;text-decoration:underline;">Ver original</a>` 
                : ''}
            </div>
          </li>`
        ).join('');
      }
      if (filesInUploads.length > 0) {
        list += filesInUploads.map(f => `<li style='margin:8px 0;'><a href="/uploads/${f}" target="_blank" style="color:#1976d2;text-decoration:underline;">${f}</a></li>`).join('');
      }
      pdfList.innerHTML = `<ul style="list-style:none;padding:0;">${list}</ul>`;
    } catch (err) {
      pdfList.innerHTML = '<div style="color:#888;">Error al buscar documentos.</div>';
      console.error('Mongo fetch error:', err);
    }
  }

  searchForm.addEventListener('submit', function(e) {
    e.preventDefault();
    fetchPDFs(searchInput.value);
  });

  fetchPDFs();
});

// No mostrar archivos de /originales en la lista, solo los de MongoDB y /uploads
