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
    return new Date(g.year,g.month,g.day,Number(hour.value),Number(minute.value),0,0).getTime();
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
  async function pluginWithPermissions() {
    const plugin=window.LocalNotifications;
    if(!plugin) throw new Error("یادآوری فقط در نسخه نصب‌شده اندروید فعال است");
    let permission=await plugin.checkPermissions();
    if(permission.display!=="granted") permission=await plugin.requestPermissions();
    if(permission.display!=="granted") throw new Error("اجازه نمایش اعلان داده نشد؛ از تنظیمات گوشی فعالش کن");
    // Exact-alarm access is optional: Android's AlarmManager falls back to an inexact alarm when unavailable.
    try { await plugin.createChannel({id:"diary-reminders",name:"یادآوری‌های دفترچه",description:"یادآوری یادداشت‌های شخصی",importance:5,vibration:true}); } catch(e) { console.warn("Notification channel",e); }
    return plugin;
  }
  async function cancel(note) {
    if(note && note.reminderNotificationId && window.LocalNotifications)
      await window.LocalNotifications.cancel({notifications:[{id:note.reminderNotificationId}]});
  }
  async function scheduleAt(note, at, plugin) {
    const id=note.reminderNotificationId || idFor(note.id);
    const result=await plugin.schedule({notifications:[{
      id:id,
      title:note.title || "یادآوری دفترچه روزانه",
      body:(note.body || "زمان یادآوری این یادداشت رسیده است").slice(0,180),
      schedule:{at:new Date(at),allowWhileIdle:true},
      channelId:"diary-reminders",
      extra:{noteId:note.id}
    }]});
    if(!result || !Array.isArray(result.notifications) || !result.notifications.some(x=>x.id===id))
      throw new Error("گوشی ثبت اعلان را تأیید نکرد");
    note.reminderAt=at;
    note.reminderText=new Intl.DateTimeFormat("fa-IR-u-ca-persian",{timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(at)) + " · " + new Intl.DateTimeFormat("fa-IR",{timeZone:"Asia/Tehran",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(at));
    note.reminderNotificationId=id;
    return note;
  }
  async function reschedule(note) {
    if(!note || !note.reminderAt || note.reminderAt<=Date.now() || !window.LocalNotifications) return note;
    const plugin=window.LocalNotifications;
    const permission=await plugin.checkPermissions();
    if(permission.display!=="granted") return note;
    // Recreate reminders even without exact-alarm access; Android will use an inexact alarm.
    const id=note.reminderNotificationId || idFor(note.id);
    const pending=await plugin.getPending();
    if(pending.notifications.some(item=>item.id===id)) return note;
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
      delete note.reminderAt;delete note.reminderText;delete note.reminderNotificationId;
      return note;
    }
    if(reminder.error) throw new Error("تاریخ یا ساعت یادآوری معتبر نیست: "+reminder.error);
    const at=reminder.at;
    if(!at || at<=Date.now()) throw new Error("زمان یادآوری باید در آینده باشد");
    const plugin=await pluginWithPermissions();
    return scheduleAt(note,at,plugin);
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
    if(!note || !note.reminderAt) return;
    const date=new Date(note.reminderAt);
    setDate(parts(date));hour.value=String(date.getHours()).padStart(2,"0");minute.value=String(date.getMinutes()).padStart(2,"0");
    enabled.checked=true;fields.hidden=false;updateSummary();
  }
  function render(note) {
    if(!note || !note.reminderAt) return "";
    return '<div class="entry-reminder">🔔 یادآوری: ' + String(note.reminderText || "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])) + '</div>';
  }
  function init() {
    for(let n=0;n<24;n++) hour.add(new Option(digits(String(n).padStart(2,"0")),String(n).padStart(2,"0")));
    for(let n=0;n<60;n++) minute.add(new Option(digits(String(n).padStart(2,"0")),String(n).padStart(2,"0")));
    hour.addEventListener("change",updateSummary);minute.addEventListener("change",updateSummary);
    enabled.addEventListener("change",()=>{fields.hidden=!enabled.checked;if(enabled.checked&&!selected)setDate(parts(new Date()));updateSummary();});
    dateButton.addEventListener("click",openCalendar);
    $("calendar-prev").addEventListener("click",()=>{viewMonth--;if(viewMonth<1){viewMonth=12;viewYear--;}renderCalendar();});
    $("calendar-next").addEventListener("click",()=>{viewMonth++;if(viewMonth>12){viewMonth=1;viewYear++;}renderCalendar();});
    daysBox.addEventListener("click",e=>{const b=e.target.closest("[data-calendar-day]");if(!b)return;draft={year:viewYear,month:viewMonth,day:Number(b.dataset.calendarDay)};renderCalendar();});
    $("calendar-cancel").addEventListener("click",()=>dialog.close());
    $("calendar-confirm").addEventListener("click",()=>{if(draft){setDate(draft);dialog.close();}});
    reset();
  }
  window.DiaryReminder={init,reset,load,capture,apply,cancel,render,reschedule,toGregorian,monthLength,setDate};
  init();
})();