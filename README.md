# Grimório — fichas de RPG

Controle de fichas para a mesa. O mestre cadastra os logins, abre o lobby da campanha e lança eventos (dano, cura, mana, XP, condições, imagens). Cada jogador entra pelo celular, escolhe a classe, fica pronto e usa a própria ficha. Tudo aparece ao vivo para a party.

| Pasta | O quê |
|---|---|
| `back/` | API NestJS 11 + Prisma 6 (PostgreSQL) + Socket.IO |
| `front/` | Vue 3 + Vuetify 4 + Pinia + Vue Router (Vite) |
| `front/public/classes/` | Arte das 9 classes (as fichas originais) |
| `back/prisma/seed/classes.json` | As 9 classes transcritas das fichas: texto, mana, críticos e efeitos automáticos |
| `deploy/nginx.conf` | Site do nginx para a VPS |

## Como funciona

**Logins.** Não existe cadastro aberto. O mestre cria os logins em *Usuários* e escolhe o papel (Jogador ou Mestre). Depois do login, cada um vê só a interface do seu papel.

**Campanha.**
1. O mestre cria a campanha (em preparação) e clica em **Abrir lobby**.
2. Os jogadores veem a campanha em *Campanhas abertas* (a lista atualiza sozinha) e clicam em **Entrar**.
3. Cada jogador escolhe a classe, dá nome ao personagem e aperta **Estou pronto**. Trocar de classe cancela o pronto.
4. Quando todos estão prontos, o mestre aperta **Começar aventura**.

**Durante a aventura.**
- **Jogador:** a ficha mostra vida, mana, habilidades, invocações, condições, inventário e anotações. Ao usar uma habilidade, ele escolhe o dado (o sistema rola, ele digita o dado físico ou sem dado) e o alvo. O sistema desconta a mana, mostra o crítico (18/19/20) e aplica o efeito:
  - **Reanimar** cria a criatura. O Necromante mantém só uma; a nova substitui a antiga.
  - **Sacrifício Macabro** consome a criatura.
  - **Máscaras** viram condição no alvo, uma por alvo; a nova substitui a anterior.
  - **Lua Rubra** e **Caçada Escarlate** viram condição em quem usou.
  - **Dívida** e **Olhar Distante** marcam o alvo.
- **Mestre:** vê a party com ações rápidas (Dano, Cura, Mana, XP/Nível, Condição, Item, Criatura, Editar ficha). Também narra no log, rola dados, envia imagens e escolhe qual mostrar na tela dos jogadores.
- **Log:** tudo vai para o log da mesa. O mestre pode **desfazer** qualquer ação. O desfazer devolve só o que aquela ação mudou: desfazer um dano depois de uma cura não apaga a cura.

## Rodar em desenvolvimento (Windows ou Linux)

Requisitos: Node 22+. **Não precisa instalar o Postgres**: o `npm run dev:db` sobe um Postgres embutido, com os dados em `back/.pgdata`.

```bash
# terminal 1 — banco
cd back
npm install
cp .env.example .env            # já vem apontando para o banco do dev:db (porta 5433)
npm run dev:db                  # deixe aberto

# terminal 2 — API
cd back
npm run db:migrate              # cria as tabelas (só na primeira vez ou quando houver migration nova)
npm run db:seed                 # carrega as 9 classes (rode de novo quando mudar o JSON)
npm run create-master -- matheus suasenha "Matheus"
npm run start:dev               # API em http://127.0.0.1:3100/api

# terminal 3 — front
cd front
npm install
npm run dev                     # http://localhost:5173 (repassa /api e /socket.io para a 3100)
```

Para abrir no celular na mesma rede, use `http://<ip-do-pc>:5173`.

A API usa a porta **3100** para não brigar com outros serviços na 3000. Para mudar, altere `PORT` no `back/.env` e rode o Vite com `API_URL=http://127.0.0.1:<porta> npm run dev`.

## Deploy na VPS (Ubuntu + nginx + pm2 + Postgres local)

```bash
# 1. Banco (UTF8 é obrigatório: o log usa caracteres como "−" e "→")
sudo -u postgres psql <<'SQL'
CREATE USER grimorio WITH PASSWORD 'troque-esta-senha';
CREATE DATABASE grimorio OWNER grimorio ENCODING 'UTF8' TEMPLATE template0;
SQL

# 2. Código em /var/www/grimorio (git clone, rsync…)
cd /var/www/grimorio/back
cp .env.example .env
#   DATABASE_URL="postgresql://grimorio:troque-esta-senha@localhost:5432/grimorio?schema=public"
#   JWT_SECRET=<gere com: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))">
#   UPLOAD_DIR=/var/lib/grimorio/uploads
sudo mkdir -p /var/lib/grimorio/uploads && sudo chown $USER /var/lib/grimorio/uploads

npm ci
npm run build
npm run db:migrate
npm run db:seed
npm run create-master:prod -- matheus suasenha "Matheus"

# 3. API no pm2 (uma instância só — ver ecosystem.config.cjs)
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup                     # siga a instrução que ele imprimir

# 4. Front
cd ../front
npm ci
npm run build                   # gera front/dist

# 5. nginx
sudo cp ../deploy/nginx.conf /etc/nginx/sites-available/grimorio   # ajuste server_name e root
sudo ln -s /etc/nginx/sites-available/grimorio /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d rpg.seudominio.com.br                       # HTTPS
```

**Atualizar depois:** `git pull`, depois `cd back && npm ci && npm run build && npm run db:migrate && pm2 restart grimorio-api`, depois `cd ../front && npm ci && npm run build`.

**Backup:** o banco (`pg_dump grimorio`) e a pasta `UPLOAD_DIR` (as imagens).

## Verificações

```bash
cd back  && npm run build && npm run lint && npm run test:e2e
cd front && npm run build        # type-check + build
```

Os testes e2e do back sobem um **Postgres real embutido** (não precisa de banco instalado). Eles cobrem login e papéis, o lobby, as habilidades (mana, críticos, efeitos, máscaras exclusivas, a criatura única do Necromante), os ajustes do mestre, o desfazer, as permissões, as imagens e o websocket.

## Mudar as classes

Edite `back/prisma/seed/classes.json` e rode `npm run db:seed`.

- **Vida e mana iniciais** (`baseHp`/`baseMana`) estão provisórios (20/10), porque as fichas não trazem esses números.
- **Efeitos automáticos:** cada habilidade aceita `effect` (`SUMMON`, `SACRIFICE_SUMMON`, `SELF_CONDITION`, `TARGET_CONDITION`) com `effectData` (nome, descrição, `exclusiveGroup`, vida da criatura).
- **Críticos:** cada habilidade aceita `crits` (`[{ "min": 18, "max": 20, "text": "..." }]`).
