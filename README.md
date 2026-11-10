# Cronos — fichas de RPG

Controle de fichas para a mesa. O mestre cadastra os logins, abre o lobby da campanha e lança eventos (dano, cura, mana, XP, condições, imagens). Cada jogador entra pelo celular, escolhe a classe, fica pronto e usa a própria ficha. Tudo aparece ao vivo para a party.

| Pasta | O quê |
|---|---|
| `back/` | API NestJS 11 + Prisma 6 (PostgreSQL) + Socket.IO |
| `front/` | Vue 3 + Vuetify 4 + Pinia + Vue Router (Vite) |
| `front/public/classes/` | Arte das 9 classes (as fichas originais) |
| `front/public/icone.png` | Ícone do app; os ícones do PWA são gerados a partir dele |
| `back/prisma/seed/classes.json` | As 9 classes transcritas das fichas: texto, mana, críticos e efeitos automáticos |
| `back/schema.sql` | CREATE TABLE do banco (aplicado à mão, sem migrations) |
| `deploy.sh` | Deploy na VPS |

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
# primeira vez: rode o back/schema.sql no banco rpg (localhost:5433, postgres/postgres)
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

## Deploy na VPS

Endereço: **https://cronos.matheustogni.com.br**. API na porta **3008** (pm2 `cronos-api`), front publicado em `/var/www/cronos`, repositório em `~/Rpg`.

**Primeira vez:**

1. Crie o banco `cronosdb` com encoding **UTF8** (o log usa caracteres como "−" e "→") e rode o `back/schema.sql` nele.
2. Em `~/Rpg/back`, copie o `.env.production.example` para `.env` e preencha a senha do banco e o `JWT_SECRET`.
3. Rode `npm ci && npm run build`, depois `npm run db:seed` (as 9 classes) e `npm run create-master:prod -- matheus suasenha "Matheus"`.
4. No nginx do domínio, além de servir `/var/www/cronos` com fallback para o `index.html`:

```nginx
client_max_body_size 16m;   # imagens do mestre (até 15 MB)

location /api/ {
    proxy_pass http://127.0.0.1:3008;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

# tempo real: sem os headers de upgrade o Socket.IO não conecta
location /socket.io/ {
    proxy_pass http://127.0.0.1:3008;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}

# PWA: sem cache, senão a atualização não chega nos celulares
location ~ ^/(sw\.js|registerSW\.js|manifest\.webmanifest|index\.html)$ {
    add_header Cache-Control "no-cache";
}
```

**Depois:** `./deploy.sh`. Se o `schema.prisma` mudar, aplique o ALTER no banco à mão e atualize o `schema.sql`. Se o `classes.json` mudar, rode `npm run db:seed` em `~/Rpg/back`.

**Backup:** o banco (`pg_dump cronosdb`) e a pasta `back/uploads` (as imagens do mestre).

## App no celular (PWA)

O front é um PWA: no celular, abra o site e use **Adicionar à tela inicial** (Android/Chrome instala como app; no iPhone, pelo Safari em *Compartilhar*). Ele abre em tela cheia, com o ícone da ampulheta.

- **Precisa de HTTPS.** Em `http://<ip-do-pc>:5173` o app abre normal, mas não instala.
- O service worker só existe no build (`npm run build`), não no `npm run dev`.
- A tela abre mesmo sem rede, mas a mesa (API e tempo real) precisa de conexão. A arte das classes e as imagens do mestre ficam em cache depois da primeira vez.
- **Atualização:** depois de um novo build, o app baixa a versão nova em segundo plano e passa a usá-la na próxima vez que for aberto.
- **Trocar o ícone:** substitua `front/public/icone.png` (quadrado, de preferência 1024px ou mais) e rode `npm run pwa-assets` em `front/`. Isso regera o favicon e os ícones `pwa-*`, `maskable-*` e `apple-touch-*` em `front/public/`.

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
