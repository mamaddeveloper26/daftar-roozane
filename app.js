(() => {
  "use strict";
  const DB_NAME = "daftar-roozane-db";
  const DB_VERSION = 1;
  const STORE = "notes";
  const CATEGORIES = ["همه","شخصی","مالی","قرار","خرید","کار","سایر"];
  const FORM_CATEGORIES = CATEGORIES.slice(1);
  let db;
  let notes = [];
  let activeCategory = "همه";
  let formCategory = "شخصی";
  let editingId = null;
  let draftPhotos = [];
  let sortNewest = true;
  let toastTimer;

  const $ = id => document.getElementById(id);
  const el = {
    pages: {home:$("page-home"),form:$("page-form"),backup:$("page-backup"),about:$("page-about")},
    nav: [...document.querySelectorAll(".nav-item")],
    list:$("entries-list"), filters:$("category-filters"), search:$("search-input"),
    count:$("note-count"), backupCount:$("backup-count"), title:$("note-title"),
    body:$("note-body"), form:$("note-form"), previewDate:$("preview-date"),
    previewTime:$("preview-time"), photoInput:$("photo-input"), photoPreview:$("photo-preview"),
    formCategories:$("form-categories"), formHeading:$("form-heading"),
    save:$("save-note"), toast:$("toast"), dialog:$("image-dialog"), largeImage:$("large-image")
  };

  function tehranNow(){ return new Date(); }
  function jalaliDate(date){
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian",{timeZone:"Asia/Tehran",year:"numeric",month:"long",day:"numeric"}).format(date);
  }
  function jalaliTime(date){
    return new Intl.DateTimeFormat("fa-IR",{timeZone:"Asia/Tehran",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
  }
  function jalaliInputValue(date){
    const parts=new Intl.DateTimeFormat("en-US-u-ca-persian",{timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
    const get=type=>parts.find(part=>part.type===type)?.value||"";
    return get("year")+"/"+get("month")+"/"+get("day");
  }
  function todayLabel(date){return new Intl.DateTimeFormat("fa-IR-u-ca-persian",{timeZone:"Asia/Tehran",weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(date);}
  function digits(value){return String(value).replace(/[0-9]/g,d=>"۰۱۲۳۴۵۶۷۸۹"[Number(d)]);}
  function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function showToast(message){
    el.toast.textContent=message;el.toast.classList.add("show");clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>el.toast.classList.remove("show"),2600);
  }
  function openDb(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{const database=request.result;if(!database.objectStoreNames.contains(STORE))database.createObjectStore(STORE,{keyPath:"id"});};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
  }
  function storeRequest(mode,action,value){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);const store=tx.objectStore(STORE);
      let result;
      let request;
      if(action==="all")request=store.getAll();
      else if(action==="put")request=store.put(value);
      else if(action==="delete")request=store.delete(value);
      else if(action==="clear")request=store.clear();
      if(request){request.onsuccess=()=>{result=request.result;};request.onerror=()=>reject(request.error);}
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error||new Error("IndexedDB transaction failed"));
      tx.onabort=()=>reject(tx.error||new Error("IndexedDB transaction aborted"));
    });
  }
  function replaceAllNotes(items){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,"readwrite");
      const store=tx.objectStore(STORE);
      store.clear();
      for(const item of items) store.put(item);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error("Backup restore failed"));
      tx.onabort=()=>reject(tx.error||new Error("Backup restore aborted"));
    });
  }
  async function migrateOldData(){
    const raw=localStorage.getItem("daftar-roozane-v1");
    if(!raw)return;
    try{
      const old=JSON.parse(raw);
      if(Array.isArray(old)&&old.length){
        const current=await storeRequest("readonly","all");
        if(!current.length){
          for(const item of old){
            await storeRequest("readwrite","put",{...item,photos:[],createdAt:Number(item.createdAt)||Date.now()});
          }
        }
      }
      localStorage.removeItem("daftar-roozane-v1");
    }catch(error){console.warn("Legacy migration skipped",error);}
  }
  async function loadNotes(){
    const loaded=await storeRequest("readonly","all");
    notes=loaded.map(note=>({...note}));
    notes.sort((a,b)=>b.createdAt-a.createdAt);render();
    for(const note of notes){if(note.reminderAt>Date.now()){try{const restored=await window.DiaryReminder.reschedule(note);if(restored)await storeRequest("readwrite","put",restored);}catch(error){console.warn("Pending reminder recovery failed",error);}}}
  }
  async function persist(note){await storeRequest("readwrite","put",note);const index=notes.findIndex(n=>n.id===note.id);if(index>=0)notes[index]=note;else notes.push(note);render();}
  async function removeNote(id){const note=notes.find(n=>n.id===id);if(note)await window.DiaryReminder.cancel(note);await storeRequest("readwrite","delete",id);notes=notes.filter(n=>n.id!==id);render();}

  function navigate(page){
    Object.entries(el.pages).forEach(([key,node])=>node.classList.toggle("active",key===page));
    el.nav.forEach(button=>button.classList.toggle("active",button.dataset.page===page));
    window.scrollTo({top:0,behavior:"instant"});
    if(page==="backup"){el.backupCount.textContent=digits(notes.length);}
  }
  function renderFilters(){
    el.filters.innerHTML=CATEGORIES.map(category=>`<button type="button" class="chip${category===activeCategory?" active":""}" data-filter="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("");
  }
  function renderFormCategories(){
    el.formCategories.innerHTML=FORM_CATEGORIES.map(category=>`<button type="button" class="chip${category===formCategory?" active":""}" data-form-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("");
  }
  function visibleNotes(){
    const query=el.search.value.trim().toLocaleLowerCase("fa");
    let result=notes.filter(note=>{
      const categoryMatch=activeCategory==="همه"||note.category===activeCategory;
      const text=[note.title,note.body,note.category].join(" ").toLocaleLowerCase("fa");
      return categoryMatch&&(!query||text.includes(query));
    });
    result.sort((a,b)=>(sortNewest?1:-1)*(b.createdAt-a.createdAt));
    return result;
  }
  function render(){
    renderFilters();
    const filtered=visibleNotes();
    el.count.textContent=digits(notes.length)+" یادداشت";
    el.backupCount.textContent=digits(notes.length);
    if(!filtered.length){
      el.list.innerHTML=`<div class="empty-state"><div class="empty-symbol">✧</div><b>${notes.length?"چیزی پیدا نشد":"هنوز یادداشتی ثبت نکردی"}</b><span>${notes.length?"عبارت دیگری جستجو کن یا فیلتر را تغییر بده":"اولین یادداشتت را با دکمه بالا ثبت کن"}</span></div>`;
      return;
    }
    el.list.innerHTML=filtered.map(note=>{
      const date=escapeHtml(note.dateText||jalaliDate(new Date(note.createdAt)));
      const time=escapeHtml(note.timeText||jalaliTime(new Date(note.createdAt)));
      const photos=(note.photos||[]).map((photo,index)=>`<img src="${photo.data}" alt="عکس پیوست ${index+1}" data-photo-note="${note.id}" data-photo-index="${index}" loading="lazy">`).join("");
      return `<article class="entry-card" data-id="${escapeHtml(note.id)}">
        <div class="entry-head"><span class="entry-category">${escapeHtml(note.category||"شخصی")}</span><div class="entry-actions"><button class="mini-action" type="button" data-action="edit" data-id="${escapeHtml(note.id)}" aria-label="ویرایش">✎</button><button class="mini-action delete" type="button" data-action="delete" data-id="${escapeHtml(note.id)}" aria-label="حذف">⌫</button></div></div>
        <h3 class="entry-title">${escapeHtml(note.title||"یادداشت")}</h3>
        ${note.body?`<p class="entry-body">${escapeHtml(note.body)}</p>`:""}
        ${photos?`<div class="entry-photos">${photos}</div>`:""}
        ${window.DiaryReminder.render(note)}
        <div class="entry-meta"><span>▦ ${date}</span><span>◷ ${time}</span></div>
      </article>`;
    }).join("");
  }

  function clearForm(){
    el.form.reset();draftPhotos=[];formCategory="شخصی";el.photoPreview.innerHTML="";window.DiaryReminder.reset();
    renderFormCategories();const now=tehranNow();el.previewDate.textContent=jalaliDate(now);el.previewTime.textContent=jalaliTime(now);
  }
  function openNew(){
    editingId=null;clearForm();el.formHeading.textContent="یادداشت جدید";el.save.textContent="ذخیره یادداشت";navigate("form");
  }
  function openEdit(id){
    const note=notes.find(item=>item.id===id);if(!note)return;
    editingId=id;formCategory=note.category||"شخصی";draftPhotos=(note.photos||[]).map(photo=>({...photo}));
    el.title.value=note.title||"";el.body.value=note.body||"";window.DiaryReminder.load(note);
    el.previewDate.textContent=note.dateText||jalaliDate(new Date(note.createdAt));
    el.previewTime.textContent=note.timeText||jalaliTime(new Date(note.createdAt));
    el.formHeading.textContent="ویرایش یادداشت";el.save.textContent="ذخیره تغییرات";
    renderFormCategories();renderPhotoPreview();navigate("form");
  }
  function renderPhotoPreview(){
    el.photoPreview.innerHTML=draftPhotos.map((photo,index)=>`<div class="photo-thumb"><img src="${photo.data}" alt="پیش‌نمایش عکس"><button type="button" data-remove-photo="${index}" aria-label="حذف عکس">×</button></div>`).join("");
  }
  async function compressImage(file){
    if(!file.type.startsWith("image/"))throw new Error("فایل انتخاب‌شده تصویر نیست");
    const bitmap=await createImageBitmap(file);
    const max=1500,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement("canvas");canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    const context=canvas.getContext("2d");context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.82));
    if(!blob)throw new Error("فشرده‌سازی عکس انجام نشد");
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
    return {name:file.name,type:"image/jpeg",data};
  }
  async function addPhotos(files){
    const remaining=5-draftPhotos.length;if(remaining<=0){showToast("حداکثر ۵ عکس برای هر یادداشت مجاز است");return;}
    for(const file of [...files].slice(0,remaining)){
      try{draftPhotos.push(await compressImage(file));}catch(error){showToast(error.message||"خطا در خواندن عکس");}
    }
    renderPhotoPreview();el.photoInput.value="";
  }
  function downloadFile(name,content){
    const blob=new Blob([content],{type:"application/json"});const url=URL.createObjectURL(blob);
    const link=document.createElement("a");link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function safeFilenameDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
  async function exportBackup(){
    const payload={app:"دفترچه روزانه",version:1,exportedAt:new Date().toISOString(),notes};
    downloadFile("daftar-roozane-backup-"+safeFilenameDate()+".json",JSON.stringify(payload));
    showToast("فایل پشتیبان آماده شد");
  }
  async function restoreBackup(file){
    try{
      const payload=JSON.parse(await file.text());const incoming=Array.isArray(payload)?payload:payload.notes;
      if(!Array.isArray(incoming))throw new Error("ساختار فایل پشتیبان معتبر نیست");
      if(!confirm("بازیابی، یادداشت‌های فعلی را با اطلاعات فایل جایگزین می‌کند. ادامه می‌دهی؟"))return;
      const validItems=incoming.filter(item=>item&&typeof item==="object"&&item.id!==undefined&&item.id!==null&&String(item.id).length>0)
        .map(item=>({...item,photos:Array.isArray(item.photos)?item.photos:[],createdAt:Number(item.createdAt)||Date.now()}));
      for(const existing of notes)await window.DiaryReminder.cancel(existing);
      await replaceAllNotes(validItems);
      await loadNotes();
      for(const note of notes){if(note.reminderAt>Date.now()){try{const restored=await window.DiaryReminder.reschedule(note);await storeRequest("readwrite","put",restored);}catch(error){console.warn("Reminder restore failed",error);}}}
      showToast("بازیابی با موفقیت انجام شد");
    }catch(error){showToast(error.message||"بازیابی انجام نشد");}
    finally{$("restore-input").value="";}
  }

  el.nav.forEach(button=>button.addEventListener("click",()=>navigate(button.dataset.page)));
  $("add-note").addEventListener("click",openNew);
  $("form-back").addEventListener("click",()=>navigate("home"));
  el.filters.addEventListener("click",event=>{const button=event.target.closest("[data-filter]");if(!button)return;activeCategory=button.dataset.filter;render();});
  el.formCategories.addEventListener("click",event=>{const button=event.target.closest("[data-form-category]");if(!button)return;formCategory=button.dataset.formCategory;renderFormCategories();});
  el.search.addEventListener("input",()=>{ $("clear-search").style.display=el.search.value?"block":"none";render();});
  $("clear-search").addEventListener("click",()=>{el.search.value="";$("clear-search").style.display="none";render();});
  $("sort-button").addEventListener("click",()=>{sortNewest=!sortNewest;$("sort-button").innerHTML=sortNewest?'جدیدترین <span>⌄</span>':'قدیمی‌ترین <span>⌃</span>';render();});
  el.photoInput.addEventListener("change",event=>addPhotos(event.target.files));
  el.photoPreview.addEventListener("click",event=>{const button=event.target.closest("[data-remove-photo]");if(!button)return;draftPhotos.splice(Number(button.dataset.removePhoto),1);renderPhotoPreview();});
  el.form.addEventListener("submit",async event=>{
    event.preventDefault();const title=el.title.value.trim();const body=el.body.value.trim();
    if(!title&&!body&&!draftPhotos.length){showToast("متن یا عنوان یادداشت را وارد کن");return;}
    el.save.disabled=true;
    try{
      const old=editingId?notes.find(note=>note.id===editingId):null;
      const createdAt=old?old.createdAt:Date.now();const created=new Date(createdAt);
      let note={id:old?old.id:crypto.randomUUID(),title,body,category:formCategory,createdAt,dateText:old?old.dateText:jalaliDate(created),timeText:old?old.timeText:jalaliTime(created),updatedAt:Date.now(),photos:draftPhotos};
      // The diary entry must save even if Android notification scheduling fails.
      let reminderWarning="";
      try{
        note=await window.DiaryReminder.apply(note,old);
      }catch(reminderError){
        console.error("Reminder scheduling failed; continue saving note",reminderError);
        if(old&&old.reminderAt){
          note.reminderAt=old.reminderAt;
          note.reminderText=old.reminderText;
          note.reminderNotificationId=old.reminderNotificationId;
        }
        reminderWarning="یادداشت ذخیره شد، اما یادآوری ثبت نشد: "+(reminderError.message||"خطای اعلان");
      }
      await persist(note);
      navigate("home");
      showToast(reminderWarning|| (old?"یادداشت ویرایش شد":"یادداشت ذخیره شد"));
    }catch(error){showToast(error.message||"ذخیره انجام نشد؛ فضای خالی گوشی را بررسی کن");console.error(error);}
    finally{el.save.disabled=false;}
  });
  el.list.addEventListener("click",async event=>{
    const action=event.target.closest("[data-action]");
    if(action){const id=action.dataset.id;if(action.dataset.action==="edit")openEdit(id);else if(action.dataset.action==="delete"&&confirm("این یادداشت و عکس‌های پیوست‌شده حذف شوند؟")){await removeNote(id);showToast("یادداشت حذف شد");}return;}
    const image=event.target.closest("[data-photo-note]");
    if(image){const note=notes.find(item=>item.id===image.dataset.photoNote);const photo=note?.photos?.[Number(image.dataset.photoIndex)];if(photo){el.largeImage.src=photo.data;el.dialog.showModal();}}
  });
  $("close-image").addEventListener("click",()=>el.dialog.close());
  $("export-backup").addEventListener("click",exportBackup);
  $("restore-input").addEventListener("change",event=>{if(event.target.files[0])restoreBackup(event.target.files[0]);});

  async function init(){
    $("today-label").textContent="امروز · "+todayLabel(new Date());
    try{
      db=await openDb();await migrateOldData();await loadNotes();
      if(navigator.storage?.persist){const persisted=await navigator.storage.persist();console.info("Persistent storage:",persisted);}
    }catch(error){console.error(error);showToast("ذخیره‌سازی گوشی در دسترس نیست؛ مرورگر را به‌روز کن");}
    if("serviceWorker" in navigator){navigator.serviceWorker.register("./sw.js?v=42").catch(error=>console.warn("Offline cache unavailable",error));}
  }
  init();
})();