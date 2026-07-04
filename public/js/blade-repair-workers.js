(function () {
  const container = document.getElementById('technician-rows');
  const addBtn = document.getElementById('add-technician-btn');
  const config = window.BRR_CONFIG || { technicians: [] };
  if (!container || !addBtn) return;

  function optionHtml(options) {
    return `<option value="">— Select —</option>${options
      .map((o) => `<option value="${String(o).replace(/"/g, '&quot;')}">${o}</option>`)
      .join('')}`;
  }

  function bindRemove(btn) {
    btn.addEventListener('click', () => {
      btn.closest('.technician-row').remove();
      reindex();
    });
  }

  function reindex() {
    container.querySelectorAll('.technician-row').forEach((row, index) => {
      const select = row.querySelector('select');
      const label = row.querySelector('label');
      select.name = `technician_${index}`;
      label.textContent =
        index === 0 ? 'Coastal Composite Technician *' : `Coastal Composite Technician ${index + 1}`;
      let removeBtn = row.querySelector('.technician-remove');
      if (index < 2 && removeBtn) removeBtn.remove();
      else if (index >= 2 && !removeBtn) {
        removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn btn-outline btn-sm technician-remove';
        removeBtn.textContent = 'Remove';
        row.appendChild(removeBtn);
        bindRemove(removeBtn);
      }
    });
  }

  container.querySelectorAll('.technician-remove').forEach(bindRemove);

  addBtn.addEventListener('click', () => {
    const index = container.querySelectorAll('.technician-row').length;
    const row = document.createElement('div');
    row.className = 'technician-row';
    row.innerHTML = `
      <div class="form-group">
        <label>Coastal Composite Technician ${index + 1}</label>
        <select name="technician_${index}" class="form-control">${optionHtml(config.technicians)}</select>
      </div>
      <button type="button" class="btn btn-outline btn-sm technician-remove">Remove</button>`;
    container.appendChild(row);
    bindRemove(row.querySelector('.technician-remove'));
    if (window.SearchableSelect) SearchableSelect.init(row.querySelector('select'));
    if (formSectionNotNa('turbine_information')) row.querySelector('select').dataset.required = 'true';
  });

  function formSectionNotNa(key) {
    const cb = document.querySelector(`.section-na-checkbox[data-section="${key}"]`);
    return !cb || !cb.checked;
  }
})();