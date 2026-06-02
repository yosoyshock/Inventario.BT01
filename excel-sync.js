// excel-sync.js - Client-side Excel to Supabase sync

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function syncFromExcelFile(file, statusEl) {
  const log = (msg, type) => {
    const level = type || 'info';
    console.log('[Sync]', msg);
    if (statusEl) {
      const palette = {
        info: '#475569',
        success: '#047857',
        error: '#b91c1c',
        warn: '#b45309'
      };
      const color = palette[level] || palette.info;
      const time = new Date().toLocaleTimeString();
      const prefix = level === 'error' ? '✘' : level === 'success' ? '✔' : '•';
      statusEl.innerHTML +=
        '<div style="color:' + color + '; margin: 2px 0;">' +
        '<span style="color:#94a3b8;">[' + time + ']</span> ' +
        prefix + ' ' + msg +
        '</div>';
      statusEl.scrollTop = statusEl.scrollHeight;
    }
  };

  try {
    if (typeof XLSX === 'undefined') {
      throw new Error('La librería SheetJS (xlsx) no está cargada.');
    }

    log('Leyendo archivo "' + file.name + '"...');

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    const sheet = workbook.Sheets['DATA'];
    if (!sheet) {
      throw new Error('No se encontró la hoja "DATA" dentro del archivo Excel.');
    }

    const excelData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    log('Archivo cargado. Filas totales: ' + excelData.length, 'success');

    log('Obteniendo inventario actual desde Supabase...');
    const { data: dbItems, error: fetchError } = await supabaseClient
      .from('inventario')
      .select('id, prealistamiento');

    if (fetchError) {
      throw new Error('No se pudo consultar Supabase: ' + fetchError.message);
    }

    const prealistamientoMap = new Map();
    (dbItems || []).forEach(function (item) {
      if (item.prealistamiento) {
        prealistamientoMap.set(item.id, item.prealistamiento);
      }
    });
    log((dbItems || []).length + ' items en DB. ' + prealistamientoMap.size + ' con fórmula de prealistamiento.');

    const excelRows = excelData.slice(1);
    const upsertRows = [];
    const processedIds = new Set();

    excelRows.forEach(function (row) {
      const codigo = row[0];
      const cantidad = row[1];
      const descripcion = row[2];
      const proveedor = row[3];
      const modulo = row[4];
      const uuid = row[5];

      if (!modulo || String(modulo).trim() === '' || modulo === 0) return;
      if (!codigo || codigo === 0) return;

      let id = uuid ? String(uuid).trim() : null;
      if (!id) {
        id = generateUUID();
      }

      processedIds.add(id);

      const existingPrealistamiento = prealistamientoMap.get(id) || null;

      upsertRows.push({
        id: id,
        codigo_sap: String(codigo).trim(),
        cantidad: typeof cantidad === 'number' ? cantidad : 0,
        descripcion: (typeof descripcion === 'string' ? descripcion : '').trim(),
        proveedor: (typeof proveedor === 'string' ? proveedor : 'N/A').trim() || 'N/A',
        modulo: String(modulo).trim(),
        prealistamiento: existingPrealistamiento
      });
    });

    log('Filas válidas procesadas: ' + upsertRows.length);

    if (upsertRows.length === 0) {
      throw new Error('El archivo no contiene filas válidas para sincronizar (revisa la hoja DATA y que tengan módulo y código SAP).');
    }

    log('Subiendo ' + upsertRows.length + ' registros a Supabase...');
    const { error: upsertError } = await supabaseClient
      .from('inventario')
      .upsert(upsertRows, { onConflict: 'id' });

    if (upsertError) {
      throw new Error('Error al subir datos: ' + upsertError.message);
    }
    log(upsertRows.length + ' registros sincronizados correctamente.', 'success');

    const itemsToDelete = (dbItems || []).filter(function (item) {
      return !processedIds.has(item.id);
    });

    if (itemsToDelete.length > 0) {
      log('Eliminando ' + itemsToDelete.length + ' items que ya no están en el Excel...');
      const idsToDelete = itemsToDelete.map(function (item) { return item.id; });
      const { error: deleteError } = await supabaseClient
        .from('inventario')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        log('Error al eliminar items obsoletos: ' + deleteError.message, 'warn');
      } else {
        log(itemsToDelete.length + ' items obsoletos eliminados.', 'success');
      }
    } else {
      log('No hay items obsoletos para eliminar.');
    }

    log('Sincronización completada.', 'success');
    return {
      success: true,
      upserted: upsertRows.length,
      deleted: itemsToDelete.length
    };
  } catch (err) {
    log(err.message || String(err), 'error');
    return { success: false, error: err.message || String(err) };
  }
}

function setupExcelSyncUI() {
  const fileInput = document.getElementById('excelFileInput');
  const syncBtn = document.getElementById('syncExcelBtn');
  const statusEl = document.getElementById('syncStatus');
  const fileNameEl = document.getElementById('syncFileName');

  if (!fileInput || !syncBtn) return;

  let selectedFile = null;

  const setBtnState = function (enabled) {
    syncBtn.disabled = !enabled;
    syncBtn.style.opacity = enabled ? '1' : '0.5';
    syncBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  };

  fileInput.addEventListener('change', function (e) {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
        alert('Por favor selecciona un archivo Excel válido (.xlsx o .xls).');
        fileInput.value = '';
        selectedFile = null;
        fileNameEl.style.display = 'none';
        setBtnState(false);
        return;
      }
      selectedFile = file;
      const sizeKb = (file.size / 1024).toFixed(1);
      fileNameEl.innerHTML =
        '<strong>📄 ' + file.name + '</strong> <span style="color:#94a3b8;">(' + sizeKb + ' KB)</span>';
      fileNameEl.style.display = 'block';
      setBtnState(true);
    } else {
      selectedFile = null;
      fileNameEl.style.display = 'none';
      setBtnState(false);
    }
  });

  syncBtn.addEventListener('click', async function () {
    if (!selectedFile) {
      alert('Por favor selecciona un archivo Excel primero.');
      return;
    }

    const confirmMsg =
      '¿Iniciar la sincronización con Supabase?\n\n' +
      'Esto actualizará todos los registros del inventario en la nube ' +
      'a partir del archivo seleccionado. Los registros que ya no estén ' +
      'en el Excel se eliminarán.';
    if (!confirm(confirmMsg)) return;

    setBtnState(false);
    fileInput.disabled = true;
    const originalText = syncBtn.textContent;
    syncBtn.textContent = 'Sincronizando...';

    const result = await syncFromExcelFile(selectedFile, statusEl);

    syncBtn.textContent = originalText;
    fileInput.disabled = false;
    setBtnState(true);

    if (result && result.success) {
      try {
        if (typeof renderStats === 'function') await renderStats();
        if (typeof renderModules === 'function') await renderModules();
      } catch (e) {
        console.warn('No se pudo refrescar la UI automáticamente:', e);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', function () {
  setupExcelSyncUI();
});
