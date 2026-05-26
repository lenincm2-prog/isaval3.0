const data = window.CRM_DATA;
const stockData = window.STOCK_ANALYSIS;
const productYearlySales = window.PRODUCT_YEARLY_SALES;
const loginEmail = "admin@isaval.pe";
const loginPassword = "123456";
const authKey = "isaval-crm-auth-v1";
const technicalSheets = [
  {
    label: "Ficha técnica 2KR Piscinas",
    file: "fichastecnicas/2krpiscinas.pdf",
    match: (text) => text.includes("2KR PISCINAS") || text.includes("KIT PISCINAS 2KR"),
  },
  {
    label: "Ficha técnica Acquapox",
    file: "fichastecnicas/acquapox.pdf",
    match: (text) => text.includes("ACQUAPOX"),
  },
  {
    label: "Ficha técnica Acquatex",
    file: "fichastecnicas/acquatex.pdf",
    match: (text) => text.includes("ACQUATEX"),
  },
  {
    label: "Ficha técnica Autonivelante",
    file: "fichastecnicas/Autonivelante.pdf",
    match: (text) => text.includes("EPOXI AUTONIVELANTE"),
  },
];

const technicalSheetCatalog = [
  {
    label: "Ficha tecnica 2KR Piscinas",
    file: "fichastecnicas/2krpiscinas.pdf",
    terms: ["2KR PISCINAS", "KIT PISCINAS 2KR"],
    description: "Esmalte poliuretano acrilico 2 componentes para piscinas, estanques y agua no potable. Brillo; relacion 4:1; rendimiento 10-13 m2/l; repintado 6-24 h.",
  },
  {
    label: "Ficha tecnica Acquapox",
    file: "fichastecnicas/acquapox.pdf",
    terms: ["ACQUAPOX"],
    description: "Pintura epoxi al agua 2 componentes para pavimentos, paredes y techos con alta limpieza. Satinado; mezcla 4:1; rendimiento 6-10 m2/l; uso interior.",
  },
  {
    label: "Ficha tecnica Acquatex",
    file: "fichastecnicas/acquatex.pdf",
    terms: ["ACQUATEX"],
    description: "Esmalte acrilico al agua para interior/exterior, madera, yeso y hierro imprimado. Mate sedoso; rendimiento 8-12 m2/l; secado tacto 30-60 min.",
  },
  {
    label: "Ficha tecnica Autonivelante",
    file: "fichastecnicas/Autonivelante.pdf",
    terms: ["EPOXI AUTONIVELANTE", "AUTONIVELANTE"],
    description: "Revestimiento epoxi 100% solidos para pavimentos de hormigon con altas exigencias mecanicas/quimicas. Brillante; mezcla 3:1; pintura 4 m2/kg.",
  },
  {
    label: "Ficha tecnica Elba",
    file: "fichastecnicas/Elba.pdf",
    terms: ["ELBA"],
    description: "Pintura vinilica mate de alta lavabilidad, opacidad y blancura para yeso, hormigon y cemento. Extra mate; rendimiento 10-14 m2/l; repintado 3-4 h.",
  },
];

const state = {
  view: "overview",
  search: "",
  stage: "all",
  seller: "all",
  minSales: 0,
  status: "open",
  selectedId: null,
  selectedProductId: null,
  selectedNewClientSeller: null,
  quoteSeller: "all",
  quoteStatus: "all",
  quoteClient: "",
  quoteProduct: "",
  quoteDateFrom: "",
  quoteDateTo: "",
  priceSearch: "",
  selectedPriceKeys: new Set(),
  selectedPriceRows: new Map(),
  priceQuoteQuantities: new Map(),
  priceQuoteCustomer: {
    search: "",
    ruc: "",
    businessName: "",
    address: "",
    attention: "",
    seller: "",
  },
  priceWhatsappPhone: "",
  stockSearch: "",
  stockAbc: "all",
  stockStatus: "all",
  stockClass: "all",
};

const colors = {
  Recuperar: "#c94b55",
  Defender: "#f4c64e",
  Expandir: "#2ca66f",
  Mantener: "#1677d2",
  Prospectar: "#35bfc4",
};

const storageKey = "isaval-crm-local-state-v1";
const localState = JSON.parse(localStorage.getItem(storageKey) || "{}");

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const money = (value) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

const money2 = (value) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

const number = (value) => new Intl.NumberFormat("es-PE").format(value || 0);
const pct = (value) => (value === null || value === undefined ? "Nuevo" : `${(value * 100).toFixed(1)}%`);

function saveLocal() {
  localStorage.setItem(storageKey, JSON.stringify(localState));
}

function initAuth() {
  const isAuthenticated = localStorage.getItem(authKey) === "ok";
  document.body.classList.toggle("authenticated", isAuthenticated);

  const form = $("#loginForm");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = $("#loginEmail").value.trim().toLowerCase();
      const password = $("#loginPassword").value;
      if (email === loginEmail && password === loginPassword) {
        localStorage.setItem(authKey, "ok");
        $("#loginError").textContent = "";
        document.body.classList.add("authenticated");
        return;
      }
      $("#loginError").textContent = "Correo o clave incorrectos.";
    });
  }

  $("#logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem(authKey);
    document.body.classList.remove("authenticated");
    $("#loginPassword").value = "";
  });
}

function getClientState(id) {
  localState[id] ||= { done: false, note: "" };
  return localState[id];
}

function filteredClients() {
  const term = state.search.toLowerCase().trim();
  return data.clients.filter((client) => {
    const haystack = `${client.name} ${client.doc} ${client.seller} ${client.topFamily}`.toLowerCase();
    const matchesSearch = !term || haystack.includes(term);
    const matchesStage = state.stage === "all" || client.stage === state.stage;
    const matchesSeller = state.seller === "all" || client.seller === state.seller;
    const matchesSales = client.last4 >= state.minSales;
    return matchesSearch && matchesStage && matchesSeller && matchesSales;
  });
}

function actionClients() {
  return filteredClients().filter((client) => {
    const done = !!getClientState(client.id).done;
    if (state.status === "done") return done;
    if (state.status === "open") return !done;
    return true;
  });
}

function setView(view) {
  state.view = view;
  $$(".view").forEach((el) => el.classList.toggle("active", el.id === view));
  $$(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
  $(".filters")?.classList.toggle("hidden", view === "prices" || view === "stock");
  updatePageHeader(view);
  render();
}

function updatePageHeader(view) {
  const titles = {
    stock: ["Analisis de producto", "Rotacion por producto"],
    prices: ["Herramienta local CRM", "Lista de precios y stock"],
    quotes: ["Herramienta local CRM", "Cotizaciones 2026"],
  };
  const [eyebrow, title] = titles[view] || ["Herramienta local CRM", "Historico trimestral de ventas"];
  $("#pageEyebrow").textContent = eyebrow;
  $("#pageTitle").textContent = title;
  $(".top-actions")?.classList.toggle("hidden", view === "stock");
}

function initControls() {
  $("#generatedAt").textContent = `Actualizado ${data.summary.generatedAt}`;
  $("#periodLabel").textContent = data.summary.periodLabel || "2022 Q1 - 2026 Q1";
  const sellers = ["all", ...data.sellers.map((s) => s.seller).sort((a, b) => a.localeCompare(b))];
  $("#sellerFilter").innerHTML = sellers
    .map((seller) => `<option value="${escapeHtml(seller)}">${seller === "all" ? "Todos" : escapeHtml(seller)}</option>`)
    .join("");

  $$(".nav-btn").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));
  $("#searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
  $("#searchInput").addEventListener("change", (event) => {
    state.search = event.target.value;
    render();
  });
  $("#stageFilter").addEventListener("change", (event) => {
    state.stage = event.target.value;
    render();
  });
  $("#sellerFilter").addEventListener("change", (event) => {
    state.seller = event.target.value;
    render();
  });
  $("#minSales").addEventListener("input", (event) => {
    state.minSales = Number(event.target.value);
    $("#minSalesLabel").textContent = money(state.minSales);
    render();
  });
  $$("#statusTabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.status = btn.dataset.status;
      $$("#statusTabs button").forEach((tab) => tab.classList.toggle("active", tab === btn));
      renderActionBoard();
    });
  });
  $("#exportCsv").addEventListener("click", exportCsv);
  initQuoteControls();
  const priceSearch = $("#priceSearch");
  if (priceSearch) {
    priceSearch.addEventListener("input", (event) => {
      state.priceSearch = event.target.value;
      if (state.view === "prices") renderPrices();
    });
  }
  initStockControls();
}

function initStockControls() {
  if (!stockData || !$("#stockSearch")) return;
  $("#stockSource").textContent = `${stockData.summary.sourceFile} | Actualizado ${stockData.summary.generatedAt}`;
  $("#stockAbcFilter").innerHTML = ["all", "A", "B", "C"]
    .map((abc) => `<option value="${abc}">${abc === "all" ? "Todas" : abc}</option>`)
    .join("");
  const statuses = ["all", ...Object.keys(stockData.summary.statusCounts || {}).sort((a, b) => a.localeCompare(b))];
  $("#stockStatusFilter").innerHTML = statuses
    .map((status) => `<option value="${escapeHtml(status)}">${status === "all" ? "Todos" : escapeHtml(status)}</option>`)
    .join("");
  const classes = ["all", ...new Set((stockData.classes || []).map((row) => row.class).filter(Boolean))];
  $("#stockClassFilter").innerHTML = classes
    .map((item) => `<option value="${escapeHtml(item)}">${item === "all" ? "Todas" : escapeHtml(item)}</option>`)
    .join("");
  [
    ["#stockSearch", "stockSearch"],
    ["#stockAbcFilter", "stockAbc"],
    ["#stockStatusFilter", "stockStatus"],
    ["#stockClassFilter", "stockClass"],
  ].forEach(([selector, key]) => {
    const el = $(selector);
    if (!el) return;
    el.addEventListener("input", (event) => {
      state[key] = event.target.value;
      if (state.view === "stock") renderStockAnalysis();
    });
    el.addEventListener("change", (event) => {
      state[key] = event.target.value;
      if (state.view === "stock") renderStockAnalysis();
    });
  });
}

function initQuoteControls() {
  const quotes = data.quotes2026;
  if (!quotes || !$("#quoteSellerFilter")) return;
  const sellers = ["all", ...new Set((quotes.sellerSummary || []).map((row) => row.seller).filter(Boolean))].sort((a, b) =>
    a === "all" ? -1 : b === "all" ? 1 : a.localeCompare(b)
  );
  $("#quoteSellerFilter").innerHTML = sellers
    .map((seller) => `<option value="${escapeHtml(seller)}">${seller === "all" ? "Todos" : escapeHtml(seller)}</option>`)
    .join("");
  const statuses = ["all", "Cerrada", "Expirada", "Pendiente"];
  $("#quoteStatusFilter").innerHTML = statuses
    .map((status) => `<option value="${status}">${status === "all" ? "Todos" : status}</option>`)
    .join("");
  [
    ["#quoteSellerFilter", "quoteSeller"],
    ["#quoteStatusFilter", "quoteStatus"],
    ["#quoteClientFilter", "quoteClient"],
    ["#quoteProductFilter", "quoteProduct"],
    ["#quoteDateFrom", "quoteDateFrom"],
    ["#quoteDateTo", "quoteDateTo"],
  ].forEach(([selector, key]) => {
    const el = $(selector);
    if (!el) return;
    el.addEventListener("input", (event) => {
      state[key] = event.target.value;
      if (state.view === "quotes") renderQuotes();
    });
    el.addEventListener("change", (event) => {
      state[key] = event.target.value;
      if (state.view === "quotes") renderQuotes();
    });
  });
}

function render() {
  if (state.view === "overview") renderOverview();
  if (state.view === "actions") renderActionBoard();
  if (state.view === "recovery") renderRecovery();
  if (state.view === "clients") renderClients();
  if (state.view === "sellers") renderSellers();
  if (state.view === "products") renderProducts();
  if (state.view === "quotes") renderQuotes();
  if (state.view === "stock") renderStockAnalysis();
  if (state.view === "prices") renderPrices();
}

function renderOverview() {
  const clients = filteredClients();
  const recovery = clients.reduce((sum, c) => sum + c.recoveryValue, 0);
  $("#kpiGrid").innerHTML = [
    ["Ventas historicas netas", money(data.summary.totalSales), `${number(data.summary.orders)} documentos sin IVA`],
    [`Ventas ${data.summary.latestYear} YTD`, money(data.summary.salesLatestYear), `Crecimiento ${pct(data.summary.growthLatestYtd)} vs mismo periodo`],
    [`Clientes activos ${data.summary.latestYear}`, number(data.summary.activeClientsLatestYear), `${number(data.summary.clients)} clientes historicos`],
    ["Dormidos alto valor", number(data.summary.dormantHighValueClients), `${money(data.summary.highValueRecoveryPipeline)} recuperable`],
    ["Pipeline recuperable", money(recovery), `${clients.length} clientes filtrados`],
  ]
    .map(([label, value, sub]) => `<article class="kpi"><span>${label}</span><strong>${value}</strong><small>${sub}</small></article>`)
    .join("");

  renderTimeline();
  renderDonut(clients);
  renderQuarterCompare();
  renderMonthlySummary();
  renderMonthlyComparisonV2();
  renderCommercialKpi();
  renderNewClients2026();
  renderRankingBlocks();
}

function renderTimeline() {
  const width = 920;
  const height = 260;
  const pad = 34;
  const max = Math.max(...data.timeline.map((d) => d.total), 1);
  const points = data.timeline.map((d, i) => {
    const x = pad + (i * (width - pad * 2)) / (data.timeline.length - 1);
    const y = height - pad - (d.total / max) * (height - pad * 2);
    return { ...d, x, y };
  });
  const area = `${pad},${height - pad} ${points.map((p) => `${p.x},${p.y}`).join(" ")} ${width - pad},${height - pad}`;
  $("#timelineChart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Ventas trimestrales">
      <polyline points="${area}" fill="rgba(53,191,196,0.16)" stroke="none"></polyline>
      <polyline points="${points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="#1677d2" stroke-width="4"></polyline>
      ${points
        .map(
          (p) => `
        <g>
          <circle cx="${p.x}" cy="${p.y}" r="5" fill="#ffffff" stroke="#1677d2" stroke-width="3"></circle>
          <title>${p.period}: ${money(p.total)} | ${p.clients} clientes</title>
        </g>`
        )
        .join("")}
      ${points
        .filter((_, i) => i % 2 === 0)
        .map((p) => `<text x="${p.x}" y="${height - 7}" text-anchor="middle" fill="#667085" font-size="12">${p.period}</text>`)
        .join("")}
      <text x="${pad}" y="18" fill="#667085" font-size="12">Max ${money(max)}</text>
    </svg>`;
}

function renderDonut(clients) {
  const stages = ["Recuperar", "Defender", "Expandir", "Mantener", "Prospectar"];
  const counts = stages.map((stage) => clients.filter((c) => c.stage === stage).length);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  let offset = 25;
  const circles = stages
    .map((stage, i) => {
      const dash = (counts[i] / total) * 100;
      const circle = `<circle cx="85" cy="85" r="62" fill="none" stroke="${colors[stage]}" stroke-width="28" stroke-dasharray="${dash} ${100 - dash}" stroke-dashoffset="${offset}" pathLength="100"></circle>`;
      offset -= dash;
      return circle;
    })
    .join("");
  $("#stageDonut").innerHTML = `
    <svg viewBox="0 0 170 170">${circles}<circle cx="85" cy="85" r="42" fill="#fff"></circle><text x="85" y="82" text-anchor="middle" font-size="24" font-weight="700">${total}</text><text x="85" y="102" text-anchor="middle" font-size="12" fill="#667085">clientes</text></svg>
    <div class="legend">
      ${stages.map((s, i) => `<span><i class="dot" style="background:${colors[s]}"></i>${s}: <b>${counts[i]}</b></span>`).join("")}
    </div>`;
}

function renderOpportunity(clients) {
  const rows = [...clients].sort((a, b) => b.dormantScore - a.dormantScore || b.recoveryValue - a.recoveryValue).slice(0, 8);
  $("#opportunityList").innerHTML = rows
    .map(
      (c) => `
      <button class="stack-item as-button" data-client="${c.id}">
        <strong>${escapeHtml(c.name)}</strong>
        <span>${escapeHtml(c.seller)} · ${c.dormantSegment} · score ${c.dormantScore} · ${money(c.recoveryValue)}</span>
      </button>`
    )
    .join("");
  $$("#opportunityList [data-client]").forEach((el) => el.addEventListener("click", () => openClient(el.dataset.client)));
}

function renderQuarterCompare() {
  const years = data.years || [];
  const max = Math.max(...data.quarterComparison.flatMap((row) => years.map((year) => row[String(year)] || 0)), 1);
  $("#quarterCompare").innerHTML = `
    <table class="quarter-table">
      <thead>
        <tr>
          <th>Trim.</th>
          ${years.map((year) => `<th>${year}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${data.quarterComparison
          .map(
            (row) => `
            <tr>
              <td><strong>${row.quarter}</strong></td>
              ${years
                .map((year) => {
                  const value = row[String(year)] || 0;
                  const quarterNumber = Number(row.quarter.replace("Q", ""));
                  const futurePeriod = Number(year) === data.summary.latestYear && quarterNumber > data.summary.latestQuarter;
                  if (futurePeriod) return `<td><span class="muted">Pend.</span></td>`;
                  return `<td><span>${money(value)}</span><i style="width:${(value / max) * 100}%"></i></td>`;
                })
                .join("")}
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function renderMonthlySummary() {
  const summary = data.monthlySummary;
  if (!summary) return;
  $("#monthlySubtitle").textContent = `${summary.year} hasta ${summary.latestMonthName} · mes cargado ${money(summary.monthTotal)}`;
  $("#monthlySummary").innerHTML = `
    ${monthlyTable("Por vendedor", summary.sellerRows)}
    ${monthlyTable("Por cliente", summary.clientRows)}
    ${monthlyTable("Por producto", summary.productRows)}
  `;
}

function monthlyTable(title, rows) {
  const months = data.monthlySummary.months;
  return `
    <section class="monthly-block">
      <h3>${title}</h3>
      <div class="monthly-scroll">
        <table class="monthly-table">
          <thead>
            <tr>
              <th>Nombre</th>
              ${months.map((month) => `<th>${month.name}</th>`).join("")}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                <tr>
                  <td><strong>${escapeHtml(row.name)}</strong>${row.doc ? `<br><span>${escapeHtml(row.doc)}</span>` : ""}${row.family ? `<br><span>${escapeHtml(row.family)}</span>` : ""}</td>
                  ${months.map((month) => `<td>${money(row.months[String(month.number)] || 0)}</td>`).join("")}
                  <td><b>${money(row.total)}</b></td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderMonthlyComparison() {
  const rows = data.monthlyComparison || [];
  const years = data.years || [];
  $("#monthlyComparison").innerHTML = `
    <table class="year-month-table">
      <thead>
        <tr>
          <th>Mes/año</th>
          ${years.map((year) => `<th>${year}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
            <tr>
              <td><strong>${row.month}</strong></td>
              ${years
                .map((year) => {
                  const value = row[String(year)];
                  return `<td>${value === null || value === undefined ? "<span class='muted'>Pend.</span>" : money(value)}</td>`;
                })
                .join("")}
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function renderMonthlyComparisonV2() {
  const rows = data.monthlyComparison || [];
  const years = data.years || [];
  const comparisonMonths = rows.filter((row) => row["2026"] !== null && row["2026"] !== undefined);
  const totals = Object.fromEntries(
    years.map((year) => [
      String(year),
      rows.reduce((sum, row) => sum + (Number(row[String(year)]) || 0), 0),
    ])
  );
  const comparable2025 = comparisonMonths.reduce((sum, row) => sum + (Number(row["2025"]) || 0), 0);
  const comparable2026 = comparisonMonths.reduce((sum, row) => sum + (Number(row["2026"]) || 0), 0);
  $("#monthlyComparison").innerHTML = `
    <table class="year-month-table">
      <thead>
        <tr>
          <th>Mes/aÃ±o</th>
          ${years.map((year) => `<th>${year}</th>`).join("")}
          <th>Var. 26/25</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            const variance = variation(row["2026"], row["2025"]);
            return `
            <tr>
              <td><strong>${row.month}</strong></td>
              ${years
                .map((year) => {
                  const value = row[String(year)];
                  return `<td>${value === null || value === undefined ? "<span class='muted'>Pend.</span>" : money(value)}</td>`;
                })
                .join("")}
              <td class="${varianceClass(variance)}">${varianceLabel(variance)}</td>
            </tr>`;
          })
          .join("")}
        <tr class="total-row">
          <td><strong>Total</strong><span>Var. comparable hasta ${data.monthlySummary?.latestMonthName || "mes cargado"}</span></td>
          ${years.map((year) => `<td><b>${money(totals[String(year)] || 0)}</b></td>`).join("")}
          <td class="${varianceClass(variation(comparable2026, comparable2025))}"><b>${varianceLabel(variation(comparable2026, comparable2025))}</b></td>
        </tr>
      </tbody>
    </table>`;
}

function variation(current, previous) {
  if (current === null || current === undefined) return null;
  if (!previous) return current ? 1 : 0;
  return (Number(current) - Number(previous)) / Math.abs(Number(previous));
}

function varianceLabel(value) {
  if (value === null || value === undefined) return "<span class='muted'>Pend.</span>";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

function varianceClass(value) {
  if (value === null || value === undefined) return "variance-cell neutral";
  if (value >= 0) return "variance-cell positive";
  return "variance-cell negative";
}

function renderCommercialKpi() {
  const years = data.years || [];
  const yearTotals = Object.fromEntries(years.map((year) => [year, data.clients.reduce((sum, client) => sum + (client.yearly?.[String(year)] || 0), 0)]));
  const activeByYear = Object.fromEntries(years.map((year) => [year, data.clients.filter((client) => (client.yearly?.[String(year)] || 0) > 0)]));
  const latestYear = data.summary.latestYear;
  const previousYear = latestYear - 1;
  const retainedLatest = activeByYear[previousYear]
    ? activeByYear[previousYear].filter((client) => (client.yearly?.[String(latestYear)] || 0) > 0).length
    : 0;
  const retentionLatest = activeByYear[previousYear]?.length ? retainedLatest / activeByYear[previousYear].length : 0;
  const recurrentAllYears = data.clients.filter((client) => years.every((year) => (client.yearly?.[String(year)] || 0) > 0)).length;
  const top20Share = data.topClients.reduce((sum, client) => sum + client.total, 0) / Math.max(data.summary.totalSales, 1);
  const topClientShare = (data.topClients[0]?.total || 0) / Math.max(data.summary.totalSales, 1);
  const completeYearGrowthRows = years
    .filter((year) => year > years[0] && year < latestYear)
    .map((year) => ({
      year,
      growth: pctNumber((yearTotals[year] - yearTotals[year - 1]) / Math.max(Math.abs(yearTotals[year - 1]), 1)),
      total: yearTotals[year],
    }));
  const latestGrowth = data.summary.growthLatestYtd || 0;
  const retentionRows = years
    .filter((year) => year >= 2023)
    .map((year) => {
      const previous = year - 1;
      const previousClients = activeByYear[previous] || [];
      const retained = previousClients.filter((client) => (client.yearly?.[String(year)] || 0) > 0).length;
      const rate = previousClients.length ? retained / previousClients.length : 0;
      return {
        year,
        previous,
        retained,
        base: previousClients.length,
        rate,
        active: activeByYear[year]?.length || 0,
        comment: retentionComment(year, rate, retained, previousClients.length),
      };
    });
  const newClientRows = years
    .filter((year) => year >= 2023)
    .map((year) => {
      const newClients = data.clients.filter((client) => {
        const boughtThisYear = (client.yearly?.[String(year)] || 0) > 0;
        const boughtBefore = years.some((previous) => previous < year && (client.yearly?.[String(previous)] || 0) > 0);
        return boughtThisYear && !boughtBefore;
      });
      const total = newClients.reduce((sum, client) => sum + (client.yearly?.[String(year)] || 0), 0);
      const avgTicket = total / Math.max(newClients.length, 1);
      const shareOfYear = total / Math.max(yearTotals[year] || 0, 1);
      const boughtAgain = newClients.filter((client) => years.some((future) => future > year && (client.yearly?.[String(future)] || 0) > 0)).length;
      const recurrentSinceFirst = newClients.filter((client) => years.filter((future) => future >= year).every((future) => (client.yearly?.[String(future)] || 0) > 0)).length;
      return {
        year,
        count: newClients.length,
        boughtAgain,
        recurrentSinceFirst,
        total,
        avgTicket,
        shareOfYear,
        comment: newClientComment(year, newClients.length, total, avgTicket, boughtAgain, recurrentSinceFirst),
      };
    });
  const activeLatest = activeByYear[latestYear]?.length || 0;
  const activePrevious = activeByYear[previousYear]?.length || 0;
  const comment = commercialComment({
    retentionLatest,
    latestGrowth,
    top20Share,
    recurrentAllYears,
    activeLatest,
    activePrevious,
    latestYear,
  });

  $("#commercialKpi").innerHTML = `
    <div class="kpi-mini-grid">
      <div><span>Fidelizacion ${latestYear} YTD</span><strong>${pct(retentionLatest)}</strong><small>${retainedLatest} de ${activePrevious} clientes ${previousYear}</small></div>
      <div><span>Crecimiento ${latestYear} YTD</span><strong>${pct(latestGrowth)}</strong><small>vs mismo periodo ${previousYear}</small></div>
      <div><span>Clientes recurrentes</span><strong>${number(recurrentAllYears)}</strong><small>compraron todos los años ${years[0]}-${latestYear}</small></div>
      <div><span>Concentracion top 20</span><strong>${pct(top20Share)}</strong><small>cliente #1: ${pct(topClientShare)}</small></div>
    </div>
    <div class="growth-strip">
      ${completeYearGrowthRows
        .map((row) => `<div><b>${row.year}</b><span>${money(row.total)}</span><strong class="${row.growth >= 0 ? "positive" : "negative"}">${pct(row.growth)}</strong></div>`)
        .join("")}
      <div><b>${latestYear} YTD</b><span>${money(data.summary.salesLatestYear)}</span><strong class="${latestGrowth >= 0 ? "positive" : "negative"}">${pct(latestGrowth)}</strong></div>
    </div>
    <div class="retention-table-wrap">
      <h3>Fidelizacion año a año</h3>
      <table class="retention-table">
        <thead>
          <tr>
            <th>Año</th>
            <th>Base anterior</th>
            <th>Retenidos</th>
            <th>Tasa</th>
            <th>Comentario</th>
          </tr>
        </thead>
        <tbody>
          ${retentionRows
            .map(
              (row) => `
              <tr>
                <td><strong>${row.year}</strong><span>vs ${row.previous}</span></td>
                <td>${number(row.base)}</td>
                <td>${number(row.retained)}</td>
                <td><b class="${row.rate >= 0.35 ? "positive" : "negative"}">${pct(row.rate)}</b></td>
                <td>${row.comment}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="retention-table-wrap">
      <h3>Clientes nuevos por año</h3>
      <table class="retention-table">
        <thead>
          <tr>
            <th>Año</th>
            <th>Nuevos</th>
            <th>Volvieron</th>
            <th>Recurrentes</th>
            <th>Venta neta</th>
            <th>% venta total</th>
            <th>Comentario</th>
          </tr>
        </thead>
        <tbody>
          ${newClientRows
            .map(
              (row) => `
              <tr>
                <td><strong>${row.year}</strong></td>
                <td>${number(row.count)}</td>
                <td>${number(row.boughtAgain)}</td>
                <td>${number(row.recurrentSinceFirst)}</td>
                <td>${money(row.total)}</td>
                <td>${pct(row.shareOfYear)}</td>
                <td>${row.comment}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="executive-comment">
      <strong>Comentario comercial</strong>
      <p>${comment}</p>
    </div>`;
}

function renderNewClients2026() {
  const block = data.newClients2026;
  const container = $("#newClients2026");
  if (!block || !container) return;
  const sellers = block.bySeller || [];
  if (!state.selectedNewClientSeller || !sellers.some((row) => row.seller === state.selectedNewClientSeller)) {
    state.selectedNewClientSeller = sellers[0]?.seller || "";
  }
  const selected = sellers.find((row) => row.seller === state.selectedNewClientSeller) || sellers[0];
  const conversion = block.totalRegistered ? block.soldClients / block.totalRegistered : 0;
  container.innerHTML = `
    <div class="kpi-mini-grid">
      <div><span>Registrados</span><strong>${number(block.totalRegistered)}</strong><small>${block.year}</small></div>
      <div><span>Con venta</span><strong>${number(block.soldClients)}</strong><small>${(conversion * 100).toFixed(1)}% conversion</small></div>
      <div><span>Importe vendido</span><strong>${money(block.sales)}</strong><small>Venta neta 2026</small></div>
    </div>
    <div class="new-client-layout">
      <div class="new-client-sellers">
        ${sellers
          .map(
            (row) => `
            <button class="new-client-seller ${row.seller === state.selectedNewClientSeller ? "active" : ""}" data-seller="${escapeHtml(row.seller)}">
              <strong>${escapeHtml(row.seller)}</strong>
              <span>${number(row.registered)} nuevos · ${number(row.soldClients)} vendidos · ${money(row.sales)}</span>
              <em>${(row.conversionRate * 100).toFixed(1)}%</em>
            </button>`
          )
          .join("")}
      </div>
      <div class="new-client-detail">
        ${selected ? newClientDetailTable(selected) : `<p class="muted empty-note">No hay clientes nuevos 2026.</p>`}
      </div>
    </div>`;
  $$("#newClients2026 [data-seller]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedNewClientSeller = button.dataset.seller;
      renderNewClients2026();
    });
  });
}

function newClientDetailTable(sellerRow) {
  return `
    <div class="detail-title">
      <strong>${escapeHtml(sellerRow.seller)}</strong>
      <span>${number(sellerRow.registered)} registrados · ${number(sellerRow.soldClients)} con venta · ${money(sellerRow.sales)}</span>
    </div>
    <div class="new-client-scroll">
      <table class="new-client-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Alta</th>
            <th>Venta</th>
            <th>Contacto</th>
          </tr>
        </thead>
        <tbody>
          ${(sellerRow.clients || [])
            .map(
              (client) => `
              <tr>
                <td><strong>${escapeHtml(client.name)}</strong><br><span>${escapeHtml(client.doc)}</span></td>
                <td>${client.entryDate || "s/d"}</td>
                <td><b>${money(client.sales)}</b><br><span>${number(client.orders)} docs.</span></td>
                <td>${escapeHtml(client.phone || client.email || "Sin contacto")}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function retentionComment(year, rate, retained, base) {
  if (!base) return "Sin base comparable del año anterior.";
  if (year === data.summary.latestYear) {
    return `Lectura parcial YTD: ${retained} clientes del año anterior ya recompraron; deberia subir conforme avance el año.`;
  }
  if (rate >= 0.45) return `Buena continuidad: casi la mitad o mas de la cartera del año previo volvio a comprar.`;
  if (rate >= 0.30) return `Fidelizacion media: hay recurrencia, pero existe una bolsa relevante para reactivacion.`;
  return `Fidelizacion baja: se perdio una parte importante de la base del año previo y conviene revisar abandono.`;
}

function newClientComment(year, count, total, avgTicket, boughtAgain, recurrentSinceFirst) {
  if (!count) return "No se registran clientes nuevos con compra neta en este año.";
  if (year === data.summary.latestYear) {
    return `Lectura parcial YTD: ya ingresaron ${count} clientes nuevos; conviene medir recompra antes de cierre anual.`;
  }
  const repurchaseRate = boughtAgain / Math.max(count, 1);
  if (recurrentSinceFirst >= count * 0.12) return `Buena calidad de captacion: ${boughtAgain} volvieron a comprar y ${recurrentSinceFirst} se mantienen recurrentes desde su ingreso.`;
  if (repurchaseRate >= 0.25) return `Captacion con recompra aceptable: ${boughtAgain} volvieron a comprar, aunque pocos sostienen recurrencia anual completa.`;
  if (avgTicket >= 5000) return `Ingreso sano: clientes nuevos con ticket promedio relevante y potencial de desarrollo.`;
  if (count >= 300) return `Buen volumen de captacion, aunque debe revisarse calidad y segunda compra.`;
  return `Captacion moderada; el foco deberia ser convertir estos nuevos clientes en recurrentes.`;
}

function pctNumber(value) {
  if (!Number.isFinite(value)) return 0;
  return value;
}

function commercialComment({ retentionLatest, latestGrowth, top20Share, recurrentAllYears, activeLatest, activePrevious, latestYear }) {
  const retentionText =
    retentionLatest >= 0.45
      ? "La cartera mantiene una fidelizacion razonable considerando que el año esta en curso"
      : "La fidelizacion del año en curso todavia es baja frente a la base activa del año anterior";
  const growthText =
    latestGrowth >= 0
      ? "las ventas vienen creciendo contra el mismo periodo anterior"
      : "las ventas vienen por debajo del mismo periodo anterior";
  const concentrationText =
    top20Share >= 0.35
      ? "hay una concentracion relevante en los principales clientes, por lo que conviene protegerlos y ampliar cobertura en la cola media"
      : "la venta esta relativamente diversificada, lo que reduce dependencia de pocos clientes";
  return `${retentionText}: ${activeLatest} clientes activos en ${latestYear} frente a ${activePrevious} del año previo. A la vez, ${growthText}. Desde 2022 se observa una base historica amplia, con ${recurrentAllYears} clientes comprando todos los años; el foco comercial deberia ser recuperar clientes dormidos de alto valor, defender recurrentes y activar venta cruzada en productos lideres. En diversidad, ${concentrationText}.`;
}

function renderFamilies() {
  const max = Math.max(...data.families.map((f) => f.total), 1);
  $("#familyBars").innerHTML = data.families
    .map(
      (f) => `
      <div class="bar-row">
        <strong>${escapeHtml(f.family)}</strong>
        <div class="bar-track"><div class="bar-fill" style="width:${(f.total / max) * 100}%"></div></div>
        <span>${money(f.total)}</span>
      </div>`
    )
    .join("");
}

function renderRankingBlocks() {
  const maxProduct = Math.max(...data.topProductGroups.map((p) => p.total), 1);
  const maxClient = Math.max(...data.topClients.map((c) => c.total), 1);
  $("#productRanking").innerHTML = data.topProductGroups
    .map(
      (product, index) => `
      <article class="simple-row clickable" data-product="${product.id}">
        <b>${index + 1}</b>
        <div>
          <strong>${escapeHtml(product.product)}</strong>
          <span>${escapeHtml(product.family)} · ${product.presentations} presentaciones · ${product.codes} codigos · ${number(product.clients)} clientes</span>
          <i style="width:${(product.total / maxProduct) * 100}%"></i>
        </div>
        <em>${money(product.total)}</em>
      </article>`
    )
    .join("");
  if (!state.selectedProductId && data.topProductGroups.length) {
    state.selectedProductId = data.topProductGroups[0].id;
  }
  $$("#productRanking [data-product]").forEach((row) => row.addEventListener("click", () => selectProduct(row.dataset.product)));
  renderProductBuyers();
  $("#clientRanking").innerHTML = data.topClients
    .map(
      (client, index) => `
      <article class="simple-row clickable" data-client="${client.id}">
        <b>${index + 1}</b>
        <div>
          <strong>${escapeHtml(client.name)}</strong>
          <span>${escapeHtml(client.seller)} · ${escapeHtml(client.topFamily)} · ${number(client.orders)} pedidos</span>
          <i style="width:${(client.total / maxClient) * 100}%"></i>
        </div>
        <em>${money(client.total)}</em>
      </article>`
    )
    .join("");
  $$("#clientRanking [data-client]").forEach((row) => row.addEventListener("click", () => openClient(row.dataset.client)));
  renderRecurringClients();
}

function renderRecurringClients() {
  const years = (data.years || []).map(String);
  const recurring = data.clients
    .filter((client) => years.every((year) => (client.yearly?.[year] || 0) > 0))
    .sort((a, b) => b.total - a.total);
  $("#recurringClients").innerHTML =
    recurring
      .map(
        (client, index) => `
        <article class="simple-row clickable" data-client="${client.id}">
          <b>${index + 1}</b>
          <div>
            <strong>${escapeHtml(client.name)}</strong>
            <span>${escapeHtml(client.seller)} · ${escapeHtml(client.topFamily)} · ${number(client.orders)} pedidos</span>
            <small>${years.map((year) => `${year}: ${money(client.yearly[year])}`).join(" · ")}</small>
          </div>
          <em>${money(client.total)}</em>
        </article>`
      )
      .join("") || `<p class="muted empty-note">No hay clientes con compras en todos los anos cargados.</p>`;
  $$("#recurringClients [data-client]").forEach((row) => row.addEventListener("click", () => openClient(row.dataset.client)));
}

function selectProduct(productId) {
  state.selectedProductId = productId;
  renderProductBuyers();
}

function renderProductBuyers() {
  const products = filteredProducts();
  const product =
    products.find((item) => item.id === state.selectedProductId) ||
    data.productGroups?.find((item) => item.id === state.selectedProductId) ||
    data.topProductGroups.find((item) => item.id === state.selectedProductId) ||
    products[0] ||
    data.topProductGroups[0];
  const container = $("#productBuyers");
  if (!container || !product) return;
  $$("#productRanking [data-product]").forEach((row) => row.classList.toggle("selected", row.dataset.product === product.id));
  container.innerHTML = `
    <div class="panel-head compact-head">
      <h2>Resumen del producto</h2>
      <span>${escapeHtml(product.product)}</span>
    </div>
    ${productYearlySummary(product)}
    <div class="panel-head compact-head product-buyers-head">
      <h2>Clientes compradores</h2>
      <span>${number((product.buyers || []).length)} clientes principales</span>
    </div>
    <div class="buyer-list">
      ${(product.buyers || [])
        .map(
          (buyer, index) => `
          <article class="buyer-row" data-client="${buyer.clientId}">
            <b>${index + 1}</b>
            <div>
              <strong>${escapeHtml(buyer.name)}</strong>
              <span>${escapeHtml(buyer.doc)} · ${number(buyer.orders)} pedidos · ult. ${buyer.lastPurchase || "s/d"}</span>
            </div>
            <span>${number(buyer.quantity)}</span>
            <em>${money(buyer.total)}</em>
          </article>`
        )
        .join("")}
    </div>`;
  $$("#productBuyers [data-client]").forEach((row) => row.addEventListener("click", () => openClient(row.dataset.client)));
}

function recoveryClients() {
  return filteredClients()
    .filter((client) => client.dormantSegment !== "Cartera activa" || client.recoveryValue > 10000)
    .sort((a, b) => b.dormantScore - a.dormantScore || b.recoveryValue - a.recoveryValue || b.bestYear - a.bestYear);
}

function renderRecovery() {
  const rows = recoveryClients();
  $("#recoveryCount").textContent = `${number(rows.length)} oportunidades`;
  $("#recoveryRows").innerHTML = rows
    .slice(0, 80)
    .map(
      (client, index) => `
      <article class="recovery-card" data-client="${client.id}">
        <div class="rank">${index + 1}</div>
        <div class="recovery-client-main">
          <strong>${escapeHtml(client.name)}</strong>
          <span class="meta">${escapeHtml(client.doc)} · ${escapeHtml(client.seller)}</span>
          <p>${escapeHtml(client.action)}</p>
        </div>
        <div class="recovery-status"><span class="tag ${client.stage}">${client.dormantSegment}</span></div>
        <div class="recovery-metrics">
          <div><span>Score</span><strong>${client.dormantScore}</strong></div>
          <div><span>Mejor ano</span><strong>${money(client.bestYear)}</strong></div>
          <div><span>12M</span><strong>${money(client.last4)}</strong></div>
          <div><span>Sin compra</span><strong>${number(client.daysSince)} d</strong></div>
        </div>
        <button class="mini-btn recovery-open" data-open="${client.id}">Ficha</button>
      </article>`
    )
    .join("");
  $$("#recoveryRows [data-client]").forEach((row) => row.addEventListener("click", () => openClient(row.dataset.client)));
  $$("#recoveryRows [data-open]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      openClient(btn.dataset.open);
    });
  });
}

function renderActionBoard() {
  const stages = ["Recuperar", "Defender", "Expandir", "Mantener", "Prospectar"];
  const clients = actionClients();
  $("#actionBoard").innerHTML = stages
    .map((stage) => {
      const rows = clients.filter((client) => client.stage === stage).slice(0, 16);
      return `
        <section class="lane">
          <h3>${stage} <span class="muted">${rows.length}</span></h3>
          ${rows.map(actionCard).join("") || `<p class="muted" style="padding:12px">Sin clientes filtrados.</p>`}
        </section>`;
    })
    .join("");
  $$("#actionBoard [data-done]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = getClientState(btn.dataset.done);
      entry.done = !entry.done;
      saveLocal();
      renderActionBoard();
    });
  });
  $$("#actionBoard [data-open]").forEach((btn) => btn.addEventListener("click", () => openClient(btn.dataset.open)));
}

function actionCard(client) {
  const entry = getClientState(client.id);
  return `
    <article class="action-card" data-stage="${client.stage}">
      <strong>${escapeHtml(client.name)}</strong>
      <span class="meta">${escapeHtml(client.seller)} · ${escapeHtml(client.topFamily)} · ${client.dormantSegment}</span>
      <span>${escapeHtml(client.action)}</span>
      <span class="meta">Mejor ano ${money(client.bestYear)} · 12M ${money(client.last4)} · recuperable ${money(client.recoveryValue)}</span>
      <div class="top-actions">
        <button data-open="${client.id}">Ficha</button>
        <button data-done="${client.id}">${entry.done ? "Reabrir" : "Hecho"}</button>
      </div>
    </article>`;
}

function renderClients() {
  const clients = filteredClients();
  renderDonut(clients);
  if (!state.selectedId || !clients.some((c) => c.id === state.selectedId)) {
    state.selectedId = clients[0]?.id || data.clients[0]?.id;
  }
  $("#clientCount").textContent = `${number(clients.length)} clientes`;
  $("#clientRows").innerHTML = clients
    .slice(0, 500)
    .map(
      (client) => `
      <tr data-client="${client.id}">
        <td><strong>${escapeHtml(client.name)}</strong><br><span class="muted">${escapeHtml(client.doc)} · ${escapeHtml(client.seller)} · ${client.dormantSegment}</span></td>
        <td><span class="tag ${client.stage}">${client.stage}</span></td>
        <td>${money(client.last4)}</td>
        <td>${pct(client.trend)}</td>
        <td>${client.lastPurchase}<br><span class="muted">${client.daysSince} dias</span></td>
        <td>${client.priority}</td>
      </tr>`
    )
    .join("");
  $$("#clientRows [data-client]").forEach((row) => row.addEventListener("click", () => openClient(row.dataset.client, false)));
  renderClientDetail();
}

function openClient(id, switchView = true) {
  state.selectedId = id;
  if (switchView) setView("clients");
  else renderClientDetail();
}

function renderClientDetail() {
  const client = data.clients.find((c) => c.id === state.selectedId);
  if (!client) {
    $("#clientDetail").innerHTML = "<p class='muted'>Sin cliente seleccionado.</p>";
    return;
  }
  const entry = getClientState(client.id);
  const contact = { ...(client.contact || {}), ...(entry.contact || {}) };
  const clientStatus = entry.clientStatus || contact.status || "Activo";
  const message = `Hola ${client.name}, soy de ISAVAL. Queria retomar contacto sobre sus compras anteriores de ${client.topFamily} y revisar si tiene una necesidad de reposicion o una obra en curso.`;
  const whatsappUrl = contact.phone ? `https://wa.me/${encodeURIComponent(contact.phone)}?text=${encodeURIComponent(message)}` : "";
  const mailUrl = contact.email
    ? `mailto:${contact.email}?subject=${encodeURIComponent("Seguimiento comercial ISAVAL")}&body=${encodeURIComponent(message)}`
    : "";
  $("#clientDetail").innerHTML = `
    <span class="tag ${client.stage}">${client.stage}</span>
    <h2>${escapeHtml(client.name)}</h2>
    <p class="muted">${escapeHtml(client.doc)} · ${escapeHtml(client.seller)} · ${client.dormantSegment}</p>
    <p>${escapeHtml(client.action)}</p>
    <div class="contact-card">
      <h3>Contacto editable</h3>
      <div class="editable-contact-grid">
        <label><span>Nombre contacto</span><input id="contactName" value="${escapeHtml(contact.contact || client.name)}" /></label>
        <label><span>Telefono 1</span><input id="contactPhone1" value="${escapeHtml(contact.phone1 || contact.phone || "")}" /></label>
        <label><span>Telefono 2</span><input id="contactPhone2" value="${escapeHtml(contact.phone2 || "")}" /></label>
        <label><span>Correo</span><input id="contactEmail" type="email" value="${escapeHtml(contact.email || "")}" /></label>
        <label class="wide"><span>Direccion</span><input id="contactAddress" value="${escapeHtml(contact.address || "")}" /></label>
        <label><span>Estado cliente</span>
          <select id="clientLocalStatus">
            ${["Activo", "De baja", "No contactar", "Datos por validar"].map((status) => `<option value="${status}" ${status === clientStatus ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="top-actions">
        <button class="mini-btn" id="saveContact">Guardar contacto</button>
        ${whatsappUrl ? `<a class="mini-btn action-link whatsapp" href="${whatsappUrl}" target="_blank" rel="noopener">WhatsApp</a>` : `<button class="mini-btn" disabled>Sin WhatsApp</button>`}
        ${mailUrl ? `<a class="mini-btn action-link" href="${mailUrl}">Correo</a>` : `<button class="mini-btn" disabled>Sin correo</button>`}
      </div>
    </div>
    <div class="detail-grid">
      <div class="mini-kpi"><span>12M</span><strong>${money(client.last4)}</strong></div>
      <div class="mini-kpi"><span>Recuperable</span><strong>${money(client.recoveryValue)}</strong></div>
      <div class="mini-kpi"><span>Mejor ano</span><strong>${money(client.bestYear)}</strong></div>
      <div class="mini-kpi"><span>Score dormido</span><strong>${client.dormantScore}</strong></div>
      <div class="mini-kpi"><span>Ticket medio</span><strong>${money(client.avgTicket)}</strong></div>
      <div class="mini-kpi"><span>Pedidos</span><strong>${number(client.orders)}</strong></div>
    </div>
    <div class="spark">${sparkline(client)}</div>
    <h3>Mix principal</h3>
    <div class="stack-list">${client.mix.map((m) => `<div class="stack-item"><strong>${escapeHtml(m.family)}</strong><span>${money(m.total)}</span></div>`).join("")}</div>
    <h3>Productos comprados</h3>
    <div class="product-detail-scroll">
      <table class="product-detail-table">
        <thead>
          <tr>
            <th>Codigo</th>
            <th>Cod. comercial</th>
            <th>Producto</th>
            <th>Cant.</th>
            <th>Importe</th>
          </tr>
        </thead>
        <tbody>
          ${(client.products || [])
            .slice(0, 50)
            .map(
              (product) => `
              <tr>
                <td>${escapeHtml(product.code)}</td>
                <td>${escapeHtml(product.commercialCode)}</td>
                <td><strong>${escapeHtml(product.name)}</strong><br><span class="muted">${escapeHtml(product.family)} · ${number(product.orders)} pedidos</span></td>
                <td>${number(product.quantity)}</td>
                <td>${money(product.total)}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="note-box">
      <label class="muted" for="clientNote">Nota comercial local</label>
      <textarea id="clientNote">${escapeHtml(entry.note || "")}</textarea>
      <div class="top-actions">
        <button class="mini-btn" id="saveNote">Guardar nota</button>
        <button class="mini-btn" id="toggleDone">${entry.done ? "Reabrir accion" : "Marcar hecha"}</button>
      </div>
    </div>`;
  $("#saveContact").addEventListener("click", () => {
    entry.contact = {
      contact: $("#contactName").value.trim(),
      phone1: $("#contactPhone1").value.trim(),
      phone2: $("#contactPhone2").value.trim(),
      phone: $("#contactPhone1").value.trim() || $("#contactPhone2").value.trim(),
      email: $("#contactEmail").value.trim(),
      address: $("#contactAddress").value.trim(),
      status: $("#clientLocalStatus").value,
    };
    entry.clientStatus = $("#clientLocalStatus").value;
    saveLocal();
    renderClientDetail();
  });
  $("#saveNote").addEventListener("click", () => {
    entry.note = $("#clientNote").value;
    saveLocal();
  });
  $("#toggleDone").addEventListener("click", () => {
    entry.done = !entry.done;
    saveLocal();
    renderClientDetail();
  });
}

function sparkline(client) {
  const values = data.periods.map((p) => client.quarterly[p] || 0);
  const max = Math.max(...values.map((v) => Math.abs(v)), 1);
  const width = 400;
  const height = 72;
  const points = values.map((v, i) => {
    const x = 8 + (i * (width - 16)) / (values.length - 1);
    const y = height - 8 - (Math.max(v, 0) / max) * (height - 16);
    return `${x},${y}`;
  });
  return `<svg viewBox="0 0 ${width} ${height}"><polyline points="${points.join(" ")}" fill="none" stroke="#1677d2" stroke-width="3"></polyline></svg>`;
}

function renderSellers() {
  $("#sellerRows").innerHTML = data.sellers
    .map(
      (s) => `
      <article class="seller-card">
        <div><strong>${escapeHtml(s.seller)}</strong><br><span class="muted">${number(s.clients)} clientes · ${number(s.orders)} documentos</span></div>
        <span>${money(s.total)}</span>
        <span>Riesgo ${number(s.atRisk)}</span>
        <span>${money(s.recoveryValue)}</span>
        <button class="mini-btn" data-seller="${escapeHtml(s.seller)}">Filtrar</button>
      </article>`
    )
    .join("");
  $$("#sellerRows [data-seller]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.seller = btn.dataset.seller;
      $("#sellerFilter").value = state.seller;
      setView("actions");
    });
  });
}

function renderProducts() {
  const products = filteredProducts();
  if (!products.some((product) => product.id === state.selectedProductId)) {
    state.selectedProductId = products[0]?.id || data.topProductGroups[0]?.id;
  }
  $("#productRanking").innerHTML = products.slice(0, 20)
    .map(
      (p, index) => `
      <article class="simple-row clickable ${p.id === state.selectedProductId ? "selected" : ""}" data-product="${p.id}">
        <b>${index + 1}</b>
        <div><strong>${escapeHtml(p.product)}</strong><br><span class="muted">${escapeHtml(p.family)} · ${p.presentations} presentaciones · ${p.codes} codigos</span></div>
        <em>${money(p.total)}</em>
      </article>`
    )
    .join("") || `<p class="muted empty-note">No hay productos para ese filtro.</p>`;
  $$("#productRanking [data-product]").forEach((row) => row.addEventListener("click", () => {
    state.selectedProductId = row.dataset.product;
    renderProducts();
  }));
  renderProductBuyers();
}

function filteredProducts() {
  const term = (($("#searchInput")?.value || state.search) ?? "").toLowerCase().trim();
  const source = term ? data.productGroups || data.topProductGroups : data.topProductGroups;
  if (!term) return source;
  return source.filter((product) => {
    const haystack = `${product.product} ${product.family}`.toLowerCase();
    return haystack.includes(term);
  });
}

function renderProductSectionBuyers() {
  const products = filteredProducts();
  const product = products.find((item) => item.id === state.selectedProductId) || products[0];
  const container = $("#productSectionBuyers");
  if (!container) return;
  if (!product) {
    container.innerHTML = `
      <div class="panel-head compact-head">
        <h2>Clientes compradores</h2>
        <span>Sin producto seleccionado</span>
      </div>
      <p class="muted empty-note">No hay compradores para mostrar.</p>`;
    return;
  }
  container.innerHTML = `
    <div class="panel-head compact-head">
      <h2>Clientes compradores</h2>
      <span>${escapeHtml(product.product)}</span>
    </div>
    <div class="buyer-list">
      ${(product.buyers || [])
        .map(
          (buyer, index) => `
          <article class="buyer-row" data-client="${buyer.clientId}">
            <b>${index + 1}</b>
            <div>
              <strong>${escapeHtml(buyer.name)}</strong>
              <span>${escapeHtml(buyer.doc)} · ${number(buyer.orders)} pedidos · ult. ${buyer.lastPurchase || "s/d"}</span>
            </div>
            <span>${number(buyer.quantity)}</span>
            <em>${money(buyer.total)}</em>
          </article>`
        )
        .join("")}
    </div>`;
  $$("#productSectionBuyers [data-client]").forEach((row) => row.addEventListener("click", () => openClient(row.dataset.client)));
}

function productYearlySummary(product) {
  const yearlyFromSales = productYearlySales?.byId?.[product.id]?.yearly || {};
  const yearly = yearlyFromSales || product.yearly || {};
  const years = productYearlySales?.summary?.years || data.years || Object.keys(yearly).sort();
  const hasYearly = years.some((year) => yearly[String(year)]);
  if (!hasYearly) {
    return `
      <div class="product-yearly-empty">
        <strong>Cantidad vendida por ano</strong>
        <p>No hay cantidad anual para este producto en el Kardex analizado.</p>
      </div>`;
  }
  const totalUnits = years.reduce((sum, year) => sum + (yearly[String(year)]?.units || 0), 0);
  return `
    <div class="product-yearly">
      <h3>Cantidad vendida por ano</h3>
      <table>
        <thead>
          <tr>
            ${years.map((year) => `<th>${year}</th>`).join("")}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            ${years.map((year) => `<td>${number(yearly[String(year)]?.units || 0)}</td>`).join("")}
            <td><strong>${number(totalUnits)}</strong></td>
          </tr>
        </tbody>
      </table>
      <p class="muted">Cantidades tomadas del Kardex por movimientos de venta.</p>
    </div>`;
}

function filteredStockProducts() {
  if (!stockData) return [];
  const term = state.stockSearch.toLowerCase().trim();
  return (stockData.products || []).filter((product) => {
    const haystack = `${product.productCode} ${product.commercialCode} ${product.product} ${product.brand} ${product.class} ${product.subclass} ${product.status}`.toLowerCase();
    const matchesSearch = !term || haystack.includes(term);
    const matchesAbc = state.stockAbc === "all" || product.abc === state.stockAbc;
    const matchesStatus = state.stockStatus === "all" || product.status === state.stockStatus;
    const matchesClass = state.stockClass === "all" || product.class === state.stockClass;
    return matchesSearch && matchesAbc && matchesStatus && matchesClass;
  });
}

function renderStockAnalysis() {
  if (!stockData) {
    $("#stockRows").innerHTML = `<p class="muted empty-note">Sin datos. Ejecuta scripts/build_stock_analysis.py.</p>`;
    return;
  }
  const rows = filteredStockProducts();
  renderStockRows(rows);
}

function renderStockRows(rows) {
  $("#stockCount").textContent = `${number(rows.length)} productos`;
  const visibleRows = rows.slice(0, 500);
  const totalInventoryValue = rows.reduce((sum, row) => sum + (row.stockValue || 0), 0);
  $("#stockRows").innerHTML = `<table>
    <thead>
      <tr>
        <th>#</th>
        <th>Codigo</th>
        <th>Producto</th>
        <th>Marca</th>
        <th>Stock</th>
        <th>Valor inv.</th>
        <th>Und. LTM</th>
        <th>Venta LTM</th>
        <th>Rotacion</th>
        <th>Dias inv.</th>
        <th>Meses cobertura</th>
        <th>ABC</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      ${visibleRows
        .map(
          (row, index) => `<tr>
            <td>${index + 1}</td>
            <td><strong>${escapeHtml(row.productCode)}</strong>${row.commercialCode ? `<span>${escapeHtml(row.commercialCode)}</span>` : ""}</td>
            <td title="${escapeHtml(row.product)}">${escapeHtml(row.product)}</td>
            <td title="${escapeHtml(row.brand || "Sin marca")}">${escapeHtml(row.brand || "Sin marca")}</td>
            <td>${number(row.stockQty)}</td>
            <td>${money2(row.stockValue)}</td>
            <td>${number(row.salesQty365)}</td>
            <td>${money2(row.salesCost365)}</td>
            <td>${row.turnover === null ? "Sin dato" : `${row.turnover}x`}</td>
            <td>${row.daysInventory === null ? "Sin venta" : number(row.daysInventory)}</td>
            <td>${row.monthsCoverage === null ? "Sin venta" : number(row.monthsCoverage)}</td>
            <td><b class="abc-pill abc-${escapeHtml(row.abc)}">${escapeHtml(row.abc)}</b></td>
            <td><span class="stock-status ${stockStatusClass(row.status)}">${escapeHtml(stockStatusLabel(row.status))}</span></td>
          </tr>`
        )
        .join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5">Total Valor inv.</td>
        <td>${money2(totalInventoryValue)}</td>
        <td colspan="7"></td>
      </tr>
    </tfoot>
  </table>
  ${rows.length > 500 ? `<p class="muted table-note">Mostrando los primeros 500 productos. Usa filtros o busqueda para acotar.</p>` : ""}`;
}

function stockStatusClass(status) {
  return `status-${String(status || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-")}`;
}

function stockStatusLabel(status) {
  if (status === "Saludable") return "Normal";
  return status;
}

function renderPrices() {
  const priceStock = data.priceStock || {};
  const allRows = selectOnePricePerProduct(
    (priceStock.rows || []).filter((row) => Number(row.stock || 0) > 0 || row.lastSale)
  ).filter((row) => String(row.productName || "").trim() || String(row.commercialCode || "").trim());
  const warehouses = priceStock.summary?.warehouses || [];
  const term = state.priceSearch.toLowerCase().trim();
  const rows = term
    ? allRows.filter((row) =>
        `${row.productCode} ${row.commercialCode} ${row.productName} ${row.priceList}`.toLowerCase().includes(term)
      )
    : allRows;
  const visibleWarehouses = warehouses.filter((warehouse) => rows.some((row) => stockByWarehouse(row, warehouse) > 0));
  const summary = priceStock.summary || {};
  renderPriceWhatsappPanel(allRows, rows);
  $("#priceCount").textContent = `${number(rows.length)} registros`;
  $("#priceRows").innerHTML = `
    <table class="price-table">
      <thead>
        <tr>
          <th>Sel.</th>
          <th>Codigo comercial</th>
          <th>Producto</th>
          <th>Descripcion tecnica</th>
          <th>Lista de precios</th>
          <th>Valor venta</th>
          <th>IGV</th>
          <th>Total</th>
          <th>Stock actual</th>
          <th>Ultima venta</th>
          ${visibleWarehouses.map((warehouse) => `<th>${escapeHtml(warehouse)}</th>`).join("")}
          <th>Costo prom.</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .slice(0, 600)
          .map(
            (row) => {
              const key = priceKey(row);
              return `
            <tr>
              <td><input type="checkbox" class="price-select" data-price-key="${escapeHtml(key)}" ${state.selectedPriceKeys.has(key) ? "checked" : ""} /></td>
              <td>${escapeHtml(row.commercialCode)}</td>
              <td><strong>${escapeHtml(row.productName)}</strong></td>
              <td>${technicalDescriptionCell(row)}</td>
              <td>${escapeHtml(row.priceList)}</td>
              <td>${money(row.valueSale)}</td>
              <td>${money(row.igv)}</td>
              <td><b>${money(row.totalSale)}</b></td>
              <td>${number(row.stock)}</td>
              <td>${row.lastSale || "<span class='muted'>Sin venta 2026</span>"}</td>
              ${visibleWarehouses.map((warehouse) => `<td>${number(stockByWarehouse(row, warehouse))}</td>`).join("")}
              <td>${money(row.avgCost)}</td>
            </tr>`;
            }
          )
          .join("")}
      </tbody>
    </table>`;
  $$("#priceRows .price-select").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const row = allRows.find((item) => priceKey(item) === checkbox.dataset.priceKey);
      if (checkbox.checked) {
        state.selectedPriceKeys.add(checkbox.dataset.priceKey);
        if (row) state.selectedPriceRows.set(checkbox.dataset.priceKey, row);
      } else {
        state.selectedPriceKeys.delete(checkbox.dataset.priceKey);
        state.selectedPriceRows.delete(checkbox.dataset.priceKey);
      }
      renderPrices();
    });
  });
}

function selectOnePricePerProduct(rows) {
  const grouped = groupRows(rows, (row) => row.productCode);
  return grouped
    .map(([, items]) => [...items].sort((a, b) => priceRowRank(b) - priceRowRank(a))[0])
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

function priceRowRank(row) {
  const list = String(row.priceList || "").toUpperCase();
  const years = [...list.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  const year = years.length ? Math.max(...years) : 0;
  const yearScore = year === 2026 ? 100000 : year * 10;
  const listScore = list.includes("PUBLICO") || list.includes("PÚBLICO") ? 4 : list.includes("LISTA") ? 3 : list.includes("PRECIO") ? 2 : 1;
  return yearScore + listScore;
}

function renderPriceWhatsappPanel(allRows, visibleRows = allRows) {
  const selected = [...state.selectedPriceRows.entries()]
    .filter(([key]) => state.selectedPriceKeys.has(key))
    .map(([, row]) => row);
  const message = priceWhatsappMessage(selected);
  const phone = state.priceWhatsappPhone.replace(/\D+/g, "");
  const href = selected.length
    ? phone
      ? `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`
      : `whatsapp://send?text=${encodeURIComponent(message)}`
    : "";
  $("#priceWhatsappPanel").innerHTML = `
    <div class="price-send-grid">
      <div class="price-send-actions">
        <strong>${number(selected.length)} seleccionados</strong>
        ${href ? `<a class="ghost-btn action-link whatsapp" href="${href}">${phone ? "Enviar WhatsApp" : "Abrir WhatsApp"}</a>` : `<button class="ghost-btn" disabled>Abrir WhatsApp</button>`}
        <button class="ghost-btn strong-action" id="openPriceQuote" ${selected.length ? "" : "disabled"}>Pre cotizacion PDF</button>
        <button class="ghost-btn" id="downloadSelectedQuotePdf" ${selected.length ? "" : "disabled"}>Descargar PDF</button>
        <button class="ghost-btn whatsapp" id="shareSelectedQuotePdf" ${selected.length ? "" : "disabled"}>Enviar PDF</button>
        <button class="ghost-btn" id="exportSelectedPrices" ${selected.length ? "" : "disabled"}>Excel</button>
        <button class="ghost-btn" id="selectAllPrices">Seleccionar todos</button>
        <button class="ghost-btn" id="clearPriceSelection">Limpiar</button>
      </div>
    </div>
    <textarea class="price-message-preview" readonly>${escapeHtml(message || "Selecciona productos para armar el mensaje.")}</textarea>`;
  $("#clearPriceSelection").addEventListener("click", () => {
    state.selectedPriceKeys.clear();
    state.selectedPriceRows.clear();
    renderPrices();
  });
  $("#exportSelectedPrices").addEventListener("click", () => exportSelectedPrices(selected));
  $("#openPriceQuote").addEventListener("click", () => renderPriceQuoteModal(selected));
  $("#downloadSelectedQuotePdf").addEventListener("click", () => downloadPriceQuotePdf(selected));
  $("#shareSelectedQuotePdf").addEventListener("click", () => sharePriceQuotePdf(selected));
  $("#selectAllPrices").addEventListener("click", () => {
    visibleRows.slice(0, 600).forEach((row) => {
      const key = priceKey(row);
      state.selectedPriceKeys.add(key);
      state.selectedPriceRows.set(key, row);
    });
    renderPrices();
  });
}

function renderPriceQuoteModal(rows) {
  if (!rows.length) return;
  const existing = $("#priceQuoteModal");
  if (existing) existing.remove();
  rows.forEach((row) => {
    const key = priceKey(row);
    if (!state.priceQuoteQuantities.has(key)) state.priceQuoteQuantities.set(key, 1);
  });
  const message = priceQuoteMessage(rows);
  const href = `whatsapp://send?text=${encodeURIComponent(message)}`;
  const total = rows.reduce((sum, row) => sum + priceQuoteQuantity(row) * Number(row.totalSale || 0), 0);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="modal-backdrop" id="priceQuoteModal">
      <section class="price-quote-modal" role="dialog" aria-modal="true" aria-label="Pre cotizacion">
        <div class="modal-head">
          <div>
            <h2>Pre cotizacion</h2>
            <p>Precio de lista referencial con IGV incluido.</p>
          </div>
          <button class="mini-btn" id="closePriceQuote" aria-label="Cerrar">Cerrar</button>
        </div>
        ${priceQuoteCustomerForm()}
        <div class="price-quote-list">
          ${rows
            .map((row, index) => {
              const key = priceKey(row);
              const qty = priceQuoteQuantity(row);
              const subtotal = qty * Number(row.totalSale || 0);
              return `
                <article class="price-quote-row">
                  <div>
                    <strong>${index + 1}. ${escapeHtml(row.productName || "Sin nombre")}</strong>
                    <span>${escapeHtml(row.commercialCode || "s/d")} · ${escapeHtml(technicalSummaryFor(row))}</span>
                  </div>
                  <label>
                    <span>Cant.</span>
                    <input type="number" min="0" step="1" value="${qty}" data-quote-qty="${escapeHtml(key)}" />
                  </label>
                  <div class="quote-price"><span>Lista c/IGV</span><strong>${money(row.totalSale)}</strong></div>
                  <div class="quote-price"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
                </article>`;
            })
            .join("")}
        </div>
        <div class="price-quote-total">
          <span>Total referencial</span>
          <strong>${money(total)}</strong>
        </div>
        <textarea class="price-message-preview quote-preview" readonly>${escapeHtml(message)}</textarea>
        <div class="modal-actions">
          <button class="ghost-btn" id="refreshPriceQuote">Actualizar cantidades</button>
          <button class="ghost-btn" id="downloadPriceQuotePdf">Descargar PDF</button>
          <button class="ghost-btn whatsapp" id="sharePriceQuotePdf">Enviar PDF</button>
          <a class="ghost-btn action-link whatsapp" href="${href}">Enviar texto</a>
        </div>
      </section>
    </div>`
  );
  $("#closePriceQuote").addEventListener("click", closePriceQuoteModal);
  $("#priceQuoteModal").addEventListener("click", (event) => {
    if (event.target.id === "priceQuoteModal") closePriceQuoteModal();
  });
  bindPriceQuoteCustomerFields(rows);
  $$("#priceQuoteModal [data-quote-qty]").forEach((input) => {
    input.addEventListener("input", () => {
      state.priceQuoteQuantities.set(input.dataset.quoteQty, Math.max(0, Number(input.value || 0)));
    });
  });
  $("#refreshPriceQuote").addEventListener("click", () => renderPriceQuoteModal(rows));
  $("#downloadPriceQuotePdf").addEventListener("click", () => downloadPriceQuotePdf(rows));
  $("#sharePriceQuotePdf").addEventListener("click", () => sharePriceQuotePdf(rows));
}

function closePriceQuoteModal() {
  $("#priceQuoteModal")?.remove();
}

function priceQuoteCustomerForm() {
  const customer = state.priceQuoteCustomer;
  return `
    <div class="price-quote-customer">
      <datalist id="quoteClientOptions">
        ${quoteClientOptions().map((client) => `<option value="${escapeHtml(quoteClientLabel(client))}"></option>`).join("")}
      </datalist>
      <datalist id="quoteSellerOptions">
        ${quoteSellerOptions().map((seller) => `<option value="${escapeHtml(seller)}"></option>`).join("")}
      </datalist>
      <label class="wide"><span>Buscar cliente</span><input id="quoteClientSearch" list="quoteClientOptions" value="${escapeHtml(customer.search)}" placeholder="RUC o razon social" /></label>
      <label><span>R.U.C.</span><input id="quoteCustomerRuc" value="${escapeHtml(customer.ruc)}" placeholder="Por confirmar" /></label>
      <label><span>Razon social</span><input id="quoteCustomerBusiness" value="${escapeHtml(customer.businessName)}" placeholder="Por confirmar" /></label>
      <label class="wide"><span>Direccion</span><input id="quoteCustomerAddress" value="${escapeHtml(customer.address)}" placeholder="Por confirmar" /></label>
      <label><span>Atencion</span><input id="quoteCustomerAttention" value="${escapeHtml(customer.attention)}" placeholder="Por confirmar" /></label>
      <label><span>Vendedor</span><input id="quoteCustomerSeller" list="quoteSellerOptions" value="${escapeHtml(customer.seller)}" placeholder="Por confirmar" /></label>
    </div>`;
}

function quoteClientOptions() {
  return [...(data.clients || [])]
    .sort((a, b) => (b.total || 0) - (a.total || 0))
    .slice(0, 350);
}

function quoteClientLabel(client) {
  return `${client.doc || ""} - ${client.name || ""}`.trim();
}

function quoteSellerOptions() {
  return [...new Set([...(data.sellers || []).map((seller) => seller.name), ...(data.clients || []).map((client) => client.seller)].filter(Boolean))].sort();
}

function bindPriceQuoteCustomerFields(rows) {
  const customer = state.priceQuoteCustomer;
  const fieldMap = {
    quoteCustomerRuc: "ruc",
    quoteCustomerBusiness: "businessName",
    quoteCustomerAddress: "address",
    quoteCustomerAttention: "attention",
    quoteCustomerSeller: "seller",
  };
  Object.entries(fieldMap).forEach(([id, key]) => {
    $(`#${id}`)?.addEventListener("input", (event) => {
      customer[key] = event.target.value;
    });
  });
  $("#quoteClientSearch")?.addEventListener("change", (event) => {
    customer.search = event.target.value;
    const found = findQuoteClient(event.target.value);
    if (found) {
      fillPriceQuoteCustomer(found);
      renderPriceQuoteModal(rows);
    }
  });
  $("#quoteClientSearch")?.addEventListener("input", (event) => {
    customer.search = event.target.value;
  });
}

function findQuoteClient(value) {
  const term = normalizeTechnicalText(value);
  if (!term) return null;
  return (data.clients || []).find((client) => {
    const label = normalizeTechnicalText(quoteClientLabel(client));
    return label === term || label.includes(term) || term.includes(normalizeTechnicalText(client.doc || ""));
  });
}

function fillPriceQuoteCustomer(client) {
  const contact = client.contact || {};
  state.priceQuoteCustomer = {
    search: quoteClientLabel(client),
    ruc: client.doc || "",
    businessName: client.name || contact.contact || "",
    address: contact.address || "",
    attention: contact.contact || client.name || "",
    seller: client.seller || contact.seller || "",
  };
}

function quoteCustomerValue(key, fallback = "Por confirmar") {
  return state.priceQuoteCustomer?.[key]?.trim() || fallback;
}

function priceQuoteQuantity(row) {
  const qty = Number(state.priceQuoteQuantities.get(priceKey(row)) ?? 1);
  return Number.isFinite(qty) && qty >= 0 ? qty : 1;
}

function priceQuotePdfName() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `pre-cotizacion-isaval-${stamp}.pdf`;
}

function downloadPriceQuotePdf(rows) {
  const blob = buildPriceQuotePdf(rows);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = priceQuotePdfName();
  a.click();
  URL.revokeObjectURL(url);
}

async function sharePriceQuotePdf(rows) {
  const blob = buildPriceQuotePdf(rows);
  const fileName = priceQuotePdfName();
  const file = new File([blob], fileName, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({
      title: "Pre cotizacion ISAVAL",
      text: "Pre cotizacion referencial a precio de lista.",
      files: [file],
    });
    return;
  }
  downloadPriceQuotePdf(rows);
  alert("Tu navegador no permite adjuntar el PDF directamente a WhatsApp. Se descargo el PDF para que puedas enviarlo.");
}

function buildPriceQuotePdf(rows) {
  const pages = priceQuotePdfPages(rows);
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = [];
  pages.forEach((content) => {
    const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function priceQuotePdfPages(rows) {
  return [priceQuotePdfMainPage(rows)];
}

function priceQuotePdfMainPage(rows) {
  const today = new Date().toLocaleDateString("es-PE");
  const quoteNo = `PRE-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const total = rows.reduce((sum, row) => sum + priceQuoteQuantity(row) * Number(row.totalSale || 0), 0);
  const taxable = total / 1.18;
  const igv = total - taxable;
  const ops = [];
  ops.push("0.05 0.16 0.42 rg");
  ops.push(pdfTextAt(28, 800, "isaval", 28, "F2"));
  ops.push("0.35 0.35 0.35 rg");
  ops.push(pdfTextAt(31, 786, "GLOBAL", 8, "F1"));
  ops.push("0.05 0.16 0.42 rg 390 785 160 22 re f");
  ops.push("1 1 1 rg");
  ops.push(pdfTextAt(430, 793, "PRECOTIZACION", 9, "F2"));
  ops.push("0 0 0 rg");
  ops.push(pdfTextAt(410, 772, `NRO: ${quoteNo}`, 8, "F1"));
  ops.push(pdfTextAt(410, 756, `Fecha emision: ${today}`, 8, "F1"));
  ops.push(pdfTextAt(28, 765, "PINTURAS ISAVAL PERU S.A.C.", 8, "F2"));
  ops.push(pdfTextAt(28, 752, "Oficina principal: Av. Javier Prado Este 1148 - La Victoria - Lima", 7, "F1"));
  ops.push(pdfTextAt(28, 740, "Pre cotizacion referencial generada desde lista de precios local.", 7, "F1"));

  ops.push("0 0 0 RG 0.8 w 28 676 522 50 re S");
  ops.push(pdfTextAt(42, 712, "Cliente", 8, "F2"));
  ops.push(pdfTextAt(42, 694, "R.U.C.:", 7, "F2"));
  ops.push(pdfTextAt(98, 694, quoteCustomerValue("ruc"), 7, "F1"));
  ops.push(pdfTextAt(42, 680, "Direccion:", 7, "F2"));
  ops.push(pdfTextAt(98, 680, quoteCustomerValue("address").slice(0, 42), 7, "F1"));
  ops.push(pdfTextAt(318, 694, "Razon Social:", 7, "F2"));
  ops.push(pdfTextAt(390, 694, quoteCustomerValue("businessName").slice(0, 28), 7, "F1"));
  ops.push(pdfTextAt(318, 680, "Atencion:", 7, "F2"));
  ops.push(pdfTextAt(390, 680, quoteCustomerValue("attention").slice(0, 28), 7, "F1"));

  const tableTop = 645;
  ops.push("0 0 0 RG 0.8 w 28 628 522 17 re S");
  ops.push(pdfTextAt(36, 634, "Item", 7, "F2"));
  ops.push(pdfTextAt(76, 634, "Descripcion", 7, "F2"));
  ops.push(pdfTextAt(338, 634, "Und", 7, "F2"));
  ops.push(pdfTextAt(374, 634, "Cant", 7, "F2"));
  ops.push(pdfTextAt(420, 634, "P. Unitario", 7, "F2"));
  ops.push(pdfTextAt(498, 634, "Sub Total", 7, "F2"));
  let y = 610;
  rows.forEach((row, index) => {
    const qty = priceQuoteQuantity(row);
    const unit = Number(row.totalSale || 0);
    const subtotal = qty * unit;
    if (y < 330) return;
    ops.push(pdfTextAt(38, y, String(index + 1), 7, "F1"));
    ops.push(pdfTextAt(76, y, pdfText(`${row.commercialCode || "s/d"} - ${row.productName || "Sin nombre"}`).slice(0, 58), 7, "F1"));
    ops.push(pdfTextAt(340, y, "UND", 7, "F1"));
    ops.push(pdfTextAt(376, y, number(qty), 7, "F1"));
    ops.push(pdfTextAt(422, y, money(unit), 7, "F1"));
    ops.push(pdfTextAt(500, y, money(subtotal), 7, "F1"));
    y -= 18;
  });
  ops.push("0.93 0.93 0.93 rg");
  ops.push(pdfTextAt(196, 410, "ISAVAL", 44, "F2"));
  ops.push(pdfTextAt(210, 374, "GLOBAL", 32, "F1"));
  ops.push("0 0 0 rg");

  ops.push("0 0 0 RG 0.8 w 28 190 522 58 re S");
  ops.push(pdfTextAt(330, 230, "VALOR VENTA", 7, "F2"));
  ops.push(pdfTextAt(500, 230, money(taxable), 7, "F1"));
  ops.push(pdfTextAt(330, 214, "IGV 18%", 7, "F2"));
  ops.push(pdfTextAt(500, 214, money(igv), 7, "F1"));
  ops.push(pdfTextAt(330, 198, "IMPORTE TOTAL", 7, "F2"));
  ops.push(pdfTextAt(500, 198, money(total), 7, "F2"));

  ops.push(pdfTextAt(28, 160, "CONDICIONES COMERCIALES", 7, "F2"));
  ops.push(pdfTextAt(28, 146, "Forma de pago: CONTADO", 7, "F1"));
  ops.push(pdfTextAt(28, 132, `Vendedor: ${quoteCustomerValue("seller")}`, 7, "F1"));
  ops.push(pdfTextAt(28, 118, "Validez de la oferta: 7 dias salvo variacion de lista.", 7, "F1"));
  ops.push(pdfTextAt(28, 104, "Observacion: Pre cotizacion referencial. Confirmar stock antes de emitir pedido.", 7, "F1"));

  ops.push("0.05 0.16 0.42 rg 28 82 180 14 re f");
  ops.push("1 1 1 rg");
  ops.push(pdfTextAt(36, 87, "DETALLE TECNICO RESUMIDO", 7, "F2"));
  ops.push("0 0 0 rg");
  const technicalLines = rows
    .flatMap((row, index) => wrapPdfLine(`${index + 1}. ${row.productName || "Sin nombre"}: ${technicalSummaryFor(row)}`, 92))
    .slice(0, 5);
  let techY = 66;
  technicalLines.forEach((line) => {
    ops.push(pdfTextAt(28, techY, line, 6.5, "F1"));
    techY -= 10;
  });
  if (rows.length > 3) {
    ops.push(pdfTextAt(28, 16, "Detalle tecnico completo disponible en fichas tecnicas del producto.", 6.5, "F1"));
  }
  return ops.join("\n");
}

function priceQuotePdfTechnicalPages(rows) {
  const lines = ["DETALLE TECNICO", ""];
  rows.forEach((row, index) => {
    lines.push(`${index + 1}. ${row.productName || "Sin nombre"}`);
    lines.push(`Codigo comercial: ${row.commercialCode || "s/d"}`);
    lines.push(technicalSummaryFor(row));
    lines.push("");
  });
  const wrapped = lines.flatMap((line) => wrapPdfLine(line, 86));
  const pages = [];
  for (let index = 0; index < wrapped.length; index += 48) {
    const pageLines = wrapped.slice(index, index + 48);
    const ops = [];
    ops.push("0.05 0.16 0.42 rg");
    ops.push(pdfTextAt(28, 800, "isaval", 24, "F2"));
    ops.push("0.05 0.16 0.42 rg 300 790 250 20 re f");
    ops.push("1 1 1 rg");
    ops.push(pdfTextAt(383, 797, "DETALLE TECNICO", 9, "F2"));
    ops.push("0 0 0 rg");
    let y = 760;
    pageLines.forEach((line) => {
      ops.push(pdfTextAt(42, y, line, line === "DETALLE TECNICO" ? 12 : 8, line === "DETALLE TECNICO" ? "F2" : "F1"));
      y -= 14;
    });
    pages.push(ops.join("\n"));
  }
  return pages;
}

function pdfTextAt(x, y, text, size = 8, font = "F1") {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET`;
}

function wrapPdfLine(line, maxChars) {
  const text = pdfText(line);
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function pdfText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfEscape(value) {
  return pdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function exportSelectedPrices(rows) {
  if (!rows.length) return;
  const header = ["Codigo comercial", "Nombre producto", "Valor venta", "IGV", "Total"];
  const body = rows.map((row) => [
    row.commercialCode || "",
    row.productName || "",
    row.valueSale || 0,
    row.igv || 0,
    row.totalSale || 0,
  ]);
  const csv = [header, ...body].map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lista-precios-seleccion.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function priceWhatsappMessage(rows) {
  if (!rows.length) return "";
  return [
    "Estimado cliente, el precio de lista es:",
    ...rows.map(
      (row, index) =>
        `${index + 1}. Codigo comercial: ${row.commercialCode || "s/d"}\nProducto: ${row.productName || "Sin nombre"}\nValor venta: ${money(row.valueSale)} + IGV\nTotal lista: ${money(row.totalSale)}\nInfo tecnica: ${technicalSummaryFor(row)}`
    ),
  ].join("\n\n");
}

function priceQuoteMessage(rows) {
  const lines = rows.map((row, index) => {
    const qty = priceQuoteQuantity(row);
    const unit = Number(row.totalSale || 0);
    const subtotal = qty * unit;
    return `${index + 1}. ${row.productName || "Sin nombre"}\nCodigo: ${row.commercialCode || "s/d"}\nCantidad: ${number(qty)}\nPrecio lista unit. c/IGV: ${money(unit)}\nSubtotal: ${money(subtotal)}\nInfo tecnica: ${technicalSummaryFor(row)}`;
  });
  const total = rows.reduce((sum, row) => sum + priceQuoteQuantity(row) * Number(row.totalSale || 0), 0);
  return [
    "Pre cotizacion referencial a precio de lista",
    "Valores sujetos a confirmacion de stock, condiciones comerciales y validez.",
    ...lines,
    `Total referencial c/IGV: ${money(total)}`,
  ].join("\n\n");
}

function priceKey(row) {
  return `${row.productCode}|${row.priceList}|${row.valueSale}|${row.totalSale}`;
}

function technicalDescription(row) {
  const text = `${row.productName} ${row.priceList}`.toUpperCase();
  if (text.includes("EPOXI AUTONIVELANTE")) return "Revestimiento epoxidico pigmentado de altas prestaciones para pisos, con alta resistencia fisica/quimica y acabado autonivelante.";
  if (text.includes("EPOXI SELLADOR INCOLORO") && text.includes("100")) return "Imprimacion epoxi incolora 100% solidos, selladora y de alta penetracion para hormigon poroso.";
  if (text.includes("IMPREX HS")) return "Imprimacion epoxi de altos solidos para estructuras metalicas, con excelente adherencia y proteccion anticorrosiva.";
  if (text.includes("EPOXI")) return "Producto epoxico orientado a alta resistencia mecanica/quimica; validar ficha tecnica antes de especificar sistema.";
  if (text.includes("POLIURETANO")) return "Producto de poliuretano para acabados resistentes; revisar compatibilidad, rendimiento y tiempos de repintado.";
  if (text.includes("DISOLVENTE")) return "Diluyente o solvente para ajuste de viscosidad y limpieza segun sistema compatible.";
  if (text.includes("SELLADOR")) return "Sellador para regular absorcion o mejorar adherencia del sistema posterior.";
  return "Descripcion comercial referencial; confirmar usos, rendimiento y aplicacion con ficha tecnica del producto.";
}

function technicalSummaryFor(row) {
  const sheet = technicalSheetFor(row);
  return sheet?.description || technicalDescription(row);
}

function technicalDescriptionCell(row) {
  const sheet = technicalSheetFor(row);
  const description = technicalSummaryFor(row);
  const fallback = `<a href="${technicalSearchUrl(row)}" target="_blank" rel="noopener">Buscar ficha tecnica</a>`;
  const link = sheet
    ? `<a class="technical-sheet-link" href="${sheet.file}" target="_blank" rel="noopener">${escapeHtml(sheet.label)}</a>`
    : fallback;
  return `<div class="technical-description">${escapeHtml(description)}<br>${link}</div>`;
}

function technicalSheetFor(row) {
  const text = normalizeTechnicalText(`${row.productName || ""} ${row.priceList || ""} ${row.productCode || ""} ${row.commercialCode || ""}`);
  return technicalSheetCatalog.find((sheet) => sheet.terms.some((term) => text.includes(normalizeTechnicalText(term))));
}

function normalizeTechnicalText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function technicalSearchUrl(row) {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:isaval.es ficha tecnica ${row.productName}`)}`;
}

function stockByWarehouse(row, warehouse) {
  const found = (row.warehouseStock || []).find((item) => item.warehouse === warehouse);
  return found ? found.stock : 0;
}

function quoteRowsFiltered() {
  const quotes = data.quotes2026 || {};
  const productTerm = state.quoteProduct.toLowerCase().trim();
  const detailMatches = productTerm
    ? new Set(
        (quotes.detailRows || [])
          .filter((row) => `${row.product} ${row.product_base} ${row.product_code} ${row.family}`.toLowerCase().includes(productTerm))
          .map((row) => row.quote_no)
      )
    : null;
  return (quotes.quoteRows || []).filter((row) => {
    const clientTerm = state.quoteClient.toLowerCase().trim();
    const matchesSeller = state.quoteSeller === "all" || row.seller === state.quoteSeller;
    const matchesStatus = state.quoteStatus === "all" || row.status_bucket === state.quoteStatus;
    const matchesClient = !clientTerm || `${row.client} ${row.client_doc}`.toLowerCase().includes(clientTerm);
    const matchesProduct = !detailMatches || detailMatches.has(row.quote_no);
    const matchesFrom = !state.quoteDateFrom || row.dateText >= state.quoteDateFrom;
    const matchesTo = !state.quoteDateTo || row.dateText <= state.quoteDateTo;
    return matchesSeller && matchesStatus && matchesClient && matchesProduct && matchesFrom && matchesTo;
  });
}

function quoteDetailFiltered() {
  const quoteNos = new Set(quoteRowsFiltered().map((row) => row.quote_no));
  const productTerm = state.quoteProduct.toLowerCase().trim();
  return ((data.quotes2026 || {}).detailRows || []).filter((row) => {
    const matchesQuote = quoteNos.has(row.quote_no);
    const matchesProduct = !productTerm || `${row.product} ${row.product_base} ${row.product_code} ${row.family}`.toLowerCase().includes(productTerm);
    return matchesQuote && matchesProduct;
  });
}

function renderQuotes() {
  const quotes = data.quotes2026;
  if (!quotes || !quotes.summary) {
    $("#quoteKpis").innerHTML = `<article class="kpi"><span>Cotizaciones</span><strong>Sin data</strong><small>No se encontro archivo de cotizaciones.</small></article>`;
    return;
  }
  const rows = quoteRowsFiltered();
  const details = quoteDetailFiltered();
  const total = rows.length;
  const closed = rows.filter((row) => row.status_bucket === "Cerrada").length;
  const expired = rows.filter((row) => row.status_bucket === "Expirada").length;
  const pending = rows.filter((row) => row.status_bucket === "Pendiente").length;
  const totalAmount = sumBy(rows, "amount");
  const closedAmount = sumBy(rows.filter((row) => row.status_bucket === "Cerrada"), "amount");
  const closeRate = total ? closed / total : 0;
  $("#quoteKpis").innerHTML = [
    ["Cotizaciones emitidas", number(total), `${money(totalAmount)} cotizados`],
    ["Cerradas / ganadas", number(closed), `${money(closedAmount)} cerrados`],
    ["Tasa de cierre", `${(closeRate * 100).toFixed(1)}%`, `${number(expired)} expiradas · ${number(pending)} abiertas`],
    ["Ticket promedio", money(total ? totalAmount / total : 0), "Importe neto sin IGV"],
    ["Productos cotizados", number(new Set(details.map((row) => row.product_base)).size), `${number(details.length)} lineas filtradas`],
  ]
    .map(([label, value, sub]) => `<article class="kpi"><span>${label}</span><strong>${value}</strong><small>${sub}</small></article>`)
    .join("");

  renderQuoteSellerTable(rows);
  renderQuoteStatusChart(rows);
  renderQuoteRankings(rows, details);
  renderQuoteRiskTables(rows, details);
  renderQuoteComments(rows, details);
}

function renderQuoteSellerTable(rows) {
  const grouped = groupRows(rows, (row) => row.seller).map(([seller, items]) => {
    const closedRows = items.filter((row) => row.status_bucket === "Cerrada");
    return {
      seller,
      quoted: items.length,
      closed: closedRows.length,
      closeRate: items.length ? closedRows.length / items.length : 0,
      expired: items.filter((row) => row.status_bucket === "Expirada").length,
      pending: items.filter((row) => row.status_bucket === "Pendiente").length,
      quotedAmount: sumBy(items, "amount"),
      closedAmount: sumBy(closedRows, "amount"),
      avgTicket: items.length ? sumBy(items, "amount") / items.length : 0,
    };
  }).sort((a, b) => b.closedAmount - a.closedAmount || b.closeRate - a.closeRate || b.quoted - a.quoted);
  $("#quoteSellerTable").innerHTML = quoteTable(
    ["Comercial", "Emitidas", "Cerradas", "Tasa", "Exp.", "Abiertas", "Monto cot.", "Monto cerrado"],
    grouped.map((row) => [
      escapeHtml(row.seller),
      number(row.quoted),
      number(row.closed),
      `${(row.closeRate * 100).toFixed(1)}%`,
      number(row.expired),
      number(row.pending),
      money(row.quotedAmount),
      `${money(row.closedAmount)}<br><span>Ticket ${money(row.avgTicket)}</span>`,
    ])
  );
}

function renderQuoteStatusChart(rows) {
  const statuses = ["Cerrada", "Expirada", "Pendiente"];
  const max = Math.max(...statuses.map((status) => rows.filter((row) => row.status_bucket === status).length), 1);
  $("#quoteStatusChart").innerHTML = statuses
    .map((status) => {
      const items = rows.filter((row) => row.status_bucket === status);
      return `<div class="quote-bar-row">
        <strong>${status}</strong>
        <div class="quote-bar-track"><i style="width:${(items.length / max) * 100}%"></i></div>
        <span>${number(items.length)}</span>
        <em title="${money(sumBy(items, "amount"))}">${compactMoney(sumBy(items, "amount"))}</em>
      </div>`;
    })
    .join("");
}

function renderQuoteRankings(rows, details) {
  const productCount = aggregateQuoteDetails(details).sort((a, b) => b.quotes - a.quotes || b.amount - a.amount);
  const productAmount = aggregateQuoteDetails(details).sort((a, b) => b.amount - a.amount);
  const productClosed = aggregateQuoteDetails(details.filter((row) => row.status_bucket === "Cerrada")).sort((a, b) => b.amount - a.amount || b.quotes - a.quotes);
  const clientCount = aggregateQuoteRows(rows, (row) => `${row.client_doc}|${row.client}`).sort((a, b) => b.quotes - a.quotes || b.amount - a.amount);
  const clientAmount = aggregateQuoteRows(rows, (row) => `${row.client_doc}|${row.client}`).sort((a, b) => b.amount - a.amount);
  renderQuoteRanking("#quoteProductsCount", productCount, "quotes");
  renderQuoteRanking("#quoteProductsAmount", productAmount, "amount");
  renderQuoteRanking("#quoteProductsClosed", productClosed, "closed");
  renderQuoteRanking("#quoteClientsCount", clientCount, "quotes");
  renderQuoteRanking("#quoteClientsAmount", clientAmount, "amount");
}

function renderQuoteRanking(selector, rows, mode) {
  $(selector).innerHTML = rows.slice(0, 20).map((row, index) => `
    <article class="quote-rank-row">
      <b>${index + 1}</b>
      <div><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.meta || "")} · ${number(row.quotes)} cot.</span></div>
      <em>${mode === "quotes" ? number(row.quotes) : money(row.amount)}</em>
    </article>`).join("") || `<p class="muted empty-note">Sin resultados con los filtros actuales.</p>`;
}

function renderQuoteRiskTables(rows, details) {
  const repeated = aggregateRepeated(details).filter((row) => row.quotes > 1).sort((a, b) => b.quotes - a.quotes || b.amount - a.amount).slice(0, 25);
  const expired = rows.filter((row) => row.status_bucket === "Expirada").sort((a, b) => b.amount - a.amount).slice(0, 25);
  const threshold = data.quotes2026?.summary?.highOpenThreshold || 0;
  const highOpen = rows.filter((row) => row.status_bucket !== "Cerrada" && row.amount >= threshold).sort((a, b) => b.amount - a.amount).slice(0, 25);
  $("#quoteRepeated").innerHTML = quoteTable(
    ["Cliente", "Producto", "Cot.", "Monto", "Cerr."],
    repeated.map((row) => [escapeHtml(row.client), escapeHtml(row.product), number(row.quotes), money(row.amount), number(row.closed)])
  );
  $("#quoteExpired").innerHTML = quoteTable(
    ["Cotizacion", "Comercial", "Cliente", "Fec.", "Monto"],
    expired.map((row) => [escapeHtml(row.quote_no), escapeHtml(row.seller), escapeHtml(row.client), row.dateText, money(row.amount)])
  );
  $("#quoteHighOpen").innerHTML = quoteTable(
    ["Cotizacion", "Estado", "Cliente", "Comercial", "Monto"],
    highOpen.map((row) => [escapeHtml(row.quote_no), escapeHtml(row.status), escapeHtml(row.client), escapeHtml(row.seller), money(row.amount)])
  );
}

function renderQuoteComments(rows, details) {
  const total = rows.length;
  const closed = rows.filter((row) => row.status_bucket === "Cerrada").length;
  const expired = rows.filter((row) => row.status_bucket === "Expirada").length;
  const highOpenAmount = sumBy(rows.filter((row) => row.status_bucket !== "Cerrada" && row.amount >= (data.quotes2026.summary.highOpenThreshold || 0)), "amount");
  const topSeller = groupRows(rows, (row) => row.seller)
    .map(([seller, items]) => ({ seller, closedAmount: sumBy(items.filter((row) => row.status_bucket === "Cerrada"), "amount") }))
    .sort((a, b) => b.closedAmount - a.closedAmount)[0];
  const topProduct = aggregateQuoteDetails(details).sort((a, b) => b.amount - a.amount)[0];
  $("#quoteComments").innerHTML = `
    <p>${escapeHtml(data.quotes2026.summary.conclusion)}</p>
    <ul>
      <li>Con los filtros actuales, la tasa de cierre es <strong>${total ? ((closed / total) * 100).toFixed(1) : "0.0"}%</strong>.</li>
      <li>Hay <strong>${number(expired)}</strong> cotizaciones vencidas sin cierre en el universo filtrado.</li>
      <li>Las oportunidades abiertas de alto monto suman <strong>${money(highOpenAmount)}</strong>.</li>
      <li>${topSeller ? `Comercial con mayor monto cerrado filtrado: <strong>${escapeHtml(topSeller.seller)}</strong> (${money(topSeller.closedAmount)}).` : "Sin comercial destacado con los filtros actuales."}</li>
      <li>${topProduct ? `Producto con mayor monto cotizado filtrado: <strong>${escapeHtml(topProduct.name)}</strong> (${money(topProduct.amount)}).` : "Sin producto destacado con los filtros actuales."}</li>
    </ul>`;
}

function aggregateQuoteDetails(details) {
  return groupRows(details, (row) => `${row.product_base}|${row.family}`).map(([key, items]) => {
    const [name, family] = key.split("|");
    return {
      name,
      meta: family,
      quotes: new Set(items.map((row) => row.quote_no)).size,
      amount: sumBy(items, "amount"),
      closed: new Set(items.filter((row) => row.status_bucket === "Cerrada").map((row) => row.quote_no)).size,
    };
  });
}

function aggregateQuoteRows(rows, keyFn) {
  return groupRows(rows, keyFn).map(([key, items]) => {
    const [doc, name] = key.split("|");
    return {
      name: name || doc,
      meta: doc,
      quotes: items.length,
      amount: sumBy(items, "amount"),
      closed: items.filter((row) => row.status_bucket === "Cerrada").length,
    };
  });
}

function aggregateRepeated(details) {
  return groupRows(details, (row) => `${row.client_doc}|${row.client}|${row.product_base}`).map(([key, items]) => {
    const [doc, client, product] = key.split("|");
    return {
      doc,
      client,
      product,
      quotes: new Set(items.map((row) => row.quote_no)).size,
      amount: sumBy(items, "amount"),
      closed: new Set(items.filter((row) => row.status_bucket === "Cerrada").map((row) => row.quote_no)).size,
    };
  });
}

function quoteTable(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${
    rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")
  }</tbody></table>`;
}

function groupRows(rows, keyFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row) || "Sin dato";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return [...map.entries()];
}

function sumBy(rows, key) {
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
}

function compactMoney(value) {
  const abs = Math.abs(Number(value || 0));
  if (abs >= 1000000) return `S/ ${(value / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `S/ ${(value / 1000).toFixed(0)}K`;
  return money(value);
}

function exportCsv() {
  const rows = actionClients().map((c) => [
    c.name,
    c.doc,
    c.seller,
    c.stage,
    c.action,
    c.last4,
    c.recoveryValue,
    c.lastPurchase,
    getClientState(c.id).done ? "Hecha" : "Abierta",
    getClientState(c.id).note || "",
  ]);
  const header = ["Cliente", "Doc", "Vendedor", "Accion", "Sugerencia", "Venta 12M", "Recuperable", "Ultima compra", "Estado", "Nota"];
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "isaval-cola-accion-comercial.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

initAuth();
initControls();
renderOverview();
