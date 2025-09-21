function attachClickSound() {
  const btn = document.querySelector('button.btn[type="submit"]');
  const audio = document.getElementById("click-audio");
  if (btn && audio) {
    btn.addEventListener("click", () => {
      try {
        audio.currentTime = 0;
        audio.play();
      } catch (e) {}
    });
  }
}
document.addEventListener("DOMContentLoaded", attachClickSound);

// Painel - com fallback se Plotly não carregar
function initPainel() {
  if (typeof window.rowsData === "undefined") return;

  const selZona = document.getElementById("f_zona");
  const selMes = document.getElementById("f_mes");
  const selSta = document.getElementById("f_status");

  function filtered() {
    return window.rowsData.filter((r) => {
      return (
        (!selZona || !selZona.value || r.zona === selZona.value) &&
        (!selMes || !selMes.value || r.mes === selMes.value) &&
        (!selSta || !selSta.value || r.status === selSta.value)
      );
    });
  }
  function aggCounts(list, key) {
    const m = new Map();
    list.forEach((r) => {
      const k = r[key] || "N/I";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return { labels: [...m.keys()], values: [...m.values()] };
  }
  function sum(list, key) {
    return list.reduce((a, b) => a + (parseInt(b[key] || 0) || 0), 0);
  }

  function render() {
    const d = filtered();
    const total = d.length;
    const qtd = sum(d, "quantidade");
    document.getElementById("k_total").innerText = total;
    document.getElementById("k_qtd").innerText = qtd;
    document.getElementById("k_media").innerText = total
      ? (qtd / total).toFixed(1)
      : 0;
    document.getElementById("k_trend").innerText = "0%"; // cálculo simples

    draw(
      "por_zona",
      aggCounts(d, "zona"),
      document.getElementById("tipo_zona")?.value || "Barra"
    );
    draw(
      "por_mes",
      aggCounts(d, "mes"),
      document.getElementById("tipo_mes")?.value || "Barra"
    );
    draw(
      "por_status",
      aggCounts(d, "status"),
      document.getElementById("tipo_status")?.value || "Barra"
    );
  }

  function draw(id, data, tipo) {
    if (typeof Plotly !== "undefined") {
      if (tipo === "Pizza") {
        Plotly.newPlot(
          id,
          [{ labels: data.labels, values: data.values, type: "pie" }],
          {}
        );
      } else if (tipo === "Linha") {
        Plotly.newPlot(
          id,
          [{ x: data.labels, y: data.values, type: "scatter" }],
          {}
        );
      } else {
        Plotly.newPlot(
          id,
          [{ x: data.labels, y: data.values, type: "bar" }],
          {}
        );
      }
      return;
    }
    // Fallback canvas simples
    const box = document.getElementById(id);
    box.innerHTML = "";
    const c = document.createElement("canvas");
    c.width = 380;
    c.height = 240;
    box.appendChild(c);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#333";
    ctx.font = "12px sans-serif";
    const max = Math.max(1, ...data.values, 1);
    const pad = 30;
    const w = (c.width - 2 * pad) / Math.max(1, data.values.length);
    ctx.beginPath();
    ctx.moveTo(pad, c.height - pad);
    ctx.lineTo(c.width - pad, c.height - pad);
    ctx.stroke();
    for (let i = 0; i < data.values.length; i++) {
      const val = data.values[i];
      const h = (val / max) * (c.height - 2 * pad);
      ctx.fillStyle = "#f6b500";
      ctx.fillRect(pad + i * w + 6, c.height - pad - h, w - 12, h);
      ctx.fillStyle = "#000";
      ctx.fillText(
        String(data.labels[i]).slice(0, 6),
        pad + i * w + 6,
        c.height - pad + 14
      );
    }
  }

  document.getElementById("btn_aplicar")?.addEventListener("click", render);
  document.getElementById("btn_limpar")?.addEventListener("click", () => {
    if (selZona) selZona.value = "";
    if (selMes) selMes.value = "";
    if (selSta) selSta.value = "";
    render();
  });
  ["tipo_zona", "tipo_mes", "tipo_status"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", render);
  });
  render();
}
document.addEventListener("DOMContentLoaded", initPainel);
function setDefaultDate() {
  const dt = document.querySelector('input[name="data_entrada"][type="date"]');
  if (dt && !dt.value) {
    dt.valueAsDate = new Date();
  }
}
document.addEventListener("DOMContentLoaded", setDefaultDate);
// Preencher a data "hoje" no cadastro
document.addEventListener("DOMContentLoaded", function () {
  const dt = document.querySelector('input[name="data_entrada"][type="date"]');
  if (dt && !dt.value) dt.valueAsDate = new Date();

  // Som no botão salvar
  const btn = document.getElementById("btn-salvar");
  const snd = document.getElementById("snd-click");
  if (btn && snd) {
    btn.addEventListener("click", () => {
      try {
        snd.currentTime = 0;
        snd.play();
      } catch (e) {}
    });
  }

  // Datalists (sugestões) se existirem
  const campos = ["solicitante", "endereco", "zona", "objeto", "mes", "status"];
  campos.forEach((c) => {
    const dl = document.getElementById("sug_" + c);
    if (!dl) return;
    fetch("/api/sugestoes/" + c)
      .then((r) => r.json())
      .then((arr) => {
        dl.innerHTML = (arr || [])
          .map((v) => `<option value="${String(v).replaceAll('"', "&quot;")}">`)
          .join("");
      })
      .catch(() => {});
  });
});
