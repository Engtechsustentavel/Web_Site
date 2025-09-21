# criar_usuario.py
import os
import sqlite3
from werkzeug.security import generate_password_hash

DB_PATH = os.path.join(os.path.dirname(__file__), "sutram.db")

def cols(conn, table):
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]

def main():
    usuario = input("Digite o nome de usuário: ").strip()
    senha = input("Digite a senha: ").strip()

    if not usuario or not senha:
        print("⚠️ Usuário e senha são obrigatórios.")
        return

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Garante tabela 'usuarios' mínima
    cur.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT UNIQUE
        )
    """)
    conn.commit()

    c = cols(conn, "usuarios")
    # Garante que exista alguma coluna de senha
    if ("senha_hash" not in c) and ("senha" not in c):
        cur.execute("ALTER TABLE usuarios ADD COLUMN senha_hash TEXT")
        conn.commit()
        c = cols(conn, "usuarios")

    try:
        if "senha_hash" in c:
            cur.execute(
                "INSERT INTO usuarios (usuario, senha_hash) VALUES (?, ?)",
                (usuario, generate_password_hash(senha)),
            )
        else:
            # esquema legado
            cur.execute(
                "INSERT INTO usuarios (usuario, senha) VALUES (?, ?)",
                (usuario, senha),
            )
        conn.commit()
        print("✅ Usuário criado com sucesso!")
    except sqlite3.IntegrityError:
        print("⚠️ Usuário já existe.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()