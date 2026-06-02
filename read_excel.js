const XLSX = require('xlsx');
const path = require('path');

const workbook = XLSX.readFile(path.join(__dirname, 'INVENTARIO.xlsx'));

// Focus on DATA sheet
const sheet = workbook.Sheets['DATA'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

console.log('=== DATA SHEET - ALL ROWS ===');
console.log(`Headers: ${JSON.stringify(data[0])}`);
console.log(`Total rows: ${data.length}`);

// Extract all modules
const modules = [];
data.slice(1).forEach((row, i) => {
  const modulo = row[4]; // MODULO column
  if (modulo && modulo !== 0 && modulo !== '') {
    modules.push({
      rowIndex: i + 1,
      codigo: row[0],
      cantidad: row[1],
      descripcion: row[2],
      proveedor: row[3],
      modulo: row[4],
      uuid: row[5]
    });
  }
});

console.log(`\nModules with IDs: ${modules.length}`);
modules.forEach(m => console.log(JSON.stringify(m)));

// Check unique modules
const uniqueModules = [...new Set(modules.map(m => m.modulo))];
console.log(`\nUnique module codes: ${JSON.stringify(uniqueModules)}`);

// Also check rows with actual data (non-zero codigo)
const withData = modules.filter(m => m.codigo && m.codigo !== 0);
console.log(`\nModules with actual product data: ${withData.length}`);
withData.forEach(m => console.log(JSON.stringify(m)));
