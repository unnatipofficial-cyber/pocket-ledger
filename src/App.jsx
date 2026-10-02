import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Coffee,
  Download,
  GraduationCap,
  Home,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Pencil,
  Plane,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const STORAGE_KEY = "pocket-ledger-transactions";
const AUTH_STORAGE_KEY = "pocket-ledger-local-account";
const expenseCategories = ["Food", "Academics", "Travel", "Shopping", "Pocket money", "Bills", "Other"];
const incomeCategories = ["Father", "Mother", "Family support", "Friend", "Scholarship", "Part-time work", "Gift", "Other"];
const categoryIcons = { Food: Coffee, Academics: GraduationCap, Travel: Plane, Shopping: ShoppingBag, Bills: Home, "Pocket money": BarChart3, Other: MoreHorizontal };
const today = new Date();

const toDateInput = (date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
};
const formatCurrency = (amount) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
const formatDate = (date) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`));
const createId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function readTransactions() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalAccount() {
  try {
    const saved = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function App() {
  const [transactions, setTransactions] = useState(readTransactions);
  const [activeView, setActiveView] = useState("dashboard");
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [date, setDate] = useState(toDateInput(today));
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [theme, setTheme] = useState(() => window.localStorage.getItem("pocket-ledger-theme") || "classic");
  const [showAuth, setShowAuth] = useState(false);
  const [localAccount, setLocalAccount] = useState(readLocalAccount);
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("pocket-ledger-theme", theme);
  }, [theme]);

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  const monthTransactions = useMemo(() => transactions.filter((item) => {
    const transactionDate = new Date(`${item.date}T00:00:00`);
    return transactionDate.getMonth() === today.getMonth() && transactionDate.getFullYear() === today.getFullYear();
  }), [transactions]);

  const totals = monthTransactions.reduce((summary, item) => {
    summary[item.type] += Number(item.amount) || 0;
    return summary;
  }, { income: 0, expense: 0 });
  const balance = totals.income - totals.expense;
  const filteredTransactions = useMemo(() => transactions
    .filter((item) => filter === "all" || item.type === filter)
    .filter((item) => `${item.note} ${item.category} ${item.date}`.toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a, b) => b.date.localeCompare(a.date)), [transactions, filter, search]);
  const categoryTotals = monthTransactions.filter((item) => item.type === "expense").reduce((result, item) => {
    result[item.category] = (result[item.category] || 0) + Number(item.amount);
    return result;
  }, {});
  const topCategories = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a).slice(0, 4);

  function changeType(nextType) {
    setType(nextType);
    if (!editingId) setCategory(nextType === "income" ? "Family support" : "Food");
  }

  function resetForm() {
    setAmount("");
    setCategory(type === "income" ? "Family support" : "Food");
    setDate(toDateInput(today));
    setNote("");
    setEditingId(null);
    setError("");
  }

  function submitTransaction(event) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setError("Please enter an amount greater than ₹0.");
      return;
    }
    if (!category.trim()) {
      setError("Add a category or source before saving.");
      return;
    }
    const entry = { id: editingId || createId(), type, amount: numericAmount, category: category.trim(), date, note: note.trim() || category.trim() };
    setTransactions((current) => editingId ? current.map((item) => item.id === editingId ? entry : item) : [entry, ...current]);
    setNotice(editingId ? "Transaction updated." : "Transaction saved locally.");
    resetForm();
    window.setTimeout(() => setNotice(""), 2600);
  }

  function editTransaction(item) {
    setType(item.type);
    setAmount(String(item.amount));
    setCategory(item.category);
    setDate(item.date);
    setNote(item.note === item.category ? "" : item.note);
    setEditingId(item.id);
    setActiveView("dashboard");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeTransaction(id) {
    setTransactions((current) => current.filter((item) => item.id !== id));
    setNotice("Transaction deleted.");
    window.setTimeout(() => setNotice(""), 2600);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), transactions }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pocket-ledger-export.json";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Your ledger export is ready.");
    window.setTimeout(() => setNotice(""), 2600);
  }

  function clearAll() {
    if (window.confirm("Delete every saved transaction from this browser?")) {
      setTransactions([]);
      setNotice("All local records were cleared.");
      window.setTimeout(() => setNotice(""), 2600);
    }
  }

  function handleAuthSuccess(account) {
    setLocalAccount(account);
    setShowAuth(false);
    setNotice("You are logged in on this device.");
    window.setTimeout(() => setNotice(""), 2600);
  }

  function handleProfileClick() {
    if (localAccount) {
      setShowAccountMenu((current) => !current);
      return;
    }
    setShowAuth(true);
  }

  function logout() {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    setLocalAccount(null);
    setShowAccountMenu(false);
    setNotice("You have been logged out.");
    window.setTimeout(() => setNotice(""), 2600);
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  const suggestions = type === "income" ? incomeCategories : expenseCategories;
  if (showAuth) {
    return <AuthView onBack={() => setShowAuth(false)} onSuccess={handleAuthSuccess} />;
  }
  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" onClick={() => setActiveView("dashboard")}><span className="brand-mark"><Sparkles size={21} /></span><span><strong>Pocket Ledger</strong><small>Student money, clearly kept.</small></span></a>
        <div className="header-actions"><span className="saved-status"><i /> Saved locally</span>{installPrompt && <button className="install-button" onClick={installApp}><Download size={14} /> Install app</button>}<button className="icon-button menu-button" aria-label="Open navigation"><Menu size={19} /></button><div className="profile-wrap"><button className="profile-button" aria-label={localAccount ? "Open account menu" : "Open login"} onClick={handleProfileClick}>U</button>{showAccountMenu && localAccount && <div className="account-menu"><strong>{localAccount.email}</strong><span>Logged in on this device</span><button onClick={logout}>Log out</button></div>}</div></div>
      </header>
      <div className="app-layout" id="top">
        <aside className="sidebar">
          <p className="side-label">Your workspace</p>
          <button className={activeView === "dashboard" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("dashboard")}><LayoutDashboard size={17} /> Overview</button>
          <button className={activeView === "records" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("records")}><ReceiptText size={17} /> All records <span>{transactions.length}</span></button>
          <p className="side-label second">Tools</p>
          <button className={activeView === "settings" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("settings")}><Settings size={17} /> Settings</button>
          <div className="sidebar-note"><BookOpen size={18} /><strong>Small habits add up.</strong><p>Track the little spends. They tell the bigger story.</p></div>
        </aside>

        <section className="main-content">
          {notice && <div className="toast"><Check size={16} /> {notice}</div>}
          {activeView === "settings" ? <SettingsView onExport={exportData} onClear={clearAll} count={transactions.length} theme={theme} onThemeChange={setTheme} onLogin={() => setShowAuth(true)} /> : activeView === "records" ? (
            <RecordsView transactions={filteredTransactions} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onEdit={editTransaction} onDelete={removeTransaction} />
          ) : (
            <>
              <div className="page-intro"><div><p className="eyebrow">October 2026 · Student money hub</p><h1>A clearer view of <em>your money.</em></h1><p className="intro-copy">Know what came in, where it went, and what is still yours.</p></div><div className="date-chip"><CalendarDays size={16} /> {new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(today)}</div></div>
              <section className="summary-grid">
                <div className="summary-card balance-card"><span className="card-kicker">Available balance</span><strong>{formatCurrency(balance)}</strong><p>Income minus spending this month</p><div className="balance-line"><span /><span /><span /><span /><span /><span /></div></div>
                <div className="summary-card"><span className="card-kicker"><i className="income-dot" /> Total income</span><strong>{formatCurrency(totals.income)}</strong><p className="positive">↗ Money received this month</p></div>
                <div className="summary-card"><span className="card-kicker"><i className="expense-dot" /> Total spending</span><strong>{formatCurrency(totals.expense)}</strong><p className="negative">↘ Money spent this month</p></div>
              </section>
              <div className="workspace-grid">
                <section className="paper-card entry-card">
                  <div className="section-heading"><div><p className="eyebrow">Keep a record</p><h2>{editingId ? "Edit transaction" : "Add transaction"}</h2></div><span className="heading-icon"><Plus size={17} /></span></div>
                  <form onSubmit={submitTransaction}>
                    <div className="type-switch"><button type="button" className={type === "expense" ? "selected expense" : ""} onClick={() => changeType("expense")}><ArrowUpRight size={15} /> Expense</button><button type="button" className={type === "income" ? "selected income" : ""} onClick={() => changeType("income")}><ArrowDownLeft size={15} /> Income</button></div>
                    <label className="form-label" htmlFor="amount">Amount</label><div className="amount-field"><span>₹</span><input id="amount" type="number" min="1" step="1" inputMode="decimal" placeholder="0" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
                    <div className="form-row"><div><label className="form-label" htmlFor="category">Category</label><input className="form-input" id="category" list="suggestions" value={category} placeholder={type === "income" ? "Father, friend, scholarship..." : "Food, books, travel..."} onChange={(event) => setCategory(event.target.value)} /><datalist id="suggestions">{suggestions.map((item) => <option key={item} value={item} />)}</datalist></div><div><label className="form-label" htmlFor="date">Date</label><input className="form-input" id="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div></div>
                    <label className="form-label" htmlFor="note">Note <small>optional</small></label><input className="form-input" id="note" value={note} maxLength={80} placeholder="What was this for?" onChange={(event) => setNote(event.target.value)} />
                    {error && <p className="form-error">{error}</p>}
                    <div className="form-actions"><button className="primary-button" type="submit"><Check size={16} /> {editingId ? "Save changes" : "Save transaction"}</button>{editingId && <button className="cancel-button" type="button" onClick={resetForm}>Cancel</button>}</div>
                  </form>
                </section>
                <section className="paper-card recent-card"><div className="section-heading"><div><p className="eyebrow">Your activity</p><h2>Recent records</h2></div><button className="text-button" onClick={() => setActiveView("records")}>View all <ArrowUpRight size={14} /></button></div><TransactionList transactions={transactions.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)} onEdit={editTransaction} onDelete={removeTransaction} /></section>
              </div>
              <section className="insight-grid"><div className="paper-card insight-card"><div className="section-heading"><div><p className="eyebrow">This month</p><h2>Where your money goes</h2></div><span className="small-muted">{formatCurrency(totals.expense)} spent</span></div>{topCategories.length ? topCategories.map(([name, value]) => <div className="category-row" key={name}><div><span className="category-name">{name}</span><span className="category-amount">{formatCurrency(value)}</span></div><div className="progress-track"><span style={{ width: `${Math.max(8, (value / totals.expense) * 100)}%` }} /></div></div>) : <p className="empty-copy">Your spending breakdown will appear after your first expense.</p>}</div><div className="paper-card privacy-card"><div className="privacy-seal"><Sparkles size={22} /></div><p className="eyebrow">Private by design</p><h2>Your records stay with you.</h2><p>Everything is saved in this browser. No account, server, or tracking required.</p></div></section>
            </>
          )}
        </section>
      </div>
      <footer><span>Pocket Ledger</span><span>Built for student life</span><span>Local-first · No cloud sync</span></footer>
    </main>
  );
}

function TransactionList({ transactions, onEdit, onDelete }) {
  if (!transactions.length) return <div className="empty-state"><div className="empty-symbol"><ReceiptText size={21} /></div><h3>No records yet</h3><p>Add an entry to start your personal ledger.</p></div>;
  return <div className="transaction-list">{transactions.map((item) => { const Icon = categoryIcons[item.category] || MoreHorizontal; return <article className="transaction-row" key={item.id}><span className={`transaction-symbol ${item.type}`}><Icon size={17} /></span><div className="transaction-main"><strong>{item.note}</strong><span>{item.category} <b>·</b> {formatDate(item.date)}</span></div><strong className={`transaction-value ${item.type}`}>{item.type === "income" ? "+" : "−"}{formatCurrency(item.amount)}</strong><div className="row-actions"><button aria-label={`Edit ${item.note}`} onClick={() => onEdit(item)}><Pencil size={14} /></button><button aria-label={`Delete ${item.note}`} onClick={() => onDelete(item.id)}><Trash2 size={14} /></button></div></article>; })}</div>;
}

function RecordsView({ transactions, search, setSearch, filter, setFilter, onEdit, onDelete }) {
  return <div className="view-wrap"><div className="page-intro"><div><p className="eyebrow">Your archive</p><h1>Every record, <em>in one place.</em></h1><p className="intro-copy">Search, review, and edit your personal money history.</p></div><button className="outline-button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Download size={15} /> Use export in Settings</button></div><section className="paper-card archive-card"><div className="archive-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search records" placeholder="Search notes, categories..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="filter-pills"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "income" ? "active" : ""} onClick={() => setFilter("income")}>Income</button><button className={filter === "expense" ? "active" : ""} onClick={() => setFilter("expense")}>Expenses</button></div></div><TransactionList transactions={transactions} onEdit={onEdit} onDelete={onDelete} /></section></div>;
}

function SettingsView({ onExport, onClear, count, theme, onThemeChange, onLogin }) {
  return <div className="view-wrap"><div className="page-intro"><div><p className="eyebrow">Workspace controls</p><h1>Make it <em>feel like you.</em></h1><p className="intro-copy">Choose a mood for your ledger, export your records, or connect an account.</p></div></div><section className="settings-grid"><div className="paper-card setting-card theme-card"><span className="setting-icon"><Sparkles size={19} /></span><h2>Pick your vibe</h2><p>Change the look anytime. Your choice is saved on this device.</p><div className="theme-options"><button className={theme === "classic" ? "theme-option selected" : "theme-option"} onClick={() => onThemeChange("classic")}><i className="theme-swatch classic-swatch" />Classic</button><button className={theme === "lavender" ? "theme-option selected" : "theme-option"} onClick={() => onThemeChange("lavender")}><i className="theme-swatch lavender-swatch" />Lavender</button><button className={theme === "sunset" ? "theme-option selected" : "theme-option"} onClick={() => onThemeChange("sunset")}><i className="theme-swatch sunset-swatch" />Sunset</button></div></div><div className="paper-card setting-card"><span className="setting-icon"><Download size={19} /></span><h2>Export your ledger</h2><p>Download all {count} saved {count === 1 ? "record" : "records"} as a readable JSON file.</p><button className="primary-button" onClick={onExport}><Download size={16} /> Export JSON</button></div><div className="paper-card setting-card account-card"><span className="setting-icon"><Sparkles size={19} /></span><h2>Share across devices</h2><p>Connect a Supabase account to sync your ledger with your classmates and your other devices.</p><button className="outline-button" onClick={onLogin}>Open login</button></div><div className="paper-card setting-card danger-card"><span className="setting-icon danger"><Trash2 size={19} /></span><h2>Clear local records</h2><p>This removes every transaction from this browser. This cannot be undone.</p><button className="danger-button" onClick={onClear}>Clear all records</button></div></section></div>;
}

function AuthView({ onBack, onSuccess }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    if (!isSupabaseConfigured || !supabase) {
      const localAccount = { email: email.trim().toLowerCase(), createdAt: new Date().toISOString() };
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(localAccount));
      onSuccess(localAccount);
      setMessage(mode === "login" ? "You are logged in on this device." : "Your local account is ready on this device.");
      return;
    }
    setBusy(true);
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (!result.error) {
      const account = { email: email.trim().toLowerCase(), createdAt: new Date().toISOString() };
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(account));
      onSuccess(account);
    }
    setMessage(result.error ? result.error.message : mode === "login" ? "Welcome back." : "Account created. Check your email to confirm it.");
  }

  return <main className="auth-page"><div className="auth-card"><button className="auth-close" aria-label="Back to ledger" onClick={onBack}><X size={18} /></button><div className="auth-logo"><Sparkles size={25} /></div><p className="eyebrow">Pocket Ledger account</p><h1>{mode === "login" ? "Welcome back." : "Create your profile."}</h1><p className="auth-copy">Log in on this device now. Cloud sync can be connected later when Supabase is configured.</p><form onSubmit={submit}><label className="form-label" htmlFor="auth-email">Email</label><input className="form-input" id="auth-email" type="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /><label className="form-label" htmlFor="auth-password">Password</label><input className="form-input" id="auth-password" type="password" required minLength={6} placeholder="At least 6 characters" value={password} onChange={(event) => setPassword(event.target.value)} />{message && <p className="auth-message">{message}</p>}<button className="primary-button auth-submit" disabled={busy}>{busy ? "Connecting..." : mode === "login" ? "Log in" : "Create account"}</button></form><button className="auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}</button><p className="auth-note">Your profile and ledger stay private on this device.</p></div></main>;
}

export default App;
