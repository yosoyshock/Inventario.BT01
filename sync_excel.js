require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Validate env variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_KEY must be defined in the .env file.');
  process.exit(1);
}

// Initialize Supabase Client
const supabase = createClient(supabaseUrl, supabaseKey);

async function syncExcelToSupabase() {
  console.log('Starting sync process...');
  
  // 1. Read Excel file
  let workbook;
  try {
    workbook = XLSX.readFile(path.join(__dirname, 'INVENTARIO.xlsx'));
  } catch (err) {
    console.error('ERROR: Could not read INVENTARIO.xlsx file.', err.message);
    process.exit(1);
  }

  const sheet = workbook.Sheets['DATA'];
  if (!sheet) {
    console.error('ERROR: "DATA" sheet not found in the workbook.');
    process.exit(1);
  }

  const excelData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  console.log(`Excel sheet loaded. Total rows: ${excelData.length}`);

  // 2. Retrieve existing data from Supabase to preserve prealistamiento edits
  console.log('Fetching existing inventory from Supabase...');
  const { data: dbItems, error: fetchError } = await supabase
    .from('inventario')
    .select('id, prealistamiento');

  if (fetchError) {
    console.error('ERROR: Could not fetch from Supabase. Ensure table "inventario" is created and policies are configured.', fetchError.message);
    console.log('If you have not run the SQL script in your Supabase dashboard yet, please do so first.');
    process.exit(1);
  }

  // Map of existing item ID to its prealistamiento formula
  const prealistamientoMap = new Map();
  dbItems.forEach(item => {
    if (item.prealistamiento) {
      prealistamientoMap.set(item.id, item.prealistamiento);
    }
  });
  console.log(`Retrieved ${dbItems.length} items from DB. ${prealistamientoMap.size} have prealistamiento formulas.`);

  // 3. Process rows
  const excelRows = excelData.slice(1); // skip headers
  const upsertRows = [];
  const processedIds = new Set();

  excelRows.forEach((row, index) => {
    const codigo = row[0];
    const cantidad = row[1];
    const descripcion = row[2];
    const proveedor = row[3];
    const modulo = row[4];
    const uuid = row[5];

    // Skip empty or invalid rows (same filters as generate_data.js)
    if (!modulo || String(modulo).trim() === '' || modulo === 0) return;
    if (!codigo || codigo === 0) return;

    // Use row UUID or generate a new one if missing
    let id = uuid ? String(uuid).trim() : null;
    if (!id) {
      id = crypto.randomUUID();
    }

    processedIds.add(id);

    // Retrieve existing prealistamiento formula if we have it in DB
    const existingPrealistamiento = prealistamientoMap.get(id) || null;

    upsertRows.push({
      id,
      codigo_sap: String(codigo).trim(),
      cantidad: typeof cantidad === 'number' ? cantidad : 0,
      descripcion: (typeof descripcion === 'string' ? descripcion : '').trim(),
      proveedor: (typeof proveedor === 'string' ? proveedor : 'N/A').trim() || 'N/A',
      modulo: String(modulo).trim(),
      prealistamiento: existingPrealistamiento
    });
  });

  console.log(`Processed ${upsertRows.length} rows to upload.`);

  // 4. Batch upsert items to Supabase
  if (upsertRows.length > 0) {
    // PostgREST handles upsert in batches automatically, but we can do it directly
    const { error: upsertError } = await supabase
      .from('inventario')
      .upsert(upsertRows, { onConflict: 'id' });

    if (upsertError) {
      console.error('ERROR: Upserting data failed:', upsertError.message);
      process.exit(1);
    }
    console.log('Upsert of all items completed successfully.');
  }

  // 5. Delete items in Supabase that are no longer in Excel (optional but recommended for syncing)
  const itemsToDelete = dbItems.filter(item => !processedIds.has(item.id));
  if (itemsToDelete.length > 0) {
    console.log(`Deleting ${itemsToDelete.length} items from Supabase that were removed from Excel...`);
    const idsToDelete = itemsToDelete.map(item => item.id);
    const { error: deleteError } = await supabase
      .from('inventario')
      .delete()
      .in('id', idsToDelete);

    if (deleteError) {
      console.error('WARNING: Error deleting stale rows from database:', deleteError.message);
    } else {
      console.log('Stale items deletion completed successfully.');
    }
  }

  console.log('Sync process completed successfully! Supabase database is now in sync with INVENTARIO.xlsx');
}

syncExcelToSupabase();
