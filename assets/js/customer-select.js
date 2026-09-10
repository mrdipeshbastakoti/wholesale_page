(function(){
  const NEW_CUSTOMER_VALUE = '__new_customer__';
  let pendingCustomerName = '';
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

  function selectNewlyAddedCustomer(){
    if (!pendingCustomerName) return;
    const select = document.getElementById('customer');
    if (!select) return;

    const target = [...select.options].find(opt => opt.textContent.trim() === pendingCustomerName);
    if (target) {
      select.value = target.value;
      pendingCustomerName = '';
    }
  }

  window.addEventListener('load', () => {
    const select = document.getElementById('customer');
    const customerForm = document.getElementById('customerForm');
    const customerName = document.getElementById('customerName');
    const separateButton = document.getElementById('openCustomer');

    if (separateButton) separateButton.style.display = 'none';
    if (!select) return;

    ensureNewCustomerOption();

    select.addEventListener('change', () => {
      if (select.value !== NEW_CUSTOMER_VALUE) return;
      select.value = '';
      if (typeof window.openCustomerDialog === 'function') {
        window.openCustomerDialog();
      } else {
        const dialog = document.getElementById('customerDialog');
        if (dialog && !dialog.open) dialog.showModal();
      }
    });

    new MutationObserver(() => {
      ensureNewCustomerOption();
      selectNewlyAddedCustomer();
    }).observe(select, {childList:true});

    if (customerForm) {
      customerForm.addEventListener('submit', () => {
        pendingCustomerName = (customerName?.value || '').trim();
        setTimeout(() => {
          ensureNewCustomerOption();
          selectNewlyAddedCustomer();
        }, 700);
      });
    }
  });
})();
