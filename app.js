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
    reminderEnabled:$("reminder-enabled"), reminderFields:$("reminder-fields"), reminderDate:$("reminder-date"), reminderTime:$("reminder-time"), reminderHour:$("reminder-hour"), reminderMinute:$("reminder-minute"),
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
  function parseJalaliDateTime(value,time){
    const normalized=Array.from(String(value||"")).map(ch=>{
      const code=ch.charCodeAt(0);
      if(code>=0x06F0&&code<=0x06F9)return String(code-0x06F0);
      if(code>=0x0660&&code<=0x0669)return String(code-0x0660);
      return ch;
    }).join("").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\uFEFF\u00A0]/g,"").replace(/[\u2044\u2215\uFF0F]/g,"/");
    const match=normalized.trim().match(/^(\d{4})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{1,2})$/);
    if(!match)throw new Error("تاریخ را به شکل شمسی سال/ماه/روز وارد کن؛ مثلاً ۱۴۰۵/۰۹/۰۳");
    const jy=Number(match[1]),jm=Number(match[2]),jd=Number(match[3]);
    if(jy<1300||jy>1500||jm<1||jm>12||jd<1||jd>31)throw new Error("تاریخ شمسی معتبر نیست");
    const formatter=new Intl.DateTimeFormat("en-US-u-ca-persian",{timeZone:"Asia/Tehran",year:"numeric",month:"numeric",day:"numeric"});
    let found=null;
    for(let offset=0;offset<35;offset++){
      const candidate=new Date(Date.UTC(jy+621,2,10+offset,12));
      const parts=formatter.formatToParts(candidate);
      const get=type=>Number(parts.find(part=>part.type===type)?.value);
      if(get("year")===jy&&get("month")===jm&&get("day")===jd){found=candidate;break;}
    }
    if(!found)throw new Error("این تاریخ در تقویم شمسی وجود ندارد");
    const [hours,minutes]=String(time||"").split(":").map(Number);
    if(!Number.isInteger(hours)||hours<0||hours>23||!Number.isInteger(minutes)||minutes<0||minutes>59)throw new Error("ساعت یادآوری معتبر نیست");
    return new Date(found.getUTCFullYear(),found.getUTCMonth(),found.getUTCDate(),hours,minutes,0,0).getTime();
  }
  function localTimeValue(date){return String(date.getHours()).padStart(2,"0")+":"+String(date.getMinutes()).padStart(2,"0");}
  function populateReminderTimeOptions(){
    el.reminderHour.innerHTML=Array.from({length:24},(_,hour)=>"<option value=\""+String(hour).padStart(2,"0")+"\">"+digits(String(hour).padStart(2,"0"))+"</option>").join("");
    el.reminderMinute.innerHTML=Array.from({length:60},(_,minute)=>"<option value=\""+String(minute).padStart(2,"0")+"\">"+digits(String(minute).padStart(2,"0"))+"</option>").join("");
  }
  function setReminderTime(value){
    const [hour,minute]=(value||"00:00").split(":");
    el.reminderHour.value=hour||"00";el.reminderMinute.value=minute||"00";
    el.reminderTime.value=el.reminderHour.value+":"+el.reminderMinute.value;
  }
  function selectedReminderTime(){
    el.reminderTime.value=el.reminderHour.value+":"+el.reminderMinute.value;
    return el.reminderTime.value;
  }
  function notificationPlugin(){return window.LocalNotifications||null;}
  function newNotificationIds(){const ids=[];while(ids.length<3){const value=crypto.getRandomValues(new Uint32Array(1))[0]%2000000000+1;if(!ids.includes(value))ids.push(value);}return ids;}
  async function cancelReminderNotifications(ids){const plugin=notificationPlugin();if(!plugin||!Array.isArray(ids)||!ids.length)return;try{await plugin.cancel({notifications:ids.map(id=>({id}))});}catch(error){console.warn("Could not cancel reminders",error);}}
  async function scheduleReminderNotifications(note){
    const plugin=notificationPlugin();if(!plugin)throw new Error("برای فعال شدن یادآوری، از نسخه نصب‌شده اندروید استفاده کن");
    let permission=await plugin.checkPermissions();if(permission.display!=="granted")permission=await plugin.requestPermissions();
    if(permission.display!=="granted")throw new Error("مجوز اعلان‌ها فعال نشد؛ از تنظیمات گوشی اجازه اعلان بده");
    try{await plugin.createChannel({id:"reminders",name:"یادآوری‌های دفترچه",description:"هشدار یادداشت‌های زمان‌بندی‌شده",importance:5,vibration:true,lights:true,lightColor:"#20dfd0"});}catch(error){console.warn("Notification channel setup",error);}
    try{const exact=await plugin.checkExactNotificationSetting();if(exact.exactAlarmOption!=="granted"){await plugin.changeExactNotificationSetting();const after=await plugin.checkExactNotificationSetting();if(after.exactAlarmOption!=="granted")showToast("هشدار ممکن است با کمی تأخیر برسد؛ اجازه هشدار دقیق را در تنظیمات فعال کن");}}catch(error){console.warn("Exact alarm permission unavailable",error);}
    const ids=newNotificationIds(),title=note.title||"یادآوری دفترچه روزانه",body=(note.body||"زمان یادآوری یادداشتت رسیده است").trim().slice(0,180);
    const notifications=ids.map((id,index)=>({id,title,body,schedule:{at:new Date(note.reminderAt+index*8000)},channelId:"reminders",extra:{noteId:note.id}}));
    await plugin.schedule({notifications});return ids;
  }
  async function reconcileReminders(){
    const plugin=notificationPlugin();if(!plugin)return;let pending=new Set();
    try{const result=await plugin.getPending();pending=new Set((result.notifications||[]).map(item=>item.id));}catch(error){console.warn("Could not inspect pending reminders",error);return;}
    for(const note of notes){if(!note.reminderAt||note.reminderAt<=Date.now())continue;const ids=Array.isArray(note.reminderNotificationIds)?note.reminderNotificationIds:[];
      if(ids.length===3&&ids.every(id=>pending.has(id)))continue;
      try{const nextIds=await scheduleReminderNotifications(note);await storeRequest("readwrite","put",{...note,reminderNotificationIds:nextIds});note.reminderNotificationIds=nextIds;await cancelReminderNotifications(ids);}catch(error){console.warn("Could not restore reminder",note.id,error);}
    }
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
  async function loadNotes(){notes=await storeRequest("readonly","all");notes.sort((a,b)=>b.createdAt-a.createdAt);render();}
  async function persist(note){await storeRequest("readwrite","put",note);const index=notes.findIndex(n=>n.id===note.id);if(index>=0)notes[index]=note;else notes.push(note);render();}
  async function removeNote(id){await storeRequest("readwrite","delete",id);notes=notes.filter(n=>n.id!==id);render();}

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
      const reminder=note.reminderAt?new Date(note.reminderAt):null;
      return `<article class="entry-card" data-id="${escapeHtml(note.id)}">
        <div class="entry-head"><span class="entry-category">${escapeHtml(note.category||"شخصی")}</span><div class="entry-actions"><button class="mini-action" type="button" data-action="edit" data-id="${escapeHtml(note.id)}" aria-label="ویرایش">✎</button><button class="mini-action delete" type="button" data-action="delete" data-id="${escapeHtml(note.id)}" aria-label="حذف">⌫</button></div></div>
        <h3 class="entry-title">${escapeHtml(note.title||"یادداشت")}</h3>
        ${note.body?`<p class="entry-body">${escapeHtml(note.body)}</p>`:""}
        ${photos?`<div class="entry-photos">${photos}</div>`:""}
        ${reminder?`<div class="entry-reminder">🔔 یادآوری: ${escapeHtml(jalaliDate(reminder))} · ${escapeHtml(jalaliTime(reminder))}</div>`:""}
        <div class="entry-meta"><span>▦ ${date}</span><span>◷ ${time}</span></div>
      </article>`;
    }).join("");
  }

  function clearForm(){
    el.form.reset();draftPhotos=[];formCategory="شخصی";el.photoPreview.innerHTML="";
    el.reminderEnabled.checked=false;el.reminderFields.hidden=true;el.reminderDate.value="";setReminderTime("00:00");
    renderFormCategories();const now=tehranNow();el.previewDate.textContent=jalaliDate(now);el.previewTime.textContent=jalaliTime(now);
  }
  function openNew(){
    editingId=null;clearForm();el.formHeading.textContent="یادداشت جدید";el.save.textContent="ذخیره یادداشت";navigate("form");
  }
  function openEdit(id){
    const note=notes.find(item=>item.id===id);if(!note)return;
    editingId=id;formCategory=note.category||"شخصی";draftPhotos=(note.photos||[]).map(photo=>({...photo}));
    el.title.value=note.title||"";el.body.value=note.body||"";
    el.reminderEnabled.checked=!!note.reminderAt;el.reminderFields.hidden=!note.reminderAt;
    if(note.reminderAt){const reminderDate=new Date(note.reminderAt);el.reminderDate.value=jalaliInputValue(reminderDate);setReminderTime(localTimeValue(reminderDate));}else{el.reminderDate.value="";setReminderTime("00:00");}
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
      const previousIds=notes.flatMap(note=>Array.isArray(note.reminderNotificationIds)?note.reminderNotificationIds:[]);
      await replaceAllNotes(validItems);
      const restoredIds=new Set(validItems.flatMap(item=>Array.isArray(item.reminderNotificationIds)?item.reminderNotificationIds:[]));
      await cancelReminderNotifications(previousIds.filter(id=>!restoredIds.has(id)));
      await loadNotes();await reconcileReminders();showToast("بازیابی با موفقیت انجام شد");
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
  el.reminderEnabled.addEventListener("change",()=>{el.reminderFields.hidden=!el.reminderEnabled.checked;if(el.reminderEnabled.checked&&(!el.reminderDate.value||!el.reminderTime.value)){const suggested=new Date(Date.now()+60*60*1000);el.reminderDate.value=jalaliInputValue(suggested);setReminderTime(localTimeValue(suggested));}});
  el.photoPreview.addEventListener("click",event=>{const button=event.target.closest("[data-remove-photo]");if(!button)return;draftPhotos.splice(Number(button.dataset.removePhoto),1);renderPhotoPreview();});
  el.form.addEventListener("submit",async event=>{
    event.preventDefault();const title=el.title.value.trim();const body=el.body.value.trim();
    if(!title&&!body&&!draftPhotos.length){showToast("متن یا عنوان یادداشت را وارد کن");return;}
    el.save.disabled=true;
    try{
      const old=editingId?notes.find(note=>note.id===editingId):null;
      const createdAt=old?old.createdAt:Date.now();const created=new Date(createdAt);
      let reminderAt=null;
      if(el.reminderEnabled.checked){const selectedTime=selectedReminderTime();if(!el.reminderDate.value||!selectedTime)throw new Error("تاریخ و ساعت یادآوری را انتخاب کن");reminderAt=parseJalaliDateTime(el.reminderDate.value,selectedTime);if(!Number.isFinite(reminderAt)||reminderAt<=Date.now())throw new Error("زمان یادآوری باید در آینده باشد");}
      const note={id:old?old.id:crypto.randomUUID(),title,body,category:formCategory,createdAt,dateText:old?old.dateText:jalaliDate(created),timeText:old?old.timeText:jalaliTime(created),updatedAt:Date.now(),photos:draftPhotos,reminderAt,reminderNotificationIds:[]};
      let newIds=[];
      try{if(reminderAt)newIds=await scheduleReminderNotifications(note);note.reminderNotificationIds=newIds;await persist(note);}
      catch(error){if(newIds.length)await cancelReminderNotifications(newIds);throw error;}
      if(old?.reminderNotificationIds?.length)await cancelReminderNotifications(old.reminderNotificationIds);
      navigate("home");showToast(old?"یادداشت ویرایش شد":"یادداشت ذخیره شد");
    }catch(error){showToast(error.message||"ذخیره انجام نشد؛ فضای خالی گوشی را بررسی کن");console.error(error);}
    finally{el.save.disabled=false;}
  });
  el.list.addEventListener("click",async event=>{
    const action=event.target.closest("[data-action]");
    if(action){const id=action.dataset.id;if(action.dataset.action==="edit")openEdit(id);else if(action.dataset.action==="delete"&&confirm("این یادداشت و عکس‌های پیوست‌شده حذف شوند؟")){const target=notes.find(note=>note.id===id);await removeNote(id);if(target?.reminderNotificationIds?.length)await cancelReminderNotifications(target.reminderNotificationIds);showToast("یادداشت حذف شد");}return;}
    const image=event.target.closest("[data-photo-note]");
    if(image){const note=notes.find(item=>item.id===image.dataset.photoNote);const photo=note?.photos?.[Number(image.dataset.photoIndex)];if(photo){el.largeImage.src=photo.data;el.dialog.showModal();}}
  });
  $("close-image").addEventListener("click",()=>el.dialog.close());
  $("export-backup").addEventListener("click",exportBackup);
  $("restore-input").addEventListener("change",event=>{if(event.target.files[0])restoreBackup(event.target.files[0]);});

  async function init(){
    populateReminderTimeOptions();setReminderTime("00:00");
    $("today-label").textContent="امروز · "+todayLabel(new Date());
    try{
      db=await openDb();await migrateOldData();await loadNotes();await reconcileReminders();
      if(navigator.storage?.persist){const persisted=await navigator.storage.persist();console.info("Persistent storage:",persisted);}
    }catch(error){console.error(error);showToast("ذخیره‌سازی گوشی در دسترس نیست؛ مرورگر را به‌روز کن");}
    if("serviceWorker" in navigator){navigator.serviceWorker.register("./sw.js").catch(error=>console.warn("Offline cache unavailable",error));}
  }
  init();
})();