(function () {
  const container = document.getElementById('damage-photo-rows');
  const addBtn = document.getElementById('add-damage-photo-btn');
  if (!container || !addBtn) return;

  let nextIndex = container.querySelectorAll('.damage-photo-row').length;

  function bindRemove(btn) {
    btn.addEventListener('click', () => {
      btn.closest('.damage-photo-row').remove();
    });
  }

  container.querySelectorAll('.damage-photo-remove').forEach(bindRemove);

  addBtn.addEventListener('click', () => {
    const index = nextIndex++;
    const row = document.createElement('div');
    row.className = 'damage-photo-row';
    row.innerHTML = `
      <div class="form-group">
        <label>Picture</label>
        <input type="file" name="damage_photo_${index}" class="form-control" accept="image/*">
      </div>
      <div class="form-group">
        <label>Photo Description (optional)</label>
        <input type="text" name="damage_photo_desc_${index}" class="form-control"
               placeholder="Describe this photo...">
      </div>
      <button type="button" class="btn btn-outline btn-sm damage-photo-remove">Remove</button>
    `;
    container.appendChild(row);
    bindRemove(row.querySelector('.damage-photo-remove'));
  });
})();