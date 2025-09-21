document.addEventListener("DOMContentLoaded", () => {
  const clickSound = document.getElementById("click-sound");
  if (clickSound) {
    clickSound.preload = "auto";
  }

  const playClick = () => {
    if (!clickSound) return;
    try {
      clickSound.currentTime = 0;
      const p = clickSound.play();
      if (p && typeof p.then === "function") p.catch(() => {});
    } catch (e) {}
  };

  document.addEventListener("pointerdown", (ev) => {
    const el = ev.target;
    if (!el) return;
    if (el.closest(".btn-nav") || el.closest("button") || el.classList.contains("btn")) {
      playClick();
    }
  });
});

$(document).ready(function () {
  if ($("#tabela-servicos").length) {
    const tabela = $("#tabela-servicos").DataTable({
      ajax: "/api/servicos",
      columns: [
        { data: "registro" },
        { data: "data_entrada" },
        { data: "solicitante" },
        { data: "endereco" },
        { data: "zona" },
        { data: "objeto" },
        { data: "quantidade" },
        { data: "mes" },
        { data: "status" },
        {
          data: null,
          render: function (data, type, row) {
            return `<button class="btn btn-sm btn-danger" onclick="apagar(${row.id})">Excluir</button>`;
          }
        }
      ],
      language: {
        "sEmptyTable": "Nenhum registro encontrado",
        "sInfo": "Mostrando _START_ até _END_ de _TOTAL_ registros",
        "sInfoEmpty": "Mostrando 0 até 0 de 0 registros",
        "sInfoFiltered": "(filtrado de _MAX_ registros no total)",
        "sLengthMenu": "Mostrar _MENU_ registros",
        "sLoadingRecords": "Carregando...",
        "sProcessing": "Processando...",
        "sSearch": "Buscar:",
        "sZeroRecords": "Nenhum registro encontrado",
        "oPaginate": {
          "sFirst": "Primeiro",
          "sLast": "Último",
          "sNext": "Próximo",
          "sPrevious": "Anterior"
        }
      }
    });

    $("#btn-export-excel").on("click", () => window.location.href = "/export/excel");
    $("#btn-export-csv").on("click", () => window.location.href = "/export/csv");
    $("#btn-reload").on("click", () => tabela.ajax.reload());
    $("#btn-clear").on("click", () => {
      if (confirm("Tem certeza que deseja apagar todos os registros?")) {
        $.post("/api/servicos/clear", () => tabela.ajax.reload());
      }
    });
  }
});

function apagar(id) {
  if (confirm("Deseja excluir este registro?")) {
    $.ajax({
      url: "/api/servicos/" + id,
      type: "DELETE",
      success: () => $("#tabela-servicos").DataTable().ajax.reload()
    });
  }
}
