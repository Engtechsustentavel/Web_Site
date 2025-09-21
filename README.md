# SUTRAM - Sistema de Usuários, Tabelas e Relatórios Municipais

Este é o repositório do aplicativo **SUTRAM**, desenvolvido em Python com Flask, para gerenciamento de dados municipais em formato de tabelas, dashboards e relatórios.

## 📦 Estrutura

- `app.py`: Arquivo principal da aplicação.
- `checar_db.py`, `corrigir_db.py`, `criar_usuario.py`, `init_db.py`: Scripts auxiliares para manipulação do banco de dados.
- `sutram.db`: Banco de dados SQLite local.
- `requirements.txt`: Lista de dependências Python.

## 🚀 Executando localmente

1. Crie e ative um ambiente virtual:
```bash
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
.venv\Scripts\activate   # Windows
```

2. Instale as dependências:
```bash
pip install -r requirements.txt
```

3. Execute a aplicação:
```bash
python app.py
```

Acesse em: [http://localhost:5000](http://localhost:5000)

## 🛠️ Requisitos

- Python 3.10+
- Flask
- Pandas
- Jinja2
- Plotly
- SQLite

---

## 📁 Publicação no GitHub

Este projeto está vinculado ao repositório:

[https://github.com/Engtechsustentavel/Web_Site](https://github.com/Engtechsustentavel/Web_Site)
