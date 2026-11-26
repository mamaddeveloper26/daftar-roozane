(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const months = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
  let selected = null, viewYear = 0, viewMonth = 0, draft = null;
  const enabled = $("reminder-enabled"), fields = $("reminder-fields");
  const dateButton = $("reminder-date-button"), hour = $("reminder-hour"), minute = $("reminder-minute");
  const summary = $("reminder-summary"), dialog = $("jalali-calendar-dialog");
  const daysBox = $("calendar-days"), title = $("calendar-title");
  const digits = value => String(value).replace(/[0-9]/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  function parts(date) {
    const p = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {timeZone:"Asia/Tehran",year:"numeric",month:"numeric",day:"numeric"}).formatToParts(date);
    const get = type => Number(p.find(x => x.type === type)?.value);
    return {year:get("year"),month:get("month"),day:get("day")};
  }
  function toGregorian(year, month, day) {
    const fmt = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {timeZone:"UTC",year:"numeric",month:"numeric",day:"numeric"});
    const start = Date.UTC(year + 621, 2, 18);
    for (let i = 0; i < 370; i++) {
      const d = new Date(start + i * 86400000);
      const p = fmt.formatToParts(d);
      const get = type => Number(p.find(x => x.type === type)?.value);
      if (get("year") === year && get("month") === month && get("day") === day)
        return {year:d.getUTCFullYear(),month:d.getUTCMonth(),day:d.getUTCDate()};
    }
    throw new Error("تاریخ شمسی معتبر نیست");
  }
  function monthLength(y,m) {
    let n = 0;
    for (let d = 1; d <= 31; d++) { try { toGregorian(y,m,d); n++; } catch (_) { break; } }
    return n;
  }
  function dateText(d) {
    return digits(d.year + "/" + String(d.month).padStart(2,"0") + "/" + String(d.day).padStart(2,"0"));
  }
  function timestamp() {
    if (!selected) return null;
    const g = toGregorian(selected.year, selected.month, selected.day);
    const wanted = Date.UTC(g.year,g.month,g.day,Number(hour.value),Number(minute.value),0,0);
    // Convert the selected Tehran wall-clock time to an absolute timestamp.
    // Do not rely on the phone's current timezone being Asia/Tehran.
    let instant = wanted;
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"
    });
    for (let i=0;i<3;i++) {
      const p=formatter.formatToParts(new Date(instant));
      const get=type=>Number(p.find(x=>x.type===type)?.value);
      const shown=Date.UTC(get("year"),get("month")-1,get("day"),get("hour"),get("minute"),get("second"));
      instant += wanted-shown;
    }
    return instant;
  }
  function updateSummary() {
    summary.textContent = selected ? ("یادآوری در " + dateText(selected) + " ساعت " + digits(hour.value + ":" + minute.value)) : "تاریخ و ساعت یادآوری را انتخاب کن.";
  }
  function setDate(d) {
    selected = {...d}; dateButton.textContent = dateText(selected); updateSummary();
  }
  function renderCalendar() {
    title.textContent = months[viewMonth-1] + " " + digits(viewYear);
    const first = toGregorian(viewYear,viewMonth,1);
    const offset = (new Date(Date.UTC(first.year,first.month,first.day)).getUTCDay() + 1) % 7;
    let html = "";
    for (let i=0;i<offset;i++) html += '<span class="calendar-empty"></span>';
    const count = monthLength(viewYear,viewMonth);
    for (let day=1;day<=count;day++) {
      const active = draft && draft.year===viewYear && draft.month===viewMonth && draft.day===day;
      html += '<button type="button" class="calendar-day' + (active?' selected':'') + '" data-calendar-day="' + day + '">' + digits(day) + '</button>';
    }
    daysBox.innerHTML = html;
    $("calendar-confirm").disabled = !draft;
  }
  function openCalendar() {
    const base = selected || parts(new Date());
    viewYear=base.year;viewMonth=base.month;draft=selected?{...selected}:null;
    renderCalendar();dialog.showModal();
  }
  function idFor(id) {
    let hash=2166136261;
    for(let i=0;i<id.length;i++){hash^=id.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return ((hash>>>0)&0x7fffffff)||1;
  }
  function withTimeout(promise, label, ms=12000) {
    // The lightweight Node test harness has no timer APIs; production Android does.
    if(typeof setTimeout!=="function") return Promise.resolve(promise);
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+" بیش از "+Math.round(ms/1000)+" ثانیه پاسخ نداد")),ms);})
    ]).finally(()=>{if(typeof clearTimeout==="function")clearTimeout(timer);});
  }
  async function pluginWithPermissions() {
    const plugin=window.LocalNotifications;
    if(!plugin) throw new Error("یادآوری فقط در نسخه نصب‌شده اندروید فعال است");
    let permission;
    try { permission=await withTimeout(plugin.checkPermissions(),"بررسی مجوز اعلان"); }
    catch(e) { throw new Error("مرحله بررسی مجوز: "+e.message); }
    if(permission.display!=="granted") {
      try { permission=await withTimeout(plugin.requestPermissions(),"دریافت مجوز اعلان"); }
      catch(e) { throw new Error("مرحله دریافت مجوز: "+e.message); }
    }
    if(permission.display!=="granted") throw new Error("اجازه نمایش اعلان داده نشد؛ از تنظیمات گوشی فعالش کن");
    // Capacitor Local Notifications exposes this API from v6 onward.
    // On Android it is mandatory: do not silently claim a reminder was scheduled
    // when the exact-alarm state cannot be checked.
    if(typeof plugin.checkExactNotificationSetting!=="function")
      throw new Error("افزونه اعلان این نسخه امکان بررسی مجوز آلارم دقیق را ندارد");
    let exact;
    try { exact=await withTimeout(plugin.checkExactNotificationSetting(),"بررسی مجوز آلارم دقیق",8000); }
    catch(e) { throw new Error("مرحله بررسی آلارم دقیق: "+(e.message||"خطای نامشخص")); }
    const exactStatus=exact?.exact_alarm ?? exact?.exactAlarm;
    if(exactStatus!=="granted")
      throw new Error("دسترسی «آلارم دقیق» اندروید برای دفترچه روزانه فعال نیست؛ از تنظیمات برنامه، بخش Alarms & reminders آن را روشن کن");
    // Do not silently continue if the channel cannot be created: on Android 8+
    // a notification posted to a missing channel cannot be displayed.
    try {
      await withTimeout(plugin.createChannel({id:"diary-reminders",name:"یادآوری‌های دفترچه",description:"یادآوری یادداشت‌های شخصی",importance:4,vibration:true}),"ساخت کانال اعلان",8000);
    } catch(e) { throw new Error("مرحله ساخت کانال اعلان: "+(e.message||"خطای نامشخص")); }
    return plugin;
  }
  async function cancel(note) {
    if(note && note.reminderNotificationId && window.LocalNotifications)
      await window.LocalNotifications.cancel({notifications:[{id:note.reminderNotificationId}]});
  }
  function reminderText(at) {
    const date = new Intl.DateTimeFormat("fa-IR-u-ca-persian",{timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(at));
    const time = new Intl.DateTimeFormat("fa-IR",{timeZone:"Asia/Tehran",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(at));
    return date + " · " + time;
  }
  function prepare(note, old, config) {
    const reminder = config || capture();
    if (!reminder.enabled) {
      delete note.reminderEnabled;delete note.reminderAt;delete note.reminderText;
      delete note.reminderNotificationId;delete note.reminderStatus;delete note.reminderError;
      return note;
    }
    note.reminderEnabled = true;
    if (reminder.at && reminder.at > Date.now()) {
      note.reminderAt = reminder.at;
      note.reminderText = reminderText(reminder.at);
      note.reminderNotificationId = old?.reminderNotificationId || note.reminderNotificationId || idFor(note.id);
      note.reminderStatus = "pending";
      delete note.reminderError;
    } else {
      note.reminderStatus = "error";
      note.reminderError = reminder.error || "زمان یادآوری باید در آینده باشد";
      if (old?.reminderAt) {
        note.reminderAt = old.reminderAt;
        note.reminderText = old.reminderText || reminderText(old.reminderAt);
        note.reminderNotificationId = old.reminderNotificationId || idFor(note.id);
      }
    }
    return note;
  }
  async function scheduleAt(note, at, plugin) {
    const id=note.reminderNotificationId || idFor(note.id);
    let result;
    try { result=await withTimeout(plugin.schedule({notifications:[{
      id:id,
      title:note.title || "یادآوری دفترچه روزانه",
      body:(note.body || "زمان یادآوری این یادداشت رسیده است").slice(0,180),
      schedule:{at:new Date(at),allowWhileIdle:true},
      channelId:"diary-reminders",
      extra:{noteId:note.id}
    }]}),"ثبت اعلان در اندروید",15000); }
    catch(e) { throw new Error("مرحله ثبت اعلان: "+(e.message||"خطای نامشخص")); }
    if(!result || !Array.isArray(result.notifications) || !result.notifications.some(x=>x.id===id))
      throw new Error("گوشی ثبت اعلان را تأیید نکرد");
    if(typeof plugin.getPending==="function") {
      let pending;
      try { pending=await withTimeout(plugin.getPending(),"بررسی فهرست اعلان‌ها",8000); }
      catch(e) { throw new Error("مرحله بررسی ثبت: "+e.message); }
      if(!pending?.notifications?.some(x=>x.id===id))
        throw new Error("اندروید پاسخ ثبت داد، اما شناسه اعلان در فهرست معلق‌ها نیست");
    }
    note.reminderAt=at;
    note.reminderText=reminderText(at);
    note.reminderNotificationId=id;
    note.reminderEnabled=true;
    note.reminderStatus="scheduled";
    delete note.reminderError;
    return note;
  }
  async function reschedule(note) {
    if(!note || !note.reminderAt || note.reminderAt<=Date.now() || !window.LocalNotifications) return note;
    const plugin=window.LocalNotifications;
    const permission=await withTimeout(plugin.checkPermissions(),"بررسی مجوز اعلان");
    if(permission.display!=="granted") {
      note.reminderEnabled=true;note.reminderStatus="permission_required";
      note.reminderError="اجازه نمایش اعلان در تنظیمات گوشی فعال نیست";
      return note;
    }
    if(typeof plugin.checkExactNotificationSetting!=="function") {
      note.reminderEnabled=true;note.reminderStatus="error";
      note.reminderError="افزونه اعلان امکان بررسی مجوز آلارم دقیق را ندارد";
      return note;
    }
    const exact=await withTimeout(plugin.checkExactNotificationSetting(),"بررسی مجوز آلارم دقیق",8000);
    if((exact?.exact_alarm ?? exact?.exactAlarm)!=="granted") {
      note.reminderEnabled=true;note.reminderStatus="permission_required";
      note.reminderError="دسترسی آلارم دقیق اندروید فعال نیست";
      return note;
    }
    const id=note.reminderNotificationId || idFor(note.id);
    const pending=await withTimeout(plugin.getPending(),"بررسی فهرست اعلان‌ها",8000);
    if(pending.notifications.some(item=>item.id===id)) {
      note.reminderEnabled=true;note.reminderStatus="scheduled";delete note.reminderError;
      return note;
    }
    try { await plugin.createChannel({id:"diary-reminders",name:"یادآوری‌های دفترچه",description:"یادآوری یادداشت‌های شخصی",importance:5}); } catch(e) {}
    note.reminderNotificationId=id;
    return scheduleAt(note,note.reminderAt,plugin);
  }
  function capture() {
    const isEnabled=enabled.checked;
    if(!isEnabled)return {enabled:false,at:null};
    try {
      return {enabled:true,at:timestamp()};
    } catch(error) {
      // A malformed/unavailable calendar value must not prevent the note itself from being saved.
      return {enabled:true,at:null,error:error?.message||"تاریخ یا ساعت یادآوری معتبر نیست"};
    }
  }
  async function apply(note, old, config) {
    const reminder=config||capture();
    if(!reminder.enabled){
      if(old && old.reminderNotificationId) await cancel(old);
      return prepare(note,old,reminder);
    }
    prepare(note,old,reminder);
    if(reminder.error || !reminder.at || reminder.at<=Date.now())
      throw new Error(reminder.error || "زمان یادآوری باید در آینده باشد");
    const plugin=await pluginWithPermissions();
    return scheduleAt(note,reminder.at,plugin);
  }
  function reset() {
    selected=null;enabled.checked=false;fields.hidden=true;
    const now=parts(new Date());
    const g=toGregorian(now.year,now.month,now.day);
    const localNow=new Date();
    hour.value=String(localNow.getHours()).padStart(2,"0");
    minute.value=String(localNow.getMinutes()).padStart(2,"0");
    dateButton.textContent="انتخاب تاریخ";updateSummary();
  }
  function load(note) {
    reset();
    if(!note || (!note.reminderEnabled && !note.reminderAt)) return;
    enabled.checked=true;fields.hidden=false;
    if(note.reminderAt) {
      const date=new Date(note.reminderAt);
      const timeParts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Tehran",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
      const get=type=>timeParts.find(x=>x.type===type)?.value||"00";
      setDate(parts(date));hour.value=get("hour");minute.value=get("minute");
    }
    updateSummary();
  }
  function render(note) {
    if(!note || (!note.reminderEnabled && !note.reminderAt)) return "";
    const text=String(note.reminderText || (note.reminderError || "یادآوری فعال است")).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
    const state=note.reminderStatus==="scheduled"?"":" · "+(note.reminderStatus==="permission_required"?"نیاز به اجازه اعلان":note.reminderStatus==="error"?"نیازمند اصلاح":"در انتظار ثبت");
    return '<div class="entry-reminder">🔔 یادآوری: ' + text + state + '</div>';
  }
  function init() {
    for(let n=0;n<24;n++) hour.add(new Option(digits(String(n).padStart(2,"0")),String(n).padStart(2,"0")));
    for(let n=0;n<60;n++) minute.add(new Option(digits(String(n).padStart(2,"0")),String(n).padStart(2,"0")));
    hour.addEventListener("change",updateSummary);minute.addEventListener("change",updateSummary);
    enabled.addEventListener("change",()=>{
      fields.hidden=!enabled.checked;
      if(enabled.checked&&!selected){
        // Default to five minutes from now so the first save is not already in the past.
        const future=new Date(Date.now()+5*60*1000);
        setDate(parts(future));
        const timeParts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Tehran",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(future);
        const get=type=>timeParts.find(x=>x.type===type)?.value||"00";
        hour.value=get("hour");minute.value=get("minute");
      }
      updateSummary();
    });
    dateButton.addEventListener("click",openCalendar);
    $("calendar-prev").addEventListener("click",()=>{viewMonth--;if(viewMonth<1){viewMonth=12;viewYear--;}renderCalendar();});
    $("calendar-next").addEventListener("click",()=>{viewMonth++;if(viewMonth>12){viewMonth=1;viewYear++;}renderCalendar();});
    daysBox.addEventListener("click",e=>{const b=e.target.closest("[data-calendar-day]");if(!b)return;draft={year:viewYear,month:viewMonth,day:Number(b.dataset.calendarDay)};renderCalendar();});
    $("calendar-cancel").addEventListener("click",()=>dialog.close());
    $("calendar-confirm").addEventListener("click",()=>{if(draft){setDate(draft);dialog.close();}});
    reset();
  }
  window.DiaryReminder={init,reset,load,capture,prepare,apply,cancel,render,reschedule,toGregorian,monthLength,setDate};
  init();
})();