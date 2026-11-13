# Combate do Cronos

Rascunho para você corrigir. Texto simples, sem código. Se algo estiver errado, risque ou reescreva; depois disso o TODO é ajustado para bater com esta página.

## Princípios

1. A mesa é física. Os dados são físicos e a conversa é o jogo. O app só apoia.
2. O mestre controla o que é informação dele: a vida dos inimigos, o d20 e o dano.
3. O sistema **não** valida falha nem teste de perícia. Fora de combate o mestre pede o d20 no roleplay e narra o resultado.
4. Em combate o d20 serve para **dano** e para **crítico**. Nada mais.

## Um turno, do ponto de vista da mesa

1. O jogador diz em voz alta o que faz e, no celular, toca na habilidade e escolhe o alvo. A mana é cobrada na hora.
2. O jogador rola o d20 físico na mesa.
3. O mestre digita esse número (grade de 1 a 20) no cartão da ação, na fila dele.
4. O sistema resolve, conforme o tipo da habilidade (tabela abaixo).
5. Se o mestre negar a ação, a mana volta.
6. O jogador lê no log o que aconteceu, narrado e sem números do inimigo.

O mestre rola o d20 dos inimigos por conta própria e aplica o dano pelo botão Dano que já existe na ficha do jogador.

## Os três tipos de habilidade

| Tipo | O que o mestre digita | O que o sistema faz |
|---|---|---|
| **Ataque** | O d20 | O número vira o dano no alvo. 5 de d20 = 5 de dano. Nada além disso. |
| **Efeito** | Nada (só confirma o alvo, se for inimigo) | Aplica condição, invocação ou marca. |
| **Narrativa** | Nada | Só registra no log. O resto é a mesa. |

**Crítico** é um extra opcional em qualquer tipo. As habilidades que têm faixa (18, 19, 20) ganham o efeito extra, calculado do mesmo número do d20. Qualquer habilidade com faixa de crítico passa pelo mestre, mesmo as de Efeito ou Narrativa. Uma habilidade sem faixa **não** tem crítico, nem as básicas: um 20 num *Golpe Pesado* são 20 de dano normal.

O texto das habilidades pode citar efeitos ("pode deixar o alvo hesitante"). Se o sistema não aplica, é narração do mestre.

## Alvos

- **Aliado ou si mesmo:** o jogador escolhe e aplica direto, sem esperar o mestre.
- **Inimigo:** o jogador escolhe pelo nome na lista de inimigos em cena. O mestre vê o cartão com o alvo preenchido e toca em Confirmar ou Negar.

## O que cada um vê do inimigo

| | Jogador | Mestre |
|---|---|---|
| Nome e condições | Sim | Sim |
| Estado | Faixa: Intacto, Ferido, Muito ferido, Por um fio, Caído | Faixa e números |
| Vida, anotações privadas, d20 e dano | Não | Sim |
| Foto | Não fica no card; o mestre mostra imagens quando quiser | Sim |

Inimigos **não têm habilidades** no sistema. O turno do mestre é o turno do mundo: ele narra e usa Dano e Condição nas fichas.

## Turnos e condições

- O mestre abre a rodada, depois vêm os jogadores. A ordem é uma trava: o turno só muda quando o jogador passa a vez.
- Condições com duração descontam no fim do turno de quem as carrega. Sangrando, por exemplo, tira vida a cada fim de turno.
- Quem tem uma condição de "perde a vez" é pulado.
- O mestre pode desfazer qualquer ação, e o desfazer devolve só o que aquela ação mudou.

## Classificação das 36 habilidades

**Ataque (7):** *Golpe Pesado*, *Execução*\*, *Golpe Serrilhado*, *Passo Predatório*\*, *Toque Fúnebre*, *Corte Furtivo*, *Estilhaço Temporal*.

**Efeito (10)**, já marcadas no `classes.json`: *Lua Rubra*, *Máscara da Serenidade*\*, *Máscara do Carrasco*\*, *Máscara Vazia*, *Dívida*, *Reanimar*\*, *Sacrifício Macabro*, *Caçada Escarlate*\*, *Olhar Distante*, *Surdez Voluntária*.

**Narrativa (19):** *Cara ou Coroa*, *Blefe*, *Tudo ou Nada*, *Sorte Roubada*, *Pressão*, *Rosto Vazio*, *Mãos Leves*, *Oferta Irrecusável*, *Troca Justa*, *Voz dos Mortos*\*, *Furto Rápido*\*, *Véu Cego*, *Roubo Sensorial*\*, *Dilatação*\*, *Aceleração*\*, *Fratura Temporal*\*, *Tiro de Estilhaço*\*, *Truque Sujo*\*, *Gancho de Corrente*\*.

\* = tem faixa de crítico.

*Troca Justa* (Mercador) é Narrativa. Se for preciso trocar um item, o mestre edita o inventário.

## Regras de personagem

- **Vida:** base 30 para todas as classes. A cada nível subido, +2 de vida máxima (nível 1 = 30, nível 2 = 32, e assim por diante).
- **Subir de nível:** aparece um efeito na tela do jogador.
- **Mana:** não regenera sozinha. Só volta com poção de mana. Por enquanto o mestre devolve pelo botão Mana quando o jogador bebe a poção. A loja para comprar poções fica para depois.
- **0 de vida:** o personagem aparece como Caído e não age.
- **Turnos:** são uma trava. A vez só passa quando o jogador encerra o turno.

## Como ficou no sistema

Tudo acima está implementado. Detalhes e números que eu precisei escolher (ajuste no arquivo indicado):

- Ao subir de nível, a vida atual também sobe 2, além do máximo. Descer de nível tira o mesmo tanto. `back/src/game/rules.ts` (`HP_PER_LEVEL`).
- Caído é pulado na ordem dos turnos, como quem perde a vez, e volta a agir quando é curado. O mestre continua podendo passar o turno de qualquer um.
- O efeito de subir de nível aparece só na tela de quem subiu (os outros veem o log). No modo leve ele fica simples.
- Personagens já criados com 20 de vida não mudam sozinhos; o mestre ajusta pela ficha.
- Cada jogador tem uma ação aguardando o mestre por vez. Enquanto espera, não declara outra.
- **Faixas de saúde do inimigo:** Intacto (100%), Ferido (>50%), Muito ferido (>25%), Por um fio (>0) e Caído (0). `back/src/game/health.ts`.
- **Instabilidade temporal (Tecelão):** +1 a cada habilidade usada; ao chegar em 5 vem o paradoxo e volta a 0. (Confirmado.) `INSTABILITY_LIMIT` em `rules.ts` (e a cópia em `front/src/utils/classHooks.ts`).
- **Frenesi (Caçador):** ativo com a vida em 40% ou menos (e acima de 0). `FRENZY_PERCENT` em `front/src/utils/classHooks.ts`.
- **Oportunidade (Raposa) e Condenado (Carrasco):** são narrativos. O app não acende selo nem calcula nada; quem diz que o inimigo está exposto é o mestre, na cena.
