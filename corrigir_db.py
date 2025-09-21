# corrigir_db.py
import os
import sqlite3
from werkzeug.security import generate_password_hash

DB_PATH = os.path.join(os.path.dirname(__file__), "sutram.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Garante tabela
cur.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT UNIQUE
    )
""")
conn.commit()

# Garante coluna senha_hash
cols = [r[1] for r in cur.execute("PRAGMA table_info(usuarios)")]
if "senha_hash" not in cols:
    cur.execute("ALTER TABLE usuarios ADD COLUMN senha_hash TEXT")
    conn.commit()

# Converte senhas legadas (texto) para hash, quando senha_hash estiver vazio
cols = [r[1] for r in cur.execute("PRAGMA table_info(usuarios)")]
if "senha" in cols:
    rows = list(cur.execute("SELECT id, senha FROM usuarios WHERE senha IS NOT NULL AND TRIM(senha)<>''"))
    for uid, senha in rows:
        h = generate_password_hash(senha)
        cur.execute("UPDATE usuarios SET senha_hash=? WHERE id=?", (h, uid))
    conn.commit()
    print(f"✅ Migrados {len(rows)} usuário(s) para senha_hash.")

conn.close()
print("✔️ Correção finalizada.")