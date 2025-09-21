# checar_db.py
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "sutram.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")]
print("📋 Tabelas existentes no banco:")
for t in tables:
    print("-", t)

for t in tables:
    print(f"\n🔎 Estrutura da tabela '{t}':")
    for _, name, ctype, *_ in cur.execute(f"PRAGMA table_info({t})"):
        print(f" - {name} ({ctype})")

conn.close()