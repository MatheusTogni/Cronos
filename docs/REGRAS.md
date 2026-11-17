# Como funciona e regras da mesa

Este documento descreve o que o app faz durante o jogo e as regras que ele aplica. A ideia central: a mesa é física, os dados são físicos e **o mestre resolve tudo**. O app só registra e dá apoio.

## Logins

Não existe cadastro aberto. O mestre cria os logins em *Usuários* e escolhe o papel (Jogador ou Mestre). Depois do login, cada um vê só a interface do seu papel.

## Campanha

1. O mestre cria a campanha (em preparação) e clica em **Abrir lobby**.
2. Os jogadores veem a campanha em *Campanhas abertas* (a lista atualiza sozinha) e clicam em **Entrar**.
3. Cada jogador escolhe a classe, dá nome ao personagem e aperta **Estou pronto**. Trocar de classe cancela o pronto.
4. Quando todos estão prontos, o mestre aperta **Começar aventura**.

## Durante a aventura

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

  Os itens de **cura** são o único efeito automático do app; nos demais, usar só grava no log e tira 1 do inventário (Corda e Gazua não se gastam). Item de cura com a vida/mana já cheia pede confirmação antes de gastar. Usar item segue a regra das skills: em combate só na vez, e quem está caído não usa. O catálogo fica em [`back/src/game/shop.ts`](../back/src/game/shop.ts) (e o espelho em [`front/src/utils/shop.ts`](../front/src/utils/shop.ts)).
- **Doações e trocas:** um jogador pode **dar** um item ou ouro, ou **trocar** um item por um item do inventário de outro jogador (ouro só em doação). Ele escolhe o item, a quantidade e a pessoa; na tela de quem recebe aparece um **popup de aceitar ou recusar**, e só então os itens se movem. Fora de combate qualquer um oferece a qualquer momento; em combate só quem está na vez (quem recebe responde sempre). Cada jogador tem uma oferta aberta por vez e pode cancelá-la. Nada fica reservado: se o item mudou antes do aceite, a oferta cai. Só o resultado aceito vai ao log, e o mestre pode desfazer.
- **Combate:** o mestre abre cada rodada ("o mundo reage") e a ordem dos personagens é uma trava: a vez só passa quando o jogador a passa (o mestre pode passar a de qualquer um). O celular vibra na vez do jogador (não funciona no iPhone, onde o aviso é só visual).
- **Ganchos de classe:** o sistema só acende o *Frenesi* (Caçador com 40% de vida ou menos). O resto da mecânica de cada classe, como a *Oportunidade* da Raposa Vermelha, a *Condenação* do Carrasco e a *Instabilidade* do Tecelão, é narração do mestre: o app não calcula.
- **Log:** tudo vai para o log da mesa. O mestre pode **desfazer** qualquer ação. O desfazer devolve só o que aquela ação mudou: desfazer um dano depois de uma cura não apaga a cura.

## Mudar as classes

Edite [`back/prisma/seed/classes.json`](../back/prisma/seed/classes.json) e rode `npm run db:seed` (em `back/`).

- **Vida e mana iniciais** (`baseHp`/`baseMana`): vida 30 e mana 10 em todas as classes, no nível 1. Os ganhos por nível (+3 de vida, +2 de mana), o nível máximo (15) e os níveis das skills (1, 5 e 10) ficam em [`back/src/game/rules.ts`](../back/src/game/rules.ts) (e o espelho dos números em [`front/src/utils/classHooks.ts`](../front/src/utils/classHooks.ts)).
- **Habilidades:** cada classe tem 3 skills (`kind: "SKILL"`) com `name`, `manaCost` e `description`, **na ordem em que são liberadas** (a 1ª no nível 1, a 2ª no 5, a 3ª no 10; o seed grava isso em `unlockLevel`). Não há ataque básico, dano, efeito nem pergunta: o mestre resolve tudo.
- **Críticos:** `crits` (`[{ "min": 18, "max": 20, "text": "..." }]`) é opcional e só aparece como texto de referência.
- **Condições** ([`back/prisma/seed/conditions.json`](../back/prisma/seed/conditions.json)): só `id`, `name`, `description` e `polarity`.
- **Banco:** o seed apaga as habilidades que saíram do JSON. Tirar campos do `schema.prisma` não exige `ALTER`: o Prisma ignora colunas que sobram no banco.
