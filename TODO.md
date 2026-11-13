# A fazer

As regras do jogo estão em [COMBATE.md](COMBATE.md).

**Fases 1 a 4 feitas no código** (back com 75 testes e2e passando; front compila). Falta só aplicar no servidor (ver abaixo) e conferir a tela.

## Para aplicar no servidor

1. No banco, antes do deploy:
   ```sql
   ALTER TABLE "log_entries" ADD COLUMN "masterMessage" TEXT;
   ALTER TABLE "log_entries" ADD COLUMN "pendingAction" JSONB;
   ALTER TABLE "abilities" ADD COLUMN "dealsDamage" BOOLEAN NOT NULL DEFAULT false;
   ALTER TABLE "abilities" ADD COLUMN "prompt" TEXT;
   ALTER TABLE "characters" ADD COLUMN "instability" INTEGER NOT NULL DEFAULT 0;
   ```
2. `./deploy.sh`.
3. Depois do deploy, `npm run db:seed` em `~/Cronos/back` (vida base 30, marca os 7 ataques e a pergunta do *Tudo ou Nada*).
4. Os jogadores reabrem o app (o PWA antigo em cache espera os números de vida dos inimigos).

## Para conferir na tela (não foi aberto no navegador)

- Jogador: declarar com alvo (inimigo, aliado, si mesmo), card do inimigo com a faixa de saúde, barra de instabilidade, Frenesi (40%), efeito de subir de nível, vibração na vez.
- Mestre: fila "Aguardando você" com a grade do d20, Resolver e Negar; criar vários inimigos de uma vez; anotações do inimigo.

## Decisões em aberto / depois

- **Loja e poções de mana.** Precisa de moeda (não existe no esquema) e de item usável pelo jogador (hoje o inventário é só do mestre). Até lá o mestre devolve a mana pelo botão Mana.
- **Modelos prontos de inimigo** ("Goblin") para criar sem digitar nome e vida.
- **Necromante:** *Reanimar* escolhendo entre inimigos **caídos** ("depende do cadáver usado").
- **Iniciativa.** A ordem é a de entrada na campanha, ajustada com setas. Com o d20 físico, o mestre poderia digitar a iniciativa de cada um e o sistema ordenaria.
- **Duração das condições fora do combate.** `endTurnOf` só roda no `combat/next`; uma condição de 3 turnos aplicada fora de combate não expira sozinha.
- **Crônica da sessão.** Ao encerrar, o jogador relê o log narrado como diário.
- **Personagem preso à campanha.** Campanha nova começa personagem novo no nível 1.
- **Mercador:** *Troca Justa* é Narrativa (o mestre edita o inventário se precisar trocar item).
- **Duas ações ao mesmo tempo:** a trava de "uma ação aguardando por vez" é checada dentro da transação, mas sem bloqueio forte; um duplo clique muito rápido poderia passar.
