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

function setVisible(element, visible) {
  if (!element) return;
  element.classList.toggle("hidden", !visible);
  element.hidden = !visible;
}

function usernameToEmail(username) {
  return username.trim().toLowerCase() + "@users.buildledger.invalid";
}

function userCollection(name) {
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

// PAGE NAVIGATION
function showPage(page) {
  ["dashboardPage", "clientsPage", "accountPage"].forEach(id => {
    setVisible($(id), id === page);
  });

  const titles = {
    dashboardPage: "Dashboard",
    clientsPage: "Clients",
    accountPage: "Client Account"
  };

  if ($("pageTitle")) {
    $("pageTitle").textContent = titles[page] || "BuildLedger";
  }
}

// LOGIN / REGISTER SWITCH
function switchAuth() {
  const login = $("loginForm");
  const register = $("registerForm");

  if (!login || !register) return;

  const registering = login.classList.contains("hidden");

  setVisible(login, registering);
  setVisible(register, !registering);

  message("loginMessage", "");
  message("registerMessage", "");

  if ($("authTitle")) {
    $("authTitle").textContent = registering
      ? "Welcome back"
      : "Create account";
  }

  if ($("authSubtitle")) {
    $("authSubtitle").textContent = registering
      ? "Sign in to your account"
      : "Register to use BuildLedger";
  }

  if ($("authSwitchText")) {
    $("authSwitchText").textContent = registering
      ? "Don't have an account?"
      : "Already have an account?";
  }

  if ($("switchAuthBtn")) {
    $("switchAuthBtn").textContent = registering
      ? "Create account"
      : "Sign in";
  }
}

$("switchAuthBtn")?.addEventListener("click", switchAuth);

// REGISTER
$("registerForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (isRegistering) return;

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

  isRegistering = true;
  const button = $("registerForm").querySelector('button[type="submit"]');

  if (button) {
    button.disabled = true;
    button.textContent = "Creating account...";
  }

  try {
    await createUserWithEmailAndPassword(
      auth,
      usernameToEmail(username),
      password
    );
    message("registerMessage", "Account created successfully!");
  } catch (error) {
    console.error(error);
    message("registerMessage", "Registration failed: " + error.message);
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

  const username = $("loginUsername").value.trim();
  const password = $("loginPassword").value;

  if (!username || !password) {
    message("loginMessage", "Enter your username and password.");
    return;
  }

  isLoggingIn = true;
  const button = $("loginForm").querySelector('button[type="submit"]');

  if (button) {
    button.disabled = true;
    button.textContent = "Signing in...";
  }

  try {
    await signInWithEmailAndPassword(
      auth,
      usernameToEmail(username),
      password
    );
  } catch (error) {
    console.error(error);
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

// AUTHENTICATION STATE
onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (user) {
    setVisible($("loginScreen"), false);
    setVisible($("appScreen"), true);

    if ($("currentUsername")) {
      $("currentUsername").textContent =
        user.email?.split("@")[0] || "User";
    }

    showPage("dashboardPage");
    await loadClients();
  } else {
    clients = [];
    activeClient = null;
    setVisible($("loginScreen"), true);
    setVisible($("appScreen"), false);
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
  if (savingClient) return;

  $("clientForm")?.reset();
  message("clientMessage", "");

  if ($("clientDialog") && !$("clientDialog").open) {
    $("clientDialog").showModal();
  }
}

$("addClientBtn")?.addEventListener("click", openClientDialog);
$("addClientTop")?.addEventListener("click", openClientDialog);

$("cancelDialog")?.addEventListener("click", () => {
  if (!savingClient) $("clientDialog")?.close();
});

// SAVE CLIENT
$("clientForm")?.addEventListener("submit", async event => {
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
    message("clientMessage", "Enter a client name.");
    return;
  }

  savingClient = true;

  const form = $("clientForm");
  const button = form.querySelector('button[type="submit"]');

  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }

  $("clientDialog").close();
  form.reset();

  try {
    const newClient = await addDoc(userCollection("clients"), {
      name,
      phone,
      project,
      createdAt: serverTimestamp()
    });

    clients.push({
      id: newClient.id,
      name,
      phone,
      project,
      income: 0,
      expenses: 0
    });

    renderClients();
    updateDashboard();
  } catch (error) {
    console.error("Client save failed:", error);
    alert("Client could not be saved: " + error.message);
  } finally {
    savingClient = false;
    if (button) {
      button.disabled = false;
      button.textContent = "Save client";
    }
  }
});// LOAD CLIENTS
async function loadClients() {
  if (!currentUser) return;

  try {
    const snapshot = await getDocs(userCollection("clients"));

    clients = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderClients();
    updateDashboard();
  } catch (error) {
    console.error("Loading clients failed:", error);
    alert("Could not load clients: " + error.message);
  }
}

// DISPLAY CLIENTS
function renderClients() {
  const container = $("allClients");
  if (!container) return;

  container.innerHTML = "";

  if ($("clientCount")) {
    $("clientCount").textContent = clients.length + " clients";
  }

  if ($("clientsEmpty")) {
    $("clientsEmpty").hidden = clients.length !== 0;
  }

  clients.forEach(client => {
    const card = document.createElement("div");
    card.className = "client-card";

    const heading = document.createElement("h3");
    heading.textContent = client.name || "Unnamed client";

    const details = document.createElement("p");
    details.textContent =
      (client.phone || "No phone") + " • " +
      (client.project || "No project");

    card.append(heading, details);
    card.addEventListener("click", () => openClient(client));
    container.appendChild(card);
  });
}

// DASHBOARD
function updateDashboard() {
  const totalIncome = clients.reduce(
    (sum, client) => sum + Number(client.income || 0), 0
  );

  const totalExpenses = clients.reduce(
    (sum, client) => sum + Number(client.expenses || 0), 0
  );

  if ($("totalClients")) $("totalClients").textContent = clients.length;
  if ($("totalIncome")) $("totalIncome").textContent = money(totalIncome);
  if ($("totalExpenses")) $("totalExpenses").textContent = money(totalExpenses);

  if ($("netBalance")) {
    $("netBalance").textContent = money(totalIncome - totalExpenses);
  }

  if ($("recentClients")) {
    $("recentClients").innerHTML = "";
    clients.slice(-5).reverse().forEach(client => {
      const item = document.createElement("p");
      item.textContent = client.name;
      $("recentClients").appendChild(item);
    });
  }

  if ($("dashboardEmpty")) {
    $("dashboardEmpty").hidden = clients.length !== 0;
  }
}

// OPEN CLIENT ACCOUNT
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

  await loadTransactions();
}

// BACK TO CLIENTS
$("backToClients")?.addEventListener("click", () => {
  showPage("clientsPage");
  renderClients();
});

// ADD TRANSACTION
$("transactionForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (savingTransaction) return;

  if (!currentUser || !activeClient) {
    message("transactionMessage", "Please sign in and select a client first.");
    return;
  }

  const form = $("transactionForm");
  const button = form.querySelector('button[type="submit"]');

  const type = $("transactionType").value;
  const date = $("transactionDate").value;
  const description = $("transactionDescription").value.trim();
  const amount = Number($("transactionAmount").value);

  if (!date || !description || !Number.isFinite(amount) || amount <= 0) {
    message("transactionMessage", "Enter a date, description and valid amount.");
    return;
  }

  savingTransaction = true;

  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }

  message("transactionMessage", "Saving transaction...");

  const clientId = activeClient.id;

  try {
    await addDoc(
      collection(db, "users", currentUser.uid, "clients", clientId, "transactions"),
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
    message("transactionMessage", "Could not save: " + error.message);
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

  try {
    const ref = collection(
      db, "users", currentUser.uid, "clients", clientId, "transactions"
    );

    const snapshot = await getDocs(ref);

    const transactions = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderTransactions(transactions);
  } catch (error) {
    console.error("Loading transactions failed:", error);
    alert("Could not load transactions: " + error.message);
  }
}

// DISPLAY TRANSACTIONS
function renderTransactions(transactions) {
  const container = $("transactionsTable");
  if (!container) return;

  container.innerHTML = "";

  let income = 0;
  let expenses = 0;

  transactions.forEach(item => {
    const amount = Number(item.amount || 0);

    if (item.type === "income") income += amount;
    else expenses += amount;

    const row = document.createElement("tr");

    [
      item.date || "",
      item.type || "",
      item.description || "",
      money(amount)
    ].forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    const actionCell = document.createElement("td");
    actionCell.textContent = "—";
    row.appendChild(actionCell);

    container.appendChild(row);
  });

  if ($("clientIncome")) $("clientIncome").textContent = money(income);
  if ($("clientExpenses")) $("clientExpenses").textContent = money(expenses);
  if ($("clientBalance")) $("clientBalance").textContent = money(income - expenses);

  activeClient.income = income;
  activeClient.expenses = expenses;

  if ($("transactionsEmpty")) {
    $("transactionsEmpty").hidden = transactions.length !== 0;
  }

  updateDashboard();
}

// DELETE CLIENT
$("deleteClientBtn")?.addEventListener("click", async () => {
  if (!currentUser || !activeClient) return;
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
  } catch (error) {
    alert("Delete failed: " + error.message);
  }
});

// EXPORT CSV
$("exportCsvBtn")?.addEventListener("click", async () => {
  if (!currentUser || !activeClient) return;

  try {
    const ref = collection(
      db, "users", currentUser.uid, "clients",
      activeClient.id, "transactions"
    );

    const snapshot = await getDocs(ref);

    const rows = [
      ["Date", "Type", "Description", "Amount"],
      ...snapshot.docs.map(item => {
        const data = item.data();
        return [data.date, data.type, data.description, data.amount];
      })
    ];

    const csv = rows.map(row =>
      row.map(value =>
        '"' + String(value ?? "").replace(/"/g, '""') + '"'
      ).join(",")
    ).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "transactions.csv";
    link.click();

    URL.revokeObjectURL(url);
  } catch (error) {
    alert("CSV export failed: " + error.message);
  }
});

// LOAD PDF LIBRARY WHEN NEEDED
async function loadPdfLibrary() {
  if (window.jspdf) return;

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load PDF library. Check your internet connection."));
    document.head.appendChild(script);
  });

  if (!window.jspdf) {
    throw new Error("PDF library did not initialize.");
  }
}

// EXPORT PROFESSIONAL CLIENT STATEMENT PDF
$("exportPdfBtn")?.addEventListener("click", async () => {
  if (!currentUser || !activeClient) return;

  const button = $("exportPdfBtn");
  button.disabled = true;
  button.textContent = "Preparing PDF...";

  try {
    await loadPdfLibrary();

    const ref = collection(
      db, "users", currentUser.uid, "clients",
      activeClient.id, "transactions"
    );

    const snapshot = await getDocs(ref);
    const transactions = snapshot.docs.map(item => item.data());

    // Sort transactions by date, oldest first.
    transactions.sort((a, b) =>
      String(a.date || "").localeCompare(String(b.date || ""))
    );

    let income = 0;
    let expenses = 0;    transactions.forEach(item => {
      const amount = Number(item.amount || 0);
      if (item.type === "income") income += amount;
      else expenses += amount;
    });

    const balance = income - expenses;
    const validDates = transactions
      .map(item => String(item.date || "").slice(0, 10))
      .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort();

    // Format stored YYYY-MM-DD dates without timezone shifting.
    const formatDate = date => {
      if (!date) return "—";
      const parts = String(date).slice(0, 10).split("-");
      if (parts.length !== 3) return String(date);
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    const startDate = validDates.length ? formatDate(validDates[0]) : "No transactions";
    const endDate = validDates.length
      ? formatDate(validDates[validDates.length - 1])
      : "No transactions";

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;

    const formatMoney = value =>
      "INR " + Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

    const clientName = String(activeClient.name || "Unnamed client");
    const safeName = clientName.replace(/[^a-z0-9_-]/gi, "_");

    // Brand colours.
    const navy = [20, 33, 61];
    const blue = [37, 99, 235];
    const paleBlue = [239, 246, 255];
    const ink = [35, 48, 68];
    const muted = [105, 119, 140];
    const line = [222, 228, 237];
    const green = [21, 128, 61];
    const red = [185, 28, 28];

    const today = formatDate(new Date().toISOString().slice(0, 10));

    // FIRST PAGE: professional report header.
    pdf.setFillColor(...navy);
    pdf.rect(0, 0, pageWidth, 39, "F");

    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.text("BuildLedger", margin, 16);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(218, 228, 245);
    pdf.text("CLIENT ACCOUNT STATEMENT", margin, 24);

    pdf.setFontSize(8);
    pdf.text("Generated: " + today, pageWidth - margin, 24, { align: "right" });

    let y = 47;

    // Highlighted client name.
    pdf.setFillColor(...paleBlue);
    pdf.setDrawColor(190, 211, 245);
    pdf.roundedRect(margin, y, contentWidth, 25, 3, 3, "FD");

    pdf.setFillColor(...blue);
    pdf.roundedRect(margin, y, 3, 25, 1, 1, "F");

    pdf.setTextColor(...muted);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("CLIENT NAME", margin + 9, y + 8);

    pdf.setTextColor(...navy);
    pdf.setFontSize(17);
    const nameLines = pdf.splitTextToSize(clientName, contentWidth - 20);
    pdf.text(nameLines.slice(0, 2), margin + 9, y + 17);

    y += 32;

    // Report period and client contact information.
    const infoHeight = 34;
    pdf.setDrawColor(...line);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(margin, y, contentWidth, infoHeight, 2, 2, "FD");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...muted);
    pdf.text("REPORT PERIOD", margin + 7, y + 8);
    pdf.text("CLIENT INFORMATION", margin + 7, y + 21);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...ink);
    pdf.text(startDate + "  to  " + endDate, margin + 42, y + 8);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    const phoneText = "Phone: " + (activeClient.phone || "Not provided");
    const projectText = "Project / Site: " + (activeClient.project || "Not provided");
    pdf.text(phoneText, margin + 7, y + 28);
    pdf.text(
      pdf.splitTextToSize(projectText, contentWidth - 85).slice(0, 2),
      margin + 91,
      y + 21
    );

    y += infoHeight + 10;

    // Financial summary cards.
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(...navy);
    pdf.text("FINANCIAL SUMMARY", margin, y);
    y += 5;

    const cardGap = 4;
    const cardWidth = (contentWidth - cardGap * 2) / 3;
    const cardHeight = 25;

    const summaryCards = [
      { label: "TOTAL INCOME", value: formatMoney(income), color: green, fill: [239, 250, 243] },
      { label: "TOTAL EXPENSES", value: formatMoney(expenses), color: red, fill: [254, 242, 242] },
      { label: "NET BALANCE", value: formatMoney(balance), color: navy, fill: [239, 246, 255] }
    ];

    summaryCards.forEach((card, index) => {
      const x = margin + index * (cardWidth + cardGap);

      pdf.setFillColor(...card.fill);
      pdf.setDrawColor(...line);
      pdf.roundedRect(x, y, cardWidth, cardHeight, 2, 2, "FD");

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      pdf.setTextColor(...muted);
      pdf.text(card.label, x + 4, y + 8);

      pdf.setFontSize(9.5);
      pdf.setTextColor(...card.color);
      pdf.text(card.value, x + 4, y + 18);
    });

    y += cardHeight + 11;

    // Transaction table.
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(...navy);
    pdf.text("TRANSACTION DETAILS", margin, y);
    y += 6;

    // Column positions fit within A4 page width.
    const dateX = margin + 3;
    const descriptionX = margin + 34;
    const incomeRight = margin + 139;
    const expenseRight = pageWidth - margin - 3;
    const tableTop = () => {
      pdf.setFillColor(...navy);
      pdf.roundedRect(margin, y, contentWidth, 10, 1.5, 1.5, "F");

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(255, 255, 255);
      pdf.text("DATE", dateX, y + 6.5);
      pdf.text("DESCRIPTION", descriptionX, y + 6.5);
      pdf.text("INCOME", incomeRight, y + 6.5, { align: "right" });
      pdf.text("EXPENSE", expenseRight, y + 6.5, { align: "right" });
      y += 10;
    };

    tableTop();

    if (transactions.length === 0) {
      pdf.setDrawColor(...line);
      pdf.roundedRect(margin, y, contentWidth, 16, 1, 1, "S");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(...muted);
      pdf.text("No transactions have been recorded for this client.", margin + 5, y + 10);
      y += 16;
    }

    transactions.forEach((item, index) => {
      const description = pdf.splitTextToSize(
        String(item.description || "—"),
        78
      );
      const rowHeight = Math.max(10, description.length * 4 + 4);

      if (y + rowHeight > pageHeight - 27) {
        pdf.addPage();
        y = 18;

        // Small continuation header on additional pages.
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.setTextColor(...navy);
        pdf.text("BuildLedger | " + clientName, margin, 10);
        pdf.setDrawColor(...line);
        pdf.line(margin, 13, pageWidth - margin, 13);
        tableTop();
      }

      if (index % 2 === 0) {
        pdf.setFillColor(247, 249, 252);
        pdf.rect(margin, y, contentWidth, rowHeight, "F");
      }

      pdf.setDrawColor(...line);
      pdf.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(...ink);
      pdf.text(formatDate(item.date || ""), dateX, y + 6.5);
      pdf.text(description, descriptionX, y + 6.5);

      const amount = formatMoney(item.amount);
      if (item.type === "income") {
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...green);
        pdf.text(amount, incomeRight, y + 6.5, { align: "right" });
      } else {
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...red);
        pdf.text(amount, expenseRight, y + 6.5, { align: "right" });
      }

      y += rowHeight;
    });

    // Closing totals section after the transaction list.
    if (y + 29 > pageHeight - 25) {
      pdf.addPage();
      y = 20;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(...navy);
      pdf.text("BuildLedger | " + clientName, margin, 11);
      pdf.setDrawColor(...line);
      pdf.line(margin, 14, pageWidth - margin, 14);
    }

    y += 7;
    pdf.setFillColor(246, 248, 252);
    pdf.setDrawColor(...line);
    pdf.roundedRect(margin, y, contentWidth, 24, 2, 2, "FD");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...ink);
    pdf.text("TOTALS", margin + 5, y + 7);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...green);
    pdf.text("Income: " + formatMoney(income), margin + 5, y + 16);

    pdf.setTextColor(...red);
    pdf.text("Expenses: " + formatMoney(expenses), margin + 70, y + 16);

    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...navy);
    pdf.text("Balance: " + formatMoney(balance), pageWidth - margin - 5, y + 16, {
      align: "right"
    });

    // Footer and page numbers on every page.
    const pageCount = pdf.internal.getNumberOfPages();

    for (let page = 1; page <= pageCount; page++) {
      pdf.setPage(page);
      pdf.setDrawColor(...line);
      pdf.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(...muted);
      pdf.text("BuildLedger | Client Account Statement", margin, pageHeight - 9);
      pdf.text(
        "Page " + page + " of " + pageCount,
        pageWidth - margin,
        pageHeight - 9,
        { align: "right" }
      );
    }

    pdf.save((safeName || "client") + "_statement.pdf");

  } catch (error) {
    console.error("PDF export failed:", error);
    alert("Could not create PDF: " + error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Download PDF";
  }
});