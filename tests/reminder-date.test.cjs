const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class FakeElement {
  constructor() { this.value=""; this.hidden=false; this.checked=false; this.disabled=false; this.textContent=""; this.innerHTML=""; this.listeners={}; }
  add() {}
  addEventListener(name, callback) { this.listeners[name]=callback; }
  showModal() {}
  close() {}
}
const elements = new Map();
const document = { getElementById(id) { if(!elements.has(id)) elements.set(id,new FakeElement()); return elements.get(id); } };
const window = {};
const Option = function(text,value) { this.text=text; this.value=value; };
const source = fs.readFileSync("reminders.js","utf8");
vm.runInNewContext(source,{window,document,Intl,Date,Number,String,Math,Array,Object,Error,console,Option});
const api = window.DiaryReminder;
function iso(y,m,d) { const x=api.toGregorian(y,m,d); return [x.year,String(x.month+1).padStart(2,"0"),String(x.day).padStart(2,"0")].join("-"); }
assert.equal(iso(1405,1,1),"2026-03-21");
assert.equal(iso(1405,1,13),"2026-04-02");
assert.equal(iso(1405,6,31),"2026-09-22");
assert.equal(iso(1405,7,1),"2026-09-23");
assert.equal(api.monthLength(1403,12),30);
assert.equal(api.monthLength(1404,12),29);
assert.throws(()=>api.toGregorian(1404,12,30),/تاریخ شمسی معتبر نیست/);
document.getElementById("reminder-enabled").checked=true;
api.setDate({year:1404,month:12,day:30});
const invalidCapture=api.capture();
assert.equal(invalidCapture.enabled,true);
assert.equal(invalidCapture.at,null);
assert.match(invalidCapture.error,/تاریخ شمسی معتبر نیست/);
api.setDate({year:1405,month:10,day:1});

(async()=>{
  let scheduled=null, cancelled=null;
  window.NativeReminder={
    schedule:async options=>{scheduled=options;return {id:options.id,scheduledAt:options.at,scheduled:true}},
    cancel:async options=>{cancelled=options.id;return {id:options.id,cancelled:true}}
  };
  document.getElementById("reminder-enabled").checked=true;
  api.reset();
  document.getElementById("reminder-enabled").checked=true;
  const beforeDefault=Date.now();
  document.getElementById("reminder-enabled").listeners.change();
  const defaultCapture=api.capture();
  assert.ok(defaultCapture.at>=beforeDefault+4*60*1000);
  assert.ok(defaultCapture.at<=beforeDefault+6*60*1000);
  const future=api.toGregorian(1405,10,1);
  const target=Date.UTC(future.year,future.month,future.day,12,30);
  const config={enabled:true,at:target};
  const prepared=api.prepare({id:"test-note-1",title:"آزمون",body:"اعلان آزمایشی"},null,config);
  assert.equal(prepared.reminderEnabled,true);
  assert.equal(prepared.reminderStatus,"pending");
  const note=await api.apply(prepared,null,config);
  assert.equal(scheduled.id,note.reminderNotificationId);
  assert.equal(scheduled.at,note.reminderAt);
  assert.equal(scheduled.noteId,note.id);
  assert.equal(note.reminderStatus,"scheduled");
  assert.match(note.reminderText,/۱۴۰۵/);
  api.load(note);
  assert.equal(document.getElementById("reminder-enabled").checked,true);
  const restored=await api.reschedule({...note});
  assert.equal(restored.reminderStatus,"scheduled");
  const cleared=await api.apply({...note},note,{enabled:false});
  assert.equal(cancelled,note.reminderNotificationId);
  assert.equal(cleared.reminderAt,undefined);
  await assert.rejects(()=>api.apply({id:"bad-note"},null,{enabled:true,at:Date.now()-1000}),/زمان یادآوری باید در آینده باشد/);
  console.log("Jalali calendar and native AlarmManager bridge tests passed.");
})().catch(error=>{console.error(error);process.exitCode=1;});
