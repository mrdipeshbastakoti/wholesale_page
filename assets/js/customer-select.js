(function(){
  const NEW_CUSTOMER_VALUE = '__new_customer__';
  let pendingCustomerName = '';
  let returnToOrder = false;
  let applying = false;

  function ensureNewCustomerOption(){
    const select = document.getElementById('customer');
    if (!select || applying) return;
    if (select.querySelector(`option[value="${NEW_CUSTOMER_VALUE}"]`)) return;

    applying = true;
    const option = document.createElement('option');
    option.value = NEW_CUSTOMER_VALUE;
    option.textContent = '＋ Add new customer';
    if (select.options.length > 0) select.insertBefore(option, select.options[1] || null);
    else select.appendChild(option);
    applying = false;
  }

  function reopenOrder(){
    if (!returnToOrder) return;
    const orderDialog = document.getElementById('orderDialog');
    if (orderDialog && !orderDialog.open) {
      try { orderDialog.showModal(); } catch (_) {}
    }
    returnToOrder = false;
  }

  function selectNewlyAddedCustomer(){
    if (!pendingCustomerName) return;
    const select = document.getElementById('customer');
    if (!select) return;

    const target = [...select.options].find(opt => opt.textContent.trim() === pendingCustomerName);
    if (target) {
      select.value = target.value;
      pendingCustomerName = '';
      setTimeout(reopenOrder, 50);
    }
  }

  window.addEventListener('load', () => {
    const select = document.getElementById('customer');
    const customerForm = document.getElementById('customerForm');
    const customerName = document.getElementById('customerName');
    const customerDialog = document.getElementById('customerDialog');
    const orderDialog = document.getElementById('orderDialog');
    const separateButton = document.getElementById('openCustomer');

    if (separateButton) separateButton.style.display = 'none';
    if (!select) return;

    ensureNewCustomerOption();

    select.addEventListener('change', () => {
      if (select.value !== NEW_CUSTOMER_VALUE) return;
      select.value = '';

      if (orderDialog?.open) {
        orderDialog.close();
        returnToOrder = true;
      }

      setTimeout(() => {
        if (typeof window.openCustomerDialog === 'function') {
          window.openCustomerDialog();
        } else if (customerDialog && !customerDialog.open) {
          customerDialog.showModal();
        }
      }, 50);
    });

    new MutationObserver(() => {
      ensureNewCustomerOption();
      selectNewlyAddedCustomer();
    }).observe(select, {childList:true});

    if (customerForm) {
      customerForm.addEventListener('submit', () => {
        pendingCustomerName = (customerName?.value || '').trim();
      });
    }

    customerDialog?.addEventListener('close', () => {
      if (returnToOrder && !pendingCustomerName) setTimeout(reopenOrder, 50);
    });
  });
})();

(function(){
  const PRIORITIES = [
    ['urgent','URGENT'],
    ['high','HIGH'],
    ['normal','NORMAL'],
    ['low','LOW']
  ];

  function addStyles(){
    if (document.getElementById('quickPriorityStyles')) return;
    const style = document.createElement('style');
    style.id = 'quickPriorityStyles';
    style.textContent = `
      .quick-priority{
        appearance:auto;
        -webkit-appearance:auto;
        cursor:pointer;
        font:inherit;
        font-size:12px;
        font-weight:900;
        letter-spacing:.04em;
        text-transform:uppercase;
        border-radius:999px;
        padding:7px 9px;
        min-width:96px;
        max-width:118px;
      }
      .quick-priority:disabled{opacity:.6;cursor:wait}
      .quick-priority.urgent{font-weight:900}
      @media(max-width:760px){
        .quick-priority{min-width:92px;max-width:112px;padding:7px 8px}
      }
    `;
    document.head.appendChild(style);
  }

  function setPriorityClass(select,value){
    select.classList.remove('urgent','high');
    if (value === 'urgent') select.classList.add('urgent');
    if (value === 'high') select.classList.add('high');
  }

  function enhancePriority(root=document){
    root.querySelectorAll('.order').forEach(card => {
      if (card.querySelector('.quick-priority')) return;
      const tags = card.querySelector('.tags');
      if (!tags) return;
      const currentTag = tags.querySelector('.tag');
      if (!currentTag) return;

      const current = currentTag.textContent.trim().toLowerCase();
      if (!PRIORITIES.some(([value]) => value === current)) return;

      const select = document.createElement('select');
      select.className = 'tag quick-priority';
      select.setAttribute('aria-label','Order priority');
      select.title = 'Change priority';

      PRIORITIES.forEach(([value,label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      });

      select.value = current;
      setPriorityClass(select,current);

      select.addEventListener('change', async () => {
        const previous = current;
        const next = select.value;
        setPriorityClass(select,next);
        select.disabled = true;

        const {error} = await supa.from('orders').update({priority:next}).eq('id',card.dataset.id);
        if (error) {
          select.value = previous;
          setPriorityClass(select,previous);
          select.disabled = false;
          if (typeof toast === 'function') toast(error.message);
          return;
        }

        if (typeof toast === 'function') {
          toast(`Priority changed to ${next.charAt(0).toUpperCase() + next.slice(1)}`);
        }
        if (typeof loadAll === 'function') await loadAll();
      });

      currentTag.replaceWith(select);
    });
  }

  window.addEventListener('load', () => {
    addStyles();
    enhancePriority();

    ['orders','priorityOrders'].forEach(id => {
      const target = document.getElementById(id);
      if (!target) return;
      new MutationObserver(() => enhancePriority(target)).observe(target,{childList:true,subtree:true});
    });
  });
})();
