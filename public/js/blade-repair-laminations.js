(function () {
  const container = document.getElementById('lamination-rows');
  const addBtn = document.getElementById('add-lamination-btn');
  const config = window.BRR_CONFIG || { materials_used: [] };
  const stages = window.BRR_LAMINATION_STAGES || [
    'Stage 1: Lamination Prepped for Layup',
    'Stage 2: Lamination Under Vacuum',
    'Stage 3: Lamination with Heat Blanket Applied',
    'Stage 4: Lamination Cured',
  ];
  if (!container || !addBtn) return;

  function materialsOptions() {
    return `<option value="">— Select —</option>${config.materials_used
      .map((o) => `<option value="${String(o).replace(/"/g, '&quot;')}">${o}</option>`)
      .join('')}`;
  }

  function mappingHtml(index) {
    return stages
      .map(
        (stage, s) => `
      <div class="lamination-mapping-stage">
        <h4 class="brr-subsection-title">${stage}</h4>
        <div class="form-group">
          <label>Picture *</label>
          <input type="file" name="lamination_${index}_mapping_${s}" class="form-control" accept="image/*" data-required="true" required>
        </div>
        <div class="form-group">
          <label>Comment *</label>
          <input type="text" name="lamination_${index}_mapping_comment_${s}" class="form-control" data-required="true" required>
        </div>
      </div>`
      )
      .join('');
  }

  function laminationHtml(index) {
    return `
      <h3 class="brr-lamination-heading">Lamination ${index + 1}</h3>
      <div class="form-row">
        <div class="form-group">
          <label>Ambient Temperature (°C) *</label>
          <input type="text" name="lamination_ambient_${index}" class="form-control" data-required="true" required>
        </div>
        <div class="form-group">
          <label>Relative Humidity (%) *</label>
          <input type="text" name="lamination_humidity_${index}" class="form-control" data-required="true" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Surface Temperature (°C) *</label>
          <input type="text" name="lamination_surface_${index}" class="form-control" data-required="true" required>
        </div>
        <div class="form-group">
          <label>Vacuum Pressure *</label>
          <input type="text" name="lamination_vacuum_${index}" class="form-control" data-required="true" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Heating Blanket Cure Time *</label>
          <input type="text" name="lamination_cure_time_${index}" class="form-control" data-required="true" required>
        </div>
        <div class="form-group">
          <label>Heating Blanket Temperature (°C) *</label>
          <input type="text" name="lamination_blanket_temp_${index}" class="form-control" data-required="true" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Lamination Size (mm) *</label>
          <input type="text" name="lamination_size_${index}" class="form-control" data-required="true" required>
        </div>
        <div class="form-group">
          <label>Materials Replaced *</label>
          <select name="lamination_materials_${index}" class="form-control" data-required="true" required>
            ${materialsOptions()}
          </select>
        </div>
      </div>
      <div class="lamination-mapping-grid">${mappingHtml(index)}</div>
      <button type="button" class="btn btn-outline btn-sm lamination-remove">Remove Lamination</button>`;
  }

  addBtn.addEventListener('click', () => {
    const index = container.querySelectorAll('.lamination-block').length;
    const block = document.createElement('div');
    block.className = 'lamination-block';
    block.innerHTML = laminationHtml(index);
    container.appendChild(block);
    block.querySelector('.lamination-remove').addEventListener('click', () => block.remove());
    if (window.SearchableSelect) SearchableSelect.init(block.querySelector('select'));
  });

  container.querySelectorAll('.lamination-remove').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('.lamination-block').remove());
  });
})();