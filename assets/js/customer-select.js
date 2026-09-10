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
  function createPasswordDialog(){
    if (document.getElementById('passwordRecoveryDialog')) return document.getElementById('passwordRecoveryDialog');

    const dialog = document.createElement('dialog');
    dialog.id = 'passwordRecoveryDialog';
    dialog.innerHTML = `
      <div class="section-head">
        <div><div class="eyebrow">WILDCAT BREWING</div><h2>Set a new password</h2></div>
        <button id="closePasswordDialog" class="x" type="button">✕</button>
      </div>
      <p class="muted">Choose the password you want to use with the Staff ID <b>WildcatBrewing</b>.</p>
      <form id="passwordRecoveryForm" class="stack">
        <label>New password<input id="recoveryPassword" type="password" autocomplete="new-password" minlength="8" required></label>
        <label>Confirm password<input id="recoveryPasswordConfirm" type="password" autocomplete="new-password" minlength="8" required></label>
        <div id="recoveryMessage" class="muted"></div>
        <button class="btn primary" type="submit">Save new password</button>
      </form>`;
    document.body.appendChild(dialog);

    document.getElementById('closePasswordDialog').addEventListener('click', () => dialog.close());

    document.getElementById('passwordRecoveryForm').addEventListener('submit', async e => {
      e.preventDefault();
      const password = document.getElementById('recoveryPassword').value;
      const confirmPassword = document.getElementById('recoveryPasswordConfirm').value;
      const message = document.getElementById('recoveryMessage');
      const button = e.currentTarget.querySelector('button[type="submit"]');

      if (password.length < 8) {
        message.textContent = 'Use at least 8 characters.';
        return;
      }
      if (password !== confirmPassword) {
        message.textContent = 'The two passwords do not match.';
        return;
      }

      button.disabled = true;
      button.textContent = 'Saving…';
      message.textContent = '';

      const {error} = await supa.auth.updateUser({password});
      if (error) {
        message.textContent = error.message;
        button.disabled = false;
        button.textContent = 'Save new password';
        return;
      }

      message.textContent = 'Password changed successfully. Returning to sign in…';
      await supa.auth.signOut();
      setTimeout(() => {
        window.location.replace('https://mrdipeshbastakoti.github.io/wholesale_page/');
      }, 900);
    });

    return dialog;
  }

  function openPasswordDialog(){
    const dialog = createPasswordDialog();
    document.getElementById('recoveryPassword').value = '';
    document.getElementById('recoveryPasswordConfirm').value = '';
    document.getElementById('recoveryMessage').textContent = '';
    const saveButton = document.querySelector('#passwordRecoveryForm button[type="submit"]');
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Save new password';
    }
    if (!dialog.open) {
      try { dialog.showModal(); } catch (_) {}
    }
  }

  function addChangePasswordButton(){
    if (document.getElementById('changePassword')) return;
    const logout = document.getElementById('logout');
    if (!logout) return;
    const button = document.createElement('button');
    button.id = 'changePassword';
    button.type = 'button';
    button.className = 'btn secondary';
    button.textContent = 'Change password';
    button.addEventListener('click', openPasswordDialog);
    logout.parentNode.insertBefore(button, logout);
  }

  window.addEventListener('load', () => {
    addChangePasswordButton();

    const looksLikeRecovery = window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery');
    if (looksLikeRecovery) openPasswordDialog();

    supa.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') openPasswordDialog();
    });
  });
})();
