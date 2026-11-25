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
const jalali = window.DiaryReminder;
function iso(y,m,d) { const x=jalali.toGregorian(y,m,d); return [x.year,String(x.month+1).padStart(2,"0"),String(x.day).padStart(2,"0")].join("-"); }
assert.equal(iso(1405,1,1),"2026-03-21");
assert.equal(iso(1405,1,13),"2026-04-02");
assert.equal(iso(1405,6,31),"2026-09-22");
assert.equal(iso(1405,7,1),"2026-09-23");
assert.equal(jalali.monthLength(1403,12),30);
assert.equal(jalali.monthLength(1404,12),29);
assert.throws(()=>jalali.toGregorian(1404,12,30),/تاریخ شمسی معتبر نیست/);
console.log("Jalali date conversion tests passed (Nowruz, month boundaries, leap and non-leap Esfand, invalid date).");
