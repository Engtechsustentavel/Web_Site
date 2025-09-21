(function () {
  const table = $("#tabela").DataTable({
    ajax: { url: "/dados.json", dataSrc: "data" },
    pageLength: 10,
    columns: [
      { data: "registro" },
      {
        data: "data_entrada",
        render: (d) => {
          if (!d) return "";
          const p = String(d).split("T")[0].split("-"); // yyyy-mm-dd
          return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
        },
      },
      { data: "solicitante" },
      { data: "endereco" },
      { data: "zona" },
      { data: "objeto" },
      { data: "quantidade" },
      { data: "mes" },
      { data: "status" },
    ],
  });

  document
    .getElementById("btn-recarregar")
    ?.addEventListener("click", () => table.ajax.reload(null, false));
})();
