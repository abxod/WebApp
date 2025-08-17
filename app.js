let state = {
  cart: [], // {id,name,price,qty}
  settings: {shopName:'مطعمي', currency:'ر.س', taxRate:15, receiptHeader:'مطعمي - أهلاً وسهلاً', receiptFooter:'شكرًا لتعاملكم معنا'},
  deferredPrompt: null,
  lastOrder:null
};

function fmt(n){ return (+n).toFixed(2); }

function renderTabs(){
  document.querySelectorAll('.tab').forEach(btn=>{
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(s=>s.classList.remove('active'));
      document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
      if(btn.dataset.tab==='orders') refreshOrders();
      if(btn.dataset.tab==='products') refreshProducts();
    });
  });
}

async function init(){
  await openDB();
  await seedDemo();
  state.settings = Object.assign(state.settings, await getSettings());
  document.getElementById('shopName').textContent = state.settings.shopName;
  await refreshProducts();
  await refreshCatalog();
  bindEvents();
  calcTotals();
  monitorOnline();
}

function monitorOnline(){
  const dot = document.getElementById('onlineStatus');
  function set(){ dot.classList.toggle('offline', !navigator.onLine); dot.classList.toggle('online', navigator.onLine); }
  window.addEventListener('online', set);
  window.addEventListener('offline', set);
  set();
}

function bindEvents(){
  // Filters
  document.getElementById('searchInput').addEventListener('input', refreshCatalog);
  document.getElementById('categoryFilter').addEventListener('change', refreshCatalog);
  document.getElementById('clearCart').addEventListener('click', ()=>{ state.cart=[]; renderCart(); calcTotals(); });
  document.getElementById('discountValue').addEventListener('input', calcTotals);
  document.getElementById('discountType').addEventListener('change', calcTotals);
  document.getElementById('payCash').addEventListener('click', ()=> openPayment('cash'));
  document.getElementById('payCard').addEventListener('click', ()=> openPayment('card'));
  document.getElementById('printLast').addEventListener('click', ()=> state.lastOrder ? printReceipt(state.lastOrder) : alert('لا توجد فاتورة بعد'));
  // Orders
  document.getElementById('ordersSearch').addEventListener('input', refreshOrders);
  document.getElementById('exportCSV').addEventListener('click', exportCSV);
  // Settings
  const form = document.getElementById('settingsForm');
  form.shopName.value = state.settings.shopName;
  form.currency.value = state.settings.currency;
  form.taxRate.value = state.settings.taxRate;
  form.receiptHeader.value = state.settings.receiptHeader;
  form.receiptFooter.value = state.settings.receiptFooter;
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const s = {
      shopName: form.shopName.value.trim()||'مطعمي',
      currency: form.currency.value.trim()||'ر.س',
      taxRate: parseFloat(form.taxRate.value)||0,
      receiptHeader: form.receiptHeader.value,
      receiptFooter: form.receiptFooter.value
    };
    await setSettings(s);
    state.settings = Object.assign(state.settings,s);
    document.getElementById('shopName').textContent = state.settings.shopName;
    alert('تم الحفظ ✅');
  });
  document.getElementById('installBtn').addEventListener('click', ()=>{
    if(state.deferredPrompt){ state.deferredPrompt.prompt(); }
    else alert('افتح من كروم على التابلت ثم اختر "أضف إلى الشاشة الرئيسية".');
  });
  document.getElementById('resetDemo').addEventListener('click', async ()=>{
    if(confirm('إعادة ضبط ستفرغ كل البيانات!')){
      indexedDB.deleteDatabase('posdb');
      location.reload();
    }
  });
  // PWA install event
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    state.deferredPrompt = e;
    document.getElementById('installBtn').disabled = false;
  });
  // Barcode via keyboard input
  let scanBuffer=''; let scanTimeout;
  document.addEventListener('keydown', (e)=>{
    if(e.key==='Enter'){ if(scanBuffer.length>=6){ onScanned(scanBuffer); } scanBuffer=''; return; }
    if(e.key.length===1){
      scanBuffer+=e.key;
      clearTimeout(scanTimeout);
      scanTimeout = setTimeout(()=> scanBuffer='', 100);
    }
  });
}

async function onScanned(code){
  const prods = await listProducts();
  const p = prods.find(x=> x.barcode && x.barcode===code);
  if(p){ addToCart(p); }
}

async function refreshCatalog(){
  const grid = document.getElementById('productGrid');
  grid.innerHTML = '';
  const term = document.getElementById('searchInput').value.trim();
  const cat = document.getElementById('categoryFilter').value;
  const prods = await listProducts();
  const cats = Array.from(new Set(prods.map(p=>p.category).filter(Boolean))).sort();
  const sel = document.getElementById('categoryFilter');
  sel.innerHTML = '<option value="">كل الأصناف</option>' + cats.map(c=>`<option ${c===cat?'selected':''}>${c}</option>`).join('');
  prods
    .filter(p=> (!cat || p.category===cat) && (!term || p.name.includes(term) || (p.barcode||'').includes(term)))
    .forEach(p=>{
      const card = document.createElement('div');
      card.className='product';
      card.innerHTML = `<h4>${p.name}</h4>
        <div class="price">${fmt(p.price)} ${state.settings.currency}</div>
        <small>${p.category||''}</small>
        <button class="primary">إضافة</button>`;
      card.querySelector('button').addEventListener('click', ()=> addToCart(p));
      grid.appendChild(card);
    });
}

function addToCart(p){
  const ex = state.cart.find(i=> i.id===p.id);
  if(ex) ex.qty+=1;
  else state.cart.push({id:p.id,name:p.name,price:p.price,qty:1});
  renderCart();
  calcTotals();
}

function renderCart(){
  const box = document.getElementById('cartItems');
  box.innerHTML = '';
  state.cart.forEach((it,idx)=>{
    const row = document.createElement('div'); row.className='cart-item';
    row.innerHTML = `<div class="name">${it.name}</div>
      <div class="qty">
        <button data-act="minus">−</button>
        <strong>${it.qty}</strong>
        <button data-act="plus">+</button>
      </div>
      <div class="line">${fmt(it.price*it.qty)} ${state.settings.currency}</div>
      <div><button class="danger" data-act="del">حذف</button></div>`;
    row.querySelector('[data-act="minus"]').onclick=()=>{ it.qty=Math.max(1,it.qty-1); renderCart(); calcTotals(); };
    row.querySelector('[data-act="plus"]').onclick=()=>{ it.qty+=1; renderCart(); calcTotals(); };
    row.querySelector('[data-act="del"]').onclick=()=>{ state.cart.splice(idx,1); renderCart(); calcTotals(); };
    box.appendChild(row);
  });
}

function calcTotals(){
  const subtotal = state.cart.reduce((s,i)=> s+i.price*i.qty, 0);
  const discVal = parseFloat(document.getElementById('discountValue').value||0);
  const discType = document.getElementById('discountType').value;
  const discount = discType==='percent' ? subtotal*discVal/100 : discVal;
  const taxedBase = Math.max(0, subtotal - discount);
  const tax = taxedBase * (parseFloat(state.settings.taxRate)||0) / 100;
  const grand = taxedBase + tax;
  document.getElementById('subtotal').textContent = fmt(Math.max(0,subtotal - discount));
  document.getElementById('tax').textContent = fmt(tax);
  document.getElementById('grandTotal').textContent = fmt(grand);
  return {subtotal, discount, tax, grand};
}

function openPayment(method){
  if(state.cart.length===0){ alert('السلة فارغة'); return; }
  const totals = calcTotals();
  const dlg = document.getElementById('paymentDialog');
  const dueEl = document.getElementById('dueAmount');
  const changeEl = document.getElementById('changeDue');
  const cashArea = document.getElementById('cashArea');
  const numpad = document.getElementById('numpad');
  dueEl.textContent = fmt(totals.grand) + ' ' + state.settings.currency;
  cashArea.style.display = method==='cash' ? 'block' : 'none';
  document.getElementById('payTitle').textContent = method==='cash' ? 'الدفع نقدًا' : 'الدفع بالبطاقة';
  if(method==='cash'){
    const cashInput = document.getElementById('cashReceived');
    cashInput.value='';
    changeEl.textContent = fmt(0);
    cashInput.oninput = ()=> changeEl.textContent = fmt((parseFloat(cashInput.value||0) - totals.grand));
    // numpad
    numpad.innerHTML='';
    ['7','8','9','4','5','6','1','2','3','.','0','⌫'].forEach(k=>{
      const b=document.createElement('button'); b.type='button'; b.textContent=k; b.onclick=()=>{
        if(k==='⌫') cashInput.value = cashInput.value.slice(0,-1);
        else cashInput.value += k;
        cashInput.dispatchEvent(new Event('input'));
      };
      numpad.appendChild(b);
    });
  }
  dlg.showModal();
  document.getElementById('confirmPay').onclick = async ()=>{
    let paid = totals.grand;
    let change = 0;
    if(method==='cash'){
      paid = parseFloat(document.getElementById('cashReceived').value||0);
      if(paid < totals.grand){ alert('المبلغ المستلم أقل من الإجمالي'); return; }
      change = paid - totals.grand;
    }
    const order = {
      createdAt: Date.now(),
      items: JSON.parse(JSON.stringify(state.cart)),
      totals,
      payment: {method, paid, change}
    };
    const id = await addOrder(order);
    order.id = id;
    state.lastOrder = order;
    state.cart = [];
    renderCart(); calcTotals();
    dlg.close();
    printReceipt(order);
    alert('تمت العملية ✔️ رقم الفاتورة: '+id);
  };
}

function printReceipt(order){
  const w = document.getElementById('receiptFrame').contentWindow;
  const s = state.settings;
  const d = new Date(order.createdAt);
  const itemsRows = order.items.map(i=>`
      <tr>
        <td>${i.name}</td>
        <td>${i.qty}</td>
        <td>${fmt(i.price)}</td>
        <td>${fmt(i.price*i.qty)}</td>
      </tr>`).join('');
  const html = `<!doctype html><html lang="ar" dir="rtl"><head>
    <meta charset="utf-8">
    <title>فاتورة #${order.id}</title>
    <style>
      body{font-family:ui-monospace,monospace;margin:0;padding:10px}
      .receipt{width:75mm}
      h3,h4,p,table{margin:0 0 6px 0}
      table{width:100%;border-collapse:collapse}
      td,th{border-bottom:1px dashed #ddd;padding:4px 0;text-align:right;font-size:12px}
      .center{text-align:center}
      .totals td{border:none}
      .small{font-size:11px;color:#555}
    </style>
  </head><body onload="window.print()">
    <div class="receipt">
      <h3 class="center">${s.shopName}</h3>
      <p class="center small">${s.receiptHeader||''}</p>
      <p class="small">رقم: ${order.id} — التاريخ: ${d.toLocaleString('ar')}</p>
      <table>
        <thead><tr><th>المادة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>
      <table class="totals">
        <tr><td>الخصم</td><td>${fmt(order.totals.discount)} ${s.currency}</td></tr>
        <tr><td>الضريبة (${fmt(s.taxRate)}%)</td><td>${fmt(order.totals.tax)} ${s.currency}</td></tr>
        <tr><td><strong>الإجمالي</strong></td><td><strong>${fmt(order.totals.grand)} ${s.currency}</strong></td></tr>
        <tr><td>طريقة الدفع</td><td>${order.payment.method==='cash'?'نقدًا':'بطاقة'}</td></tr>
        ${order.payment.method==='cash' ? `<tr><td>المستلم</td><td>${fmt(order.payment.paid)} ${s.currency}</td></tr>
        <tr><td>الباقي</td><td>${fmt(order.payment.change)} ${s.currency}</td></tr>` : ''}
      </table>
      <p class="center small">${s.receiptFooter||''}</p>
    </div>
  </body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
}

async function refreshOrders(){
  const tbody = document.querySelector('#ordersTable tbody');
  const q = document.getElementById('ordersSearch').value.trim();
  const orders = await listOrders();
  const filtered = orders.filter(o=>{
    const id = String(o.id||'');
    const dt = new Date(o.createdAt).toLocaleDateString('ar');
    return !q || id.includes(q) || dt.includes(q);
  });
  tbody.innerHTML = '';
  filtered.forEach(o=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${o.id}</td>
      <td>${new Date(o.createdAt).toLocaleString('ar')}</td>
      <td>${fmt(o.totals.grand)} ${state.settings.currency}</td>
      <td>${o.payment.method==='cash'?'نقدًا':'بطاقة'}</td>
      <td><button>عرض/طباعة</button></td>`;
    tr.querySelector('button').onclick = ()=> printReceipt(o);
    tbody.appendChild(tr);
  });
}

async function refreshProducts(){
  const tbody = document.querySelector('#productsTable tbody');
  const prods = await listProducts();
  tbody.innerHTML = '';
  prods.forEach(p=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input value="${p.name}"></td>
      <td><input type="number" step="0.01" value="${p.price}"></td>
      <td><input value="${p.category||''}"></td>
      <td><input value="${p.barcode||''}"></td>
      <td><button data-act="save">حفظ</button> <button class="danger" data-act="del">حذف</button></td>`;
    tr.querySelector('[data-act="save"]').onclick = async ()=>{
      const [name, price, category, barcode] = [ ...tr.querySelectorAll('input') ].map(i=>i.value);
      await updateProduct({id:p.id, name, price:parseFloat(price)||0, category, barcode});
      await refreshProducts(); await refreshCatalog();
    };
    tr.querySelector('[data-act="del"]').onclick = async ()=>{
      if(confirm('حذف المنتج؟')){ await deleteProduct(p.id); await refreshProducts(); await refreshCatalog(); }
    };
    tbody.appendChild(tr);
  });
  document.getElementById('addProduct').onclick = async ()=>{
    const name = prompt('اسم المنتج'); if(!name) return;
    const price = parseFloat(prompt('السعر')||'0')||0;
    const category = prompt('التصنيف (اختياري)')||'';
    const barcode = prompt('الباركود (اختياري)')||'';
    await addProduct({name, price, category, barcode});
    await refreshProducts(); await refreshCatalog();
  };
}

function exportCSV(){
  const headers = ['id','date','total','method'];
  listOrders().then(orders=>{
    const rows = orders.map(o=>[o.id,new Date(o.createdAt).toISOString(),fmt(o.totals.grand),o.payment.method]);
    const csv = [headers.join(','), ...rows.map(r=>r.join(','))].join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'orders.csv';
    a.click();
  });
}

renderTabs();
init();
