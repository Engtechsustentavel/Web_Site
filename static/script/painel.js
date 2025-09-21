/* =========================================================
   SUTRAM - PAINEL
   - Meses em ordem (JAN→DEZ), preenchendo ausentes com 0
   - Barras horizontais nos 3 gráficos da linha 1 quando tipo = Barra
   - Linha 2 com selects de tipo:
       * Funil: Funil de atendimento | Barras horizontais | Pizza
       * Colunas: Colunas (vertical) | Barras horizontais | Linha | Pizza
       * Venn: Venn (3 conjuntos) | Barras (interseções) | Pizza (interseções)
   - Venn 3-sets configurável: A = Top Zona; B e C = Status escolhidos (qualquer um)
     * Se B == C, vira Venn de 2-sets (A e B)
   ========================================================= */

let RAW = [];
let charts = {};

const MESES_ORDENADOS = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];

/* ---------- Utils ---------- */
function preencheSelect(id, arr, includeTodos = false) {
  const s = document.getElementById(id);
  if (!s) return;
  const val = s.value;
  s.innerHTML =
    (includeTodos ? '<option value="">Todos</option>' : "") +
    arr.map((v) => `<option>${v}</option>`).join("");
  if ([...s.options].some((o) => o.value === val)) s.value = val;
}
function contagem(arr, campo) {
  const m = {};
  arr.forEach((r) => {
    const k = (r[campo] || "—").toString();
    m[k] = (m[k] || 0) + 1;
  });
  if (campo === "mes") {
    const labels = MESES_ORDENADOS.slice();
    const values = labels.map((mes) => m[mes] || 0);
    return { labels, values };
  }
  const labels = Object.keys(m).sort();
  return { labels, values: labels.map((k) => m[k]) };
}
function tipo(id) {
  const v = (document.getElementById(id)?.value || "Barra").toLowerCase();
  return v === "pizza" ? "pie" : v === "linha" ? "line" : "bar";
}
function makePalette(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const h = Math.round((360 / Math.max(1, n)) * i);
    arr.push(`hsl(${h} 60% 65%)`);
  }
  return arr;
}
function darken(hsl) {
  return hsl.replace(/(\d+)%\)$/, (_, l) => Math.max(0, +l - 20) + "%)");
}

/* ---------- Dados ---------- */
async function carregarDados() {
  try {
    const r = await fetch("/dados.json", { cache: "no-store" });
    if (!r.ok) throw new Error("sem /dados.json");
    const j = await r.json();
    RAW = j.data || [];
  } catch {
    RAW = [
      { zona: "CENTRAL", mes: "JANEIRO", status: "CONCLUÍDO", quantidade: 42 },
      { zona: "NORTE", mes: "FEVEREIRO", status: "CONCLUÍDO", quantidade: 12 },
      { zona: "OESTE", mes: "MARÇO", status: "EM ANÁLISE", quantidade: 5 },
      { zona: "SUL", mes: "ABRIL", status: "PENDENTE", quantidade: 33 },
      { zona: "SUL", mes: "MAIO", status: "CONCLUÍDO", quantidade: 28 },
      { zona: "CENTRAL", mes: "JUNHO", status: "EM ANÁLISE", quantidade: 16 },
      { zona: "CENTRAL", mes: "JULHO", status: "PENDENTE", quantidade: 11 },
      { zona: "CENTRAL", mes: "AGOSTO", status: "CONCLUÍDO", quantidade: 7 },
    ];
  }
  popularFiltros();
  aplicar();
}

function popularFiltros() {
  const zonas = [...new Set(RAW.map((r) => r.zona).filter(Boolean))].sort();
  const meses = MESES_ORDENADOS.filter((m) => RAW.some((r) => r.mes === m));
  const status = [...new Set(RAW.map((r) => r.status).filter(Boolean))].sort();

  preencheSelect("f_zona", zonas, true);
  preencheSelect("f_mes", meses, true);
  preencheSelect("f_status", status, true);

  // Preenche selects do Venn (B e C) — sem "Todos"
  preencheSelect("venn_status_b", status, false);
  preencheSelect("venn_status_c", status, false);

  // Defaults amigáveis (se existirem)
  const sB = document.getElementById("venn_status_b");
  const sC = document.getElementById("venn_status_c");
  if (sB && [...sB.options].some((o) => o.value === "CONCLUÍDO"))
    sB.value = "CONCLUÍDO";
  if (sC && [...sC.options].some((o) => o.value === "EM ANÁLISE"))
    sC.value = "EM ANÁLISE";
}

/* ---------- KPIs + Gráficos ---------- */
function aplicar() {
  const fz = document.getElementById("f_zona")?.value || "";
  const fm = document.getElementById("f_mes")?.value || "";
  const fs = document.getElementById("f_status")?.value || "";

  const dados = RAW.filter(
    (r) =>
      (!fz || r.zona === fz) &&
      (!fm || r.mes === fm) &&
      (!fs || r.status === fs)
  );

  // KPIs
  const total = dados.length;
  const qtd = dados.reduce((s, r) => s + (+r.quantidade || 0), 0);
  document.getElementById("kpi_total").textContent = total;
  document.getElementById("kpi_qtd").textContent = qtd;
  document.getElementById("kpi_media").textContent = total
    ? (qtd / total).toFixed(2)
    : 0;
  document.getElementById("kpi_trend").textContent = "0%";

  // Contagens
  const cZona = contagem(dados, "zona");
  const cMes = contagem(dados, "mes");
  const cStatus = contagem(dados, "status");

  // Linha 1
  desenharBasico(
    "chart_zona",
    cZona.labels,
    cZona.values,
    tipo("tipo_zona"),
    "Por Zona",
    true
  );
  desenharBasico(
    "chart_mes",
    cMes.labels,
    cMes.values,
    tipo("tipo_mes"),
    "Por Mês",
    true
  );
  desenharBasico(
    "chart_status",
    cStatus.labels,
    cStatus.values,
    tipo("tipo_status"),
    "Por Status",
    true
  );

  // Linha 2 (com selects de tipo)
  desenharFunilFlex(dados);
  desenharColunasFlex(dados);
  desenharVennFlex(dados);
}

function desenharBasico(id, labels, data, type, title, horizontalBars = false) {
  const cv = document.getElementById(id);
  if (!cv) return;
  charts[id]?.destroy?.();

  const safeLabels = labels.length ? labels : ["—"];
  const safeData = data.length ? data : [0];

  const palette = makePalette(safeData.length);
  const ds = { label: title, data: safeData };
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };

  if (type === "pie") {
    ds.backgroundColor = palette;
    ds.borderColor = palette.map(darken);
    ds.borderWidth = 1;
    charts[id] = new Chart(cv.getContext("2d"), {
      type,
      data: { labels: safeLabels, datasets: [ds] },
      options: commonOptions,
    });
    return;
  }
  if (type === "bar") {
    ds.backgroundColor = palette;
    ds.borderColor = palette.map(darken);
    ds.borderWidth = 1;
    charts[id] = new Chart(cv.getContext("2d"), {
      type,
      data: { labels: safeLabels, datasets: [ds] },
      options: {
        ...commonOptions,
        indexAxis: horizontalBars ? "y" : "x",
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { grid: { display: false } },
        },
      },
    });
    return;
  }
  // line
  ds.fill = false;
  ds.tension = 0.3;
  ds.pointRadius = 4;
  ds.pointHoverRadius = 5;
  ds.pointBackgroundColor = palette;
  ds.pointBorderColor = palette.map(darken);
  ds.segment = {
    borderColor: (ctx) => palette[ctx.p0DataIndex] || "#888",
    borderWidth: () => 2,
  };
  charts[id] = new Chart(cv.getContext("2d"), {
    type,
    data: { labels: safeLabels, datasets: [ds] },
    options: {
      ...commonOptions,
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

/* ---------- Linha 2: Funil flex ---------- */
function getModoFunil() {
  const txt = (
    document.getElementById("tipo_funil")?.value || ""
  ).toLowerCase();
  if (txt.includes("funil")) return "funil";
  if (txt.includes("pizza")) return "pizza";
  return "barra"; // Barras horizontais
}
function funilSerie(dados) {
  return [
    { etapa: "Solicitações", valor: dados.length || 40 },
    {
      etapa: "Triadas",
      valor: Math.max(0, Math.round(dados.length * 0.75)) || 30,
    },
    {
      etapa: "Em Execução",
      valor: Math.max(0, Math.round(dados.length * 0.45)) || 18,
    },
    {
      etapa: "Concluídas",
      valor: Math.max(0, Math.round(dados.length * 0.3)) || 12,
    },
  ];
}
function desenharFunilFlex(dados) {
  const el = document.getElementById("chart_funil");
  if (!el) return;
  charts.chart_funil?.destroy?.();

  const modo = getModoFunil();
  const serie = funilSerie(dados);
  const labels = serie.map((d) => d.etapa);
  const values = serie.map((d) => d.valor);
  const palette = makePalette(values.length);

  if (modo === "funil") {
    charts.chart_funil = new Chart(el, {
      type: "funnel",
      data: { labels, datasets: [{ data: values, backgroundColor: palette }] },
      options: {
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Funil de Atendimento" },
        },
        layout: { padding: 8 },
      },
    });
  } else if (modo === "pizza") {
    charts.chart_funil = new Chart(el, {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: palette,
            borderColor: palette.map(darken),
            borderWidth: 1,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Funil (Pizza)" },
        },
      },
    });
  } else {
    // barra horizontal
    charts.chart_funil = new Chart(el, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: values,
            label: "Etapas",
            backgroundColor: palette,
            borderColor: palette.map(darken),
            borderWidth: 1,
          },
        ],
      },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Funil (Barras horizontais)" },
        },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { grid: { display: false } },
        },
      },
    });
  }
}

/* ---------- Linha 2: Colunas flex ---------- */
function getModoColunas() {
  const txt = (
    document.getElementById("tipo_colunas")?.value || ""
  ).toLowerCase();
  if (txt.includes("pizza")) return "pizza";
  if (txt.includes("linha")) return "linha";
  if (txt.includes("horizontal")) return "barra-h";
  return "barra-v"; // Colunas (vertical)
}
function desenharColunasFlex(dados) {
  const el = document.getElementById("chart_colunas");
  if (!el) return;
  charts.chart_colunas?.destroy?.();

  const modo = getModoColunas();
  const cz = contagem(dados, "zona");
  const palette = makePalette(cz.values.length);

  if (modo === "pizza") {
    charts.chart_colunas = new Chart(el, {
      type: "pie",
      data: {
        labels: cz.labels,
        datasets: [
          {
            data: cz.values,
            backgroundColor: palette,
            borderColor: palette.map(darken),
            borderWidth: 1,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Distribuição por Zona (Pizza)" },
        },
      },
    });
  } else if (modo === "linha") {
    charts.chart_colunas = new Chart(el, {
      type: "line",
      data: {
        labels: cz.labels,
        datasets: [
          {
            data: cz.values,
            label: "Quantidade",
            fill: false,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: palette,
            pointBorderColor: palette.map(darken),
            segment: {
              borderColor: (ctx) => palette[ctx.p0DataIndex] || "#888",
              borderWidth: 2,
            },
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Distribuição por Zona (Linha)" },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  } else if (modo === "barra-h") {
    charts.chart_colunas = new Chart(el, {
      type: "bar",
      data: {
        labels: cz.labels,
        datasets: [
          {
            data: cz.values,
            label: "Quantidade",
            backgroundColor: palette,
            borderColor: palette.map(darken),
            borderWidth: 1,
          },
        ],
      },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: "Distribuição por Zona (Barras horizontais)",
          },
        },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { grid: { display: false } },
        },
      },
    });
  } else {
    // barra vertical
    charts.chart_colunas = new Chart(el, {
      type: "bar",
      data: {
        labels: cz.labels,
        datasets: [
          {
            data: cz.values,
            label: "Quantidade",
            backgroundColor: palette,
            borderColor: palette.map(darken),
            borderWidth: 1,
          },
        ],
      },
      options: {
        indexAxis: "x",
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Diagrama de Colunas (Vertical)" },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
        maintainAspectRatio: false,
      },
    });
  }
}

/* ---------- Linha 2: Venn flex (3-sets configurável) ---------- */
function getModoVenn() {
  const txt = (document.getElementById("tipo_venn")?.value || "").toLowerCase();
  if (txt.includes("pizza")) return "pizza";
  if (txt.includes("barra")) return "barra";
  return "venn";
}
function calcularTopZona(dados) {
  const mapa = {};
  dados.forEach((r) => {
    const z = (r.zona || "—").toString();
    mapa[z] = (mapa[z] || 0) + 1;
  });
  let zonaTop = "—",
    max = 0;
  Object.keys(mapa).forEach((z) => {
    if (mapa[z] > max) {
      max = mapa[z];
      zonaTop = z;
    }
  });
  return { zonaTop, aCount: max };
}
function desenharVennFlex(dados) {
  const el = document.getElementById("chart_medidor");
  if (!el) return;
  charts.chart_medidor?.destroy?.();

  const modo = getModoVenn();

  // Status B e C escolhidos
  const sB = document.getElementById("venn_status_b")?.value || "";
  const sC = document.getElementById("venn_status_c")?.value || "";

  const { zonaTop, aCount } = calcularTopZona(dados);

  // Conjuntos B e C (podem ser iguais; se forem, vira Venn de 2 sets)
  const arrB = dados.filter(
    (r) => (r.status || "").toUpperCase() === sB.toUpperCase()
  );
  const arrC = dados.filter(
    (r) => (r.status || "").toUpperCase() === sC.toUpperCase()
  );

  const bCount = arrB.length;
  const cCount = arrC.length;

  const ab = arrB.filter((r) => (r.zona || "—").toString() === zonaTop).length;
  const ac = arrC.filter((r) => (r.zona || "—").toString() === zonaTop).length;

  let vennData, labelsTitle;

  if (!sB) {
    // sem B definido: só mostra A (zona top)
    vennData = [{ sets: [zonaTop], value: aCount }];
    labelsTitle = [zonaTop];
  } else if (sB && (!sC || sB.toUpperCase() === sC.toUpperCase())) {
    // B == C ou C vazio => Venn 2-sets: A e B
    const bc = 0; // por status mutuamente exclusivo, B∩C não existe aqui
    const abOnly = ab; // A∩B
    vennData = [
      { sets: [zonaTop], value: aCount },
      { sets: [sB], value: bCount },
      { sets: [zonaTop, sB], value: abOnly },
    ];
    labelsTitle = [zonaTop, sB];
  } else {
    // Venn 3-sets: A, B, C
    const bc = 0; // em geral status são exclusivos; ajuste se não for o caso
    const abc = 0;
    vennData = [
      { sets: [zonaTop], value: aCount },
      { sets: [sB], value: bCount },
      { sets: [sC], value: cCount },
      { sets: [zonaTop, sB], value: ab },
      { sets: [zonaTop, sC], value: ac },
      { sets: [sB, sC], value: bc },
      { sets: [zonaTop, sB, sC], value: abc },
    ];
    labelsTitle = [zonaTop, sB, sC];
  }

  const palette = makePalette(vennData.length);

  if (modo === "venn") {
    charts.chart_medidor = new Chart(el, {
      type: "venn",
      data: {
        labels: labelsTitle,
        datasets: [
          {
            data: vennData,
            backgroundColor: vennData.map(
              (_, i) => palette[i % palette.length]
            ),
            borderColor: "rgba(0,0,0,.15)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: `Venn — Zona: ${zonaTop}${sB ? ` • B: ${sB}` : ""}${
              sC ? ` • C: ${sC}` : ""
            }`,
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const d = ctx.raw;
                const nome = Array.isArray(d.sets)
                  ? d.sets.join(" ∩ ")
                  : d.sets;
                return `${nome}: ${d.value}`;
              },
            },
          },
        },
      },
    });
  } else {
    // Alternativas: Barra ou Pizza com os valores (todos os sets/interseções construídos acima)
    const labels = vennData.map((v) =>
      Array.isArray(v.sets) ? v.sets.join(" ∩ ") : v.sets
    );
    const values = vennData.map((v) => v.value);

    if (modo === "pizza") {
      charts.chart_medidor = new Chart(el, {
        type: "pie",
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: palette,
              borderColor: palette.map(darken),
              borderWidth: 1,
            },
          ],
        },
        options: {
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: "Venn (Pizza – conjuntos/interseções)",
            },
          },
        },
      });
    } else {
      // Barra horizontal
      charts.chart_medidor = new Chart(el, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              data: values,
              label: "Conjuntos e interseções",
              backgroundColor: palette,
              borderColor: palette.map(darken),
              borderWidth: 1,
            },
          ],
        },
        options: {
          indexAxis: "y",
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: "Venn (Barras – conjuntos/interseções)",
            },
          },
          scales: {
            x: { beginAtZero: true, ticks: { precision: 0 } },
            y: { grid: { display: false } },
          },
        },
      });
    }
  }
}

/* ---------- Listeners ---------- */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-aplicar")?.addEventListener("click", aplicar);
  document.getElementById("btn-limpar")?.addEventListener("click", () => {
    ["f_zona", "f_mes", "f_status"].forEach((id) => {
      const s = document.getElementById(id);
      if (s) s.value = "";
    });
    aplicar();
  });

  // Linha 1
  ["tipo_zona", "tipo_mes", "tipo_status"].forEach((id) =>
    document.getElementById(id)?.addEventListener("change", aplicar)
  );
  // Linha 2 – selects de tipo + selects do Venn (B e C)
  [
    "tipo_funil",
    "tipo_colunas",
    "tipo_venn",
    "venn_status_b",
    "venn_status_c",
  ].forEach((id) =>
    document.getElementById(id)?.addEventListener("change", aplicar)
  );

  carregarDados();
});
