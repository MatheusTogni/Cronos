# Cronos — fichas de RPG de mesa no celular

[![CI](https://github.com/MatheusTogni/Cronos/actions/workflows/ci.yml/badge.svg)](https://github.com/MatheusTogni/Cronos/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)
![Node 22+](https://img.shields.io/badge/node-22%2B-339933)

*Real-time character sheets for tabletop RPG nights: a PWA with a NestJS API, Vue 3 and Socket.IO. Docs in Portuguese.*

Feito para jogar RPG de mesa com os amigos **sem controlar a ficha no papel**. O mestre cadastra os logins, abre o lobby da campanha e lança os eventos (dano, cura, mana, XP, condições, imagens). Cada jogador entra pelo celular, escolhe a classe e usa a própria ficha. Tudo aparece ao vivo para a party.

A mesa continua física: os dados são de verdade, a conversa é o jogo e **o mestre resolve tudo**. O app só registra e dá apoio.

<!--
Prints e GIFs ajudam muito a vitrine. Coloque as imagens em docs/img/ e descomente:

<p align="center">
  <img src="docs/img/ficha.png" width="260" alt="Ficha do jogador">
  <img src="docs/img/mestre.png" width="260" alt="Painel do mestre">
  <img src="docs/img/mercador.png" width="260" alt="Loja do mercador">
</p>
-->

## O que tem

- **Ficha ao vivo** no celular: vida, mana, habilidades, invocações, condições, inventário e anotações, sincronizados por WebSocket.
- **Painel do mestre**: dano, cura, mana, XP/nível, condições, itens, criaturas e inimigos em ações rápidas, com **log da mesa e desfazer** para qualquer ação.
- **Lobby e campanhas**: o mestre abre a campanha, os jogadores entram, escolhem a classe e ficam prontos.
- **9 classes** com 3 habilidades cada, liberadas por nível (até o 15).
- **Combate por turnos** com vez travada e vibração no celular de quem joga.
- **Condições com carta animada** que gira na tela do jogador quando o mestre aplica.
- **Loja do mercador** (portas que se abrem, ouro, poções) e **doações e trocas** entre jogadores com aceite.
- **Imagens do mestre** exibidas na tela de todos.
- **PWA**: instala na tela inicial e abre em tela cheia.
- **Segredo do mestre protegido**: o servidor nem envia a vida dos inimigos aos jogadores.

As regras completas estão em [docs/REGRAS.md](docs/REGRAS.md).

## Stack

| Parte | Tecnologias |
|---|---|
| `back/` | NestJS 11, Prisma 6, PostgreSQL, Socket.IO, JWT, helmet e rate limit no login |
| `front/` | Vue 3, Vuetify 4, Pinia, Vue Router, Vite, PWA |
| CI | GitHub Actions (build do back e do front) |

## Rodar em desenvolvimento

Requisitos: **Node 22+**. Não precisa instalar o Postgres: `npm run dev:db` sobe um embutido, com os dados em `back/.pgdata`.

```bash
# terminal 1 — banco (deixe aberto)
cd back
npm install
cp .env.example .env     # já aponta para o banco do dev:db (porta 5433)
npm run dev:db

# terminal 2 — API
cd back
npm run db:schema        # só na primeira vez: cria as tabelas
npm run db:seed          # carrega as 9 classes e as condições
npm run create-master -- seulogin suasenha "Seu Nome"
npm run start:dev        # API em http://127.0.0.1:3100/api

# terminal 3 — front
cd front
npm install
npm run dev              # http://localhost:5173 (repassa /api e /socket.io para a 3100)
```

Entre com o login que você criou no `create-master`; os outros logins o mestre cria pela tela *Usuários*. Para abrir no celular na mesma rede, use `http://<ip-do-pc>:5173`.

A API usa a porta **3100** para não brigar com outros serviços na 3000. Para mudar, altere `PORT` no `back/.env` e rode o Vite com `API_URL=http://127.0.0.1:<porta> npm run dev`.

## Verificações

```bash
cd back  && npm run build && npm run lint:check
cd front && npm run build        # type-check + build
```

## Estrutura

| Pasta | O quê |
|---|---|
| `back/` | API (`src/`), schema do banco (`schema.sql`, aplicado à mão, sem migrations), seeds das classes e condições (`prisma/seed/`) |
| `front/` | App Vue (`src/`) e arte e ícones (`public/`) |
| `docs/` | [Regras da mesa](docs/REGRAS.md) e [deploy em VPS](docs/DEPLOY.md) |
| `deploy.sh` | Script de deploy com backup e rollback automático |

## Deploy

Veja [docs/DEPLOY.md](docs/DEPLOY.md): Ubuntu, nginx, pm2, HTTPS e as notas de segurança (limite de login, `JWT_SECRET`, usuário do banco).

## Licença

O **código** é [MIT](LICENSE).

A **arte das classes** (`front/public/classes/`) foi **gerada com IA** e fica fora da licença MIT: se for reutilizá-la, confira os termos da ferramenta de IA usada. Os **textos das classes e condições** (`back/prisma/seed/`) também ficam fora da MIT: todos os direitos reservados. Para usá-los em outro projeto, peça permissão.
