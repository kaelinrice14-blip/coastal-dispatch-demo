(function () {
  const ENHANCED = 'searchable-select-enhanced';

  function closeAll() {
    document.querySelectorAll('.searchable-select.is-open').forEach((wrapper) => {
      wrapper.classList.remove('is-open');
      const trigger = wrapper.querySelector('.searchable-select-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function destroy(select) {
    const api = select._searchableSelect;
    if (!api) return;
    api.observer.disconnect();
    select.classList.remove(ENHANCED, 'searchable-select-native');
    api.wrapper.replaceWith(select);
    delete select._searchableSelect;
  }

  function init(select) {
    if (!select || select.classList.contains(ENHANCED)) return select;

    select.classList.add(ENHANCED);

    const wrapper = document.createElement('div');
    wrapper.className = 'searchable-select';
    if (select.disabled) wrapper.classList.add('is-disabled');

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    select.classList.add('searchable-select-native');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'searchable-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const chevron = document.createElement('span');
    chevron.className = 'searchable-select-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▾';
    trigger.appendChild(chevron);

    const dropdown = document.createElement('div');
    dropdown.className = 'searchable-select-dropdown';

    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'searchable-select-search';
    search.placeholder = 'Search...';
    search.setAttribute('autocomplete', 'off');
    search.setAttribute('aria-label', 'Search options');

    const list = document.createElement('ul');
    list.className = 'searchable-select-list';
    list.setAttribute('role', 'listbox');

    dropdown.appendChild(search);
    dropdown.appendChild(list);
    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);

    let activeIndex = -1;

    function selectedLabel() {
      const opt = select.options[select.selectedIndex];
      if (opt && opt.value) return opt.textContent;
      const placeholder = Array.from(select.options).find((o) => !o.value);
      return placeholder ? placeholder.textContent : 'Select...';
    }

    function updateTrigger() {
      const label = selectedLabel();
      while (trigger.firstChild && trigger.firstChild !== chevron) {
        trigger.removeChild(trigger.firstChild);
      }
      trigger.insertBefore(document.createTextNode(label), chevron);
      trigger.classList.toggle('is-placeholder', !select.value);
    }

    function setActive(index) {
      const items = list.querySelectorAll('.searchable-select-option:not(.is-disabled)');
      if (!items.length) {
        activeIndex = -1;
        return;
      }
      activeIndex = Math.max(0, Math.min(index, items.length - 1));
      items.forEach((item, i) => item.classList.toggle('is-active', i === activeIndex));
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function buildList(filter) {
      const query = (filter || '').toLowerCase().trim();
      list.innerHTML = '';
      activeIndex = -1;

      const matches = [];
      Array.from(select.options).forEach((opt) => {
        const label = opt.textContent;
        const haystack = `${label} ${opt.value}`.toLowerCase();
        if (query && !haystack.includes(query)) return;

        const li = document.createElement('li');
        li.className = 'searchable-select-option';
        li.textContent = label;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', opt.value === select.value ? 'true' : 'false');

        if (opt.disabled) li.classList.add('is-disabled');
        if (opt.value === select.value) li.classList.add('is-selected');

        if (!opt.disabled) {
          li.addEventListener('mousedown', (e) => e.preventDefault());
          li.addEventListener('click', () => {
            select.value = opt.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            updateTrigger();
            close();
          });
        }

        list.appendChild(li);
        matches.push(li);
      });

      if (!matches.length) {
        const empty = document.createElement('li');
        empty.className = 'searchable-select-empty';
        empty.textContent = 'No matches found';
        list.appendChild(empty);
        return;
      }

      const selectedIdx = matches.findIndex((li) => li.classList.contains('is-selected'));
      setActive(selectedIdx >= 0 ? selectedIdx : 0);
    }

    function open() {
      if (select.disabled) return;
      closeAll();
      wrapper.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      search.value = '';
      buildList();
      search.focus();
    }

    function close() {
      wrapper.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      search.value = '';
    }

    function selectActive() {
      const items = list.querySelectorAll('.searchable-select-option:not(.is-disabled)');
      if (activeIndex < 0 || !items[activeIndex]) return;
      items[activeIndex].click();
    }

    function handleKeydown(e) {
      const items = list.querySelectorAll('.searchable-select-option:not(.is-disabled)');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(activeIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectActive();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
        trigger.focus();
      } else if (e.key === 'Tab') {
        close();
      }
    }

    trigger.addEventListener('click', () => {
      if (wrapper.classList.contains('is-open')) close();
      else open();
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!wrapper.classList.contains('is-open')) open();
      }
    });

    search.addEventListener('input', () => buildList(search.value));
    search.addEventListener('keydown', handleKeydown);

    const observer = new MutationObserver(() => {
      wrapper.classList.toggle('is-disabled', select.disabled);
      updateTrigger();
      if (wrapper.classList.contains('is-open')) buildList(search.value);
    });
    observer.observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['selected', 'disabled'],
    });

    select.addEventListener('change', updateTrigger);

    select._searchableSelect = {
      wrapper,
      observer,
      refresh: () => {
        updateTrigger();
        if (wrapper.classList.contains('is-open')) buildList(search.value);
      },
      destroy: () => destroy(select),
    };

    updateTrigger();
    return select;
  }

  function initAll(root) {
    const scope = root || document;
    scope.querySelectorAll(`select.form-control:not(.${ENHANCED})`).forEach(init);
  }

  function refresh(select) {
    if (select?._searchableSelect) select._searchableSelect.refresh();
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.searchable-select')) closeAll();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });

  window.SearchableSelect = { init, initAll, refresh, destroy };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAll());
  } else {
    initAll();
  }
})();