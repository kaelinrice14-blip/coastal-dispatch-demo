(function () {
  const startInput = document.getElementById('start_time');
  const endInput = document.getElementById('end_time');
  const totalInput = document.getElementById('total_hours');
  const dateInput = document.getElementById('entry_date');
  const formRefSelect = document.getElementById('submission_id');

  function calcHours() {
    if (!startInput || !endInput || !totalInput) return;
    const start = startInput.value;
    const end = endInput.value;
    if (!start || !end) {
      totalInput.value = '';
      return;
    }
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let startMins = sh * 60 + sm;
    let endMins = eh * 60 + em;
    if (endMins <= startMins) endMins += 24 * 60;
    const hours = Math.round(((endMins - startMins) / 60) * 100) / 100;
    totalInput.value = hours;
  }

  if (startInput) startInput.addEventListener('change', calcHours);
  if (endInput) endInput.addEventListener('change', calcHours);
  if (startInput) startInput.addEventListener('input', calcHours);
  if (endInput) endInput.addEventListener('input', calcHours);

  if (dateInput && formRefSelect) {
    dateInput.addEventListener('change', async () => {
      try {
        const res = await fetch(`/time/api/form-refs?date=${dateInput.value}`);
        const refs = await res.json();
        const current = formRefSelect.value;
        formRefSelect.innerHTML = '<option value="">— None —</option>';
        refs.forEach((ref) => {
          const opt = document.createElement('option');
          opt.value = ref.id;
          opt.textContent = ref.label;
          if (String(ref.id) === current) opt.selected = true;
          formRefSelect.appendChild(opt);
        });
      } catch (_e) { /* ignore */ }
    });
  }

  calcHours();
})();