const SUPABASE_URL = 'https://gqbyigliedexvjyxshkb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_KWzE2eqCE4FY-15N6E1k6g_ITE7zqHI';
const supa = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

let allBeers = [];
let beers = [];
let customers = [];
let orders = [];
let prepRows = [];
let activeFilter = 'all';
let orderSearch = '';
let deliveredSearch = '';
let customerSearch = '';
let salesPeriod = 'all';
let realtimeSetup = false;
let returnToOrderAfterBeer = false;

const flowStates = ['not_started','preparing','ready','out_for_delivery','delivered'];
const labels = {
  not_started:'Not started', preparing:'Preparing', ready:'Ready', out_for_delivery:'Out for delivery',
  delivered:'Delivered', on_hold:'On hold', cancelled:'Cancelled'
};

function esc(v='') {
  return String(v).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => t.classList.add('hidden'), 2600);
}
function compactNumber(v) { return new Intl.NumberFormat('en-US').format(Number(v || 0)); }
function priorityRank(p) { return ({urgent:0,high:1,normal:2,low:3}[p] ?? 9); }
function priorityClass(p) { return p === 'urgent' ? 'urgent' : p === 'high' ? 'high' : ''; }
function statusTagClass(s) { return s === 'ready' ? 'ready' : s === 'out_for_delivery' ? 'delivery' : s === 'on_hold' ? 'hold' : ''; }
function orderDate(o) { return o.delivered_at || o.delivery_date || o.order_date || o.created_at; }
function todayISO() { return new Date().toISOString().slice(0,10); }
function matchesOrderSearch(o, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (o.customers?.name || '').toLowerCase().includes(s)
    || (o.order_items || []).some(i => (i.beers?.name || '').toLowerCase().includes(s))
    || String(o.order_number || '').includes(s);
}

function switchPage(page) {
  document.querySelectorAll('.app-page').forEach(s => s.classList.toggle('active', s.id === `page-${page}`));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchPage(btn.dataset.page)));
document.querySelectorAll('.js-go-orders').forEach(btn => btn.addEventListener('click', () => switchPage('orders')));

async function boot() {
  const {data:{session}} = await supa.auth.getSession();
  if (session) await enter(session);
  else $('auth').classList.remove('hidden');
}

async function enter(session) {
  $('auth').classList.add('hidden');
  $('app').classList.remove('hidden');
  const {data:allowed,error} = await supa.from('staff_allowlist').select('email,role,active').ilike('email', session.user.email).maybeSingle();
  if (error || !allowed || !allowed.active) {
    $('blocked').classList.remove('hidden');
    $('main').classList.add('hidden');
    return;
  }
  $('blocked').classList.add('hidden');
  $('main').classList.remove('hidden');
  await loadAll();
  setupRealtime();
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const {data,error} = await supa.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
  if (error) return toast(error.message);
  await enter(data.session);
});
$('logout').onclick = async () => { await supa.auth.signOut(); location.reload(); };
$('refresh').onclick = loadAll;

async function loadAll() {
  const [b,c,o,p] = await Promise.all([
    supa.from('beers').select('*').order('active',{ascending:false}).order('name'),
    supa.from('customers').select('*').eq('active',true).order('name'),
    supa.from('orders').select('*, customers(name), order_items(*, beers(name))').neq('status','cancelled').order('created_at',{ascending:false}),
    supa.from('active_preparation_summary').select('*').order('beer_name')
  ]);
  const bad = [b,c,o,p].find(x => x.error);
  if (bad) return toast(bad.error.message);
  allBeers = b.data || [];
  beers = allBeers.filter(x => x.active);
  customers = c.data || [];
  orders = (o.data || []).sort((a,b) => priorityRank(a.priority) - priorityRank(b.priority) || String(a.delivery_date || '9999').localeCompare(String(b.delivery_date || '9999')));
  prepRows = p.data || [];
  fillCustomers();
  renderAll();
}

function renderAll() {
  renderOverview();
  renderOrders();
  renderDelivered();
  renderSales();
  renderBeers();
  renderCustomers();
}

function renderOverview() {
  const active = orders.filter(o => !['delivered','cancelled'].includes(o.status));
  const boxes = prepRows.reduce((n,x) => n + (Number(x.boxes_to_prepare) || 0), 0);
  const kegs = prepRows.reduce((n,x) => n + (Number(x.kegs_to_prepare) || 0), 0);
  const urgent = active.filter(o => o.priority === 'urgent').length;
  $('metrics').innerHTML = [
    ['📦',boxes,'Boxes to prepare'],['🛢️',kegs,'Kegs to prepare'],['🚚',active.length,'Pending orders'],['🔴',urgent,'Urgent orders']
  ].map(x => `<div class="metric"><div>${x[0]}</div><div class="n">${compactNumber(x[1])}</div><div class="muted">${x[2]}</div></div>`).join('');

  const rows = prepRows.filter(x => Number(x.boxes_to_prepare || 0) || Number(x.kegs_to_prepare || 0));
  $('prep').innerHTML = rows.length ? `<table><thead><tr><th>Beer</th><th>Boxes</th><th>Cans</th><th>Kegs</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.beer_name)}</b></td><td>${compactNumber(r.boxes_to_prepare)}</td><td>${compactNumber(r.cans_to_prepare)}</td><td>${compactNumber(r.kegs_to_prepare)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nothing waiting to be prepared 🎉</div>';

  const priority = active.slice(0,5);
  $('priorityOrders').innerHTML = priority.length ? priority.map(o => renderOrderCard(o,'active')).join('') : '<div class="empty">No active orders.</div>';
  bindOrderButtons($('priorityOrders'));
}

function renderOrders() {
  let list = orders.filter(o => !['delivered','cancelled'].includes(o.status));
  if (activeFilter !== 'all') {
    list = list.filter(o => activeFilter === 'urgent' ? o.priority === 'urgent' : o.status === activeFilter);
  }
  list = list.filter(o => matchesOrderSearch(o, orderSearch));
  $('orders').innerHTML = list.length ? list.map(o => renderOrderCard(o,'active')).join('') : '<div class="empty">No matching active orders.</div>';
  bindOrderButtons($('orders'));
}

function renderDelivered() {
  let list = orders.filter(o => o.status === 'delivered').filter(o => matchesOrderSearch(o, deliveredSearch));
  list = [...list].sort((a,b) => new Date(orderDate(b)) - new Date(orderDate(a)));
  $('deliveredCount').textContent = `${list.length} delivered order${list.length === 1 ? '' : 's'}`;
  $('deliveredOrders').innerHTML = list.length ? list.map(o => renderOrderCard(o,'delivered')).join('') : '<div class="empty">No delivered orders yet.</div>';
  bindOrderButtons($('deliveredOrders'));
}

function renderOrderCard(order, mode='active') {
  const items = (order.order_items || []).map(item => {
    if (item.package_type === 'can') {
      const perBox = item.cans_per_box || 12;
      const size = item.can_size_ml || 500;
      return `${esc(item.beers?.name || 'Beer')} — ${item.quantity} box${item.quantity > 1 ? 'es' : ''} (${perBox} × ${size}ml)`;
    }
    return `${esc(item.beers?.name || 'Beer')} — ${item.quantity} × ${item.keg_size_l || 20}L keg${item.quantity > 1 ? 's' : ''}`;
  }).join('<br>');

  const workflow = mode === 'delivered'
    ? `<div class="flow"><button type="button" data-action="status" data-status="not_started">Move back to active</button></div>`
    : `<div class="flow">${flowStates.map(s => `<button type="button" data-action="status" data-status="${s}" class="${order.status === s ? 'on' : ''}">${labels[s]}</button>`).join('')}<button type="button" data-action="hold" class="${order.status === 'on_hold' ? 'on' : ''}">On hold</button></div>`;

  const actions = mode === 'delivered'
    ? `<div class="actions"><button type="button" class="btn secondary" data-action="edit">Edit</button></div>`
    : `<div class="actions"><button type="button" class="btn secondary" data-action="edit">Edit</button><button type="button" class="btn danger" data-action="delete">Delete</button></div>`;

  return `<article class="order" data-id="${order.id}">
    <div class="order-top"><div><div class="name">${esc(order.customers?.name || 'Customer')}</div><div class="muted">#${order.order_number || ''}${order.delivery_date ? ' · ' + order.delivery_date : ''}</div></div><div class="tags"><span class="tag ${priorityClass(order.priority)}">${esc((order.priority || 'normal').toUpperCase())}</span><span class="tag ${statusTagClass(order.status)}">${esc(labels[order.status] || order.status)}</span></div></div>
    <div class="items">${items || '<span class="muted">No beer items</span>'}</div>
    <div class="meta">${order.delivery_method ? `<span>Delivery: ${esc(order.delivery_method)}</span>` : ''}${order.status === 'delivered' && order.delivered_at ? `<span>Delivered: ${String(order.delivered_at).slice(0,10)}</span>` : ''}</div>
    ${order.notes ? `<div class="muted" style="margin-top:8px">${esc(order.notes)}</div>` : ''}
    ${workflow}
    ${actions}
  </article>`;
}

function bindOrderButtons(root) {
  root.querySelectorAll('.order').forEach(card => {
    const id = card.dataset.id;
    card.querySelectorAll('[data-action="status"]').forEach(btn => btn.onclick = () => updateOrderStatus(id, btn.dataset.status));
    card.querySelector('[data-action="hold"]')?.addEventListener('click', () => updateOrderStatus(id,'on_hold'));
    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => openOrderDialog(id));
    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteOrder(id));
  });
}

async function updateOrderStatus(id,status) {
  const order = orders.find(o => o.id === id);
  if (!order) return;
  const customer = order.customers?.name || 'this customer';

  if (status === 'delivered' && order.status !== 'delivered') {
    const ok = confirm(`Are you sure order #${order.order_number || ''} for ${customer} has been delivered?\n\nIt will be moved out of Active Orders and saved under Delivered.`);
    if (!ok) return;
  }
  if (order.status === 'delivered' && status !== 'delivered') {
    const ok = confirm(`Are you sure you want to move order #${order.order_number || ''} back to Active Orders?`);
    if (!ok) return;
  }

  const {error} = await supa.from('orders').update({status}).eq('id',id);
  if (error) return toast(error.message);
  toast(status === 'delivered' ? 'Order moved to Delivered' : order.status === 'delivered' ? 'Order moved back to Active' : 'Status updated');
  await loadAll();
}

async function deleteOrder(id) {
  const order = orders.find(o => o.id === id);
  const customer = order?.customers?.name || 'this customer';
  if (!confirm(`Are you sure you want to remove order #${order?.order_number || ''} for ${customer}?\n\nIt will be kept in the database as cancelled.`)) return;
  const {error} = await supa.from('orders').update({status:'cancelled'}).eq('id',id);
  if (error) return toast(error.message);
  toast('Order removed');
  await loadAll();
}

function periodOrders() {
  const delivered = orders.filter(o => o.status === 'delivered');
  if (salesPeriod === 'all') return delivered;
  const now = new Date();
  let start;
  if (salesPeriod === 'month') start = new Date(now.getFullYear(),now.getMonth(),1);
  if (salesPeriod === '30') start = new Date(now.getTime() - 30 * 86400000);
  if (salesPeriod === 'year') start = new Date(now.getFullYear(),0,1);
  return delivered.filter(o => new Date(orderDate(o)) >= start);
}

function summarizeOrder(order) {
  let boxes=0,cans=0,kegs=0,liters=0;
  (order.order_items || []).forEach(i => {
    const qty = Number(i.quantity || 0);
    if (i.package_type === 'can') {
      const perBox = Number(i.cans_per_box || 12);
      const size = Number(i.can_size_ml || 500);
      boxes += qty;
      cans += qty * perBox;
      liters += qty * perBox * size / 1000;
    } else {
      const size = Number(i.keg_size_l || 20);
      kegs += qty;
      liters += qty * size;
    }
  });
  return {boxes,cans,kegs,liters};
}

function renderSales() {
  const sold = periodOrders();
  let boxes=0,cans=0,kegs=0,liters=0;
  const beerMap = new Map();
  const customerMap = new Map();

  sold.forEach(order => {
    const custName = order.customers?.name || 'Unknown';
    const cust = customerMap.get(custName) || {name:custName,orders:0,boxes:0,kegs:0,liters:0};
    cust.orders += 1;
    (order.order_items || []).forEach(i => {
      const qty = Number(i.quantity || 0);
      const beerName = i.beers?.name || 'Unknown beer';
      const beer = beerMap.get(beerName) || {name:beerName,boxes:0,cans:0,kegs:0,liters:0};
      if (i.package_type === 'can') {
        const perBox = Number(i.cans_per_box || 12);
        const size = Number(i.can_size_ml || 500);
        const totalCans = qty * perBox;
        boxes += qty; cans += totalCans; liters += totalCans * size / 1000;
        beer.boxes += qty; beer.cans += totalCans; beer.liters += totalCans * size / 1000;
        cust.boxes += qty; cust.liters += totalCans * size / 1000;
      } else {
        const size = Number(i.keg_size_l || 20);
        kegs += qty; liters += qty * size;
        beer.kegs += qty; beer.liters += qty * size;
        cust.kegs += qty; cust.liters += qty * size;
      }
      beerMap.set(beerName,beer);
    });
    customerMap.set(custName,cust);
  });

  $('salesMetrics').innerHTML = [
    ['📦',compactNumber(boxes),'Boxes sold'],['🥫',compactNumber(cans),'Cans sold'],['🛢️',compactNumber(kegs),'Kegs sold'],['🍺',compactNumber(liters.toFixed(1)) + ' L','Beer volume'],['✅',compactNumber(sold.length),'Delivered orders']
  ].map(x => `<div class="metric"><div>${x[0]}</div><div class="n small-n">${x[1]}</div><div class="muted">${x[2]}</div></div>`).join('');

  const beerRows = [...beerMap.values()].sort((a,b) => b.liters - a.liters);
  $('salesByBeer').innerHTML = beerRows.length ? `<table><thead><tr><th>Beer</th><th>Boxes</th><th>Cans</th><th>Kegs</th><th>Liters</th></tr></thead><tbody>${beerRows.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${compactNumber(x.boxes)}</td><td>${compactNumber(x.cans)}</td><td>${compactNumber(x.kegs)}</td><td>${compactNumber(x.liters.toFixed(1))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No delivered sales in this period.</div>';

  const customerRows = [...customerMap.values()].sort((a,b) => b.liters - a.liters || b.orders - a.orders);
  $('salesByCustomer').innerHTML = customerRows.length ? `<table><thead><tr><th>Customer</th><th>Orders</th><th>Boxes</th><th>Kegs</th><th>Liters</th></tr></thead><tbody>${customerRows.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${x.orders}</td><td>${x.boxes}</td><td>${x.kegs}</td><td>${compactNumber(x.liters.toFixed(1))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No delivered sales in this period.</div>';

  const recent = [...sold].sort((a,b) => new Date(orderDate(b)) - new Date(orderDate(a))).slice(0,25);
  $('salesHistory').innerHTML = recent.length ? `<table><thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Boxes</th><th>Kegs</th><th>Liters</th></tr></thead><tbody>${recent.map(o => { const s=summarizeOrder(o); return `<tr><td>${String(orderDate(o)).slice(0,10)}</td><td>#${o.order_number || ''}</td><td>${esc(o.customers?.name || '')}</td><td>${s.boxes}</td><td>${s.kegs}</td><td>${compactNumber(s.liters.toFixed(1))}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">No delivered orders yet.</div>';
}

function renderBeers() {
  const showArchived = $('showArchivedBeers').checked;
  const list = allBeers.filter(b => showArchived || b.active);
  const delivered = orders.filter(o => o.status === 'delivered');
  $('beerList').innerHTML = list.length ? list.map(b => {
    let boxes=0,kegs=0,liters=0;
    delivered.forEach(o => (o.order_items || []).filter(i => i.beer_id === b.id).forEach(i => {
      const qty=Number(i.quantity || 0);
      if (i.package_type === 'can') {
        const perBox=Number(i.cans_per_box || 12), size=Number(i.can_size_ml || 500);
        boxes += qty; liters += qty * perBox * size / 1000;
      } else {
        const size=Number(i.keg_size_l || 20);
        kegs += qty; liters += qty * size;
      }
    }));
    return `<div class="management-row" data-beer-id="${b.id}">
      <div><div class="management-title">${esc(b.name)} ${!b.active ? '<span class="tag archived">REMOVED</span>' : ''}</div><div class="muted">${b.default_cans_per_box || 12} cans/box · ${b.default_can_size_ml || 500}ml${b.notes ? ' · ' + esc(b.notes) : ''}</div></div>
      <div><div class="management-label">Boxes sold</div><div class="management-value">${boxes}</div></div>
      <div><div class="management-label">Kegs sold</div><div class="management-value">${kegs}</div></div>
      <div><div class="management-label">Volume</div><div class="management-value">${compactNumber(liters.toFixed(1))} L</div></div>
      <div class="management-actions"><button class="mini-btn" data-beer-action="edit">Edit</button>${b.active ? '<button class="mini-btn danger" data-beer-action="remove">Delete</button>' : '<button class="mini-btn restore" data-beer-action="restore">Restore</button>'}</div>
    </div>`;
  }).join('') : '<div class="empty">No beers yet.</div>';

  $('beerList').querySelectorAll('[data-beer-action="edit"]').forEach(btn => btn.onclick = () => openBeerDialog(btn.closest('[data-beer-id]').dataset.beerId));
  $('beerList').querySelectorAll('[data-beer-action="remove"]').forEach(btn => btn.onclick = () => setBeerActive(btn.closest('[data-beer-id]').dataset.beerId,false));
  $('beerList').querySelectorAll('[data-beer-action="restore"]').forEach(btn => btn.onclick = () => setBeerActive(btn.closest('[data-beer-id]').dataset.beerId,true));
}

function renderCustomers() {
  let list = customers;
  if (customerSearch) {
    const q=customerSearch.toLowerCase();
    list=list.filter(c => [c.name,c.contact_name,c.phone,c.email].some(v => String(v || '').toLowerCase().includes(q)));
  }
  const delivered=orders.filter(o => o.status === 'delivered');
  $('customerList').innerHTML = list.length ? list.map(c => {
    const all = orders.filter(o => o.customer_id === c.id);
    const done = delivered.filter(o => o.customer_id === c.id);
    let boxes=0,kegs=0,liters=0;
    done.forEach(o => { const s=summarizeOrder(o); boxes += s.boxes; kegs += s.kegs; liters += s.liters; });
    return `<div class="management-row customer-row" data-customer-id="${c.id}">
      <div><div class="management-title">${esc(c.name)}</div><div class="muted">${esc(c.contact_name || c.phone || c.email || 'No contact details')}</div></div>
      <div><div class="management-label">Orders</div><div class="management-value">${all.length}</div></div>
      <div><div class="management-label">Delivered</div><div class="management-value">${done.length}</div></div>
      <div><div class="management-label">Beer sold</div><div class="management-value">${boxes} boxes · ${kegs} kegs · ${compactNumber(liters.toFixed(1))} L</div></div>
      <div class="management-actions"><button class="mini-btn" data-customer-action="edit">Edit</button></div>
    </div>`;
  }).join('') : '<div class="empty">No matching customers.</div>';
  $('customerList').querySelectorAll('[data-customer-action="edit"]').forEach(btn => btn.onclick = () => openCustomerDialog(btn.closest('[data-customer-id]').dataset.customerId));
}

function fillCustomers(selectedId='') {
  $('customer').innerHTML = '<option value="">Choose customer</option>' + customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (selectedId) $('customer').value = selectedId;
}
function beerOptions(selectedId='') {
  return beers.map(b => `<option value="${b.id}" ${b.id === selectedId ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
}
function refreshOrderBeerSelects(preferredBeerId='') {
  const selects=[...document.querySelectorAll('#itemRows .beer-select')];
  selects.forEach((sel,index) => {
    const current=sel.value;
    sel.innerHTML=beerOptions(current);
    if (current && beers.some(b => b.id === current)) sel.value=current;
    if (preferredBeerId && index === selects.length - 1) sel.value=preferredBeerId;
  });
  if (!selects.length && beers.length) $('itemRows').appendChild(newItemRow({beer_id:preferredBeerId || beers[0].id,package_type:'can',quantity:1,cans_per_box:12}));
}

function newItemRow(item) {
  const wrap=document.createElement('div');
  wrap.className='item-row';
  wrap.innerHTML=`<label>Beer<select class="beer-select" required>${beerOptions(item?.beer_id)}</select></label>
    <label>Package<select class="package-select"><option value="can">Can / box</option><option value="keg">Keg</option></select></label>
    <label>Qty<input class="qty-input" type="number" min="1" value="1" required></label>
    <label class="size-label">Cans / box<input class="size-input" type="number" min="1" value="12" required></label>
    <button type="button" class="x remove-row">✕</button>`;
  const beerSel=wrap.querySelector('.beer-select');
  const pkg=wrap.querySelector('.package-select');
  const sizeLabel=wrap.querySelector('.size-label');
  const sizeInput=wrap.querySelector('.size-input');
  const applyDefaults=() => {
    const b=beers.find(x => x.id === beerSel.value);
    if (pkg.value === 'keg') {
      sizeLabel.childNodes[0].textContent='Keg size L';
      if (!item || item.package_type !== 'keg') sizeInput.value=20;
    } else {
      sizeLabel.childNodes[0].textContent='Cans / box';
      if (!item || item.package_type !== 'can') sizeInput.value=b?.default_cans_per_box || 12;
    }
  };
  beerSel.onchange=applyDefaults;
  pkg.onchange=applyDefaults;
  wrap.querySelector('.remove-row').onclick=() => wrap.remove();
  if (item) {
    beerSel.value=item.beer_id || beers[0]?.id || '';
    pkg.value=item.package_type || 'can';
    wrap.querySelector('.qty-input').value=item.quantity || 1;
    sizeInput.value=pkg.value === 'can' ? (item.cans_per_box || 12) : (item.keg_size_l || 20);
  }
  applyDefaults();
  return wrap;
}

function resetOrderForm() {
  $('editingId').value='';
  $('dialogTitle').textContent='Create order';
  $('orderForm').reset();
  $('orderStatus').value='not_started';
  $('deliveryDate').value=todayISO();
  $('itemRows').innerHTML='';
  if (beers.length) $('itemRows').appendChild(newItemRow());
  fillCustomers();
}
function openOrderDialog(id) {
  resetOrderForm();
  const order=id ? orders.find(o => o.id === id) : null;
  if (order) {
    $('editingId').value=order.id;
    $('dialogTitle').textContent='Edit order';
    fillCustomers(order.customer_id);
    $('priority').value=order.priority || 'normal';
    $('deliveryDate').value=order.delivery_date || '';
    $('deliveryMethod').value=order.delivery_method || '';
    $('orderStatus').value=order.status || 'not_started';
    $('notes').value=order.notes || '';
    $('itemRows').innerHTML='';
    (order.order_items || []).forEach(i => $('itemRows').appendChild(newItemRow(i)));
    if (!(order.order_items || []).length && beers.length) $('itemRows').appendChild(newItemRow());
  }
  if (!beers.length) toast('Add a beer first.');
  $('orderDialog').showModal();
}

document.querySelectorAll('.js-new-order').forEach(btn => btn.onclick=() => openOrderDialog());
$('closeDialog').onclick=() => $('orderDialog').close();
$('addItem').onclick=() => {
  if (!beers.length) return toast('Add a beer first.');
  $('itemRows').appendChild(newItemRow());
};
$('openCustomer').onclick=() => openCustomerDialog();
$('addBeerFromOrder').onclick=() => {
  returnToOrderAfterBeer=true;
  $('orderDialog').close();
  openBeerDialog();
};

$('orderForm').addEventListener('submit', async e => {
  e.preventDefault();
  const editingId=$('editingId').value;
  const customerId=$('customer').value;
  if (!customerId) return toast('Choose a customer');
  const rows=[...document.querySelectorAll('#itemRows .item-row')];
  if (!rows.length) return toast('Add at least one beer item');
  const items=rows.map(row => {
    const packageType=row.querySelector('.package-select').value;
    const qty=Number(row.querySelector('.qty-input').value || 0);
    const size=Number(row.querySelector('.size-input').value || 0);
    const beerId=row.querySelector('.beer-select').value;
    const beer=beers.find(b => b.id === beerId);
    const base={beer_id:beerId,package_type:packageType,quantity:qty,unit_price:null};
    return packageType === 'can' ? {...base,can_size_ml:beer?.default_can_size_ml || 500,cans_per_box:size,keg_size_l:null} : {...base,can_size_ml:null,cans_per_box:null,keg_size_l:size};
  });
  if (items.some(i => !i.beer_id || i.quantity < 1)) return toast('Choose a beer and check the quantity');

  const payload={
    customer_id:customerId,
    priority:$('priority').value,
    delivery_date:$('deliveryDate').value || null,
    delivery_method:$('deliveryMethod').value.trim() || null,
    notes:$('notes').value.trim() || null,
    status:$('orderStatus').value
  };

  const existing = editingId ? orders.find(o => o.id === editingId) : null;
  if (payload.status === 'delivered' && existing?.status !== 'delivered') {
    const customer = customers.find(c => c.id === customerId)?.name || 'this customer';
    if (!confirm(`Are you sure this order for ${customer} is already delivered?\n\nIt will be saved under Delivered Orders.`)) return;
  }
  if (existing?.status === 'delivered' && payload.status !== 'delivered') {
    if (!confirm('Are you sure you want to move this delivered order back to Active Orders?')) return;
  }

  if (editingId) {
    const {error}=await supa.from('orders').update(payload).eq('id',editingId);
    if (error) return toast(error.message);
    const del=await supa.from('order_items').delete().eq('order_id',editingId);
    if (del.error) return toast(del.error.message);
    const ins=await supa.from('order_items').insert(items.map(i => ({...i,order_id:editingId})));
    if (ins.error) return toast(ins.error.message);
    toast('Order updated');
  } else {
    const {data,error}=await supa.from('orders').insert(payload).select().single();
    if (error) return toast(error.message);
    const ins=await supa.from('order_items').insert(items.map(i => ({...i,order_id:data.id})));
    if (ins.error) {
      await supa.from('orders').delete().eq('id',data.id);
      return toast(ins.error.message);
    }
    toast(payload.status === 'delivered' ? 'Order saved under Delivered' : 'Order created');
  }
  $('orderDialog').close();
  await loadAll();
});

function openCustomerDialog(id='') {
  $('customerForm').reset();
  $('editingCustomerId').value='';
  $('customerDialogTitle').textContent='Add customer';
  if (id) {
    const c=customers.find(x => x.id === id);
    if (c) {
      $('editingCustomerId').value=c.id;
      $('customerDialogTitle').textContent='Edit customer';
      $('customerName').value=c.name || '';
      $('customerContact').value=c.contact_name || '';
      $('customerPhone').value=c.phone || '';
      $('customerEmail').value=c.email || '';
      $('customerAddress').value=c.address || '';
      $('customerNotes').value=c.delivery_notes || '';
    }
  }
  $('customerDialog').showModal();
}
$('newCustomer').onclick=() => openCustomerDialog();
$('closeCustomer').onclick=() => $('customerDialog').close();
$('customerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id=$('editingCustomerId').value;
  const payload={name:$('customerName').value.trim(),contact_name:$('customerContact').value.trim() || null,phone:$('customerPhone').value.trim() || null,email:$('customerEmail').value.trim() || null,address:$('customerAddress').value.trim() || null,delivery_notes:$('customerNotes').value.trim() || null};
  const res=id ? await supa.from('customers').update(payload).eq('id',id) : await supa.from('customers').insert(payload);
  if (res.error) return toast(res.error.message);
  $('customerDialog').close();
  toast(id ? 'Customer updated' : 'Customer added');
  await loadAll();
});

function openBeerDialog(id='') {
  $('beerForm').reset();
  $('editingBeerId').value='';
  $('beerDialogTitle').textContent='Add beer';
  $('beerCanSize').value=500;
  $('beerBoxSize').value=12;
  if (id) {
    const b=allBeers.find(x => x.id === id);
    if (b) {
      $('editingBeerId').value=b.id;
      $('beerDialogTitle').textContent='Edit beer';
      $('beerName').value=b.name || '';
      $('beerCanSize').value=b.default_can_size_ml || 500;
      $('beerBoxSize').value=b.default_cans_per_box || 12;
      $('beerNotes').value=b.notes || '';
    }
  }
  $('beerDialog').showModal();
}
$('newBeer').onclick=() => { returnToOrderAfterBeer=false; openBeerDialog(); };
$('closeBeer').onclick=() => {
  $('beerDialog').close();
  if (returnToOrderAfterBeer) { returnToOrderAfterBeer=false; $('orderDialog').showModal(); }
};
$('beerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id=$('editingBeerId').value;
  const payload={name:$('beerName').value.trim(),default_can_size_ml:Number($('beerCanSize').value || 500),default_cans_per_box:Number($('beerBoxSize').value || 12),notes:$('beerNotes').value.trim() || null,active:true};
  let savedBeer;
  if (id) {
    const {data,error}=await supa.from('beers').update(payload).eq('id',id).select().single();
    if (error) return toast(error.message);
    savedBeer=data;
  } else {
    const {data,error}=await supa.from('beers').insert(payload).select().single();
    if (error) return toast(error.message);
    savedBeer=data;
  }
  $('beerDialog').close();
  await loadAll();
  toast(id ? 'Beer updated' : 'Beer added');
  if (returnToOrderAfterBeer) {
    returnToOrderAfterBeer=false;
    refreshOrderBeerSelects(savedBeer.id);
    $('orderDialog').showModal();
  }
});

async function setBeerActive(id,active) {
  const b=allBeers.find(x => x.id === id);
  if (!active && !confirm(`Are you sure you want to delete ${b?.name || 'this beer'} from the active list?\n\nOld orders will still keep their history.`)) return;
  const {error}=await supa.from('beers').update({active}).eq('id',id);
  if (error) return toast(error.message);
  toast(active ? 'Beer restored' : 'Beer removed');
  await loadAll();
}

$('showArchivedBeers').onchange=renderBeers;
$('orderSearch').oninput=e => { orderSearch=e.target.value.trim(); renderOrders(); };
$('deliveredSearch').oninput=e => { deliveredSearch=e.target.value.trim(); renderDelivered(); };
$('customerSearch').oninput=e => { customerSearch=e.target.value.trim(); renderCustomers(); };
$('salesPeriod').onchange=e => { salesPeriod=e.target.value; renderSales(); };
document.querySelectorAll('#chips .chip').forEach(btn => btn.onclick=() => {
  activeFilter=btn.dataset.filter;
  document.querySelectorAll('#chips .chip').forEach(chip => chip.classList.toggle('on',chip === btn));
  renderOrders();
});

$('exportSales').onclick=() => {
  const sold=periodOrders();
  const rows=[['Date','Order','Customer','Beer','Package','Quantity','Pack size']];
  sold.forEach(o => (o.order_items || []).forEach(i => rows.push([
    String(orderDate(o)).slice(0,10),o.order_number,o.customers?.name || '',i.beers?.name || '',i.package_type,i.quantity,
    i.package_type === 'can' ? `${i.cans_per_box || 12} cans × ${i.can_size_ml || 500}ml` : `${i.keg_size_l || 20}L`
  ])));
  const csv=rows.map(r => r.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;
  a.download=`wildcat-wholesale-sales-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

function setupRealtime() {
  if (realtimeSetup) return;
  realtimeSetup=true;
  supa.channel('wildcat-wholesale-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'orders'},loadAll)
    .on('postgres_changes',{event:'*',schema:'public',table:'order_items'},loadAll)
    .on('postgres_changes',{event:'*',schema:'public',table:'customers'},loadAll)
    .on('postgres_changes',{event:'*',schema:'public',table:'beers'},loadAll)
    .subscribe();
}

boot();
