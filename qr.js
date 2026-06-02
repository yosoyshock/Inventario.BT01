// qr.js - Handles QR Code generation

let currentQRModule = null;

function showQR(moduloId) {
  currentQRModule = moduloId;
  const qrContainer = document.getElementById('qrContainer');
  const modalTitle = document.getElementById('qrModalTitle');
  
  modalTitle.textContent = `Código QR - Módulo ${moduloId}`;
  qrContainer.innerHTML = ''; // Clear previous

  // Generate URL for the module
  // Check if a custom base URL has been configured (e.g. for Vercel or local network IP)
  const savedBaseUrl = localStorage.getItem('qr_base_url');
  let targetUrl;
  if (savedBaseUrl) {
    targetUrl = `${savedBaseUrl.replace(/\/$/, '')}/modulo.html?id=${encodeURIComponent(moduloId)}`;
  } else {
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    targetUrl = `${baseUrl}/modulo.html?id=${encodeURIComponent(moduloId)}`;
  }

  // Create QR Code
  // TypeNumber 0 means auto-detect. ErrorCorrectionLevel 'M' (15%) or 'H' (30%)
  const qr = qrcode(0, 'M');
  qr.addData(targetUrl);
  qr.make();

  // Render QR as Image
  // cell size 6, margin 4
  qrContainer.innerHTML = qr.createImgTag(6, 4);

  openModal('qrModal');
}

function printQR() {
  if (!currentQRModule) return;
  
  const qrImg = document.querySelector('#qrContainer img');
  if (!qrImg) return;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Imprimir QR - ${currentQRModule}</title>
        <style>
          body { 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0; 
            font-family: monospace;
          }
          .label {
            font-size: 2rem;
            margin-bottom: 1rem;
            font-weight: bold;
          }
          img {
            max-width: 80vw;
            max-height: 80vh;
          }
        </style>
      </head>
      <body>
        <div class="label">MÓDULO ${currentQRModule}</div>
        <img src="${qrImg.src}" />
        <script>
          window.onload = function() {
            setTimeout(() => {
              window.print();
              window.close();
            }, 500);
          }
        </script>
      </body>
    </html>
  `);
}
