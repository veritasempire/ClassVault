/* ─────────────────────────────────────────────────────────────
   EduTrack — app.js
   Modular, state-managed student dashboard
───────────────────────────────────────────────────────────── */

// ── STATE ─────────────────────────────────────────────────────
const state = {
  students: [],          // source of truth
  editingId: null,       // id of student being edited in modal
  sortKey: "createdAt",  // createdAt | name | class
  searchQuery: "",
  filterClass: "",
};

// Accent colour pool mapped to unique class names
const CLASS_ACCENTS = {};
let accentIndex = 0;

function getAccent(cls) {
  const key = cls.trim().toLowerCase();
  if (!(key in CLASS_ACCENTS)) {
    CLASS_ACCENTS[key] = accentIndex++ % 8;
  }
  return CLASS_ACCENTS[key];
}

// ── STORAGE ───────────────────────────────────────────────────
const STORAGE_KEY = "edutrack_students";

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.students));
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        state.students = parsed;
        // Rebuild accent map from loaded data
        state.students.forEach(s => getAccent(s.class));
      }
    }
  } catch (e) {
    console.warn("Could not parse storage:", e);
  }
}

// ── ID GENERATOR ──────────────────────────────────────────────
function generateId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── VALIDATION ────────────────────────────────────────────────
function validate(fields) {
  // fields: { name, class: cls, timing }  + corresponding error element IDs
  const errors = {};
  if (!fields.name || fields.name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters.";
  }
  if (!fields.cls || fields.cls.trim().length < 1) {
    errors.cls = "Class is required.";
  }
  if (!fields.timing || fields.timing.trim().length < 2) {
    errors.timing = "Please enter a valid timing.";
  }
  return errors;
}

function showFieldErrors(errors, ids) {
  // ids: { name, cls, timing } → element IDs for error spans + inputs
  clearFieldErrors(ids);
  let focused = false;
  for (const [key, msg] of Object.entries(errors)) {
    const errEl = document.getElementById(ids[key].err);
    const inputEl = document.getElementById(ids[key].input);
    if (errEl) errEl.textContent = msg;
    if (inputEl) {
      inputEl.classList.add("error");
      if (!focused) { inputEl.focus(); focused = true; }
    }
  }
}

function clearFieldErrors(ids) {
  for (const { err, input } of Object.values(ids)) {
    const errEl = document.getElementById(err);
    const inputEl = document.getElementById(input);
    if (errEl) errEl.textContent = "";
    if (inputEl) inputEl.classList.remove("error");
  }
}

// ── CRUD OPERATIONS ───────────────────────────────────────────
function createStudent(name, cls, timing) {
  const student = {
    id: generateId(),
    name: name.trim(),
    class: cls.trim(),
    timing: timing.trim(),
    createdAt: Date.now(),
  };
  state.students.unshift(student);
  saveToStorage();
  return student;
}

function updateStudent(id, name, cls, timing) {
  const idx = state.students.findIndex(s => s.id === id);
  if (idx === -1) return false;
  state.students[idx] = {
    ...state.students[idx],
    name: name.trim(),
    class: cls.trim(),
    timing: timing.trim(),
  };
  saveToStorage();
  return true;
}

function deleteStudent(id) {
  const idx = state.students.findIndex(s => s.id === id);
  if (idx === -1) return false;
  const name = state.students[idx].name;
  state.students.splice(idx, 1);
  saveToStorage();
  return name;
}

// ── FILTERING & SORTING ───────────────────────────────────────
function getFilteredStudents() {
  let list = [...state.students];

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(s => s.name.toLowerCase().includes(q));
  }

  if (state.filterClass) {
    list = list.filter(s => s.class.trim().toLowerCase() === state.filterClass.toLowerCase());
  }

  list.sort((a, b) => {
    if (state.sortKey === "name") {
      return a.name.localeCompare(b.name);
    }
    if (state.sortKey === "class") {
      return a.class.localeCompare(b.class) || a.name.localeCompare(b.name);
    }
    return b.createdAt - a.createdAt; // newest first
  });

  return list;
}

function getUniqueClasses() {
  return [...new Set(state.students.map(s => s.class.trim()))].sort();
}

// ── RENDER ────────────────────────────────────────────────────
function render() {
  renderCards();
  renderNavStats();
  renderClassFilter();
  renderBreakdown();
}

function renderCards() {
  const grid = document.getElementById("cardGrid");
  const emptyState = document.getElementById("emptyState");
  const noResults = document.getElementById("noResultsState");

  const filtered = getFilteredStudents();

  // Empty-state logic
  emptyState.style.display  = "none";
  noResults.style.display   = "none";
  grid.style.display        = "";

  if (state.students.length === 0) {
    grid.style.display = "none";
    emptyState.style.display = "block";
    updateResultsLabel(0);
    return;
  }

  if (filtered.length === 0) {
    grid.style.display = "none";
    noResults.style.display = "block";
    updateResultsLabel(0);
    return;
  }

  updateResultsLabel(filtered.length);

  // Diff-render: only rebuild if content changes
  const existing = Array.from(grid.querySelectorAll(".student-card")).map(el => el.dataset.id);
  const incoming = filtered.map(s => s.id);

  // Simple full re-render (fast enough for typical class sizes)
  grid.innerHTML = "";
  filtered.forEach(student => {
    grid.appendChild(buildCard(student));
  });
}

function buildCard(student) {
  const initials = student.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const accentClass = `accent-${getAccent(student.class)}`;
  const dateStr = new Date(student.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });

  const card = document.createElement("div");
  card.className = `student-card ${accentClass}`;
  card.dataset.id = student.id;
  card.innerHTML = `
    <div class="card-avatar">${initials}</div>
    <div class="card-name">${escHtml(student.name)}</div>
    <div class="card-meta"><span class="card-meta-icon">🏫</span>${escHtml(student.class)}</div>
    <div class="card-meta"><span class="card-meta-icon">🕐</span>${escHtml(student.timing)}</div>
    <div class="card-date">Added ${dateStr}</div>
    <div class="card-actions">
      <button class="card-btn card-btn-edit" data-id="${student.id}">✏️ Edit</button>
      <button class="card-btn card-btn-delete" data-id="${student.id}">🗑 Delete</button>
    </div>
  `;

  card.querySelector(".card-btn-edit").addEventListener("click", () => openEditModal(student.id));
  card.querySelector(".card-btn-delete").addEventListener("click", () => handleDelete(student.id));

  return card;
}

function renderNavStats() {
  const totalEl = document.getElementById("totalCount");
  const classEl = document.getElementById("classCount");

  const newTotal = state.students.length;
  const newClasses = getUniqueClasses().length;

  animateCounterChange(totalEl, newTotal);
  animateCounterChange(classEl, newClasses);
}

function animateCounterChange(el, newVal) {
  if (el.textContent !== String(newVal)) {
    el.textContent = newVal;
    el.classList.remove("bump");
    void el.offsetWidth; // reflow
    el.classList.add("bump");
    setTimeout(() => el.classList.remove("bump"), 300);
  }
}

function renderClassFilter() {
  const sel = document.getElementById("filterClass");
  const current = sel.value;
  const classes = getUniqueClasses();
  sel.innerHTML = `<option value="">All Classes</option>` +
    classes.map(c => `<option value="${escHtml(c)}" ${c === current ? "selected" : ""}>${escHtml(c)}</option>`).join("");
}

function renderBreakdown() {
  const container = document.getElementById("breakdownList");
  const classes = getUniqueClasses();

  if (classes.length === 0) {
    container.innerHTML = `<p class="empty-mini">No students yet.</p>`;
    return;
  }

  container.innerHTML = classes.map(cls => {
    const count = state.students.filter(s => s.class.trim() === cls).length;
    return `<div class="breakdown-row">
      <span class="breakdown-class">${escHtml(cls)}</span>
      <span class="breakdown-badge">${count}</span>
    </div>`;
  }).join("");
}

function updateResultsLabel(count) {
  const el = document.getElementById("resultsLabel");
  const hasFilter = state.searchQuery || state.filterClass;
  el.textContent = hasFilter
    ? `${count} result${count !== 1 ? "s" : ""} found`
    : `All Students (${state.students.length})`;
}

// ── ADD FORM LOGIC ────────────────────────────────────────────
const ADD_IDS = {
  name:   { input: "inputName",  err: "errName"  },
  cls:    { input: "inputClass", err: "errClass" },
  timing: { input: "inputTime",  err: "errTime"  },
};

function handleAddStudent() {
  const name   = document.getElementById("inputName").value;
  const cls    = document.getElementById("inputClass").value;
  const timing = document.getElementById("inputTime").value;

  const errors = validate({ name, cls, timing });
  if (Object.keys(errors).length > 0) {
    showFieldErrors(errors, ADD_IDS);
    return;
  }

  clearFieldErrors(ADD_IDS);
  createStudent(name, cls, timing);
  render();

  // Clear + refocus
  document.getElementById("inputName").value  = "";
  document.getElementById("inputClass").value = "";
  document.getElementById("inputTime").value  = "";
  document.getElementById("inputName").focus();

  showToast(`${name.trim()} added!`, "success");
}

// ── DELETE LOGIC ──────────────────────────────────────────────
function handleDelete(id) {
  const name = deleteStudent(id);
  if (name) {
    render();
    showToast(`${name} removed.`, "info");
  }
}

// ── EDIT MODAL ────────────────────────────────────────────────
function openEditModal(id) {
  const student = state.students.find(s => s.id === id);
  if (!student) return;

  state.editingId = id;
  document.getElementById("editName").value  = student.name;
  document.getElementById("editClass").value = student.class;
  document.getElementById("editTime").value  = student.timing;

  clearFieldErrors({
    name:   { input: "editName",  err: "editErrName"  },
    cls:    { input: "editClass", err: "editErrClass" },
    timing: { input: "editTime",  err: "editErrTime"  },
  });

  document.getElementById("modalBackdrop").style.display = "flex";
  document.getElementById("editName").focus();
}

function closeEditModal() {
  document.getElementById("modalBackdrop").style.display = "none";
  state.editingId = null;
}

function handleSaveEdit() {
  const name   = document.getElementById("editName").value;
  const cls    = document.getElementById("editClass").value;
  const timing = document.getElementById("editTime").value;

  const EDIT_IDS = {
    name:   { input: "editName",  err: "editErrName"  },
    cls:    { input: "editClass", err: "editErrClass" },
    timing: { input: "editTime",  err: "editErrTime"  },
  };

  const errors = validate({ name, cls, timing });
  if (Object.keys(errors).length > 0) {
    showFieldErrors(errors, EDIT_IDS);
    return;
  }

  clearFieldErrors(EDIT_IDS);
  updateStudent(state.editingId, name, cls, timing);
  closeEditModal();
  render();
  showToast("Changes saved.", "success");
}

// ── TOAST ─────────────────────────────────────────────────────
let toastTimer = null;

function showToast(msg, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove("show"); }, 2600);
}

// ── DARK MODE ─────────────────────────────────────────────────
const DARK_KEY = "edutrack_dark";

function initDarkMode() {
  const stored = localStorage.getItem(DARK_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = stored !== null ? stored === "true" : prefersDark;
  applyDark(dark);
}

function applyDark(dark) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.getElementById("darkToggle").querySelector(".toggle-icon").textContent = dark ? "☀️" : "🌙";
  localStorage.setItem(DARK_KEY, String(dark));
}

function toggleDark() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  applyDark(!isDark);
}

// ── UTILITY ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── BOOT: EVENT WIRING ────────────────────────────────────────
function boot() {
  // Load persisted data
  loadFromStorage();

  // Dark mode
  initDarkMode();

  // Initial render
  render();

  // ── Add form
  document.getElementById("submitBtn").addEventListener("click", handleAddStudent);

  // Enter key on any add-form input
  ["inputName", "inputClass", "inputTime"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", e => {
      if (e.key === "Enter") handleAddStudent();
    });
  });

  // Auto-advance on Enter within field (Tab feel)
  document.getElementById("inputName").addEventListener("keydown", e => {
    if (e.key === "Tab") return; // let browser handle normal tab
    if (e.key === "Enter") document.getElementById("inputClass").focus();
  });
  document.getElementById("inputClass").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("inputTime").focus();
  });

  // Live validation clearing on input
  document.getElementById("inputName").addEventListener("input", () => {
    document.getElementById("inputName").classList.remove("error");
    document.getElementById("errName").textContent = "";
  });
  document.getElementById("inputClass").addEventListener("input", () => {
    document.getElementById("inputClass").classList.remove("error");
    document.getElementById("errClass").textContent = "";
  });
  document.getElementById("inputTime").addEventListener("input", () => {
    document.getElementById("inputTime").classList.remove("error");
    document.getElementById("errTime").textContent = "";
  });

  // ── Search & filter (real-time)
  document.getElementById("searchInput").addEventListener("input", e => {
    state.searchQuery = e.target.value.trim();
    render();
  });

  document.getElementById("filterClass").addEventListener("change", e => {
    state.filterClass = e.target.value;
    render();
  });

  // ── Sort buttons
  document.querySelectorAll(".sort-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sort-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.sortKey = btn.dataset.sort;
      render();
    });
  });

  // ── Dark mode toggle
  document.getElementById("darkToggle").addEventListener("click", toggleDark);

  // ── Modal controls
  document.getElementById("modalClose").addEventListener("click", closeEditModal);
  document.getElementById("modalCancelBtn").addEventListener("click", closeEditModal);
  document.getElementById("modalSaveBtn").addEventListener("click", handleSaveEdit);

  // Enter in modal inputs
  ["editName", "editClass", "editTime"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", e => {
      if (e.key === "Enter") handleSaveEdit();
      if (e.key === "Escape") closeEditModal();
    });
  });

  // Close modal on backdrop click
  document.getElementById("modalBackdrop").addEventListener("click", e => {
    if (e.target === document.getElementById("modalBackdrop")) closeEditModal();
  });

  // Escape key closes modal globally
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeEditModal();
  });
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", boot);