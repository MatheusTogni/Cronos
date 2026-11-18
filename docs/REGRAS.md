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

- **Jogador:** a ficha é enxuta para o celular: na página ficam o retrato, o ouro, a vida, a mana, as condições, as habilidades e as invocações; a **mochila**, o **Doar / Trocar** e as **anotações** abrem por atalhos com ícone. O jogador diz na mesa o que vai fazer e, se for usar uma skill, toca nela e confirma: o app **só gasta a mana e registra no log**. Não há ataque básico nem escolha de alvo, e nada acontece sozinho.
- **Mestre:** decide e aplica tudo pela interface dele. Dano, Cura, Mana, XP/Nível, Condição, Dar item, Tirar item, Criatura e Editar ficha (em personagens, criaturas e inimigos) são ações rápidas. Também narra no log, rola dados, envia imagens e escolhe qual mostrar na tela dos jogadores, **para todos ou só para os jogadores que escolher** (apoio à narração, para descrever um monstro ou um lugar). A imagem aparece sem título. Mostrada só a alguns, ela não fica guardada: chega na hora e some se o jogador recarregar a página. Quando um jogador usa uma skill, a linha aparece no log da mesa ("Fulano usou X (−2 mana)") e o mestre pode desfazer.
- **Skills:** cada classe tem 3. O app guarda nome, custo de mana, descrição e as faixas de crítico, que são só texto de referência (o mestre decide o que cada uma faz). Quem começa só tem a **1ª** liberada; a **2ª** abre no nível **5** e a **3ª** no nível **10**. Antes disso a skill aparece trancada na ficha ("Libera no nível 5") e o servidor recusa o uso.
- **Inimigos:** são só do mestre. O jogador **não vê nada deles**: nem o nome, nem a barra de vida, nem o estado, nem as condições. O servidor nem manda os inimigos aos jogadores, e as linhas do log sobre eles (entrar em cena, dano, cura, condição, sair de cena e o "Desfeito" delas) só aparecem para o mestre. O que o jogador sabe do inimigo é o que o mestre fala na mesa.
- **Condições:** são um status à mostra, sem prazo e sem efeito automático. O mestre coloca, decide o que acontece e tira. Passar o turno não mexe em vida nem em duração. Quando o mestre coloca uma condição, a **carta dela aparece girando na tela do jogador** (a mesma arte da galeria de condições, com vibração no celular); tirar a condição não faz efeito nenhum.
- **Vida, mana e nível:** todas as classes começam no **nível 1** com 30 de vida e 10 de mana. O nível vai até **15** e quem sobe é o mestre (botão XP/Nível). A cada nível o personagem ganha **+3 de vida e +2 de mana**, máximas e atuais (no 15: 72 de vida e 38 de mana). O log diz o que subiu e quais skills abriram, e o efeito de subir de nível aparece na tela do jogador. Descer de nível tira o mesmo tanto. Com 0 de vida o personagem fica **Caído**: não age e perde a vez no combate até ser curado.
- **Mana:** não regenera sozinha; volta com a Poção de Mana da loja (ou o mestre devolve pelo botão Mana).
- **Mochila:** cada jogador carrega até **9 itens diferentes**, em quadradinhos de 3×3 como um baú. O mesmo item soma a quantidade no mesmo quadradinho (sem limite de unidades). Cada quadradinho mostra o ícone do item e, se houver mais de um, a quantidade; ao tocar, abre o que o item faz, com **Usar** (só os da loja), **Dar** e **Trocar**. O mestre dá e tira itens pelo menu **⋯** do card do jogador (**Dar item** e **Tirar item**; ao tirar, escolhe o item na mesma grade e, se houver mais de uma unidade, quantas tirar; vai para o log e dá para desfazer). Com a mochila cheia, só entra mais do que o jogador já tem: a loja, o item que o mestre dá e a oferta de outro jogador são recusados, e o servidor confere isso. Item dado à mão pelo mestre usa o ícone do catálogo se tiver o mesmo nome de um item da loja, um ícone pelo nome (chave, espada, mapa…) ou um baú. É a mesma pilha quando o código do catálogo é igual ou, na falta dele, o nome é igual (sem diferenciar maiúsculas e acentos). O código está em [`back/src/game/backpack.ts`](../back/src/game/backpack.ts) (e o espelho em [`front/src/utils/backpack.ts`](../front/src/utils/backpack.ts)).
- **Ouro:** cada jogador tem o próprio ouro, que aparece no cabeçalho da ficha. Ao **encerrar um combate**, todo jogador recebe 3 moedas. O mestre também dá e tira ouro pelo botão **Ouro** do card do jogador (Dar/Tirar, com Desfazer), por exemplo para corrigir um combate encerrado por engano.
- **Mercador:** o mestre abre e fecha a loja pelo card **Mercador**. Ao abrir, a tela dos jogadores mostra portas se abrindo e o estande, com os itens em prateleiras; o jogador compra com o próprio ouro (uma unidade por clique, a compra soma na pilha). O jogador não sai da loja: ela fica na tela até o mestre fechar. Ao fechar, as portas se fecham de volta (o inverso da abertura) e, enquanto isso, comprar e rolar a tela não respondem. As animações somem no modo leve e com movimento reduzido. O mestre pode desfazer uma compra pelo log.

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
- **Doações e trocas:** um jogador pode **dar** um item ou ouro, ou **trocar** um item por um item do inventário de outro jogador (ouro só em doação). Pelo atalho **Doar / Trocar** da ficha ele escolhe Dar, Trocar ou Ouro; pela mochila, o item já vem escolhido. Ele escolhe o item, a quantidade e a pessoa; na tela de quem recebe aparece um **popup de aceitar ou recusar**, e só então os itens se movem. Fora de combate qualquer um oferece a qualquer momento; em combate só quem está na vez (quem recebe responde sempre). Cada jogador tem uma oferta aberta por vez e pode cancelá-la. Nada fica reservado: se o item mudou antes do aceite, a oferta cai. Só o resultado aceito vai ao log, e o mestre pode desfazer.
- **Combate:** só o mestre inicia e encerra. O mestre abre cada rodada ("o mundo reage") e a ordem dos personagens é uma trava: a vez só passa quando o jogador a passa (o mestre pode passar a de qualquer um). O celular vibra na vez do jogador (não funciona no iPhone, onde o aviso é só visual). Ao **começar** o combate aparece na tela de todos um efeito (espadas que se cruzam num clarão vermelho, "Combate!") e ao **terminar** outro (bandeira dourada, quantas rodadas houve e o +3 de ouro de cada jogador); eles não bloqueiam a tela, só tocam com a tela aberta e viram um aviso simples no modo leve e com movimento reduzido. **Em combate, as 3 habilidades da ficha viram 3 quadradinhos lado a lado**, da que libera primeiro (à esquerda) à que libera por último, cada um com a **ilustração da skill** (recortada da carta da classe, em [`front/src/utils/skillArt.ts`](../front/src/utils/skillArt.ts); uma classe nova precisa dos 3 recortes, senão o quadradinho mostra só o número); tocar usa (com a mesma confirmação de sempre) e **segurar o dedo (ou passar o mouse) mostra os detalhes** sem usar nada. Fora de combate continua a lista de habilidades.
- **Ganchos de classe:** o sistema só acende o *Frenesi* (Caçador com 40% de vida ou menos). O resto da mecânica de cada classe, como a *Oportunidade* da Raposa Vermelha, a *Condenação* do Carrasco e a *Instabilidade* do Tecelão, é narração do mestre: o app não calcula.
- **Log:** tudo vai para o log da mesa. O mestre pode **desfazer** qualquer ação. O desfazer devolve só o que aquela ação mudou: desfazer um dano depois de uma cura não apaga a cura.

## Mudar as classes

Edite [`back/prisma/seed/classes.json`](../back/prisma/seed/classes.json) e rode `npm run db:seed` (em `back/`).

- **Vida e mana iniciais** (`baseHp`/`baseMana`): vida 30 e mana 10 em todas as classes, no nível 1. Os ganhos por nível (+3 de vida, +2 de mana), o nível máximo (15) e os níveis das skills (1, 5 e 10) ficam em [`back/src/game/rules.ts`](../back/src/game/rules.ts) (e o espelho dos números em [`front/src/utils/classHooks.ts`](../front/src/utils/classHooks.ts)).
- **Habilidades:** cada classe tem 3 skills (`kind: "SKILL"`) com `name`, `manaCost` e `description`, **na ordem em que são liberadas** (a 1ª no nível 1, a 2ª no 5, a 3ª no 10; o seed grava isso em `unlockLevel`). Não há ataque básico, dano, efeito nem pergunta: o mestre resolve tudo.
- **Críticos:** `crits` (`[{ "min": 18, "max": 20, "text": "..." }]`) é opcional e só aparece como texto de referência.
- **Condições** ([`back/prisma/seed/conditions.json`](../back/prisma/seed/conditions.json)): só `id`, `name`, `description` e `polarity`.
- **Banco:** o seed apaga as habilidades que saíram do JSON. Tirar campos do `schema.prisma` não exige `ALTER`: o Prisma ignora colunas que sobram no banco.
