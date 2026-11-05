
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// FIREBASE CONFIG
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

const $ = id => document.getElementById(id);

let currentUser = null;
let clients = [];
let activeClient = null;
let savingClient = false;
let savingTransaction = false;
let isRegistering = false;
let isLoggingIn = false;

// HELPERS
function usernameToEmail(username) {
  return username.trim().toLowerCase() + "@users.buildledger.invalid";
}

function userCollection(name) {
  if (!currentUser) throw new Error("Please sign in first.");
  return collection(db, "users", currentUser.uid, name);
}

function money(value) {
  return "₹" + Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function message(id, text) {
  const element = $(id);
  if (element) element.textContent = text;
}

function hideElement(id, hide) {
  const element = $(id);
  if (element) element.classList.toggle("hidden", hide);
}

function showPage(page) {
  ["dashboardPage", "clientsPage", "accountPage"].forEach(id => {
    hideElement(id, id !== page);
  });

  const titles = {
    dashboardPage: "Dashboard",
    clientsPage: "Clients",
    accountPage: "Client account"
  };

  if ($("pageTitle")) {
    $("pageTitle").textContent = titles[page] || "BuildLedger";
  }
}

// APP STATUS MESSAGE
function showAppStatus(text, isError = false) {
  let status = $("appStatus");

  if (!status) {
    status = document.createElement("p");
    status.id = "appStatus";
    status.className = "message";
    status.setAttribute("role", "status");

    const main = document.querySelector(".main-area");
    if (main) {
      main.insertBefore(status, main.firstChild);
    }
  }

  status.textContent = text;
  status.style.color = isError ? "#b91c1c" : "#2563eb";
  status.classList.remove("hidden");
}

// AUTH SWITCH
function switchAuth() {
  const login = $("loginForm");
  const register = $("registerForm");

  if (!login || !register) return;

  const registering = register.classList.contains("hidden");

  login.classList.toggle("hidden", registering);
  register.classList.toggle("hidden", !registering);

  if ($("authTitle")) {
    $("authTitle").textContent = registering
      ? "Create account"
      : "Welcome back";
  }

  if ($("authSubtitle")) {
    $("authSubtitle").textContent = registering
      ? "Register to use BuildLedger"
      : "Sign in to your account";
  }

  if ($("authSwitchText")) {
    $("authSwitchText").textContent = registering
      ? "Already have an account?"
      : "Don't have an account?";
  }

  if ($("switchAuthBtn")) {
    $("switchAuthBtn").textContent = registering
      ? "Sign in"
      : "Create account";
  }

  message("loginMessage", "");
  message("registerMessage", "");
}

$("switchAuthBtn")?.addEventListener("click", switchAuth);

// REGISTER
$("registerForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (isRegistering) return;
  isRegistering = true;

  const form = $("registerForm");
  const button = form.querySelector('button[type="submit"]');

  if (button) {
    button.disabled = true;
    button.textContent = "Creating account...";
  }

  const username = $("registerUsername").value.trim();
  const password = $("registerPassword").value;
  const confirm = $("confirmPassword").value;

  try {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      throw new Error("Username must be 3–20 characters and use only letters, numbers or underscores.");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    if (password !== confirm) {
      throw new Error("Passwords do not match.");
    }

    await createUserWithEmailAndPassword(
      auth,
      usernameToEmail(username),
      password
    );

    message("registerMessage", "Account created successfully!");

  } catch (error) {
    console.error("Registration error:", error);
    message("registerMessage", error.message);

  } finally {
    isRegistering = false;

    if (button) {
      button.disabled = false;
      button.textContent = "Create account →";
    }
  }
});

// LOGIN
$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (isLoggingIn) return;
  isLoggingIn = true;

  const form = $("loginForm");
  const button = form.querySelector('button[type="submit"]');

  if (button) {
    button.disabled = true;
    button.textContent = "Signing in...";
  }

  try {
    const username = $("loginUsername").value.trim();
    const password = $("loginPassword").value;

    await signInWithEmailAndPassword(
      auth,
      usernameToEmail(username),
      password
    );

    message("loginMessage", "");

  } catch (error) {
    console.error("Login error:", error);
    message("loginMessage", "Login failed: " + error.message);

  } finally {
    isLoggingIn = false;

    if (button) {
      button.disabled = false;
      button.textContent = "Sign in →";
    }
  }
});

// LOGOUT
$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    alert("Sign out failed: " + error.message);
  }
});

// AUTH STATE
onAuthStateChanged(auth, async user => {
  currentUser = user;

  hideElement("loginScreen", !!user);
  hideElement("appScreen", !user);

  if (!user) {
    clients = [];
    activeClient = null;
    return;
  }

  if ($("currentUsername")) {
    $("currentUsername").textContent =
      user.email.split("@")[0];
  }

  try {
    await loadClients();
    showPage("dashboardPage");
    updateDashboard();
  } catch (error) {
    console.error("Account loading error:", error);
    showAppStatus("Could not load your data: " + error.message, true);
  }
});

// NAVIGATION
$("dashboardNav")?.addEventListener("click", () => {
  showPage("dashboardPage");
  updateDashboard();
});

$("clientsNav")?.addEventListener("click", () => {
  showPage("clientsPage");
  renderClients();
});

$("viewAllClients")?.addEventListener("click", () => {
  showPage("clientsPage");
  renderClients();
});

// CLIENT DIALOG
function openClientDialog() {
  if (!currentUser) {
    showAppStatus("Please sign in before adding a client.", true);
    return;
  }

  if (!$("clientDialog")) return;

  $("clientForm")?.reset();
  message("clientMessage", "");

  if (!$("clientDialog").open) {
    $("clientDialog").showModal();
  }
}

$("addClientBtn")?.addEventListener("click", openClientDialog);
$("addClientTop")?.addEventListener("click", openClientDialog);

$("cancelDialog")?.addEventListener("click", () => {
  if ($("clientDialog")?.open) {
    $("clientDialog").close();
  }
});

// SAVE CLIENT
$("clientForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (savingClient || !currentUser) return;

  const name = $("clientName").value.trim();
  const phone = $("clientPhone").value.trim();
  const project = $("clientProject").value.trim();

  if (!name) {
    message("clientMessage", "Enter a client name.");
    return;
  }

  const form = $("clientForm");
  const button = form.querySelector('button[type="submit"]');

  savingClient = true;

  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }

  // Close the popup immediately.
  // Keep the entered values in case saving fails.
  if ($("clientDialog")?.open) {
    $("clientDialog").close();
  }

  showAppStatus("Saving client...");

  try {
    const result = await addDoc(userCollection("clients"), {
      name,
      phone,
      project,
      createdAt: serverTimestamp()
    });

    clients.push({
      id: result.id,
      name,
      phone,
      project,
      income: 0,
      expenses: 0
    });

    form.reset();

    renderClients();
    updateDashboard();

    showAppStatus("Client saved successfully.");

  } catch (error) {
    console.error("Client save failed:", error);

    // Restore the popup and entered information.
    if ($("clientDialog") && !$("clientDialog").open) {
      $("clientDialog").showModal();
    }

    message("clientMessage", "Save failed: " + error.message);
    showAppStatus("Client was not saved. Check the error in the popup.", true);

  } finally {
    savingClient = false;

    if (button) {
      button.disabled = false;
      button.textContent = "Save client";
    }
  }
});

// LOAD CLIENTS
async function loadClients() {
  if (!currentUser) return;

  const snapshot = await getDocs(userCollection("clients"));

  clients = snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));

  // Load transaction totals for all clients.
  await Promise.all(clients.map(async client => {
    const ref = collection(
      db,
      "users",
      currentUser.uid,
      "clients",
      client.id,
      "transactions"
    );

    const transactions = await getDocs(ref);

    let income = 0;
    let expenses = 0;

    transactions.forEach(item => {
      const data = item.data();

      if (data.type === "income") {
        income += Number(data.amount || 0);
      } else {
        expenses += Number(data.amount || 0);
      }
    });

    client.income = income;
    client.expenses = expenses;
  }));

  renderClients();
  updateDashboard();
}

// RENDER CLIENTS
function renderClients() {
  const container = $("allClients");
  if (!container) return;

  container.innerHTML = "";

  const search = $("clientSearch")?.value.trim().toLowerCase() || "";

  const filtered = clients.filter(client =>
    (client.name || "").toLowerCase().includes(search) ||
    (client.phone || "").toLowerCase().includes(search) ||
    (client.project || "").toLowerCase().includes(search)
  );

  if ($("clientCount")) {
    $("clientCount").textContent = filtered.length + " client(s)";
  }

  hideElement("clientsEmpty", filtered.length !== 0);

  filtered.forEach(client => {
    const card = document.createElement("div");
    card.className = "client-card";

    const heading = document.createElement("h3");
    heading.textContent = client.name || "Unnamed client";

    const details = document.createElement("p");
    details.textContent =
      (client.phone || "No phone") + " • " +
      (client.project || "No project");

    const balance = document.createElement("p");
    balance.textContent = "Balance: " + money(
      Number(client.income || 0) -
      Number(client.expenses || 0)
    );

    card.append(heading, details, balance);
    card.addEventListener("click", () => openClient(client));

    container.appendChild(card);
  });
}

$("clientSearch")?.addEventListener("input", renderClients);

// DASHBOARD
function updateDashboard() {
  const totalIncome = clients.reduce(
    (sum, client) => sum + Number(client.income || 0), 0
  );

  const totalExpenses = clients.reduce(
    (sum, client) => sum + Number(client.expenses || 0), 0
  );

  if ($("totalClients")) {
    $("totalClients").textContent = clients.length;
  }

  if ($("totalIncome")) {
    $("totalIncome").textContent = money(totalIncome);
  }

  if ($("totalExpenses")) {
    $("totalExpenses").textContent = money(totalExpenses);
  }

  if ($("netBalance")) {
    $("netBalance").textContent =
      money(totalIncome - totalExpenses);
  }

  if ($("recentClients")) {
    $("recentClients").innerHTML = "";

    clients.slice(-5).reverse().forEach(client => {
      const item = document.createElement("p");
      item.textContent = client.name;
      item.className = "client-card";
      item.addEventListener("click", () => openClient(client));
      $("recentClients").appendChild(item);
    });
  }

  hideElement("dashboardEmpty", clients.length !== 0);
}

// OPEN CLIENT
async function openClient(client) {
  activeClient = client;

  showPage("accountPage");

  if ($("accountClientName")) {
    $("accountClientName").textContent = client.name || "Client";
  }

  if ($("accountClientDetails")) {
    $("accountClientDetails").textContent =
      (client.phone || "") + " " + (client.project || "");
  }

  message("transactionMessage", "");
  await loadTransactions();
}

// BACK TO CLIENTS
$("backToClients")?.addEventListener("click", () => {
  showPage("clientsPage");
  renderClients();
});

// SAVE TRANSACTION
$("transactionForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (savingTransaction || !currentUser || !activeClient) return;

  const type = $("transactionType").value;
  const date = $("transactionDate").value;
  const description = $("transactionDescription").value.trim();
  const amount = Number($("transactionAmount").value);

  if (!date || !description || !Number.isFinite(amount) || amount <= 0) {
    message("transactionMessage", "Enter a date, description and valid amount.");
    return;
  }

  savingTransaction = true;

  const form = $("transactionForm");
  const button = form.querySelector('button[type="submit"]');

  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }

  try {
    await addDoc(
      collection(
        db,
        "users",
        currentUser.uid,
        "clients",
        activeClient.id,
        "transactions"
      ),
      {
        type,
        date,
        description,
        amount,
        createdAt: serverTimestamp()
      }
    );

    form.reset();
    message("transactionMessage", "Transaction saved successfully!");

    await loadTransactions();

  } catch (error) {
    console.error("Transaction save failed:", error);
    message("transactionMessage", "Save failed: " + error.message);

  } finally {
    savingTransaction = false;

    if (button) {
      button.disabled = false;
      button.textContent = "Save transaction";
    }
  }
});

// LOAD TRANSACTIONS
async function loadTransactions() {
  if (!currentUser || !activeClient) return;

  const clientId = activeClient.id;

  const ref = collection(
    db,
    "users",
    currentUser.uid,
    "clients",
    clientId,
    "transactions"
  );

  try {
    const snapshot = await getDocs(ref);

    const transactions = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    // Avoid rendering data for a different client if the user switched.
    if (!activeClient || activeClient.id !== clientId) return;

    renderTransactions(transactions);

  } catch (error) {
    console.error("Loading transactions failed:", error);
    message("transactionMessage", "Could not load transactions: " + error.message);
  }
}

// RENDER TRANSACTIONS
function renderTransactions(transactions) {
  const container = $("transactionsTable");
  if (!container) return;

  container.innerHTML = "";

  let income = 0;
  let expenses = 0;

  transactions.sort((a, b) =>
    (b.date || "").localeCompare(a.date || "")
  );

  transactions.forEach(item => {
    if (item.type === "income") {
      income += Number(item.amount || 0);
    } else {
      expenses += Number(item.amount || 0);
    }

    const row = document.createElement("tr");

    const dateCell = document.createElement("td");
    dateCell.textContent = item.date || "";

    const typeCell = document.createElement("td");
    typeCell.textContent = item.type || "";

    const descriptionCell = document.createElement("td");
    descriptionCell.textContent = item.description || "";

    const amountCell = document.createElement("td");
    amountCell.textContent = money(item.amount);

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");

    deleteButton.textContent = "Delete";
    deleteButton.className = "danger-btn";

    deleteButton.addEventListener("click", async () => {
      if (!confirm("Delete this transaction?")) return;

      try {
        await deleteDoc(
          doc(
            db,
            "users",
            currentUser.uid,
            "clients",
            activeClient.id,
            "transactions",
            item.id
          )
        );

        await loadTransactions();

      } catch (error) {
        alert("Delete failed: " + error.message);
      }
    });

    actionCell.appendChild(deleteButton);

    row.append(
      dateCell,
      typeCell,
      descriptionCell,
      amountCell,
      actionCell
    );

    container.appendChild(row);
  });

  if ($("clientIncome")) {
    $("clientIncome").textContent = money(income);
  }

  if ($("clientExpenses")) {
    $("clientExpenses").textContent = money(expenses);
  }

  if ($("clientBalance")) {
    $("clientBalance").textContent = money(income - expenses);
  }

  if (activeClient) {
    activeClient.income = income;
    activeClient.expenses = expenses;
  }

  hideElement("transactionsEmpty", transactions.length !== 0);
  updateDashboard();
}

// DELETE CLIENT
$("deleteClientBtn")?.addEventListener("click", async () => {
  if (!activeClient || !currentUser) return;

  if (!confirm("Delete this client?")) return;

  try {
    await deleteDoc(
      doc(db, "users", currentUser.uid, "clients", activeClient.id)
    );

    clients = clients.filter(client => client.id !== activeClient.id);
    activeClient = null;

    showPage("clientsPage");
    renderClients();
    updateDashboard();

    showAppStatus("Client deleted.");

  } catch (error) {
    alert("Delete failed: " + error.message);
  }
});

// EXPORT CSV
$("exportCsvBtn")?.addEventListener("click", async () => {
  if (!activeClient || !currentUser) return;

  try {
    const ref = collection(
      db,
      "users",
      currentUser.uid,
      "clients",
      activeClient.id,
      "transactions"
    );

    const snapshot = await getDocs(ref);

    const rows = [
      ["Date", "Type", "Description", "Amount"],
      ...snapshot.docs.map(item => {
        const data = item.data();

        return [
          data.date,
          data.type,
          data.description,
          data.amount
        ];
      })
    ];

    const csv = rows.map(row =>
      row.map(value =>
        '"' + String(value ?? "").replace(/"/g, '""') + '"'
      ).join(",")
    ).join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "transactions.csv";
    link.click();

    URL.revokeObjectURL(url);

  } catch (error) {
    alert("Export failed: " + error.message);
  }
});
