<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useCampaignStore } from '@/stores/campaign'
import { useLiteStore } from '@/stores/lite'
import { buzz } from '@/utils/haptics'
import { COMBAT_REWARD_GOLD } from '@/utils/shop'

/**
 * Efeito de tela quando o combate começa (espadas que se cruzam num clarão
 * vermelho) e quando termina (bandeira dourada, rodadas e o ouro de cada
 * jogador). Aparece para o mestre e para os jogadores, sem bloquear a tela.
 *
 * Só dispara quando o combate muda com a tela aberta: abrir a campanha no meio
 * de um combate, reconectar, ou o mestre encerrar a campanha inteira não contam.
 * No modo leve e com movimento reduzido fica só o aviso, sem animação.
 */
const campaign = useCampaignStore()
const lite = useLiteStore()

type Kind = 'start' | 'end'
const kind = ref<Kind | null>(null)
/** Muda a cada efeito, para as animações recomeçarem se um vier logo depois do outro. */
const run = ref(0)
/** A rodada em que o combate está, para dizer quantas houve quando ele acabar. */
const rounds = ref(1)
let timer: ReturnType<typeof setTimeout> | undefined

/** null = a campanha ainda não carregou (aí só se aprende o estado, sem efeito). */
const inCombat = computed(() => (campaign.state ? !!campaign.state.combat : null))

watch(
  () => campaign.combat?.round,
  (round) => {
    if (round) rounds.value = round
  },
  { immediate: true },
)

watch(inCombat, (now, before) => {
  if (now === null || before === null || before === undefined || now === before) return
  // encerrar a campanha também desliga o combate, mas aí não há fim de combate nem ouro
  if (campaign.state?.status !== 'ACTIVE') return
  play(now ? 'start' : 'end')
})

function play(next: Kind) {
  clearTimeout(timer)
  kind.value = next
  run.value++
  if (!campaign.isMaster) buzz(next === 'start' ? [150, 70, 150, 70, 260] : [120, 60, 200])
  const ms = lite.lite ? 1800 : next === 'start' ? 2400 : 2800
  timer = setTimeout(() => (kind.value = null), ms)
}

onBeforeUnmount(() => clearTimeout(timer))

const title = computed(() => (kind.value === 'start' ? 'Combate!' : 'Combate encerrado'))
const sub = computed(() =>
  kind.value === 'start'
    ? 'Rodada 1 — o mundo reage'
    : `${rounds.value} ${rounds.value === 1 ? 'rodada' : 'rodadas'}`,
)
/** O ouro do fim do combate é só dos jogadores. */
const reward = computed(() => kind.value === 'end' && !campaign.isMaster)
</script>

<template>
  <Teleport to="body">
    <Transition name="cfx">
      <div v-if="kind" :key="run" class="cfx" :class="kind" role="status" aria-live="polite">
        <div class="veil" aria-hidden="true" />
        <div class="flash" aria-hidden="true" />
        <div class="slash s1" aria-hidden="true" />
        <div class="slash s2" aria-hidden="true" />
        <div class="ring" aria-hidden="true" />

        <div class="stage">
          <div class="emblem" aria-hidden="true">
            <v-icon :icon="kind === 'start' ? 'mdi-sword-cross' : 'mdi-flag-checkered'" size="60" />
          </div>
          <div class="title title-font">{{ title }}</div>
          <div class="sub">{{ sub }}</div>
          <div v-if="reward" class="reward">
            <v-icon icon="mdi-circle-multiple" size="small" /> +{{ COMBAT_REWARD_GOLD }} de ouro
          </div>
        </div>

        <div v-if="reward" class="coins" aria-hidden="true">
          <v-icon v-for="n in 7" :key="n" icon="mdi-circle-multiple" class="coin" :style="{ '--n': n }" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* acima dos diálogos (2400) e da loja (2000); não bloqueia nada */
.cfx {
  --tone: 217, 70, 61;
  position: fixed;
  inset: 0;
  z-index: 2800;
  display: grid;
  place-items: center;
  overflow: hidden;
  pointer-events: none;
}

.cfx.end {
  --tone: 212, 160, 76;
}

/* escurece a tela e tinge as bordas */
.veil {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at center,
    rgba(5, 2, 8, 0.62) 0%,
    rgba(var(--tone), 0.5) 78%,
    rgba(18, 4, 4, 0.92) 100%
  );
  animation: veil 0.45s ease-out both;
}

/* clarão do choque das espadas */
.flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 46%, rgba(255, 255, 255, 0.9), rgba(255, 205, 160, 0.35) 34%, transparent 62%);
  opacity: 0;
  animation: flash 0.7s ease-out 0.5s both;
}

.cfx.end .flash {
  background: radial-gradient(circle at 50% 46%, rgba(255, 244, 214, 0.75), rgba(240, 205, 90, 0.3) 34%, transparent 62%);
  animation-delay: 0.35s;
}

/* duas lâminas cortando a tela de lados opostos (só no começo) */
.slash {
  position: absolute;
  left: -20%;
  top: 50%;
  width: 140%;
  height: 4px;
  background: linear-gradient(90deg, transparent, #fff 45%, rgb(var(--tone)) 55%, transparent);
  box-shadow: 0 0 18px rgba(var(--tone), 0.9);
  opacity: 0;
}

.slash.s1 {
  animation: slash-a 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) 0.25s both;
}

.slash.s2 {
  animation: slash-b 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) 0.35s both;
}

.cfx.end .slash {
  display: none;
}

/* onda de choque saindo do emblema */
.ring {
  position: absolute;
  left: 50%;
  top: 46%;
  width: 80px;
  height: 80px;
  margin: -40px 0 0 -40px;
  border-radius: 50%;
  border: 3px solid rgba(var(--tone), 0.9);
  opacity: 0;
  animation: ring 1s ease-out 0.55s both;
}

.stage {
  position: relative;
  padding: 0 24px;
  text-align: center;
}

.emblem {
  display: inline-grid;
  place-items: center;
  width: 108px;
  height: 108px;
  border-radius: 50%;
  color: #fff4e0;
  border: 2px solid rgba(243, 211, 145, 0.7);
  background: radial-gradient(
    circle at 35% 30%,
    color-mix(in srgb, rgb(var(--tone)), #fff 25%),
    rgb(var(--tone)) 45%,
    color-mix(in srgb, rgb(var(--tone)), #000 55%)
  );
  box-shadow:
    0 0 0 5px rgba(0, 0, 0, 0.5),
    0 0 40px rgba(var(--tone), 0.8);
  animation: emblem 0.7s cubic-bezier(0.2, 0.9, 0.3, 1.3) 0.15s both;
}

.title {
  margin-top: 14px;
  font-size: clamp(2.2rem, 12vw, 3.6rem);
  line-height: 1.05;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  background: var(--gold-text);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 3px 10px rgba(0, 0, 0, 0.85));
  animation: title 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.1) 0.5s both;
}

.cfx.end .title {
  font-size: clamp(1.8rem, 9.5vw, 2.8rem);
}

.sub {
  margin-top: 8px;
  font-size: 1.05rem;
  letter-spacing: 0.08em;
  color: #f0dfc0;
  text-shadow: 0 2px 8px #000;
  animation: rise 0.5s ease-out 0.95s both;
}

.reward {
  margin-top: 10px;
  font-family: var(--font-title);
  font-size: 1.2rem;
  color: var(--gold-bright);
  text-shadow:
    0 0 14px rgba(240, 205, 90, 0.7),
    0 2px 6px #000;
  animation: pop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.4) 1.2s both;
}

/* moedas subindo (só no fim, só para jogadores) */
.coins {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.coin {
  position: absolute;
  bottom: -8%;
  left: calc(6% + var(--n) * 12%);
  color: var(--gold-bright);
  font-size: 26px !important;
  opacity: 0;
  filter: drop-shadow(0 0 8px rgba(240, 205, 90, 0.8));
  animation: coin 2.2s ease-out calc(0.5s + var(--n) * 0.11s) both;
}

.cfx-leave-active {
  transition: opacity 0.6s ease;
}

.cfx-leave-to {
  opacity: 0;
}

@keyframes veil {
  from {
    opacity: 0;
  }
}

@keyframes flash {
  0% {
    opacity: 0;
  }
  15% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
  }
}

@keyframes slash-a {
  0% {
    opacity: 0;
    transform: rotate(-24deg) translateX(-110%);
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: rotate(-24deg) translateX(110%);
  }
}

@keyframes slash-b {
  0% {
    opacity: 0;
    transform: rotate(24deg) translateX(110%);
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: rotate(24deg) translateX(-110%);
  }
}

@keyframes ring {
  0% {
    opacity: 0.9;
    transform: scale(0.3);
  }
  100% {
    opacity: 0;
    transform: scale(7);
  }
}

@keyframes emblem {
  from {
    opacity: 0;
    transform: scale(2.6) rotate(-35deg);
  }
  60% {
    opacity: 1;
  }
  to {
    transform: scale(1) rotate(0);
  }
}

@keyframes title {
  from {
    opacity: 0;
    letter-spacing: 0.5em;
    transform: scale(1.25);
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
}

@keyframes coin {
  0% {
    opacity: 0;
    transform: translateY(0) scale(0.6);
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-70vh) rotate(180deg) scale(1.1);
  }
}

/* modo leve e movimento reduzido: só o aviso, sem choque nem moedas */
:global(html.lite) .cfx .flash,
:global(html.lite) .cfx .slash,
:global(html.lite) .cfx .ring,
:global(html.lite) .cfx .coins {
  display: none;
}

:global(html.lite) .cfx .veil,
:global(html.lite) .cfx .emblem,
:global(html.lite) .cfx .title,
:global(html.lite) .cfx .sub,
:global(html.lite) .cfx .reward {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .flash,
  .slash,
  .ring,
  .coins {
    display: none;
  }

  .veil,
  .emblem,
  .title,
  .sub,
  .reward {
    animation: none;
  }
}
</style>
