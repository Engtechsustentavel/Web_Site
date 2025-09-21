import sqlite3

# Cria/abre o banco
conn = sqlite3.connect("sutram.db")
cur = conn.cursor()

# Cria tabela de serviços
cur.execute("""
CREATE TABLE IF NOT EXISTS cadastro_servicos (
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

# Cria tabela de usuários
cur.execute("""
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    senha TEXT
)
""")

conn.commit()
conn.close()
print("Banco de dados inicializado com sucesso 🚀")
