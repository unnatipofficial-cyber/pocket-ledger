import React, { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
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
const BUDGET_STORAGE_KEY = "pocket-ledger-monthly-budget";
const expenseCategories = ["Food", "Academics", "Travel", "Shopping", "Pocket money", "Bills", "Other"];
const incomeCategories = ["Father", "Mother", "Family support", "Friend", "Scholarship", "Part-time work", "Gift", "Other"];
const categoryIcons = { Food: Coffee, Academics: GraduationCap, Travel: Plane, Shopping: ShoppingBag, Bills: Home, "Pocket money": BarChart3, Other: MoreHorizontal };
const today = new Date();
const accountTransactionLoads = new Map();

function getAccountDisplayName(account) {
  return account?.displayName ||
    account?.fullName ||
    account?.email?.split("@")[0] ||
    "User";
}

function getAccountInitials(account) {
  return getAccountDisplayName(account)
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "U";
}

const toDateInput = (date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
};
const formatCurrency = (amount) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
const formatDate = (date) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`));
const createId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function normalizeTransactions(items) {
  const seen = new Set();
  const fingerprints = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    const fingerprint = [item.type, item.amount, item.category, item.date, item.note || ""].join("|");
    if (fingerprints.has(fingerprint)) return false;
    fingerprints.add(fingerprint);
    return true;
  });
}

function readTransactions() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? normalizeTransactions(parsed) : [];
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
  const existingLoad = accountTransactionLoads.get(accountId);
  if (existingLoad) return existingLoad;

  const load = (async () => {
    const { data: cloudTransactions, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", accountId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return { transactions: null, error: error.message };

    if (!cloudTransactions?.length && localTransactions.length) {
      const legacyRows = normalizeTransactions(localTransactions).map((item) => ({
        id: item.id,
        user_id: accountId,
        type: item.type,
        amount: Number(item.amount),
        category: item.category,
        transaction_date: item.date,
        note: item.note || item.category,
      }));
      const { data: migratedRows, error: migrationError } = await supabase
        .from("transactions")
        .upsert(legacyRows, { onConflict: "id", ignoreDuplicates: true })
        .select();
      if (migrationError) return { transactions: null, error: `Could not migrate local records: ${migrationError.message}` };
      return {
        transactions: normalizeTransactions((migratedRows || []).map(fromCloudTransaction)),
        notice: "Your local records were synced to your account.",
      };
    }

    return { transactions: normalizeTransactions((cloudTransactions || []).map(fromCloudTransaction)), notice: "" };
  })();
  accountTransactionLoads.set(accountId, load);
  try {
    return await load;
  } finally {
    accountTransactionLoads.delete(accountId);
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [theme, setTheme] = useState(() => window.localStorage.getItem("pocket-ledger-theme") || "classic");
  const [localAccount, setLocalAccount] = useState(readLocalAccount);
  const [showAuth, setShowAuth] = useState(() => !readLocalAccount());
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState(() => Number(window.localStorage.getItem(BUDGET_STORAGE_KEY)) || 0);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (monthlyBudget > 0) window.localStorage.setItem(BUDGET_STORAGE_KEY, String(monthlyBudget));
    else window.localStorage.removeItem(BUDGET_STORAGE_KEY);
  }, [monthlyBudget]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    let active = true;
    supabase.auth.getUser().then(async ({ data, error }) => {
      if (!active) return;
      if (error || !data.user) {
        setLocalAccount(null);
        if (error) setNotice("Your session expired or could not be restored. Please log in again.");
        setShowAuth(true);
        return;
      }
      const account = {
        id: data.user.id,
        email: data.user.email,
        displayName: data.user.user_metadata?.full_name || data.user.user_metadata?.name || "",
        createdAt: data.user.created_at,
      };
      setLocalAccount(account);
      setShowAuth(false);
      if (!active) return;
      const result = await loadAccountTransactions(data.user.id, transactions);
      if (!active) return;
      if (result.error) {
        setNotice(result.error.includes("JWT") ? "Your session expired. Please log in again." : `Could not sync your ledger: ${result.error}`);
        return;
      }
      setTransactions(normalizeTransactions(result.transactions || []));
      if (result.notice) setNotice(result.notice);
    }).catch((syncError) => {
      if (active) {
        console.error("Pocket Ledger account sync failed.", syncError);
        setNotice("Could not sync your ledger. Your local records are still available.");
      }
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
  const budgetPercent = monthlyBudget ? Math.round((totals.expense / monthlyBudget) * 100) : 0;

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
    if (isSaving) return;
    setIsSaving(true);
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setError("Please enter an amount greater than ₹0.");
      setIsSaving(false);
      return;
    }
    if (!category.trim()) {
      setError("Add a category or source before saving.");
      setIsSaving(false);
      return;
    }
    try {
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
        if (!result.data) {
          setError("Could not save to your account: no transaction was returned.");
          return;
        }
        entry.id = result.data.id;
        entry.createdAt = result.data.created_at;
      }
      setTransactions((current) => normalizeTransactions(editingId ? current.map((item) => item.id === editingId ? entry : item) : [entry, ...current]));
      setNotice(editingId ? "Transaction updated." : isSupabaseConfigured ? "Transaction saved to your account." : "Transaction saved locally.");
      resetForm();
    } catch (saveError) {
      console.error("Pocket Ledger transaction save failed.", saveError);
      setError("Could not save this transaction. Please try again.");
    } finally {
      setIsSaving(false);
    }
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

  async function exportData() {
    const balances = getRunningBalances(transactions);
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Date", "Type", "Category", "Note", "Amount (INR)", "Balance (INR)"],
      ...transactions
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((item) => [
          item.date,
          item.type === "income" ? "Income" : "Expense",
          item.category,
          item.note || "",
          Number(item.amount) || 0,
          balances[item.id] || 0,
        ]),
    ];
    const payload = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob([payload], { type: "text/csv;charset=utf-8" });
    const file = new File([blob], "pocket-ledger-export.csv", { type: "text/csv" });

    try {
      if (Capacitor.isNativePlatform()) {
        const saved = await Filesystem.writeFile({
          path: "pocket-ledger-export.csv",
          data: payload,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        await Share.share({
          title: "Pocket Ledger spreadsheet",
          text: "Your Pocket Ledger records in spreadsheet format",
          url: saved.uri,
          dialogTitle: "Save or share your ledger export",
        });
        setNotice("Your ledger export is ready to save or share.");
      } else if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Pocket Ledger spreadsheet",
          text: "Your Pocket Ledger records in spreadsheet format",
          files: [file],
        });
        setNotice("Your ledger export is ready to share or save.");
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice("Your readable spreadsheet was downloaded.");
      }
    } catch (exportError) {
      if (exportError?.name !== "AbortError") {
        setNotice("Export could not be completed. Please try again.");
      }
    }
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

  function selectView(view) {
    setActiveView(view);
    setShowMobileNav(false);
    setShowAccountMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        <div className="header-actions"><span className="saved-status"><i /> {isSupabaseConfigured && localAccount ? "Synced to your account" : "Saved locally"}</span>{installPrompt && <button className="install-button" onClick={installApp}><Download size={14} /> Install app</button>}<button className="icon-button menu-button" aria-label="Open navigation" aria-expanded={showMobileNav} onClick={() => setShowMobileNav((current) => !current)}><Menu size={19} /></button><div className="profile-wrap"><button className="profile-button" aria-label={localAccount ? `Open account menu for ${getAccountDisplayName(localAccount)}` : "Open login"} onClick={handleProfileClick}>{localAccount ? getAccountInitials(localAccount) : "U"}</button>{showAccountMenu && localAccount && <div className="account-menu"><strong>{getAccountDisplayName(localAccount)}</strong><span>{localAccount.email}</span><span>Logged in on this device</span><button onClick={logout}>Log out</button></div>}</div></div>
      </header>
      <div className="app-layout" id="top">
        {showMobileNav && <button className="mobile-nav-backdrop" aria-label="Close navigation" onClick={() => setShowMobileNav(false)} />}
        <aside className={showMobileNav ? "sidebar mobile-open" : "sidebar"}>
          <button className="mobile-nav-close" aria-label="Close navigation" onClick={() => setShowMobileNav(false)}><X size={18} /> Close menu</button>
          <p className="side-label">Your workspace</p>
          <button type="button" className={activeView === "dashboard" ? "nav-item active" : "nav-item"} onClick={() => selectView("dashboard")}><LayoutDashboard size={17} /> Overview</button>
          <button type="button" className={activeView === "records" ? "nav-item active" : "nav-item"} onClick={() => selectView("records")}><ReceiptText size={17} /> All records <span>{transactions.length}</span></button>
          <p className="side-label second">Tools</p>
          <button type="button" className={activeView === "settings" ? "nav-item active" : "nav-item"} onClick={() => selectView("settings")}><Settings size={17} /> Settings</button>
          <button type="button" className="nav-item" onClick={() => { setShowGuide(true); setShowMobileNav(false); }}><BookOpen size={17} /> How to use</button>
          <div className="sidebar-note"><BookOpen size={18} /><strong>Small habits add up.</strong><p>Track the little spends. They tell the bigger story.</p></div>
        </aside>

        <section className="main-content">
          {notice && <div className="toast"><Check size={16} /> {notice}</div>}
          {activeView === "settings" ? <SettingsView onExport={exportData} onClear={clearAll} count={transactions.length} theme={theme} onThemeChange={setTheme} onLogin={() => setShowAuth(true)} monthlyBudget={monthlyBudget} onBudgetChange={setMonthlyBudget} /> : activeView === "records" ? (
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
                    <div className="form-actions"><button className="primary-button" type="submit" disabled={isSaving}><Check size={16} /> {isSaving ? "Saving…" : editingId ? "Save changes" : "Save transaction"}</button>{editingId && <button className="cancel-button" type="button" onClick={resetForm} disabled={isSaving}>Cancel</button>}</div>
                  </form>
                </section>
                <section className="paper-card recent-card"><div className="section-heading"><div><p className="eyebrow">Your activity</p><h2>Recent records</h2></div><button className="text-button" onClick={() => setActiveView("records")}>View all <ArrowUpRight size={14} /></button></div><TransactionList transactions={transactions.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)} balances={runningBalances} onEdit={editTransaction} onDelete={removeTransaction} /></section>
              </div>
              <section className="insight-grid"><div className="paper-card insight-card"><div className="section-heading"><div><p className="eyebrow">This month</p><h2>Where your money goes</h2></div><span className="small-muted">{formatCurrency(totals.expense)} spent</span></div>{topCategories.length ? topCategories.map(([name, value]) => <div className="category-row" key={name}><div><span className="category-name">{name}</span><span className="category-amount">{formatCurrency(value)}</span></div><div className="progress-track"><span style={{ width: `${Math.max(8, (value / totals.expense) * 100)}%` }} /></div></div>) : <p className="empty-copy">Your spending breakdown will appear after your first expense.</p>}</div><div className="paper-card privacy-card"><div className="privacy-seal"><Sparkles size={22} /></div><p className="eyebrow">{monthlyBudget ? "Monthly budget" : "Private by design"}</p><h2>{monthlyBudget ? `${budgetPercent}% of budget used` : "Your records stay with you."}</h2><p>{monthlyBudget ? `${formatCurrency(Math.max(0, monthlyBudget - totals.expense))} remaining from ${formatCurrency(monthlyBudget)}.` : isSupabaseConfigured && localAccount ? "Your records are synced privately to your account." : "Your records are stored only on this device."}</p></div></section>
            </>
          )}
        </section>
      </div>
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
      <footer><span>Pocket Ledger</span><span>Built for student life</span><span>{isSupabaseConfigured && localAccount ? "Private account sync" : "Stored on this device"}</span></footer>
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
  return <div className="guide-overlay" role="dialog" aria-modal="true" aria-labelledby="guide-title"><section className="guide-card"><button className="auth-close" aria-label="Close guide" onClick={onClose}><X size={18} /></button><span className="setting-icon"><BookOpen size={19} /></span><p className="eyebrow">Pocket Ledger basics</p><h2 id="guide-title">Manage your money in three steps.</h2><div className="guide-steps"><div><b>1</b><p><strong>Add income</strong> Choose Income when money comes from family, a friend, scholarship, or work.</p></div><div><b>2</b><p><strong>Add expenses</strong> Choose Expense for food, travel, fees, shopping, or anything you buy.</p></div><div><b>3</b><p><strong>Check Remaining</strong> Every record shows the balance left after that entry. Edit mistakes with the pencil icon.</p></div></div><p className="guide-note">Your records are saved on this device. Use Settings to export a readable spreadsheet before changing phones.</p><button className="primary-button" onClick={onClose}>Got it</button></section></div>;
}

function SettingsView({ onExport, onClear, count, theme, onThemeChange, onLogin, monthlyBudget, onBudgetChange }) {
 return <div className="view-wrap"><div className="page-intro"><div><p className="eyebrow">Workspace controls</p><h1>Make it <em>feel like you.</em></h1><p className="intro-copy">Personalize your ledger, manage your budget, and keep your records portable.</p></div></div><section className="settings-grid"><div className="paper-card setting-card theme-card"><span className="setting-icon"><Sparkles size={19} /></span><h2>Appearance</h2><p>Choose a comfortable look. Your choice is saved on this device.</p><div className="theme-options"><button type="button" className={theme === "classic" ? "theme-option selected" : "theme-option"} onClick={() => onThemeChange("classic")}><i className="theme-swatch classic-swatch" />Light</button><button type="button" className={theme === "dark" ? "theme-option selected" : "theme-option"} onClick={() => onThemeChange("dark")}><i className="theme-swatch dark-swatch" />Dark</button><button type="button" className={theme === "lavender" ? "theme-option selected" : "theme-option"} onClick={() => onThemeChange("lavender")}><i className="theme-swatch lavender-swatch" />Lavender</button><button type="button" className={theme === "sunset" ? "theme-option selected" : "theme-option"} onClick={() => onThemeChange("sunset")}><i className="theme-swatch sunset-swatch" />Sunset</button></div></div><div className="paper-card setting-card budget-card"><span className="setting-icon"><WalletCards size={19} /></span><h2>Monthly budget</h2><p>Set a spending limit to see how much of your budget remains.</p><label className="form-label" htmlFor="monthly-budget">Budget amount</label><div className="amount-field"><span>₹</span><input id="monthly-budget" type="number" min="0" step="100" placeholder="No limit" value={monthlyBudget || ""} onChange={(event) => onBudgetChange(Math.max(0, Number(event.target.value) || 0))} /></div></div><div className="paper-card setting-card"><span className="setting-icon"><Download size={19} /></span><h2>Export your ledger</h2><p>Download all {count} saved {count === 1 ? "record" : "records"} as a simple spreadsheet that is easy to read.</p><button type="button" className="primary-button" onClick={onExport}><Download size={16} /> Export spreadsheet</button></div><div className="paper-card setting-card account-card"><span className="setting-icon"><Sparkles size={19} /></span><h2>Share across devices</h2><p>Connect a Supabase account to sync your ledger with your other devices.</p><button type="button" className="outline-button" onClick={onLogin}>Open login</button></div><div className="paper-card setting-card danger-card"><span className="setting-icon danger"><Trash2 size={19} /></span><h2>Clear local records</h2><p>This removes every transaction from this browser. This cannot be undone.</p><button type="button" className="danger-button" onClick={onClear}>Clear all records</button></div></section></div>;
}

function AuthView({ canGoBack, onBack, onSuccess }) {
  const [mode, setMode] = useState("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showResend, setShowResend] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setShowResend(false);
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
        const localAccount = { email: normalizedEmail, displayName: displayName.trim(), passwordHash, createdAt: new Date().toISOString() };
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
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: displayName.trim() } } });
    setBusy(false);
    if (result.error) {
      const errorMessage = result.error.message.toLowerCase();
      setMessage(errorMessage.includes("rate limit")
        ? "Too many attempts were made. Please wait before trying again."
        : result.error.message);
      setShowResend(errorMessage.includes("email not confirmed"));
      return;
    }
    if (!result.data.session || !result.data.user) {
      setMessage("Account created. Check your email, confirm it, then log in here.");
      return;
    }
    const account = {
      id: result.data.user.id,
      email: email.trim().toLowerCase(),
      displayName: result.data.user.user_metadata?.full_name || result.data.user.user_metadata?.name || "",
      createdAt: result.data.user.created_at || new Date().toISOString(),
    };
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(account));
    onSuccess(account);
    setMessage(mode === "login" ? "Welcome back." : "Account created and synced.");
  }

  async function resendConfirmation() {
    if (!supabase || !email.trim()) return;
    setBusy(true);
    const result = await supabase.auth.resend({ type: "signup", email: email.trim().toLowerCase() });
    setBusy(false);
    if (result.error) {
      const rateLimited = result.error.message.toLowerCase().includes("rate limit");
      setMessage(rateLimited
        ? "Email sending is temporarily limited. Please wait before trying again, then check your inbox and spam folder."
        : result.error.message);
      return;
    }
    setMessage("Confirmation email sent. Check your inbox and spam folder.");
    if (!result.error) setShowResend(false);
  }

  return <main className="auth-page"><div className="auth-card">{canGoBack && <button className="auth-close" aria-label="Back to ledger" onClick={onBack}><X size={18} /></button>}<div className="auth-logo"><Sparkles size={25} /></div><p className="eyebrow">Pocket Ledger account</p><h1>{mode === "login" ? "Welcome back." : "Create your profile."}</h1><p className="auth-copy">{isSupabaseConfigured ? "Sign in to sync your student ledger across devices." : "Sign in first so your ledger is protected on this device."}</p><form onSubmit={submit}>{mode === "signup" && <><label className="form-label" htmlFor="auth-name">Your name</label><input className="form-input" id="auth-name" type="text" maxLength={60} placeholder="e.g. Unnati Patil" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></>}<label className="form-label" htmlFor="auth-email">Email</label><input className="form-input" id="auth-email" type="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /><label className="form-label" htmlFor="auth-password">Password</label><input className="form-input" id="auth-password" type="password" required minLength={6} placeholder="At least 6 characters" value={password} onChange={(event) => setPassword(event.target.value)} />{message && <p className="auth-message">{message}</p>}{showResend && <button className="auth-switch" type="button" onClick={resendConfirmation} disabled={busy}>Resend confirmation email</button>}<button className="primary-button auth-submit" disabled={busy}>{busy ? "Connecting..." : mode === "login" ? "Log in" : "Create account"}</button></form><button className="auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); setShowResend(false); }}>{mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}</button><p className="auth-note">{isSupabaseConfigured ? "Your ledger is private to your Supabase account." : "Your profile and ledger stay private on this device."}</p></div></main>;
}

export default App;
