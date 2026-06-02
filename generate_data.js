const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const workbook = XLSX.readFile(path.join(__dirname, 'INVENTARIO.xlsx'));
const sheet = workbook.Sheets['DATA'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

// Skip header row
const modules = [];
data.slice(1).forEach((row) => {
  const codigo = row[0];
  const cantidad = row[1];
  const descripcion = row[2];
  const proveedor = row[3];
  const modulo = row[4];
  const uuid = row[5];

  // Only include rows with a valid module identifier
  if (!modulo || modulo === 0 || modulo === '') return;
  // Only include rows with actual product data (non-zero codigo)
  if (!codigo || codigo === 0) return;

  modules.push({
    id: uuid || crypto.randomUUID(),
    codigoSAP: String(codigo),
    cantidad: typeof cantidad === 'number' ? cantidad : 0,
    descripcion: (typeof descripcion === 'string' ? descripcion : '').trim(),
    proveedor: (typeof proveedor === 'string' ? proveedor : 'N/A').trim() || 'N/A',
    modulo: String(modulo).trim()
  });
});

// Group by module
const grouped = {};
modules.forEach(m => {
  if (!grouped[m.modulo]) {
    grouped[m.modulo] = [];
  }
  grouped[m.modulo].push(m);
});

// Generate data.js
const output = `// ============================================
// INVENTARIO - Datos extraídos de INVENTARIO.xlsx
// Generado automáticamente el ${new Date().toISOString().split('T')[0]}
// ============================================

const INVENTORY_DATA = ${JSON.stringify(modules, null, 2)};

// Módulos agrupados
const MODULES_GROUPED = ${JSON.stringify(grouped, null, 2)};

// Lista de módulos únicos
const MODULE_LIST = ${JSON.stringify(Object.keys(grouped).sort((a, b) => {
  // Sort: LI first, then numeric, then alpha
  const aIsLI = a.startsWith('LI');
  const bIsLI = b.startsWith('LI');
  const aNum = parseInt(a);
  const bNum = parseInt(b);
  
  if (aIsLI && bIsLI) {
    return parseInt(a.replace('LI', '')) - parseInt(b.replace('LI', ''));
  }
  if (aIsLI) return -1;
  if (bIsLI) return 1;
  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
  if (!isNaN(aNum)) return -1;
  if (!isNaN(bNum)) return 1;
  return a.localeCompare(b);
}), null, 2)};

// Zonas/áreas para filtros
const ZONES = {
  'Línea (LI)': MODULE_LIST.filter(m => m.startsWith('LI')),
  'Bodega (Numérico)': MODULE_LIST.filter(m => /^\\d+$/.test(m)),
  'Misceláneo (M-M)': MODULE_LIST.filter(m => m === 'M-M'),
  'Troqueladora': MODULE_LIST.filter(m => m === 'TROQUELADORA'),
  'Defectos': MODULE_LIST.filter(m => m === 'DEFECTOS')
};

// ============================================
// Storage Manager
// ============================================
const StorageManager = {
  KEY: 'inventario_data',

  init() {
    if (!localStorage.getItem(this.KEY)) {
      localStorage.setItem(this.KEY, JSON.stringify(INVENTORY_DATA));
    }
  },

  getAll() {
    return JSON.parse(localStorage.getItem(this.KEY) || '[]');
  },

  getByModule(modulo) {
    return this.getAll().filter(item => item.modulo === modulo);
  },

  getById(id) {
    return this.getAll().find(item => item.id === id);
  },

  update(id, updates) {
    const data = this.getAll();
    const index = data.findIndex(item => item.id === id);
    if (index !== -1) {
      data[index] = { ...data[index], ...updates };
      localStorage.setItem(this.KEY, JSON.stringify(data));
      return data[index];
    }
    return null;
  },

  getGrouped() {
    const data = this.getAll();
    const grouped = {};
    data.forEach(item => {
      if (!grouped[item.modulo]) grouped[item.modulo] = [];
      grouped[item.modulo].push(item);
    });
    return grouped;
  },

  getStats() {
    const data = this.getAll();
    const modules = new Set(data.map(d => d.modulo));
    const totalCantidad = data.reduce((sum, d) => sum + (d.cantidad || 0), 0);
    return {
      totalItems: data.length,
      totalModules: modules.size,
      totalCantidad,
      proveedores: [...new Set(data.map(d => d.proveedor).filter(p => p && p !== 'N/A'))]
    };
  },

  resetToDefaults() {
    localStorage.setItem(this.KEY, JSON.stringify(INVENTORY_DATA));
  },

  exportJSON() {
    return JSON.stringify(this.getAll(), null, 2);
  }
};
`;

fs.writeFileSync(path.join(__dirname, 'data.js'), output, 'utf-8');
console.log(`Generated data.js with ${modules.length} items across ${Object.keys(grouped).length} modules`);
console.log('Modules:', Object.keys(grouped).sort().join(', '));
