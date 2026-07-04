(function () {
  const container = document.getElementById('chemical-rows');
  const addBtn = document.getElementById('add-chemical-btn');
  const config = window.BRR_CONFIG || { materials_used: [] };
  if (!container || !addBtn) return;

  function optionHtml() {
    return `<option value="">— Select —</option>${config.materials_used
      .map((o) => `<option value="${String(o).replace(/"/g, '&quot;')}">${o}</option>`)
      .join('')}`;
  }

  addBtn.addEventListener('click', () => {
    const index = container.querySelectorAll('.chemical-row').length;
    const row = document.createElement('div');
    row.className = 'chemical-row';
    row.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label>Material Used *</label>
          <select name="chemical_material_${index}" class="form-control" data-required="true" required>
            ${optionHtml()}
          </select>
        </div>
        <div class="form-group">
          <label>Batch Number *</label>
          <input type="text" name="chemical_batch_${index}" class="form-control" data-required="true" required>
        </div>
        <div class="form-group">
          <label>Expiration Date *</label>
          <input type="date" name="chemical_expiration_${index}" class="form-control" data-required="true" required>
        </div>
      </div>
      <button type="button" class="btn btn-outline btn-sm chemical-remove">Remove</button>`;
    container.appendChild(row);
    row.querySelector('.chemical-remove').addEventListener('click', () => row.remove());
    if (window.SearchableSelect) SearchableSelect.init(row.querySelector('select'));
  });

  container.querySelectorAll('.chemical-remove').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('.chemical-row').remove());
  });
})();