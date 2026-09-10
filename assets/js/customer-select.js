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
