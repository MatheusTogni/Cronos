# Cronos — fichas de RPG

Controle de fichas para a mesa. O mestre cadastra os logins, abre o lobby da campanha e lança eventos (dano, cura, mana, XP, condições, imagens). Cada jogador entra pelo celular, escolhe a classe, fica pronto e usa a própria ficha. Tudo aparece ao vivo para a party.

| Pasta | O quê |
|---|---|
| `back/` | API NestJS 11 + Prisma 6 (PostgreSQL) + Socket.IO |
| `front/` | Vue 3 + Vuetify 4 + Pinia + Vue Router (Vite) |
| `front/public/classes/` | Arte das 9 classes (as fichas originais) |
| `front/public/icone.png` | Ícone do app; os ícones do PWA são gerados a partir dele |
| `back/prisma/seed/classes.json` | As 9 classes transcritas das fichas: texto, mana e faixas de crítico (só referência) |
| `back/schema.sql` | CREATE TABLE do banco (aplicado à mão, sem migrations) |
| `deploy.sh` | Deploy na VPS |

## Como funciona

**Logins.** Não existe cadastro aberto. O mestre cria os logins em *Usuários* e escolhe o papel (Jogador ou Mestre). Depois do login, cada um vê só a interface do seu papel.

**Campanha.**
1. O mestre cria a campanha (em preparação) e clica em **Abrir lobby**.
2. Os jogadores veem a campanha em *Campanhas abertas* (a lista atualiza sozinha) e clicam em **Entrar**.
3. Cada jogador escolhe a classe, dá nome ao personagem e aperta **Estou pronto**. Trocar de classe cancela o pronto.
4. Quando todos estão prontos, o mestre aperta **Começar aventura**.

**Durante a aventura.** A mesa é física: os dados são físicos, a conversa é o jogo e **o mestre resolve tudo**. O app só registra e dá apoio.
- **Jogador:** a ficha mostra vida, mana, habilidades, invocações, condições, inventário e anotações. O jogador diz na mesa o que vai fazer e, se for usar uma skill, toca nela e confirma: o app **só gasta a mana e registra no log**. Não há ataque básico nem escolha de alvo, e nada acontece sozinho.
- **Mestre:** decide e aplica tudo pela interface dele. Dano, Cura, Mana, XP/Nível, Condição, Item, Criatura e Editar ficha (em personagens, criaturas e inimigos) são ações rápidas. Também narra no log, rola dados, envia imagens e escolhe qual mostrar na tela dos jogadores. Quando um jogador usa uma skill, a linha aparece no log da mesa ("Fulano usou X (−2 mana)") e o mestre pode desfazer.
- **Skills:** cada classe tem 3. O app guarda nome, custo de mana, descrição e as faixas de crítico, que são só texto de referência (o mestre decide o que cada uma faz). Quem começa só tem a **1ª** liberada; a **2ª** abre no nível **5** e a **3ª** no nível **10**. Antes disso a skill aparece trancada na ficha ("Libera no nível 5") e o servidor recusa o uso.
- **Inimigos:** o jogador vê o nome, as condições e uma **faixa de saúde** (Intacto, Ferido, Muito ferido, Por um fio, Caído). A vida e o dano são só do mestre. O servidor nem manda esses números aos jogadores, e o log tem duas versões: a do mestre, com números, e a narrada.
- **Condições:** são um status à mostra, sem prazo e sem efeito automático. O mestre coloca, decide o que acontece e tira. Passar o turno não mexe em vida nem em duração. Quando o mestre coloca uma condição, a **carta dela aparece girando na tela do jogador** (a mesma arte da galeria de condições, com vibração no celular); tirar a condição não faz efeito nenhum.
- **Vida, mana e nível:** todas as classes começam no **nível 1** com 30 de vida e 10 de mana. O nível vai até **15** e quem sobe é o mestre (botão XP/Nível). A cada nível o personagem ganha **+3 de vida e +2 de mana**, máximas e atuais (no 15: 72 de vida e 38 de mana). O log diz o que subiu e quais skills abriram, e o efeito de subir de nível aparece na tela do jogador. Descer de nível tira o mesmo tanto. Com 0 de vida o personagem fica **Caído**: não age e perde a vez no combate até ser curado.
- **Mana:** não regenera sozinha; volta com a Poção de Mana da loja (ou o mestre devolve pelo botão Mana).
- **Ouro:** cada jogador tem o próprio ouro. Ao **encerrar um combate**, todo jogador recebe 3 moedas. O mestre também dá e tira ouro pelo botão **Ouro** do card do jogador (Dar/Tirar, com Desfazer), por exemplo para corrigir um combate encerrado por engano.
- **Mercador:** o mestre abre e fecha a loja pelo card **Mercador**. Ao abrir, a tela dos jogadores mostra portas se abrindo e o estande, com os itens em prateleiras; o jogador compra com o próprio ouro (uma unidade por clique, a compra soma na pilha). A animação some no modo leve e com movimento reduzido. O mestre pode desfazer uma compra pelo log.

  | Item | Preço | Ao usar |
  |---|---|---|
  | Poção de Vida | 5 | **+10 vida** (automático) |
  | Poção de Mana | 5 | **+10 mana** (automático) |
  | Ração de Viagem | 3 | **+5 vida** (automático) |
  | Elixir do Viajante | 7 | **+5 vida e +5 mana** (automático) |
  | Antídoto | 4 | só registra; o mestre tira a condição |
  | Bomba de Fumaça | 6 | só registra; o mestre narra |
  | Frasco de Fogo | 8 | só registra; o mestre decide o dano |
  | Amuleto de Proteção | 10 | só registra; o mestre aplica |
  | Tocha | 1 | só registra; o mestre narra |
  | Corda | 2 | só registra; **o item fica** |
  | Gazua | 4 | só registra; **o item fica** |

  Os itens de **cura** são o único efeito automático do app; nos demais, usar só grava no log e tira 1 do inventário (Corda e Gazua não se gastam). Item de cura com a vida/mana já cheia pede confirmação antes de gastar. Usar item segue a regra das skills: em combate só na vez, e quem está caído não usa. O catálogo fica em `back/src/game/shop.ts` (e o espelho em `front/src/utils/shop.ts`).
- **Doações e trocas:** um jogador pode **dar** um item ou ouro, ou **trocar** um item por um item do inventário de outro jogador (ouro só em doação). Ele escolhe o item, a quantidade e a pessoa; na tela de quem recebe aparece um **popup de aceitar ou recusar**, e só então os itens se movem. Fora de combate qualquer um oferece a qualquer momento; em combate só quem está na vez (quem recebe responde sempre). Cada jogador tem uma oferta aberta por vez e pode cancelá-la. Nada fica reservado: se o item mudou antes do aceite, a oferta cai. Só o resultado aceito vai ao log, e o mestre pode desfazer.
- **Combate:** o mestre abre cada rodada ("o mundo reage") e a ordem dos personagens é uma trava: a vez só passa quando o jogador a passa (o mestre pode passar a de qualquer um). O celular vibra na vez do jogador (não funciona no iPhone, onde o aviso é só visual).
- **Ganchos de classe:** o sistema só acende o *Frenesi* (Caçador com 40% de vida ou menos). O resto da mecânica de cada classe, como a *Oportunidade* da Raposa Vermelha, a *Condenação* do Carrasco e a *Instabilidade* do Tecelão, é narração do mestre: o app não calcula.
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

Endereço: **https://cronos.matheustogni.com.br**. API na porta **3008** (pm2 `cronos-api`), front publicado em `/var/www/cronos`, repositório em `~/Cronos`.

**Primeira vez:**

1. Crie o banco `cronosdb` com encoding **UTF8** (o log usa caracteres como "−" e "→") e rode o `back/schema.sql` nele.
2. Em `~/Cronos/back`, copie o `.env.production.example` para `.env` e preencha a senha do banco e o `JWT_SECRET`.
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

**Depois:** `./deploy.sh`. Se o `schema.prisma` mudar, aplique o ALTER no banco à mão e atualize o `schema.sql`. Se o `classes.json` mudar, rode `npm run db:seed` em `~/Cronos/back`.

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

Os testes e2e do back sobem um **Postgres real embutido** (não precisa de banco instalado). Eles cobrem login e papéis, o lobby, o uso de habilidades (só mana e log), os ajustes do mestre, o desfazer, o combate por turnos, as condições manuais, o ouro, a loja e os itens, as doações e trocas, as permissões, as imagens e o websocket.

## Mudar as classes

Edite `back/prisma/seed/classes.json` e rode `npm run db:seed`.

- **Vida e mana iniciais** (`baseHp`/`baseMana`): vida 30 e mana 10 em todas as classes, no nível 1. Os ganhos por nível (+3 de vida, +2 de mana), o nível máximo (15) e os níveis das skills (1, 5 e 10) ficam em `back/src/game/rules.ts` (e o espelho dos números em `front/src/utils/classHooks.ts`).
- **Habilidades:** cada classe tem 3 skills (`kind: "SKILL"`) com `name`, `manaCost` e `description`, **na ordem em que são liberadas** (a 1ª no nível 1, a 2ª no 5, a 3ª no 10; o seed grava isso em `unlockLevel`). Não há ataque básico, dano, efeito nem pergunta: o mestre resolve tudo.
- **Críticos:** `crits` (`[{ "min": 18, "max": 20, "text": "..." }]`) é opcional e só aparece como texto de referência.
- **Condições** (`back/prisma/seed/conditions.json`): só `id`, `name`, `description` e `polarity`.
- **Banco:** o seed apaga as habilidades que saíram do JSON. Tirar campos do `schema.prisma` não exige `ALTER`: o Prisma ignora colunas que sobram no banco.
