(function () {
  const container = document.getElementById('hazard-rows');
  const addBtn = document.getElementById('add-hazard-btn');
  const config = window.JSA_CONFIG || {
    potential_hazards: [],
    hazard_control_measures: [],
  };

  if (!container || !addBtn) return;

  function optionHtml(options, name) {
    const opts = options
      .map((o) => `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`)
      .join('');
    return `<option value="">— Select —</option>${opts}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  function bindRemove(btn) {
    btn.addEventListener('click', () => {
      btn.closest('.hazard-row').remove();
      reindex();
    });
  }

  function reindex() {
    container.querySelectorAll('.hazard-row').forEach((row, index) => {
      row.dataset.index = index;
      const potential = row.querySelector('select:first-of-type');
      const control = row.querySelector('select:last-of-type');
      potential.name = `hazard_potential_${index}`;
      control.name = `hazard_control_${index}`;

      let removeBtn = row.querySelector('.hazard-remove');
      if (index === 0 && removeBtn) {
        removeBtn.remove();
      } else if (index > 0 && !removeBtn) {
        removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn btn-outline btn-sm hazard-remove';
        removeBtn.textContent = 'Remove';
        row.appendChild(removeBtn);
        bindRemove(removeBtn);
      }
    });
  }

  container.querySelectorAll('.hazard-remove').forEach(bindRemove);

  addBtn.addEventListener('click', () => {
    const index = container.querySelectorAll('.hazard-row').length;
    const row = document.createElement('div');
    row.className = 'hazard-row';
    row.dataset.index = index;
    row.innerHTML = `
      <div class="form-group">
        <label>Potential Hazards *</label>
        <select name="hazard_potential_${index}" class="form-control" required>
          ${optionHtml(config.potential_hazards)}
        </select>
      </div>
      <div class="form-group">
        <label>Hazard Control Measures *</label>
        <select name="hazard_control_${index}" class="form-control" required>
          ${optionHtml(config.hazard_control_measures)}
        </select>
      </div>
      <button type="button" class="btn btn-outline btn-sm hazard-remove">Remove</button>
    `;
    container.appendChild(row);
    bindRemove(row.querySelector('.hazard-remove'));
    if (window.SearchableSelect) {
      row.querySelectorAll('select.form-control').forEach((el) => SearchableSelect.init(el));
    }
  });
})();