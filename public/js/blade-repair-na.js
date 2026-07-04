(function () {
  const form = document.getElementById('brr-form');
  if (!form) return;

  function setSectionState(sectionKey, isNa) {
    const section = form.querySelector(`.brr-section[data-section="${sectionKey}"]`);
    if (!section) return;
    section.classList.toggle('section-is-na', isNa);
    section.querySelectorAll('input, select, textarea, button').forEach((el) => {
      if (el.classList.contains('section-na-checkbox')) return;
      if (el.type === 'button' && el.id && el.id.startsWith('add-')) {
        el.disabled = isNa;
        return;
      }
      if (isNa) {
        el.removeAttribute('required');
        el.disabled = true;
      } else {
        el.disabled = false;
        if (el.dataset.required === 'true') el.setAttribute('required', 'required');
      }
    });
  }

  form.querySelectorAll('.section-na-checkbox').forEach((checkbox) => {
    const sectionKey = checkbox.dataset.section;
    setSectionState(sectionKey, checkbox.checked);
    checkbox.addEventListener('change', () => setSectionState(sectionKey, checkbox.checked));
  });
})();