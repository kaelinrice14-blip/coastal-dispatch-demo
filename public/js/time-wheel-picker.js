(function () {
  const MINUTES = ['00', '15', '30', '45'];
  const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const ITEM_HEIGHT = 40;
  const VISIBLE_ITEMS = 5;
  const PADDING_ITEMS = Math.floor(VISIBLE_ITEMS / 2);

  function parseTime(value) {
    if (!value) return { hour: '08', minute: '00' };
    const timePart = value.includes('T') ? value.split('T')[1] : value;
    const [h, m] = (timePart || '').split(':');
    const hour = HOURS.includes(h) ? h : '08';
    let minute = MINUTES.includes(m) ? m : '00';
    if (m && !MINUTES.includes(m)) {
      const mn = parseInt(m, 10);
      minute = MINUTES[Math.min(3, Math.round(mn / 15))];
    }
    return { hour, minute };
  }

  function buildColumn(values, selected) {
    const col = document.createElement('div');
    col.className = 'time-wheel-column';
    for (let i = 0; i < PADDING_ITEMS; i++) {
      col.appendChild(document.createElement('div')).className = 'time-wheel-spacer';
    }
    values.forEach((val) => {
      const item = document.createElement('div');
      item.className = 'time-wheel-item' + (val === selected ? ' selected' : '');
      item.dataset.value = val;
      item.textContent = val;
      col.appendChild(item);
    });
    for (let i = 0; i < PADDING_ITEMS; i++) {
      col.appendChild(document.createElement('div')).className = 'time-wheel-spacer';
    }
    return col;
  }

  function getSelectedValue(col) {
    const center = col.scrollTop + col.clientHeight / 2;
    let closest = null;
    let closestDist = Infinity;
    col.querySelectorAll('.time-wheel-item').forEach((item) => {
      const itemCenter = item.offsetTop + ITEM_HEIGHT / 2;
      const dist = Math.abs(center - itemCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closest = item;
      }
    });
    return closest ? closest.dataset.value : null;
  }

  function scrollToValue(col, value) {
    const item = col.querySelector(`.time-wheel-item[data-value="${value}"]`);
    if (item) {
      col.scrollTop = item.offsetTop - col.clientHeight / 2 + ITEM_HEIGHT / 2;
    }
  }

  function initPicker(container) {
    const hidden = container.querySelector('input[type="hidden"]');
    if (!hidden) return;

    const initial = parseTime(hidden.value);
    const mask = document.createElement('div');
    mask.className = 'time-wheel-mask';

    const columns = document.createElement('div');
    columns.className = 'time-wheel-columns';

    const hourCol = buildColumn(HOURS, initial.hour);
    const minuteCol = buildColumn(MINUTES, initial.minute);

    columns.appendChild(hourCol);
    const colon = document.createElement('span');
    colon.className = 'time-wheel-colon';
    colon.textContent = ':';
    columns.appendChild(colon);
    columns.appendChild(minuteCol);

    const highlight = document.createElement('div');
    highlight.className = 'time-wheel-highlight';

    mask.appendChild(columns);
    mask.appendChild(highlight);
    container.insertBefore(mask, hidden);

    function updateHidden() {
      const hour = getSelectedValue(hourCol);
      const minute = getSelectedValue(minuteCol);
      if (hour && minute) {
        hidden.value = `${hour}:${minute}`;
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      }
      hourCol.querySelectorAll('.time-wheel-item').forEach((el) => {
        el.classList.toggle('selected', el.dataset.value === hour);
      });
      minuteCol.querySelectorAll('.time-wheel-item').forEach((el) => {
        el.classList.toggle('selected', el.dataset.value === minute);
      });
    }

    let scrollTimer;
    function onScroll() {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        [hourCol, minuteCol].forEach((col) => {
          const val = getSelectedValue(col);
          const item = col.querySelector(`.time-wheel-item[data-value="${val}"]`);
          if (item) {
            col.scrollTo({ top: item.offsetTop - col.clientHeight / 2 + ITEM_HEIGHT / 2, behavior: 'smooth' });
          }
        });
        setTimeout(updateHidden, 150);
      }, 80);
    }

    hourCol.addEventListener('scroll', onScroll);
    minuteCol.addEventListener('scroll', onScroll);

    hourCol.querySelectorAll('.time-wheel-item').forEach((item) => {
      item.addEventListener('click', () => {
        scrollToValue(hourCol, item.dataset.value);
        updateHidden();
      });
    });
    minuteCol.querySelectorAll('.time-wheel-item').forEach((item) => {
      item.addEventListener('click', () => {
        scrollToValue(minuteCol, item.dataset.value);
        updateHidden();
      });
    });

    requestAnimationFrame(() => {
      scrollToValue(hourCol, initial.hour);
      scrollToValue(minuteCol, initial.minute);
      updateHidden();
    });
  }

  function initDateTimeGroup(group) {
    const dateInput = group.querySelector('input[type="date"]');
    const hidden = group.querySelector('input[type="hidden"].datetime-combined');
    const picker = group.querySelector('.time-wheel-picker');
    if (!dateInput || !hidden || !picker) return;

    const timeHidden = picker.querySelector('input[type="hidden"]');

    function combine() {
      if (dateInput.value && timeHidden.value) {
        hidden.value = `${dateInput.value}T${timeHidden.value}`;
      }
    }

    dateInput.addEventListener('change', combine);
    timeHidden.addEventListener('change', combine);
    combine();
  }

  document.querySelectorAll('.time-wheel-picker').forEach(initPicker);
  document.querySelectorAll('.datetime-wheel-group').forEach(initDateTimeGroup);
})();