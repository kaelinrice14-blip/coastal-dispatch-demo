(function () {
  const container = document.getElementById('fields-container');
  const addBtn = document.getElementById('add-field-btn');
  const form = document.getElementById('form-editor');
  const fieldsInput = document.getElementById('fields_json');

  if (!container || !form) return;

  let fields = (window.INITIAL_FIELDS || []).map((f) => ({
    field_key: f.field_key,
    label: f.label,
    field_type: f.field_type,
    required: !!f.required,
    placeholder: f.placeholder || '',
    options: f.options_json
      ? (function () {
          try {
            return JSON.parse(f.options_json).join(', ');
          } catch {
            return f.options_json;
          }
        })()
      : '',
  }));

  function typeOptions(selected) {
    return window.FIELD_TYPES.map(
      (t) =>
        `<option value="${t.value}" ${t.value === selected ? 'selected' : ''}>${t.label}</option>`
    ).join('');
  }

  function render() {
    if (fields.length === 0) {
      container.innerHTML =
        '<p class="empty-fields">No fields yet. Click "Add Field" to get started.</p>';
      return;
    }

    container.innerHTML = fields
      .map(
        (field, index) => `
      <div class="field-builder-row" data-index="${index}">
        <div class="field-builder-handle" title="Drag to reorder">⠿</div>
        <div class="field-builder-body">
          <div class="form-row">
            <div class="form-group">
              <label>Field Label *</label>
              <input type="text" class="form-control field-label" value="${escapeAttr(field.label)}" placeholder="e.g. Job Site Address">
            </div>
            <div class="form-group">
              <label>Field Type</label>
              <select class="form-control field-type">${typeOptions(field.field_type)}</select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Placeholder</label>
              <input type="text" class="form-control field-placeholder" value="${escapeAttr(field.placeholder)}" placeholder="Optional hint text">
            </div>
            <div class="form-group field-options-group ${field.field_type === 'dropdown' ? '' : 'hidden'}">
              <label>Dropdown Options (comma-separated)</label>
              <input type="text" class="form-control field-options" value="${escapeAttr(field.options)}" placeholder="Option A, Option B, Option C">
            </div>
          </div>
          <div class="field-builder-footer">
            <label class="checkbox-label">
              <input type="checkbox" class="field-required" ${field.required ? 'checked' : ''}> Required
            </label>
            <button type="button" class="btn btn-outline btn-sm field-remove">Remove</button>
          </div>
        </div>
      </div>`
      )
      .join('');

    bindRowEvents();
    if (window.SearchableSelect) SearchableSelect.initAll(container);
  }

  function escapeAttr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function syncFromDom() {
    const rows = container.querySelectorAll('.field-builder-row');
    fields = Array.from(rows).map((row) => ({
      label: row.querySelector('.field-label').value.trim(),
      field_type: row.querySelector('.field-type').value,
      placeholder: row.querySelector('.field-placeholder').value.trim(),
      options: row.querySelector('.field-options')?.value.trim() || '',
      required: row.querySelector('.field-required').checked,
    }));
  }

  function bindRowEvents() {
    container.querySelectorAll('.field-type').forEach((select) => {
      select.addEventListener('change', (e) => {
        const row = e.target.closest('.field-builder-row');
        const optionsGroup = row.querySelector('.field-options-group');
        optionsGroup.classList.toggle('hidden', e.target.value !== 'dropdown');
      });
    });

    container.querySelectorAll('.field-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncFromDom();
        const index = parseInt(btn.closest('.field-builder-row').dataset.index, 10);
        fields.splice(index, 1);
        render();
      });
    });
  }

  addBtn.addEventListener('click', () => {
    syncFromDom();
    fields.push({
      label: '',
      field_type: 'text',
      required: false,
      placeholder: '',
      options: '',
    });
    render();
    const lastLabel = container.querySelector('.field-builder-row:last-child .field-label');
    if (lastLabel) lastLabel.focus();
  });

  form.addEventListener('submit', (e) => {
    syncFromDom();
    const valid = fields.filter((f) => f.label.trim());
    if (valid.length === 0) {
      e.preventDefault();
      alert('Add at least one field with a label.');
      return;
    }
    fieldsInput.value = JSON.stringify(valid);
  });

  render();
})();