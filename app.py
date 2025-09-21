# -*- coding: utf-8 -*-
import os
import sys
import sqlite3
from pathlib import Path
from functools import wraps
from io import BytesIO
from datetime import datetime, timedelta

import pandas as pd
from flask import (
    Flask, render_template, request, redirect, url_for,
    session, flash, jsonify, send_file
)
from werkzeug.security import generate_password_hash, check_password_hash

# -----------------------------------------------------------------------------
# Ambiente / caminhos compatíveis com PyInstaller (one-file)
# -----------------------------------------------------------------------------
IS_FROZEN = getattr(sys, "frozen", False)

# Diretório de recursos (templates/static) quando empacotado:
RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))

# Diretório gravável para DB/Uploads:
# - no .exe: pasta do executável
# - em dev: pasta do arquivo
APP_DIR = Path(sys.executable).parent if IS_FROZEN else Path(__file__).parent

def resource_path(rel: str) -> str:
    """Retorna caminho para recursos (templates/static) em dev e no .exe."""
    return str(RESOURCE_DIR / rel)

def pick_writable_base() -> Path:
    """Escolhe uma base gravável para data/ e uploads/, com fallbacks seguros."""
    candidates = [
        APP_DIR,                         # ao lado do exe (ou do app.py)
        Path.cwd(),                      # diretório atual
        Path.home() / "SUTRAM",          # pasta do usuário
    ]
    for base in candidates:
        try:
            base.mkdir(parents=True, exist_ok=True)
            probe = base / ".sutram_write_test"
            with open(probe, "w", encoding="utf-8") as f:
                f.write("ok")
            probe.unlink(missing_ok=True)
            return base
        except Exception:
            continue
    # Último recurso: cwd
    return Path.cwd()

DATA_ROOT = pick_writable_base() / "data"
DATA_ROOT.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_ROOT / "sutram.db"
UPLOAD_FOLDER = DATA_ROOT / "uploads"
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTS = {".xls", ".xlsx", ".csv"}

# -----------------------------------------------------------------------------
# Configuração Flask
# -----------------------------------------------------------------------------
app = Flask(
    __name__,
    template_folder=resource_path("templates") if IS_FROZEN else "templates",
    static_folder=resource_path("static") if IS_FROZEN else "static",
    static_url_path="/static",
)
app.secret_key = "segredo_super_seguro"   # defina um valor fixo/seguro em produção
app.config["SESSION_PERMANENT"] = False

# -----------------------------------------------------------------------------
# DB / Utils
# -----------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    # Tabelas
    conn.execute("""
        CREATE TABLE IF NOT EXISTS servicos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            registro TEXT,
            data_entrada TEXT,
            solicitante TEXT,
            endereco TEXT,
            zona TEXT,
            objeto TEXT,
            quantidade INTEGER,
            mes TEXT,
            status TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT UNIQUE
            -- pode existir 'senha' (texto puro, legado)
            -- ou 'senha_hash' (recomendado)
        )
    """)
    # Garante ao menos uma coluna de senha
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(usuarios)")]
    if ("senha_hash" not in cols) and ("senha" not in cols):
        conn.execute("ALTER TABLE usuarios ADD COLUMN senha_hash TEXT")
        cols.append("senha_hash")

    # Seed: cria admin/admin se a tabela estiver vazia
    qtd = conn.execute("SELECT COUNT(*) AS c FROM usuarios").fetchone()["c"]
    if qtd == 0:
        if "senha_hash" in cols:
            conn.execute(
                "INSERT INTO usuarios (usuario, senha_hash) VALUES (?, ?)",
                ("admin", generate_password_hash("admin")),
            )
        else:
            conn.execute(
                "INSERT INTO usuarios (usuario, senha) VALUES (?, ?)",
                ("admin", "admin"),
            )
    conn.commit()
    conn.close()

init_db()

def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # checa a chave correta da sessão
        if not session.get("user_id"):
            return redirect(url_for("login"))
        return fn(*args, **kwargs)
    return wrapper

def _iso_date_from_any(value) -> str:
    if value is None:
        return ""
    try:
        d = pd.to_datetime(value, dayfirst=True, errors="coerce")
        if pd.notna(d):
            return d.strftime("%Y-%m-%d")
    except Exception:
        pass
    try:
        return datetime.strptime(str(value).strip(), "%d/%m/%Y").strftime("%Y-%m-%d")
    except Exception:
        return ""

def _int(value, default=0) -> int:
    try:
        if value is None or str(value).strip() == "":
            return default
        return int(float(str(value).replace(",", ".")))
    except Exception:
        return default

def _norm_col(s: str) -> str:
    s = str(s or "").strip().lower()
    mapa = {"ê":"e","é":"e","è":"e","ç":"c","ã":"a","á":"a","à":"a","í":"i","ó":"o","õ":"o","ú":"u","â":"a","ô":"o"}
    for k,v in mapa.items():
        s = s.replace(k,v)
    while "  " in s:
        s = s.replace("  ", " ")
    return s

def _pick(colmap, *keys):
    for k in keys:
        if k in colmap:
            return colmap[k]
    return None

# -----------------------------------------------------------------------------
# Rotas públicas / Auth
# -----------------------------------------------------------------------------
@app.route("/")
def index():
    return redirect(url_for("cadastro" if session.get("user_id") else "login"))

def fetch_user(usuario: str):
    """Busca 1 usuário e normaliza campos (tanto legado quanto com hash)."""
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        cols = [r[1] for r in cur.execute("PRAGMA table_info(usuarios)")]
        has_senha = "senha" in cols
        has_hash  = "senha_hash" in cols

        fields = ["id", "usuario"]
        if has_senha: fields.append("senha")
        if has_hash:  fields.append("senha_hash")

        row = cur.execute(
            f"SELECT {', '.join(fields)} FROM usuarios WHERE usuario=?",
            (usuario,)
        ).fetchone()
        if not row:
            return None

        return {
            "id": row["id"],
            "usuario": row["usuario"],
            "senha": row["senha"] if has_senha else "",
            "senha_hash": row["senha_hash"] if has_hash else "",
        }

def valid_password(row, senha: str) -> bool:
    """Valida por senha_hash (preferencial) ou senha em texto (legado)."""
    if not row:
        return False
    sh = (row.get("senha_hash") or "").strip()
    if sh:
        try:
            return check_password_hash(sh, senha)
        except Exception:
            return False
    sp = (row.get("senha") or "").strip()
    return sp == senha

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        usuario = (request.form.get("usuario") or "").strip()
        senha   = (request.form.get("senha") or "")

        if not usuario or not senha:
            flash("Informe usuário e senha.", "warning")
            return render_template("login.html")

        row = fetch_user(usuario)

        if row and valid_password(row, senha):
            session.clear()
            session["user_id"] = row["id"]
            session["usuario"] = row["usuario"]

            if request.form.get("lembrar"):
                session.permanent = True
                app.permanent_session_lifetime = timedelta(days=7)
            else:
                session.permanent = False

            return redirect(url_for("cadastro"))
        else:
            flash("Usuário ou senha inválidos.", "danger")
            return render_template("login.html"), 401

    return render_template("login.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# -----------------------------------------------------------------------------
# Páginas
# -----------------------------------------------------------------------------
@app.route("/cadastro", methods=["GET", "POST"])
@login_required
def cadastro():
    if request.method == "POST":
        registro     = request.form.get("registro", "").strip()
        data_raw     = request.form.get("data_entrada", "").strip()
        solicitante  = request.form.get("solicitante", "").strip()
        endereco     = request.form.get("endereco", "").strip()
        zona         = request.form.get("zona", "").strip()
        objeto       = request.form.get("objeto", "").strip()
        quantidade   = _int(request.form.get("quantidade", "0"))
        mes          = request.form.get("mes", "").strip()
        status       = request.form.get("status", "").strip()

        data_iso = _iso_date_from_any(data_raw)

        conn = get_db()
        conn.execute("""
            INSERT INTO servicos (registro, data_entrada, solicitante, endereco, zona, objeto, quantidade, mes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (registro, data_iso, solicitante, endereco, zona, objeto, quantidade, mes, status))
        conn.commit()
        conn.close()

        flash("Serviço salvo com sucesso!", "success")
        return redirect(url_for("cadastro"))

    return render_template("cadastro.html")

@app.route("/dados")
@login_required
def dados():
    return render_template("dados.html")

@app.route("/painel")
@login_required
def painel():
    return render_template("painel.html")

# -----------------------------------------------------------------------------
# JSON para DataTables/Painel
# -----------------------------------------------------------------------------
@app.route("/dados.json")
@login_required
def dados_json():
    conn = get_db()
    cur = conn.execute("""
        SELECT
            COALESCE(registro,'')      AS registro,
            COALESCE(data_entrada,'')  AS data_entrada,
            COALESCE(solicitante,'')   AS solicitante,
            COALESCE(endereco,'')      AS endereco,
            COALESCE(zona,'')          AS zona,
            COALESCE(objeto,'')        AS objeto,
            COALESCE(quantidade,0)     AS quantidade,
            COALESCE(mes,'')           AS mes,
            COALESCE(status,'')        AS status
        FROM servicos
        ORDER BY rowid DESC
    """)
    data = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify({"data": data})

# -----------------------------------------------------------------------------
# Importação / Exportação / Limpar
# -----------------------------------------------------------------------------
@app.route("/importar", methods=["POST"])
@login_required
def importar():
    if "arquivo" not in request.files:
        flash("Selecione um arquivo.", "warning")
        return redirect(url_for("dados"))

    f = request.files["arquivo"]
    if not f or f.filename == "":
        flash("Arquivo inválido.", "warning")
        return redirect(url_for("dados"))

    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        flash("Formato não suportado. Use .csv, .xls ou .xlsx.", "danger")
        return redirect(url_for("dados"))

    try:
        if ext == ".csv":
            df = pd.read_csv(f, sep=None, engine="python", encoding="utf-8")
        else:
            df = pd.read_excel(f)
    except Exception:
        try:
            f.stream.seek(0)
            df = pd.read_csv(f, sep=";", engine="python", encoding="latin1")
        except Exception:
            flash("Não foi possível ler o arquivo.", "danger")
            return redirect(url_for("dados"))

    colmap = {_norm_col(c): c for c in df.columns}

    c_reg   = _pick(colmap, "registro")
    c_data  = _pick(colmap, "data entrada", "data_entrada", "data")
    c_solic = _pick(colmap, "solicitante")
    c_end   = _pick(colmap, "endereco", "endereço")
    c_zona  = _pick(colmap, "zona")
    c_obj   = _pick(colmap, "objeto")
    c_qtd   = _pick(colmap, "quantidade", "qtd")
    c_mes   = _pick(colmap, "mes", "mês", "meses")
    c_stat  = _pick(colmap, "status", "situacao", "situação")

    conn = get_db()
    cur = conn.cursor()

    for _, row in df.iterrows():
        registro    = str(row[c_reg]).strip() if c_reg in df.columns else ""
        solicitante = str(row[c_solic]).strip() if c_solic in df.columns else ""
        endereco    = str(row[c_end]).strip() if c_end in df.columns else ""
        zona        = str(row[c_zona]).strip() if c_zona in df.columns else ""
        objeto      = str(row[c_obj]).strip() if c_obj in df.columns else ""
        quantidade  = _int(row[c_qtd]) if c_qtd in df.columns else 0
        mes         = str(row[c_mes]).strip() if c_mes in df.columns else ""
        status      = str(row[c_stat]).strip() if c_stat in df.columns else ""
        data_iso    = _iso_date_from_any(row[c_data]) if c_data in df.columns else ""

        cur.execute("""
            INSERT INTO servicos (registro, data_entrada, solicitante, endereco, zona, objeto, quantidade, mes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (registro, data_iso, solicitante, endereco, zona, objeto, quantidade, mes, status))

    conn.commit()
    conn.close()
    flash("Importação concluída.", "success")
    return redirect(url_for("dados"))

@app.route("/exportar_excel")
@login_required
def exportar_excel():
    conn = get_db()
    df = pd.read_sql_query("""
        SELECT registro, data_entrada, solicitante, endereco, zona, objeto, quantidade, mes, status
        FROM servicos
        ORDER BY rowid DESC
    """, conn)
    conn.close()
    bio = BytesIO()
    df.to_excel(bio, index=False)
    bio.seek(0)
    return send_file(
        bio, as_attachment=True, download_name="dados.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

@app.route("/exportar_csv")
@login_required
def exportar_csv():
    conn = get_db()
    df = pd.read_sql_query("""
        SELECT registro, data_entrada, solicitante, endereco, zona, objeto, quantidade, mes, status
        FROM servicos
        ORDER BY rowid DESC
    """, conn)
    conn.close()
    bio = BytesIO()
    bio.write(df.to_csv(index=False).encode("utf-8"))
    bio.seek(0)
    return send_file(bio, as_attachment=True, download_name="dados.csv", mimetype="text/csv")

@app.route("/apagar_tudo", methods=["POST"])
@login_required
def apagar_tudo():
    conn = get_db()
    conn.execute("DELETE FROM servicos")
    conn.commit()
    conn.close()
    flash("Todos os registros foram apagados.", "warning")
    return redirect(url_for("dados"))

# -----------------------------------------------------------------------------
# Usuários
# -----------------------------------------------------------------------------
@app.route("/usuarios", methods=["GET", "POST"])
@login_required
def usuarios():
    conn = get_db()
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(usuarios)")]
    if request.method == "POST":
        usuario = request.form.get("usuario", "").strip()
        senha = request.form.get("senha", "")
        if not usuario or not senha:
            flash("Informe usuário e senha.", "warning")
            return redirect(url_for("usuarios"))
        try:
            if "senha_hash" in cols:
                conn.execute(
                    "INSERT INTO usuarios (usuario, senha_hash) VALUES (?, ?)",
                    (usuario, generate_password_hash(senha)),
                )
            elif "senha" in cols:
                conn.execute(
                    "INSERT INTO usuarios (usuario, senha) VALUES (?, ?)",
                    (usuario, senha),
                )
            else:
                conn.execute("ALTER TABLE usuarios ADD COLUMN senha_hash TEXT")
                conn.execute(
                    "INSERT INTO usuarios (usuario, senha_hash) VALUES (?, ?)",
                    (usuario, generate_password_hash(senha)),
                )
            conn.commit()
            flash("Usuário criado.", "success")
        except sqlite3.IntegrityError:
            flash("Usuário já existe.", "danger")
        return redirect(url_for("usuarios"))

    rows = conn.execute("SELECT id, usuario FROM usuarios ORDER BY usuario ASC").fetchall()
    conn.close()
    return render_template("usuarios.html", usuarios=rows)

# -----------------------------------------------------------------------------
# Sugestões datalist
# -----------------------------------------------------------------------------
@app.route("/api/sugestoes/<campo>")
@login_required
def sugestoes(campo):
    campos_validos = {
        "solicitante": "solicitante",
        "endereco": "endereco",
        "zona": "zona",
        "objeto": "objeto",
        "mes": "mes",
        "status": "status",
    }
    col = campos_validos.get(campo.lower())
    if not col:
        return jsonify([])
    conn = get_db()
    cur = conn.execute(f"""
        SELECT DISTINCT {col} AS valor
        FROM servicos
        WHERE {col} IS NOT NULL AND TRIM({col}) <> ''
        ORDER BY {col} COLLATE NOCASE
    """)
    valores = [r["valor"] for r in cur.fetchall()]
    conn.close()
    return jsonify(valores)

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    debug = not IS_FROZEN
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", "5000")),
        debug=debug,
        use_reloader=debug
    )