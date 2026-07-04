(function () {
  function setupAddButton(btnId, containerId, prefix, withDesc) {
    const addBtn = document.getElementById(btnId);
    const container = document.getElementById(containerId);
    if (!addBtn || !container) return;

    let nextIndex = container.querySelectorAll('.dynamic-photo-row').length;

    addBtn.addEventListener('click', () => {
      const index = nextIndex++;
      const row = document.createElement('div');
      row.className = 'dynamic-photo-row';
      row.innerHTML = withDesc
        ? `<div class="form-group">
             <label>Picture</label>
             <input type="file" name="${prefix}_${index}" class="form-control" accept="image/*">
           </div>
           <div class="form-group">
             <label>Comment (optional)</label>
             <input type="text" name="${prefix}_desc_${index}" class="form-control" placeholder="Describe this photo...">
           </div>
           <button type="button" class="btn btn-outline btn-sm dynamic-photo-remove">Remove</button>`
        : `<div class="form-group">
             <label>Picture</label>
             <input type="file" name="${prefix}_${index}" class="form-control" accept="image/*">
           </div>
           <button type="button" class="btn btn-outline btn-sm dynamic-photo-remove">Remove</button>`;
      container.appendChild(row);
      row.querySelector('.dynamic-photo-remove').addEventListener('click', () => row.remove());
    });

    container.querySelectorAll('.dynamic-photo-remove').forEach((btn) => {
      btn.addEventListener('click', () => btn.closest('.dynamic-photo-row').remove());
    });
  }

  setupAddButton('add-initial-damage-btn', 'initial-damage-rows', 'initial_damage', true);
  setupAddButton('add-filler-photo-btn', 'filler-photo-rows', 'filler_photo', false);
  setupAddButton('add-paint-photo-btn', 'paint-photo-rows', 'paint_photo', false);
})();