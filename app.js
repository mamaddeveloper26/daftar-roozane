(() => {
  const STORAGE_KEY = "daftar-roozane-v1";
  const CATEGORIES = ["همه", "کار", "شخصی", "ورزش", "یادداشت"];
  const FORM_CATEGORIES = CATEGORIES.filter((c) => c !== "همه");

  const MONTHS = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
  ];

  let entries = load();
  let activeCategory = "همه";
  let formCategory = "کار";
  let editingId = null;

  const el = {
    home: document.getElementById("view-home"),
    form: document.getElementById("view-form"),
    categories: document.getElementById("categories"),
    formCategories: document.getElementById("form-categories"),
    list: document.getElementById("entries-list"),
    btnAdd: document.getElementById("btn-add"),
    btnBack: document.getElementById("btn-back"),
    entryForm: document.getElementById("entry-form"),
    inputTitle: document.getElementById("input-title"),
    inputBody: document.getElementById("input-body"),
    previewDate: document.getElementById("preview-date"),
    previewTime: document.getElementById("preview-time"),
    formTitle: document.getElementById("form-title"),
    btnSave: document.getElementById("btn-save"),
  };

  function nowTehran() {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Tehran" })
    );
  }

  function toJalali(gy, gm, gd) {
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy;
    if (gy > 1600) {
      jy = 979;
      gy -= 1600;
    } else {
      jy = 0;
      gy -= 621;
    }
    const gy2 = gm > 2 ? gy + 1 : gy;
    let days =
      365 * gy +
      Math.floor((gy2 + 3) / 4) -
      Math.floor((gy2 + 99) / 100) +
      Math.floor((gy2 + 399) / 400) -
      80 +
      gd +
      g_d_m[gm - 1];
    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      jy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }
    const jm =
      days < 186
        ? 1 + Math.floor(days / 31)
        : 7 + Math.floor((days - 186) / 30);
    const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return { jy, jm, jd };
  }

  function formatShamsi(date) {
    const { jy, jm, jd } = toJalali(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate()
    );
    return `${jd} ${MONTHS[jm - 1]} ${jy}`;
  }

  function formatTime(date) {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }

  function refreshAutoTime() {
    const d = nowTehran();
    el.previewDate.textContent = formatShamsi(d);
    el.previewTime.textContent = formatTime(d);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function show(view) {
    el.home.classList.toggle("active", view === "home");
    el.form.classList.toggle("active", view === "form");
    window.scrollTo(0, 0);
  }

  function renderCategories() {
    el.categories.innerHTML = CATEGORIES.map(
      (c) =>
        `<button type="button" class="chip${
          c === activeCategory ? " active" : ""
        }" data-cat="${c}">${c}</button>`
    ).join("");
  }

  function renderFormCategories() {
    el.formCategories.innerHTML = FORM_CATEGORIES.map(
      (c) =>
        `<button type="button" class="chip${
          c === formCategory ? " active" : ""
        }" data-cat="${c}">${c}</button>`
    ).join("");
  }

  function filteredEntries() {
    const list =
      activeCategory === "همه"
        ? entries.slice()
        : entries.filter((e) => e.category === activeCategory);
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  function renderList() {
    const list = filteredEntries();
    if (!list.length) {
      el.list.innerHTML = `
        <div class="empty">
          <strong>هنوز نوشته‌ای نیست</strong>
          با دکمه + اولین نوشته را اضافه کنید
        </div>`;
      return;
    }

    el.list.innerHTML = list
      .map((e) => {
        const d = new Date(e.createdAt);
        return `
        <article class="card" data-cat="${e.category}" data-id="${e.id}">
          <div class="card-top">
            <span class="badge" data-cat="${e.category}">${e.category}</span>
            <div class="card-actions">
              <button type="button" class="mini-btn" data-action="edit" data-id="${e.id}" aria-label="ویرایش">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                </svg>
              </button>
              <button type="button" class="mini-btn danger" data-action="delete" data-id="${e.id}" aria-label="حذف">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                </svg>
              </button>
            </div>
          </div>
          <h2>${escapeHtml(e.title)}</h2>
          ${e.body ? `<p>${escapeHtml(e.body)}</p>` : ""}
          <div class="card-meta">
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>
              </svg>
              ${e.shamsiDate || formatShamsi(d)}
            </span>
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
              </svg>
              ${e.timeStr || formatTime(d)}
            </span>
          </div>
        </article>`;
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function openNew() {
    editingId = null;
    formCategory = "کار";
    el.formTitle.textContent = "نوشته جدید";
    el.btnSave.textContent = "ذخیره";
    el.entryForm.reset();
    renderFormCategories();
    refreshAutoTime();
    show("form");
    el.inputTitle.focus();
  }

  function openEdit(id) {
    const e = entries.find((x) => x.id === id);
    if (!e) return;
    editingId = id;
    formCategory = e.category;
    el.formTitle.textContent = "ویرایش نوشته";
    el.btnSave.textContent = "به‌روزرسانی";
    el.inputTitle.value = e.title;
    el.inputBody.value = e.body || "";
    el.previewDate.textContent = e.shamsiDate;
    el.previewTime.textContent = e.timeStr;
    renderFormCategories();
    show("form");
  }

  el.categories.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-cat]");
    if (!btn) return;
    activeCategory = btn.dataset.cat;
    renderCategories();
    renderList();
  });

  el.formCategories.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-cat]");
    if (!btn) return;
    formCategory = btn.dataset.cat;
    renderFormCategories();
  });

  el.btnAdd.addEventListener("click", openNew);
  el.btnBack.addEventListener("click", () => show("home"));

  el.list.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "delete") {
      if (confirm("این نوشته حذف شود؟")) {
        entries = entries.filter((e) => e.id !== id);
        save();
        renderList();
      }
    } else if (btn.dataset.action === "edit") {
      openEdit(id);
    }
  });

  el.entryForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const title = el.inputTitle.value.trim();
    const body = el.inputBody.value.trim();
    if (!title) return;

    if (editingId) {
      const e = entries.find((x) => x.id === editingId);
      if (e) {
        e.title = title;
        e.body = body;
        e.category = formCategory;
      }
    } else {
      const d = nowTehran();
      entries.push({
        id: crypto.randomUUID(),
        title,
        body,
        category: formCategory,
        createdAt: Date.now(),
        shamsiDate: formatShamsi(d),
        timeStr: formatTime(d),
      });
    }
    save();
    renderList();
    show("home");
  });

  renderCategories();
  renderFormCategories();
  renderList();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
