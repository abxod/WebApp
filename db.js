// IndexedDB helper & schema
const DB_NAME = 'posdb';
const DB_VERSION = 1;
let db;

function openDB() {
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e)=>{
      db = e.target.result;
      if(!db.objectStoreNames.contains('products')){
        const ps = db.createObjectStore('products', {keyPath:'id', autoIncrement:true});
        ps.createIndex('name','name',{unique:false});
        ps.createIndex('category','category',{unique:false});
        ps.createIndex('barcode','barcode',{unique:false});
      }
      if(!db.objectStoreNames.contains('orders')){
        const os = db.createObjectStore('orders', {keyPath:'id', autoIncrement:true});
        os.createIndex('createdAt','createdAt',{unique:false});
      }
      if(!db.objectStoreNames.contains('settings')){
        db.createObjectStore('settings', {keyPath:'key'});
      }
    };
    req.onsuccess = (e)=>{ db = e.target.result; resolve(db); };
    req.onerror = (e)=> reject(e);
  });
}

function tx(storeNames, mode='readonly'){ return db.transaction(storeNames, mode); }

// Settings
async function getSettings(){
  const t = tx(['settings']);
  const store = t.objectStore('settings');
  return new Promise(res=>{
    const req = store.getAll();
    req.onsuccess = ()=>{
      const map = {};
      (req.result||[]).forEach(s=> map[s.key]=s.value);
      res(map);
    };
  });
}
async function setSettings(obj){
  const t = tx(['settings'],'readwrite');
  const store = t.objectStore('settings');
  for(const [key,value] of Object.entries(obj)){
    store.put({key, value});
  }
  return new Promise(res=> t.oncomplete = res);
}

// Products
async function addProduct(p){
  const t = tx(['products'],'readwrite');
  return new Promise((res,rej)=>{
    t.objectStore('products').add(p).onsuccess = (e)=> res(e.target.result);
    t.onerror = rej;
  });
}
async function updateProduct(p){
  const t = tx(['products'],'readwrite');
  return new Promise((res,rej)=>{
    t.objectStore('products').put(p).onsuccess = ()=> res(true);
    t.onerror = rej;
  });
}
async function deleteProduct(id){
  const t = tx(['products'],'readwrite');
  return new Promise((res,rej)=>{
    t.objectStore('products').delete(id).onsuccess = ()=> res(true);
    t.onerror = rej;
  });
}
async function listProducts(){
  const t = tx(['products']);
  return new Promise(res=>{
    t.objectStore('products').getAll().onsuccess = (e)=> res(e.target.result||[]);
  });
}

// Orders
async function addOrder(order){
  const t = tx(['orders'],'readwrite');
  return new Promise((res,rej)=>{
    t.objectStore('orders').add(order).onsuccess = (e)=> res(e.target.result);
    t.onerror = rej;
  });
}
async function listOrders(){
  const t = tx(['orders']);
  return new Promise(res=>{
    t.objectStore('orders').getAll().onsuccess = (e)=>{
      const arr = e.target.result||[];
      arr.sort((a,b)=> b.createdAt - a.createdAt);
      res(arr);
    };
  });
}

// Seed demo data if empty
async function seedDemo(){
  const prods = await listProducts();
  if(prods.length) return;
  const demo = [
    {name:'شاورما عربي', price:18, category:'ساندويتش', barcode:''},
    {name:'شاورما صحن', price:26, category:'أطباق', barcode:''},
    {name:'بطاطس', price:8, category:'مقبلات', barcode:''},
    {name:'حمص', price:7, category:'مقبلات', barcode:''},
    {name:'بيبسي', price:4, category:'مشروبات', barcode:'6281234567890'},
    {name:'ماء', price:2, category:'مشروبات', barcode:''},
  ];
  for(const d of demo) await addProduct(d);
}
