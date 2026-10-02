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

async function hashPassword(password) {
  const encoded = new TextEncoder().encode(password);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getRunningBalances(transactions) {
  let balance = 0;
  const balances = {};
  [...transactions]
    .sort((a, b) => `${a.date}-${a.createdAt || ""}-${a.id}`.localeCompare(`${b.date}-${b.createdAt || ""}-${b.id}`))
    .forEach((item) => {
      balance += item.type === "income" ? Number(item.amount) || 0 : -(Number(item.amount) || 0);
      balances[item.id] = balance;
    });
  return balances;
}

function fromCloudTransaction(item) {
  return {
    id: item.id,
    createdAt: item.created_at,
    type: item.type,
    amount: Number(item.amount),
    category: item.category,
    date: item.transaction_date,
    note: item.note || item.category,
  };
}

async function loadAccountTransactions(accountId, localTransactions = []) {
  if (!supabase) return { transactions: [], notice: "" };
  const { data: cloudTransactions, error } = await supabase
    .from("transactions")
    .select("*")
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { transactions: null, error: error.message };

  if (!cloudTransactions?.length && localTransactions.length) {
    const legacyRows = localTransactions.map((item) => ({
      user_id: accountId,
      type: item.type,
      amount: Number(item.amount),
      category: item.category,
      transaction_date: item.date,
      note: item.note || item.category,
    }));
    const { data: migratedRows, error: migrationError } = await supabase
      .from("transactions")
      .insert(legacyRows)
      .select();
    if (migrationError) return { transactions: null, error: `Could not migrate local records: ${migrationError.message}` };
    return {
      transactions: (migratedRows || []).map(fromCloudTransaction),
      notice: "Your local records were synced to your account.",
    };
  }

  return { transactions: (cloudTransactions || []).map(fromCloudTransaction), notice: "" };
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
  const [localAccount, setLocalAccount] = useState(readLocalAccount);
  const [showAuth, setShowAuth] = useState(() => !readLocalAccount());
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    let active = true;
    supabase.auth.getUser().then(async ({ data, error }) => {
      if (!active) return;
      if (error || !data.user) {
        setLocalAccount(null);
        setShowAuth(true);
        return;
      }
      const account = { id: data.user.id, email: data.user.email, createdAt: data.user.created_at };
      setLocalAccount(account);
      setShowAuth(false);
      if (!active) return;
      const result = await loadAccountTransactions(data.user.id, transactions);
      if (!active) return;
      if (result.error) {
        setNotice(result.error);
        return;
      }
      setTransactions(result.transactions || []);
      if (result.notice) setNotice(result.notice);
    });
    return () => { active = false; };
  }, []);

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
  const allTimeTotals = transactions.reduce((summary, item) => {
    summary[item.type] += Number(item.amount) || 0;
    return summary;
  }, { income: 0, expense: 0 });
  const balance = allTimeTotals.income - allTimeTotals.expense;
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

  async function submitTransaction(event) {
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
    const entry = { id: editingId || createId(), createdAt: editingId ? transactions.find((item) => item.id === editingId)?.createdAt || new Date().toISOString() : new Date().toISOString(), type, amount: numericAmount, category: category.trim(), date, note: note.trim() || category.trim() };
    if (isSupabaseConfigured && supabase && localAccount?.id) {
      const payload = { type, amount: numericAmount, category: category.trim(), transaction_date: date, note: note.trim() || category.trim(), user_id: localAccount.id };
      const result = editingId
        ? await supabase.from("transactions").update(payload).eq("id", editingId).select().single()
        : await supabase.from("transactions").insert(payload).select().single();
      if (result.error) {
        setError(`Could not save to your account: ${result.error.message}`);
        return;
      }
      entry.id = result.data.id;
      entry.createdAt = result.data.created_at;
    }
    setTransactions((current) => editingId ? current.map((item) => item.id === editingId ? entry : item) : [entry, ...current]);
    setNotice(editingId ? "Transaction updated." : isSupabaseConfigured ? "Transaction saved to your account." : "Transaction saved locally.");
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

  async function removeTransaction(id) {
    if (isSupabaseConfigured && supabase && localAccount?.id) {
      const { error: deleteError } = await supabase.from("transactions").delete().eq("id", id);
      if (deleteError) {
        setNotice(`Could not delete cloud record: ${deleteError.message}`);
        return;
      }
    }
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

  async function handleAuthSuccess(account) {
    setLocalAccount(account);
    setShowAuth(false);
    if (isSupabaseConfigured && supabase && account.id) {
      const result = await loadAccountTransactions(account.id, transactions);
      if (result.error) {
        setNotice(result.error);
      } else {
        setTransactions(result.transactions || []);
        setNotice(result.notice || "You are logged in and your ledger is synced.");
      }
    } else {
      setNotice("You are logged in on this device.");
    }
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
    if (isSupabaseConfigured && supabase) void supabase.auth.signOut();
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
  const runningBalances = getRunningBalances(transactions);
  if (showAuth) {
    return <AuthView canGoBack={Boolean(localAccount)} onBack={() => setShowAuth(false)} onSuccess={handleAuthSuccess} />;
  }
  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" onClick={() => setActiveView("dashboard")}><span className="brand-mark"><Sparkles size={21} /></span><span><strong>Pocket Ledger</strong><small>Student money, clearly kept.</small></span></a>
        <div className="header-actions"><span className="saved-status"><i /> {isSupabaseConfigured && localAccount ? "Synced to your account" : "Saved locally"}</span>{installPrompt && <button className="install-button" onClick={installApp}><Download size={14} /> Install app</button>}<button className="icon-button menu-button" aria-label="Open navigation"><Menu size={19} /></button><div className="profile-wrap"><button className="profile-button" aria-label={localAccount ? "Open account menu" : "Open login"} onClick={handleProfileClick}>U</button>{showAccountMenu && localAccount && <div className="account-menu"><strong>{localAccount.email}</strong><span>Logged in on this device</span><button onClick={logout}>Log out</button></div>}</div></div>
      </header>
      <div className="app-layout" id="top">
        <aside className="sidebar">
          <p className="side-label">Your workspace</p>
          <button className={activeView === "dashboard" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("dashboard")}><LayoutDashboard size={17} /> Overview</button>
          <button className={activeView === "records" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("records")}><ReceiptText size={17} /> All records <span>{transactions.length}</span></button>
          <p className="side-label second">Tools</p>
          <button className={activeView === "settings" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("settings")}><Settings size={17} /> Settings</button>
          <button className="nav-item" onClick={() => setShowGuide(true)}><BookOpen size={17} /> How to use</button>
          <div className="sidebar-note"><BookOpen size={18} /><strong>Small habits add up.</strong><p>Track the little spends. They tell the bigger story.</p></div>
        </aside>

        <section className="main-content">
          {notice && <div className="toast"><Check size={16} /> {notice}</div>}
          {activeView === "settings" ? <SettingsView onExport={exportData} onClear={clearAll} count={transactions.length} theme={theme} onThemeChange={setTheme} onLogin={() => setShowAuth(true)} /> : activeView === "records" ? (
            <RecordsView transactions={filteredTransactions} balances={runningBalances} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onEdit={editTransaction} onDelete={removeTransaction} />
          ) : (
            <>
              <div className="page-intro"><div><p className="eyebrow">October 2026 · Student money hub</p><h1>A clearer view of <em>your money.</em></h1><p className="intro-copy">Know what came in, where it went, and what is still yours.</p></div><div className="date-chip"><CalendarDays size={16} /> {new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(today)}</div></div>
              <section className="summary-grid">
                <div className="summary-card balance-card"><span className="card-kicker">Available balance</span><strong>{formatCurrency(balance)}</strong><p>All income minus all spending</p><div className="balance-line"><span /><span /><span /><span /><span /><span /></div></div>
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
                <section className="paper-card recent-card"><div className="section-heading"><div><p className="eyebrow">Your activity</p><h2>Recent records</h2></div><button className="text-button" onClick={() => setActiveView("records")}>View all <ArrowUpRight size={14} /></button></div><TransactionList transactions={transactions.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)} balances={runningBalances} onEdit={editTransaction} onDelete={removeTransaction} /></section>
              </div>
              <section className="insight-grid"><div className="paper-card insight-card"><div className="section-heading"><div><p className="eyebrow">This month</p><h2>Where your money goes</h2></div><span className="small-muted">{formatCurrency(totals.expense)} spent</span></div>{topCategories.length ? topCategories.map(([name, value]) => <div className="category-row" key={name}><div><span className="category-name">{name}</span><span className="category-amount">{formatCurrency(value)}</span></div><div className="progress-track"><span style={{ width: `${Math.max(8, (value / totals.expense) * 100)}%` }} /></div></div>) : <p className="empty-copy">Your spending breakdown will appear after your first expense.</p>}</div><div className="paper-card privacy-card"><div className="privacy-seal"><Sparkles size={22} /></div><p className="eyebrow">Private by design</p><h2>Your records stay with you.</h2><p>Everything is saved in this browser. No account, server, or tracking required.</p></div></section>
            </>
          )}
        </section>
      </div>
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
      <footer><span>Pocket Ledger</span><span>Built for student life</span><span>Local-first · No cloud sync</span></footer>
    </main>
  );
}

function TransactionList({ transactions, balances, onEdit, onDelete }) {
  if (!transactions.length) return <div className="empty-state"><div className="empty-symbol"><ReceiptText size={21} /></div><h3>No records yet</h3><p>Add an entry to start your personal ledger.</p></div>;
  return <div className="transaction-list">{transactions.map((item) => { const Icon = categoryIcons[item.category] || MoreHorizontal; return <article className="transaction-row" key={item.id}><span className={`transaction-symbol ${item.type}`}><Icon size={17} /></span><div className="transaction-main"><strong>{item.note}</strong><span>{item.category} <b>·</b> {formatDate(item.date)}</span><small>Remaining {formatCurrency(balances[item.id] || 0)}</small></div><strong className={`transaction-value ${item.type}`}>{item.type === "income" ? "+" : "−"}{formatCurrency(item.amount)}</strong><div className="row-actions"><button aria-label={`Edit ${item.note}`} onClick={() => onEdit(item)}><Pencil size={14} /></button><button aria-label={`Delete ${item.note}`} onClick={() => onDelete(item.id)}><Trash2 size={14} /></button></div></article>; })}</div>;
}

function RecordsView({ transactions, balances, search, setSearch, filter, setFilter, onEdit, onDelete }) {
  return <div className="view-wrap"><div className="page-intro"><div><p className="eyebrow">Your archive</p><h1>Every record, <em>in one place.</em></h1><p className="intro-copy">Search, review, and edit your personal money history.</p></div><button className="outline-button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Download size={15} /> Use export in Settings</button></div><section className="paper-card archive-card"><div className="archive-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search records" placeholder="Search notes, categories..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="filter-pills"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "income" ? "active" : ""} onClick={() => setFilter("income")}>Income</button><button className={filter === "expense" ? "active" : ""} onClick={() => setFilter("expense")}>Expenses</button></div></div><TransactionList transactions={transactions} balances={balances} onEdit={onEdit} onDelete={onDelete} /></section></div>;
}

function GuideModal({ onClose }) {
  return <div className="guide-overlay" role="dialog" aria-modal="true" aria-labelledby="guide-title"><section className="guide-card"><button className="auth-close" aria-label="Close guide" onClick={onClose}><X size={18} /></button><span className="setting-icon"><BookOpen size={19} /></span><p className="eyebrow">Pocket Ledger basics</p><h2 id="guide-title">Manage your money in three steps.</h2><div className="guide-steps"><div><b>1</b><p><strong>Add income</strong> Choose Income when money comes from family, a friend, scholarship, or work.</p></div><div><b>2</b><p><strong>Add expenses</strong> Choose Expense for food, travel, fees, shopping, or anything you buy.</p></div><div><b>3</b><p><strong>Check Remaining</strong> Every record shows the balance left after that entry. Edit mistakes with the pencil icon.</p></div></div><p className="guide-note">Your records are saved on this device. Use Settings to export a backup JSON file before changing phones.</p><button className="primary-button" onClick={onClose}>Got it</button></section></div>;
}

function SettingsView({ onExport, onClear, count, theme, onThemeChange, onLogin }) {
  return <div className="view-wrap"><div className="page-intro"><div><p className="eyebrow">Workspace controls</p><h1>Make it <em>feel like you.</em></h1><p className="intro-copy">Choose a mood for your ledger, export your records, or connect an account.</p></div></div><section className="settings-grid"><div className="paper-card setting-card theme-card"><span className="setting-icon"><Sparkles size={19} /></span><h2>Pick your vibe</h2><p>Change the look anytime. Your choice is saved on this device.</p><div className="theme-options"><button className={theme === "classic" ? "theme-option selected" : "theme-option"} onClick={() => onThemeChange("classic")}><i className="theme-swatch classic-swatch" />Classic</button><button className={theme === "lavender" ? "theme-option selected" : "theme-option"} onClick={() => onThemeChange("lavender")}><i className="theme-swatch lavender-swatch" />Lavender</button><button className={theme === "sunset" ? "theme-option selected" : "theme-option"} onClick={() => onThemeChange("sunset")}><i className="theme-swatch sunset-swatch" />Sunset</button></div></div><div className="paper-card setting-card"><span className="setting-icon"><Download size={19} /></span><h2>Export your ledger</h2><p>Download all {count} saved {count === 1 ? "record" : "records"} as a readable JSON file.</p><button className="primary-button" onClick={onExport}><Download size={16} /> Export JSON</button></div><div className="paper-card setting-card account-card"><span className="setting-icon"><Sparkles size={19} /></span><h2>Share across devices</h2><p>Connect a Supabase account to sync your ledger with your classmates and your other devices.</p><button className="outline-button" onClick={onLogin}>Open login</button></div><div className="paper-card setting-card danger-card"><span className="setting-icon danger"><Trash2 size={19} /></span><h2>Clear local records</h2><p>This removes every transaction from this browser. This cannot be undone.</p><button className="danger-button" onClick={onClear}>Clear all records</button></div></section></div>;
}

function AuthView({ canGoBack, onBack, onSuccess }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    if (!isSupabaseConfigured || !supabase) {
      setBusy(true);
      const normalizedEmail = email.trim().toLowerCase();
      const savedAccount = readLocalAccount();
      const passwordHash = await hashPassword(password);
      if (mode === "login") {
        if (!savedAccount || savedAccount.email !== normalizedEmail || savedAccount.passwordHash !== passwordHash) {
          setBusy(false);
          setMessage("Incorrect email or password.");
          return;
        }
        onSuccess(savedAccount);
        setMessage("You are logged in on this device.");
      } else {
        if (savedAccount) {
          setBusy(false);
          setMessage("An account already exists on this device. Please log in.");
          return;
        }
        const localAccount = { email: normalizedEmail, passwordHash, createdAt: new Date().toISOString() };
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(localAccount));
        onSuccess(localAccount);
        setMessage("Your local account is ready on this device.");
      }
      setBusy(false);
      return;
    }
    setBusy(true);
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    if (!result.data.session || !result.data.user) {
      setMessage("Account created. Check your email, confirm it, then log in here.");
      return;
    }
    const account = { id: result.data.user.id, email: email.trim().toLowerCase(), createdAt: result.data.user.created_at || new Date().toISOString() };
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(account));
    onSuccess(account);
    setMessage(mode === "login" ? "Welcome back." : "Account created and synced.");
  }

  return <main className="auth-page"><div className="auth-card">{canGoBack && <button className="auth-close" aria-label="Back to ledger" onClick={onBack}><X size={18} /></button>}<div className="auth-logo"><Sparkles size={25} /></div><p className="eyebrow">Pocket Ledger account</p><h1>{mode === "login" ? "Welcome back." : "Create your profile."}</h1><p className="auth-copy">{isSupabaseConfigured ? "Sign in to sync your student ledger across devices." : "Sign in first so your ledger is protected on this device."}</p><form onSubmit={submit}><label className="form-label" htmlFor="auth-email">Email</label><input className="form-input" id="auth-email" type="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /><label className="form-label" htmlFor="auth-password">Password</label><input className="form-input" id="auth-password" type="password" required minLength={6} placeholder="At least 6 characters" value={password} onChange={(event) => setPassword(event.target.value)} />{message && <p className="auth-message">{message}</p>}<button className="primary-button auth-submit" disabled={busy}>{busy ? "Connecting..." : mode === "login" ? "Log in" : "Create account"}</button></form><button className="auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}</button><p className="auth-note">{isSupabaseConfigured ? "Your ledger is private to your Supabase account." : "Your profile and ledger stay private on this device."}</p></div></main>;
}

export default App;
