// app.js - Main Application Logic

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize storage
  await StorageManager.init();

  // Initialize UI
  initZones();
  await renderStats();
  await renderModules();

  // Load saved QR base URL settings
  const qrBaseUrlInput = document.getElementById('qrBaseUrlInput');
  if (qrBaseUrlInput) {
    qrBaseUrlInput.value = localStorage.getItem('qr_base_url') || window.location.origin;
  }

  // Event Listeners
  document.getElementById('searchInput').addEventListener('input', debounce(handleSearchAndFilter, 300));
  document.getElementById('zoneFilter').addEventListener('change', handleSearchAndFilter);
});

// State
let currentEditId = null;
let currentSearch = '';
let currentZone = 'ALL';

// --- Initialization & Rendering ---

function initZones() {
  const select = document.getElementById('zoneFilter');
  for (const [zoneName, _] of Object.entries(ZONES)) {
    const option = document.createElement('option');
    option.value = zoneName;
    option.textContent = zoneName;
    select.appendChild(option);
  }
}

async function renderStats() {
  const stats = await StorageManager.getStats();
  const container = document.getElementById('statsContainer');
  
  container.innerHTML = `
    <div class="stat-box highlight">
      <div class="stat-label">Total Módulos</div>
      <div class="stat-value">${stats.totalModules}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Total Items</div>
      <div class="stat-value">${stats.totalItems}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Unidades Totales</div>
      <div class="stat-value">${stats.totalCantidad.toLocaleString('es-ES')}</div>
    </div>
  `;
}

async function renderModules() {
  const grid = document.getElementById('modulesGrid');
  grid.innerHTML = ''; // Clear

  const grouped = await StorageManager.getGrouped();
  
  // Sort modules based on MODULE_LIST order
  const moduleKeys = Object.keys(grouped).sort((a, b) => {
    return MODULE_LIST.indexOf(a) - MODULE_LIST.indexOf(b);
  });

  let delay = 0;

  moduleKeys.forEach(modulo => {
    // Apply filters
    if (currentZone !== 'ALL') {
      if (!ZONES[currentZone].includes(modulo)) return;
    }

    const items = grouped[modulo];
    
    // Apply search filter (if active)
    let displayItems = items;
    if (currentSearch) {
      const searchLower = currentSearch.toLowerCase();
      // Check if module matches or any item matches
      const moduleMatch = String(modulo).toLowerCase().includes(searchLower);
      
      if (!moduleMatch) {
        displayItems = items.filter(item => 
          String(item.codigoSAP).toLowerCase().includes(searchLower) ||
          String(item.descripcion).toLowerCase().includes(searchLower)
        );
        if (displayItems.length === 0) return; // Skip module if no items match
      }
    }

    // Create card
    const card = document.createElement('div');
    card.className = 'module-card stagger-reveal';
    card.style.animationDelay = `${delay}s`;
    delay += 0.05;

    // Header
    const header = document.createElement('div');
    header.className = 'module-header';
    header.innerHTML = `
      <div class="module-id">MÓDULO ${modulo}</div>
      <div class="module-actions">
        <button class="btn-icon" onclick="showQR('${modulo}')" title="Ver QR">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
        </button>
      </div>
    `;
    card.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.className = 'module-content';
    
    displayItems.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'product-item';
      itemDiv.innerHTML = `
        <div class="data-row">
          <span class="data-label">Código SAP</span>
          <span class="data-value sap">${item.codigoSAP}</span>
        </div>
        <p class="data-desc">${item.descripcion}</p>
        <div class="data-row" style="margin-top: 1rem;">
          <span class="data-qty">${item.cantidad.toLocaleString('es-ES')}</span>
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.7rem;" onclick="openEditModal('${item.id}')">EDITAR</button>
        </div>
        ${item.proveedor && item.proveedor !== 'N/A' ? `<div class="data-label" style="margin-top: 0.5rem;">Prov: ${item.proveedor}</div>` : ''}
      `;
      content.appendChild(itemDiv);
    });

    card.appendChild(content);
    grid.appendChild(card);
  });
}

// --- Filtering & Searching ---

async function handleSearchAndFilter() {
  currentSearch = document.getElementById('searchInput').value.trim();
  currentZone = document.getElementById('zoneFilter').value;
  await renderModules();
}

// --- Modals & Editing ---

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

async function openEditModal(id) {
  currentEditId = id;
  const item = await StorageManager.getById(id);
  if (!item) return;

  document.getElementById('editId').value = item.id;
  document.getElementById('editModulo').value = item.modulo;
  document.getElementById('editSap').value = item.codigoSAP;
  document.getElementById('editDesc').value = item.descripcion;
  document.getElementById('editQty').value = item.cantidad;
  document.getElementById('editPrealistamiento').value = item.prealistamiento || '';
  document.getElementById('editProv').value = item.proveedor;

  openModal('editModal');
}

async function saveEdit() {
  if (!currentEditId) return;

  const sap = document.getElementById('editSap').value.trim();
  const desc = document.getElementById('editDesc').value.trim();
  const prealistamientoRaw = document.getElementById('editPrealistamiento').value.trim();
  let qty = parseInt(document.getElementById('editQty').value, 10);
  const prov = document.getElementById('editProv').value.trim() || 'N/A';

  if (!sap || !desc) {
    alert('Por favor complete los campos requeridos.');
    return;
  }

  // Handle prealistamiento formula evaluation
  if (prealistamientoRaw) {
    // Only allow digits, spaces, and +
    if (/^[0-9+\s]+$/.test(prealistamientoRaw)) {
      const sum = prealistamientoRaw
        .split('+')
        .map(val => parseFloat(val.trim()))
        .reduce((acc, curr) => acc + (isNaN(curr) ? 0 : curr), 0);
      qty = sum;
      // Update quantity input value visually
      document.getElementById('editQty').value = qty;
    } else {
      alert('La fórmula de prealistamiento contiene caracteres no válidos. Use solo números y "+".');
      return;
    }
  }

  if (isNaN(qty)) {
    alert('Por favor ingrese una cantidad válida.');
    return;
  }

  await StorageManager.update(currentEditId, {
    codigoSAP: sap,
    descripcion: desc,
    cantidad: qty,
    prealistamiento: prealistamientoRaw,
    proveedor: prov
  });

  closeModal('editModal');
  await renderStats();
  await renderModules();
}

// --- Utils ---

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function saveQRSettings() {
  const urlInput = document.getElementById('qrBaseUrlInput');
  if (urlInput) {
    const url = urlInput.value.trim();
    if (url) {
      // Basic URL check
      try {
        new URL(url);
      } catch (e) {
        alert('Por favor ingrese una URL válida completa (ej. https://mi-proyecto.vercel.app)');
        return;
      }
      localStorage.setItem('qr_base_url', url);
      alert('Configuración de QR guardada con éxito. Los nuevos QRs apuntarán a:\n' + url);
    } else {
      localStorage.removeItem('qr_base_url');
      alert('Configuración de QR restablecida al valor por defecto (dominio actual).');
    }
  }
}
