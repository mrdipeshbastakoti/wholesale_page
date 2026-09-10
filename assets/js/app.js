const SUPABASE_URL = 'https://gqbyigliedexvjyxshkb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_KWzE2eqCE4FY-15N6E1k6g_ITE7zqHI';
const supa = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);
let beers = [], customers = [], orders = [], prepRows = [], activeFilter = 'all';
const flowStates = ['not_started','preparing','ready','out_for_delivery','delivered'];
const labels = {
  not_started:'Not started', preparing:'Preparing', ready:'Ready', out_for_delivery:'Out for delivery', delivered:'Delivered', on_hold:'On hold', cancelled:'Cancelled'
};

function esc(v=''){ return String(v).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.remove('hidden'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>t.classList.add('hidden'),2600); }
function statusTagClass(status){ return status==='ready' ? 'ready' : status==='out_for_delivery' ? 'delivery' : status==='on_hold' ? 'hold' : ''; }
function priorityClass(priority){ return priority==='urgent' ? 'urgent' : priority==='high' ? 'high' : ''; }

async function boot(){
  const { data:{ session } } = await supa.auth.getSession();
  if(session) await enter(session);
  else $('auth').classList.remove('hidden');
}

async function enter(session){
  $('auth').classList.add('hidden');
  $('app').classList.remove('hidden');
  const { data: allowed, error } = await supa.from('staff_allowlist').select('email,role,active').ilike('email', session.user.email).maybeSingle();
  if(error || !allowed || !allowed.active){
    $('blocked').classList.remove('hidden');
    $('main').classList.add('hidden');
    return;
  }
  $('blocked').classList.add('hidden');
  $('main').classList.remove('hidden');
  await loadAll();
  setupRealtime();
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim();
  const password = $('password').value;
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if(error) return toast(error.message);
  await enter(data.session);
});

$('logout').onclick = async () => { await supa.auth.signOut(); location.reload(); };
$('refresh').onclick = () => loadAll();

async function loadAll(){
  const [b,c,o,p] = await Promise.all([
    supa.from('beers').select('*').eq('active', true).order('name'),
    supa.from('customers').select('*').eq('active', true).order('name'),
    supa.from('orders').select('*, customers(name), order_items(*, beers(name))').neq('status','cancelled').order('delivery_date', { ascending:true, nullsFirst:false }),
    supa.from('active_preparation_summary').select('*').order('beer_name')
  ]);
  const bad = [b,c,o,p].find(x => x.error);
  if(bad) return toast(bad.error.message);
  beers = b.data || [];
  customers = c.data || [];
  orders = (o.data || []).sort((a,b) => ({urgent:0,high:1,normal:2,low:3}[a.priority] - {urgent:0,high:1,normal:2,low:3}[b.priority]) || String(a.delivery_date || '9999').localeCompare(String(b.delivery_date || '9999')));
  prepRows = p.data || [];
  fillCustomers();
  render();
}

function render(){
  const activeOrders = orders.filter(o => !['delivered','cancelled'].includes(o.status));
  const boxes = prepRows.reduce((n,x)=>n + (Number(x.boxes_to_prepare)||0), 0);
  const kegs = prepRows.reduce((n,x)=>n + (Number(x.kegs_to_prepare)||0), 0);
  const urgent = activeOrders.filter(o => o.priority === 'urgent').length;
  $('metrics').innerHTML = [
    ['📦', boxes, 'Boxes to prepare'],
    ['🛢️', kegs, 'Kegs to prepare'],
    ['🚚', activeOrders.length, 'Pending orders'],
    ['🔴', urgent, 'Urgent orders']
  ].map(x => `<div class="metric"><div>${x[0]}</div><div class="n">${x[1]}</div><div class="muted">${x[2]}</div></div>`).join('');

  const rows = prepRows.filter(x => (Number(x.boxes_to_prepare)||0) > 0 || (Number(x.kegs_to_prepare)||0) > 0);
  $('prep').innerHTML = rows.length ? `
    <table>
      <thead><tr><th>Beer</th><th>Boxes</th><th>Cans</th><th>Kegs</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td><b>${esc(r.beer_name)}</b></td><td>${Number(r.boxes_to_prepare)||0}</td><td>${Number(r.cans_to_prepare)||0}</td><td>${Number(r.kegs_to_prepare)||0}</td></tr>`).join('')}</tbody>
    </table>` : '<div class="empty">Nothing waiting to be prepared 🎉</div>';

  const filtered = activeOrders.filter(o => activeFilter === 'all' || (activeFilter === 'urgent' ? o.priority === 'urgent' : o.status === activeFilter));
  $('orders').innerHTML = filtered.length ? filtered.map(renderOrderCard).join('') : '<div class="empty">No orders in this view.</div>';
  bindOrderButtons();
}

function renderOrderCard(order){
  const items = (order.order_items || []).map(item => {
    if(item.package_type === 'can'){
      const perBox = item.cans_per_box || 12;
      const size = item.can_size_ml || 500;
      return `${esc(item.beers?.name || '')} — ${item.quantity} box${item.quantity > 1 ? 'es' : ''} (${perBox} × ${size}ml)`;
    }
    return `${esc(item.beers?.name || '')} — ${item.quantity} × ${item.keg_size_l || 20}L keg${item.quantity > 1 ? 's' : ''}`;
  }).join('<br>');

  return `<article class="order" data-id="${order.id}">
    <div class="order-top">
      <div>
        <div class="name">${esc(order.customers?.name || 'Customer')}</div>
        <div class="muted">#${order.order_number || ''}${order.delivery_date ? ' · ' + order.delivery_date : ''}</div>
      </div>
      <div class="tags">
        <span class="tag ${priorityClass(order.priority)}">${esc((order.priority || 'normal').toUpperCase())}</span>
        <span class="tag ${statusTagClass(order.status)}">${esc(labels[order.status] || order.status)}</span>
      </div>
    </div>
    <div class="items">${items || '<span class="muted">No items</span>'}</div>
    <div class="meta">
      <span>Payment: ${esc(order.payment_status || 'pending')}</span>
      ${order.delivery_method ? `<span>Method: ${esc(order.delivery_method)}</span>` : ''}
      ${order.assigned_to ? `<span>Assigned: ${esc(order.assigned_to)}</span>` : ''}
    </div>
    ${order.notes ? `<div class="muted" style="margin-top:8px">${esc(order.notes)}</div>` : ''}
    <div class="flow">
      ${flowStates.map(s => `<button type="button" data-action="status" data-status="${s}" class="${order.status === s ? 'on' : ''}">${labels[s]}</button>`).join('')}
      <button type="button" data-action="hold">On hold</button>
    </div>
    <div class="actions">
      <button type="button" class="btn secondary" data-action="edit">Edit</button>
      <button type="button" class="btn danger" data-action="delete">Delete</button>
    </div>
  </article>`;
}

function bindOrderButtons(){
  document.querySelectorAll('.order').forEach(card => {
    const id = card.dataset.id;
    card.querySelectorAll('[data-action="status"]').forEach(btn => btn.onclick = () => updateOrderStatus(id, btn.dataset.status));
    const holdBtn = card.querySelector('[data-action="hold"]');
    if(holdBtn) holdBtn.onclick = () => updateOrderStatus(id, 'on_hold');
    const editBtn = card.querySelector('[data-action="edit"]');
    if(editBtn) editBtn.onclick = () => openOrderDialog(id);
    const deleteBtn = card.querySelector('[data-action="delete"]');
    if(deleteBtn) deleteBtn.onclick = () => deleteOrder(id);
  });
}

async function updateOrderStatus(id, status){
  const patch = { status };
  if(status === 'delivered') patch.delivered_at = new Date().toISOString();
  const { error } = await supa.from('orders').update(patch).eq('id', id);
  if(error) return toast(error.message);
  toast('Status updated');
  await loadAll();
}

async function deleteOrder(id){
  if(!confirm('Delete this order?')) return;
  const { error } = await supa.from('orders').update({ status:'cancelled' }).eq('id', id);
  if(error) return toast(error.message);
  toast('Order removed');
  await loadAll();
}

function fillCustomers(selectedId=''){
  const options = ['<option value="">Choose customer</option>']
    .concat(customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`));
  $('customer').innerHTML = options.join('');
  if(selectedId) $('customer').value = selectedId;
}

function newItemRow(item){
  const wrap = document.createElement('div');
  wrap.className = 'item-row';
  wrap.innerHTML = `
    <label>Beer
      <select class="beer-select">${beers.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>
    </label>
    <label>Package
      <select class="package-select">
        <option value="can">Can / box</option>
        <option value="keg">Keg</option>
      </select>
    </label>
    <label>Qty
      <input class="qty-input" type="number" min="1" value="1">
    </label>
    <label class="size-label">Cans / box
      <input class="size-input" type="number" min="1" value="12">
    </label>
    <button type="button" class="x remove-row">✕</button>`;
  const pkg = wrap.querySelector('.package-select');
  const sizeLabel = wrap.querySelector('.size-label');
  const sizeInput = wrap.querySelector('.size-input');
  pkg.onchange = () => {
    if(pkg.value === 'keg'){
      sizeLabel.childNodes[0].textContent = 'Keg size L';
      sizeInput.value = 20;
    } else {
      sizeLabel.childNodes[0].textContent = 'Cans / box';
      sizeInput.value = 12;
    }
  };
  wrap.querySelector('.remove-row').onclick = () => wrap.remove();
  if(item){
    wrap.querySelector('.beer-select').value = item.beer_id;
    pkg.value = item.package_type;
    wrap.querySelector('.qty-input').value = item.quantity;
    sizeInput.value = item.package_type === 'can' ? (item.cans_per_box || 12) : (item.keg_size_l || 20);
    sizeLabel.childNodes[0].textContent = item.package_type === 'keg' ? 'Keg size L' : 'Cans / box';
  }
  return wrap;
}

function resetOrderForm(){
  $('editingId').value = '';
  $('dialogTitle').textContent = 'Create order';
  $('orderForm').reset();
  $('orderStatus').value = 'not_started';
  $('itemRows').innerHTML = '';
  $('itemRows').appendChild(newItemRow());
  fillCustomers();
}

function openOrderDialog(id){
  resetOrderForm();
  if(!id){
    $('orderDialog').showModal();
    return;
  }
  const order = orders.find(o => o.id === id);
  if(!order){ $('orderDialog').showModal(); return; }
  $('editingId').value = order.id;
  $('dialogTitle').textContent = 'Edit order';
  fillCustomers(order.customer_id);
  $('priority').value = order.priority || 'normal';
  $('deliveryDate').value = order.delivery_date || '';
  $('payment').value = order.payment_status || 'pending';
  $('deliveryMethod').value = order.delivery_method || '';
  $('assignedTo').value = order.assigned_to || '';
  $('orderStatus').value = order.status || 'not_started';
  $('notes').value = order.notes || '';
  $('itemRows').innerHTML = '';
  (order.order_items || []).forEach(item => $('itemRows').appendChild(newItemRow(item)));
  if(!(order.order_items || []).length) $('itemRows').appendChild(newItemRow());
  $('orderDialog').showModal();
}

$('newOrder').onclick = () => openOrderDialog();
$('closeDialog').onclick = () => $('orderDialog').close();
$('addItem').onclick = () => $('itemRows').appendChild(newItemRow());
$('openCustomer').onclick = () => $('customerDialog').showModal();
$('closeCustomer').onclick = () => $('customerDialog').close();

document.querySelectorAll('#chips .chip').forEach(btn => {
  btn.onclick = () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('#chips .chip').forEach(chip => chip.classList.toggle('on', chip === btn));
    render();
  };
});

$('customerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    name: $('customerName').value.trim(),
    contact_name: $('customerContact').value.trim() || null,
    phone: $('customerPhone').value.trim() || null,
    address: $('customerAddress').value.trim() || null,
    delivery_notes: $('customerNotes').value.trim() || null
  };
  const { data, error } = await supa.from('customers').insert(payload).select().single();
  if(error) return toast(error.message);
  customers.push(data);
  customers.sort((a,b) => a.name.localeCompare(b.name));
  fillCustomers(data.id);
  $('customerForm').reset();
  $('customerDialog').close();
  toast('Customer added');
});

$('orderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const editingId = $('editingId').value;
  const customerId = $('customer').value;
  if(!customerId) return toast('Choose a customer');
  const rows = [...document.querySelectorAll('#itemRows .item-row')];
  if(!rows.length) return toast('Add at least one beer item');
  const items = rows.map(row => {
    const packageType = row.querySelector('.package-select').value;
    const qty = Number(row.querySelector('.qty-input').value || 0);
    const sizeValue = Number(row.querySelector('.size-input').value || 0);
    const beerId = row.querySelector('.beer-select').value;
    const base = { beer_id: beerId, package_type: packageType, quantity: qty };
    return packageType === 'can'
      ? { ...base, can_size_ml: 500, cans_per_box: sizeValue, keg_size_l: null }
      : { ...base, can_size_ml: null, cans_per_box: null, keg_size_l: sizeValue };
  });
  if(items.some(i => !i.beer_id || !i.quantity || i.quantity < 1)) return toast('Check the beer item quantity');

  const payload = {
    customer_id: customerId,
    priority: $('priority').value,
    payment_status: $('payment').value,
    delivery_date: $('deliveryDate').value || null,
    delivery_method: $('deliveryMethod').value.trim() || null,
    assigned_to: $('assignedTo').value.trim() || null,
    notes: $('notes').value.trim() || null,
    status: $('orderStatus').value
  };

  if(editingId){
    const { error } = await supa.from('orders').update(payload).eq('id', editingId);
    if(error) return toast(error.message);
    const oldOrder = orders.find(o => o.id === editingId);
    if(oldOrder?.order_items?.length){
      const ids = oldOrder.order_items.map(x => x.id);
      const delRes = await supa.from('order_items').delete().in('id', ids);
      if(delRes.error) return toast(delRes.error.message);
    }
    const insertRes = await supa.from('order_items').insert(items.map(i => ({ ...i, order_id: editingId })));
    if(insertRes.error) return toast(insertRes.error.message);
    toast('Order updated');
  } else {
    const { data, error } = await supa.from('orders').insert(payload).select().single();
    if(error) return toast(error.message);
    const insertRes = await supa.from('order_items').insert(items.map(i => ({ ...i, order_id: data.id })));
    if(insertRes.error){
      await supa.from('orders').delete().eq('id', data.id);
      return toast(insertRes.error.message);
    }
    toast('Order created');
  }
  $('orderDialog').close();
  await loadAll();
});

let realtimeSetup = false;
function setupRealtime(){
  if(realtimeSetup) return;
  realtimeSetup = true;
  supa.channel('wildcat-wholesale-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'orders' }, () => loadAll())
    .on('postgres_changes', { event:'*', schema:'public', table:'order_items' }, () => loadAll())
    .on('postgres_changes', { event:'*', schema:'public', table:'customers' }, () => loadAll())
    .subscribe();
}

boot();