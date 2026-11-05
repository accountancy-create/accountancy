
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyByMIpKF3AAldzu_6Cw8rDH41NgVo44-Uo",
  authDomain: "accountancy-804b2.firebaseapp.com",
  projectId: "accountancy-804b2",
  storageBucket: "accountancy-804b2.firebasestorage.app",
  messagingSenderId: "537103223807",
  appId: "1:537103223807:web:1d132e037c245c1fb835ca",
  measurementId: "G-M17HHGNH3C"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// APP STATE
let currentUser = null;
let clients = [];
let transactions = [];
let selectedClientId = null;

// HELPERS
const $ = (id) => document.getElementById(id);

function usernameToEmail(username) {
  return username.trim().toLowerCase() + "@users.buildledger.invalid";
}

function userCollection(name) {
  if (!currentUser) throw new Error("Please sign in first.");
  return collection(db, "users", currentUser.uid, name);
}

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  });
}

function message(id, text) {
  const element = $(id);
  if (element) element.textContent = text;
}

function showPage(pageId, title) {
  ["dashboardPage", "clientsPage", "accountPage"].forEach(id => {
    $(id).classList.add("hidden");
  });

  $(pageId).classList.remove("hidden");
  $("pageTitle").textContent = title;
}

function safeText(value) {
  return String(value ?? "");
}

// AUTH SWITCH
let showingRegister = false;

$("switchAuthBtn").addEventListener("click", () => {
  showingRegister = !showingRegister;

  $("loginForm").classList.toggle("hidden", showingRegister);
  $("registerForm").classList.toggle("hidden", !showingRegister);

  $("authTitle").textContent = showingRegister
    ? "Create account"
    : "Welcome back";

  $("authSubtitle").textContent = showingRegister
    ? "Create your BuildLedger account."
    : "Sign in to manage your accounts.";

  $("authSwitchText").textContent = showingRegister
    ? "Already have an account?"
    : "Don't have an account?";

  $("switchAuthBtn").textContent = showingRegister
    ? "Sign in"
    : "Create account";
});

// REGISTER
$("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = $("registerUsername").value.trim();
  const password = $("registerPassword").value;
  const confirm = $("confirmPassword").value;

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    message("registerMessage", "Use 3–20 letters, numbers or underscores.");
    return;
  }

  if (password.length < 8) {
    message("registerMessage", "Password must be at least 8 characters.");
    return;
  }

  if (password !== confirm) {
    message("registerMessage", "Passwords do not match.");
    return;
  }

  try {
    message("registerMessage", "Creating account...");

    const credential = await createUserWithEmailAndPassword(
      auth,
      usernameToEmail(username),
      password
    );

    await updateProfile(credential.user, {
      displayName: username
    });

    await addDoc(
      collection(db, "users", credential.user.uid, "profile"),
      {
        username: username,
        createdAt: serverTimestamp()
      }
    );

    $("registerForm").reset();
    message("registerMessage", "Account created successfully!");

  } catch (error) {
    console.error(error);

    message(
      "registerMessage",
      error.code === "auth/email-already-in-use"
        ? "That username is already taken."
        : error.message
    );
  }
});

// LOGIN
$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = $("loginUsername").value.trim();
  const password = $("loginPassword").value;

  if (!username || !password) {
    message("loginMessage", "Enter your username and password.");
    return;
  }

  try {
    message("loginMessage", "Signing in...");

    await signInWithEmailAndPassword(
      auth,
      usernameToEmail(username),
      password
    );

    $("loginForm").reset();
    message("loginMessage", "");

  } catch (error) {
    console.error(error);
    message("loginMessage", "Incorrect username or password.");
  }
});

// LOGOUT
$("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
});

// AUTH STATE
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    $("loginScreen").classList.add("hidden");
    $("appScreen").classList.remove("hidden");

    $("currentUsername").textContent =
      user.displayName || "User";

    try {
      await loadClients();
      await loadTransactions();
      showPage("dashboardPage", "Dashboard");
      updateDashboard();

    } catch (error) {
      console.error(error);
      alert("Could not load your data. Check your Firestore settings.");
    }

  } else {
    $("appScreen").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");

    clients = [];
    transactions = [];
    selectedClientId = null;
  }
});

// NAVIGATION
$("dashboardNav").addEventListener("click", () => {
  showPage("dashboardPage", "Dashboard");
  setActiveNav("dashboardNav");
  updateDashboard();
});

$("clientsNav").addEventListener("click", () => {
  showPage("clientsPage", "Clients");
  setActiveNav("clientsNav");
  renderClients();
});

$("viewAllClients").addEventListener("click", () => {
  showPage("clientsPage", "Clients");
  setActiveNav("clientsNav");
  renderClients();
});

$("backToClients").addEventListener("click", () => {
  showPage("clientsPage", "Clients");
  setActiveNav("clientsNav");
  renderClients();
});

function setActiveNav(id) {
  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.remove("active");
  });

  $(id).classList.add("active");
}

// ADD CLIENT DIALOG
function openClientDialog() {
  $("clientForm").reset();
  message("clientMessage", "");
  $("clientDialog").showModal();
}

$("addClientBtn").addEventListener("click", openClientDialog);
$("addClientTop").addEventListener("click", openClientDialog);

$("cancelDialog").addEventListener("click", () => {
  $("clientDialog").close();
});

// SAVE CLIENT - DUPLICATE SAVE FIX
let savingClient = false;

$("clientForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (savingClient) return;

  const name = $("clientName").value.trim();
  const phone = $("clientPhone").value.trim();
  const project = $("clientProject").value.trim();

  if (!currentUser) {
    message("clientMessage", "Please sign in first.");
    return;
  }

  if (!name) {
    message("clientMessage", "Enter the client name.");
    return;
  }

  const saveButton = $("clientForm").querySelector(
    'button[type="submit"]'
  );

  savingClient = true;
  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  // Close popup immediately
  $("clientDialog").close();

  try {
    await addDoc(userCollection("clients"), {
      name,
      phone,
      project,
      createdAt: serverTimestamp()
    });

    $("clientForm").reset();

    await loadClients();
    updateDashboard();

  } catch (error) {
    console.error("Client save error:", error);

    $("clientDialog").showModal();

    message(
      "clientMessage",
      "Save failed: " + error.message
    );

  } finally {
    savingClient = false;
    saveButton.disabled = false;
    saveButton.textContent = "Save client";
  }
});

// LOAD CLIENTS
async function loadClients() {
  const snapshot = await getDocs(userCollection("clients"));

  clients = snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));

  clients.sort((a, b) =>
    safeText(a.name).localeCompare(safeText(b.name))
  );

  renderClients();
}

// RENDER CLIENTS
function renderClients() {
  const allClients = $("allClients");
  const recentClients = $("recentClients");

  allClients.innerHTML = "";
  recentClients.innerHTML = "";

  const search = $("clientSearch").value.toLowerCase();

  const filtered = clients.filter(client =>
    safeText(client.name).toLowerCase().includes(search) ||
    safeText(client.phone).toLowerCase().includes(search) ||
    safeText(client.project).toLowerCase().includes(search)
  );

  $("clientCount").textContent =
    `${filtered.length} client(s)`;

  $("clientsEmpty").classList.toggle(
    "hidden",
    filtered.length > 0
  );

  $("dashboardEmpty").classList.toggle(
    "hidden",
    clients.length > 0
  );

  filtered.forEach(client => {
    const card = document.createElement("article");
    card.className = "client-card";

    const heading = document.createElement("h3");
    heading.textContent = client.name || "Unnamed client";

    const phone = document.createElement("p");
    phone.className = "muted";
    phone.textContent = client.phone || "No phone number";

    const project = document.createElement("p");
    project.className = "muted";
    project.textContent = client.project || "No project";

    card.append(heading, phone, project);

    card.addEventListener("click", () => {
      openClient(client.id);
    });

    allClients.appendChild(card);
  });

  clients.slice(0, 3).forEach(client => {
    const card = document.createElement("article");
    card.className = "client-card";

    const heading = document.createElement("h3");
    heading.textContent = client.name || "Unnamed client";

    const detail = document.createElement("p");
    detail.className = "muted";
    detail.textContent = client.project || "Client account";

    card.append(heading, detail);

    card.addEventListener("click", () => {
      openClient(client.id);
    });

    recentClients.appendChild(card);
  });
}

$("clientSearch").addEventListener("input", renderClients);

// OPEN CLIENT ACCOUNT
async function openClient(clientId) {
  selectedClientId = clientId;

  const client = clients.find(item => item.id === clientId);
  if (!client) return;

  $("accountClientName").textContent = client.name || "Client";

  $("accountClientDetails").textContent =
    [client.phone, client.project].filter(Boolean).join(" • ");

  showPage("accountPage", "Client account");

  await loadTransactions();
  renderTransactions();
  updateClientSummary();
}

// DELETE CLIENT
$("deleteClientBtn").addEventListener("click", async () => {
  if (!selectedClientId) return;

  const confirmed = confirm(
    "Delete this client and all their transactions?"
  );

  if (!confirmed) return;

  try {
    const clientTransactions = transactions.filter(
      item => item.clientId === selectedClientId
    );

    for (const transaction of clientTransactions) {
      await deleteDoc(
        doc(db, "users", currentUser.uid, "transactions", transaction.id)
      );
    }

    await deleteDoc(
      doc(db, "users", currentUser.uid, "clients", selectedClientId)
    );

    selectedClientId = null;

    await loadClients();
    await loadTransactions();

    showPage("clientsPage", "Clients");
    updateDashboard();

  } catch (error) {
    console.error(error);
    alert("Could not delete client.");
  }
});

// ADD TRANSACTION
$("transactionForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedClientId) return;

  const type = $("transactionType").value;
  const date = $("transactionDate").value;
  const description = $("transactionDescription").value.trim();
  const amount = Number($("transactionAmount").value);

  if (!date || !description || !Number.isFinite(amount) || amount <= 0) {
    message("transactionMessage", "Enter valid transaction details.");
    return;
  }

  try {
    await addDoc(userCollection("transactions"), {
      clientId: selectedClientId,
      type,
      date,
      description,
      amount,
      createdAt: serverTimestamp()
    });

    $("transactionForm").reset();
    message("transactionMessage", "Transaction saved!");

    await loadTransactions();
    renderTransactions();
    updateClientSummary();
    updateDashboard();

  } catch (error) {
    console.error(error);
    message("transactionMessage", "Could not save transaction.");
  }
});

// LOAD TRANSACTIONS
async function loadTransactions() {
  const snapshot = await getDocs(userCollection("transactions"));

  transactions = snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));

  transactions.sort((a, b) =>
    safeText(b.date).localeCompare(safeText(a.date))
  );
}

// RENDER TRANSACTIONS
function renderTransactions() {
  const tbody = $("transactionsTable");
  tbody.innerHTML = "";

  const selected = transactions.filter(
    item => item.clientId === selectedClientId
  );

  $("transactionsEmpty").classList.toggle(
    "hidden",
    selected.length > 0
  );

  selected.forEach(transaction => {
    const row = document.createElement("tr");

    const date = document.createElement("td");
    date.textContent = safeText(transaction.date);

    const type = document.createElement("td");
    type.textContent = transaction.type;

    const description = document.createElement("td");
    description.textContent = safeText(transaction.description);

    const amount = document.createElement("td");
    amount.textContent = money(transaction.amount);

    const action = document.createElement("td");
    const deleteButton = document.createElement("button");

    deleteButton.className = "delete-transaction";
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", () => {
      deleteTransaction(transaction.id);
    });

    action.appendChild(deleteButton);

    row.append(date, type, description, amount, action);
    tbody.appendChild(row);
  });
}

// DELETE TRANSACTION
async function deleteTransaction(transactionId) {
  if (!confirm("Delete this transaction?")) return;

  try {
    await deleteDoc(
      doc(db, "users", currentUser.uid, "transactions", transactionId)
    );

    await loadTransactions();
    renderTransactions();
    updateClientSummary();
    updateDashboard();

  } catch (error) {
    console.error(error);
    alert("Could not delete transaction.");
  }
}

// CALCULATE CLIENT TOTALS
function getTotals(clientId) {
  const records = transactions.filter(
    item => item.clientId === clientId
  );

  let income = 0;
  let expenses = 0;

  records.forEach(item => {
    const amount = Number(item.amount) || 0;

    if (item.type === "income") {
      income += amount;
    } else if (item.type === "expense") {
      expenses += amount;
    }
  });

  return {
    income,
    expenses,
    balance: income - expenses
  };
}

// CLIENT SUMMARY
function updateClientSummary() {
  if (!selectedClientId) return;

  const totals = getTotals(selectedClientId);

  $("clientIncome").textContent = money(totals.income);
  $("clientExpenses").textContent = money(totals.expenses);
  $("clientBalance").textContent = money(totals.balance);
}

// DASHBOARD SUMMARY
function updateDashboard() {
  let income = 0;
  let expenses = 0;

  clients.forEach(client => {
    const totals = getTotals(client.id);
    income += totals.income;
    expenses += totals.expenses;
  });

  $("totalClients").textContent = clients.length;
  $("totalIncome").textContent = money(income);
  $("totalExpenses").textContent = money(expenses);
  $("netBalance").textContent = money(income - expenses);

  renderClients();
}

// CSV EXPORT
$("exportCsvBtn").addEventListener("click", () => {
  if (!selectedClientId) return;

  const selected = transactions.filter(
    item => item.clientId === selectedClientId
  );

  if (!selected.length) {
    alert("No transactions to export.");
    return;
  }

  const rows = [
    ["Date", "Type", "Description", "Amount"]
  ];

  selected.forEach(item => {
    rows.push([
      item.date,
      item.type,
      item.description,
      item.amount
    ]);
  });

  const csv = rows.map(row =>
    row.map(value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`
    ).join(",")
  ).join("\n");

  const blob = new Blob(
    ["\uFEFF" + csv],
    { type: "text/csv;charset=utf-8;" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "BuildLedger-transactions.csv";
  link.click();

  URL.revokeObjectURL(url);
});

// DEFAULT DATE
$("transactionDate").value =
  new Date().toISOString().slice(0, 10);
