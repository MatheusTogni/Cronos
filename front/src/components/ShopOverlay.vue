<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PotionBottle from '@/components/PotionBottle.vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useNotifyStore } from '@/stores/notify'
import type { ActionResult } from '@/types/api'
import { BACKPACK_SLOTS, hasRoomFor } from '@/utils/backpack'
import { SHOP_GROUPS, SHOP_ITEMS, type ShopItem } from '@/utils/shop'

/**
 * A loja do mercador na tela do jogador: as portas se abrem e aparece o
 * estande, com os itens em prateleiras. Quem abre e fecha é só o mestre: o
 * jogador não sai por conta própria. Quando o mestre fecha, as portas se
 * fecham de volta (o inverso da abertura) e, enquanto isso, nada no estande
 * responde (nem comprar, nem rolar).
 * No modo leve e com movimento reduzido não há portas: o estande só some.
 */
const props = defineProps<{ open: boolean }>()

/** Tempo das portas se fechando (a animação) mais um respiro com elas fechadas. */
const CLOSE_MS = 1700

/** O estande está na tela: da abertura até as portas terminarem de fechar. */
const shown = ref(props.open)
/** As portas estão se fechando: o estande fica travado. */
const closing = ref(false)
const doors = ref<HTMLElement | null>(null)
let closeTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.open,
  (isOpen) => {
    clearTimeout(closeTimer)
    if (isOpen) {
      closing.value = false
      shown.value = true
      return
    }
    if (!shown.value) return
    // sem portas (modo leve, movimento reduzido) o estande só some, sem espera
    const hasDoors = !!doors.value && getComputedStyle(doors.value).display !== 'none'
    closing.value = hasDoors
    closeTimer = setTimeout(
      () => {
        shown.value = false
        closing.value = false
      },
      hasDoors ? CLOSE_MS : 0,
    )
  },
)
onBeforeUnmount(() => clearTimeout(closeTimer))

const campaign = useCampaignStore()
const notify = useNotifyStore()

const me = computed(() => campaign.myCharacter)
const gold = computed(() => me.value?.gold ?? 0)

const shelves = computed(() =>
  SHOP_GROUPS.map((g) => ({ ...g, items: SHOP_ITEMS.filter((i) => i.group === g.id) })).filter((g) => g.items.length),
)

/** Quantos o jogador já tem deste item (some as pilhas). */
const owned = (code: string) =>
  me.value?.inventory.filter((i) => i.code === code).reduce((sum, i) => sum + i.qty, 0) ?? 0

const inventory = computed(() => me.value?.inventory ?? [])
/** Mochila cheia (9 itens diferentes): só dá para comprar o que já tem pilha. */
const noRoom = (item: ShopItem) => !hasRoomFor(inventory.value, item)

const buying = ref<string | null>(null)
async function buy(item: ShopItem) {
  const c = me.value
  if (!c || buying.value || closing.value || noRoom(item)) return
  buying.value = item.code
  const result = { log: null as ActionResult['log'] }
  const ok = await campaign.act(async () => {
    const res = await api.post<ActionResult>(`/characters/${c.id}/shop/buy`, { item: item.code })
    result.log = res.data.log
    return res
  })
  buying.value = null
  if (ok && result.log) notify.success(result.log.message)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="shop">
      <div v-if="shown" class="shop" :class="{ closing }" role="dialog" aria-modal="true" aria-label="Loja do mercador">
        <!-- o estande, atrás das portas -->
        <div class="scene">
          <header class="awning" aria-hidden="true" />
          <div class="sign title-font">Mercador</div>

          <div class="bar">
            <span class="purse" :title="`Você tem ${gold} moedas de ouro`">
              <v-icon icon="mdi-circle-multiple" size="small" />
              <strong>{{ gold }}</strong> de ouro
            </span>
            <span class="purse pack" :class="{ full: inventory.length >= BACKPACK_SLOTS }" title="Itens diferentes na mochila">
              <v-icon icon="mdi-bag-personal" size="small" />
              <strong>{{ inventory.length }}/{{ BACKPACK_SLOTS }}</strong>
            </span>
          </div>

          <div class="counter">
            <section v-for="shelf in shelves" :key="shelf.id" class="shelf">
              <h3 class="title-font">{{ shelf.title }}</h3>
              <div class="grid">
                <article v-for="item in shelf.items" :key="item.code" class="item">
                  <div class="art">
                    <PotionBottle v-if="item.bottle" :color="item.bottle" :size="52" />
                    <v-icon v-else :icon="item.icon" size="48" class="art-icon" />
                  </div>
                  <div class="name title-font">{{ item.name }}</div>
                  <div class="desc">{{ item.description }}</div>
                  <div v-if="owned(item.code)" class="have">Você tem {{ owned(item.code) }}</div>
                  <div v-if="noRoom(item)" class="nospace">Mochila cheia</div>
                  <div class="buy">
                    <span class="price" :class="{ poor: gold < item.price }">
                      <v-icon icon="mdi-circle-multiple" size="x-small" /> {{ item.price }}
                    </span>
                    <v-btn
                      size="small"
                      color="secondary"
                      variant="flat"
                      :disabled="gold < item.price || closing || noRoom(item)"
                      :loading="buying === item.code"
                      :aria-label="`Comprar ${item.name} por ${item.price} de ouro`"
                      @click="buy(item)"
                    >
                      Comprar
                    </v-btn>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </div>

        <!-- as portas: abrem e somem; quando o mestre fecha a loja, voltam e se fecham -->
        <div ref="doors" class="doors" aria-hidden="true">
          <div class="glow" />
          <div class="door left"><span class="ring" /></div>
          <div class="door right"><span class="ring" /></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* abaixo dos diálogos do Vuetify (2400): o popup de oferta e as confirmações aparecem por cima */
.shop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  overflow: hidden;
  background: #0a0709;
}

/* ───────────── estande ───────────── */

.scene {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(ellipse at 50% 25%, rgba(255, 190, 110, 0.12), transparent 60%),
    repeating-linear-gradient(90deg, #2b1a10 0 46px, #24150d 46px 48px),
    #20130b;
  animation: scene-light 1.4s ease-out 0.9s both;
}

.awning {
  position: relative;
  flex: 0 0 auto;
  height: 46px;
  background: repeating-linear-gradient(90deg, #a8322b 0 28px, #f1e4c6 28px 56px);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.55);
}

/* bainha em ondas, no mesmo ritmo das listras */
.awning::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: 14px;
  background:
    radial-gradient(circle at 14px 0, #a8322b 13px, transparent 14px) 0 0 / 56px 14px repeat-x,
    radial-gradient(circle at 42px 0, #f1e4c6 13px, transparent 14px) 0 0 / 56px 14px repeat-x;
}

.sign {
  align-self: center;
  margin-top: 22px;
  padding: 6px 26px;
  font-size: 1.35rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gold-bright);
  background: linear-gradient(180deg, #4a2d17, #34200f);
  border: 1px solid var(--gold-deep);
  border-radius: 6px;
  box-shadow:
    inset 0 0 0 2px rgba(0, 0, 0, 0.45),
    0 6px 14px rgba(0, 0, 0, 0.6);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: min(640px, 100%);
  margin: 14px auto 0;
  padding: 0 14px;
}

.purse {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 99px;
  border: 1px solid var(--border-strong);
  background: rgba(0, 0, 0, 0.45);
  color: var(--gold-bright);
}

.counter {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  width: min(640px, 100%);
  margin: 10px auto 0;
  padding: 4px 14px 40px;
}

.shelf {
  margin-top: 16px;
}

.shelf h3 {
  display: inline-block;
  margin: 0 0 8px;
  padding: 2px 14px;
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gold);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
}

/* a tábua da prateleira */
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px 10px 14px;
  border-radius: 6px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.05));
  border-bottom: 6px solid #4a2d17;
  box-shadow: 0 8px 12px -6px rgba(0, 0, 0, 0.7);
}

@media (min-width: 560px) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  text-align: center;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: linear-gradient(180deg, #2c1d12, #1b120b);
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.5);
}

.art {
  display: grid;
  place-items: center;
  height: 68px;
}

.art-icon {
  color: var(--gold);
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.6));
}

.name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--gold-bright);
  line-height: 1.15;
}

.desc {
  flex: 1 1 auto;
  font-size: 0.8rem;
  line-height: 1.25;
  opacity: 0.72;
}

.have {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-success));
}

.nospace {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-error));
}

/* selo da mochila ao lado do ouro; vermelho quando está cheia */
.pack strong {
  font-variant-numeric: tabular-nums;
}

.pack.full {
  color: rgb(var(--v-theme-error));
  border-color: rgb(var(--v-theme-error));
}

.buy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  margin-top: 4px;
}

.price {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  color: var(--gold-bright);
}

.price.poor {
  color: rgb(var(--v-theme-error));
}

/* ───────────── portas ───────────── */

.doors {
  position: absolute;
  inset: 0;
  perspective: 1500px;
  perspective-origin: 50% 50%;
  /* some de vez no fim da abertura, liberando os cliques no estande */
  animation: doors-gone 0.01s linear 2.4s forwards;
}

.door {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  background:
    /* tiras de ferro */
    linear-gradient(180deg, transparent 12%, #1c1713 12% 15%, transparent 15% 84%, #1c1713 84% 87%, transparent 87%),
    /* tábuas */
    repeating-linear-gradient(90deg, #5a3820 0 22px, #3f2615 22px 24px);
  box-shadow:
    inset 0 0 40px rgba(0, 0, 0, 0.6),
    0 0 30px rgba(0, 0, 0, 0.7);
  backface-visibility: hidden;
}

.door.left {
  left: 0;
  transform-origin: left center;
  border-right: 3px solid #1c1713;
  animation: door-left 1.7s cubic-bezier(0.55, 0.05, 0.25, 1) 0.5s forwards;
}

.door.right {
  right: 0;
  transform-origin: right center;
  border-left: 3px solid #1c1713;
  animation: door-right 1.7s cubic-bezier(0.55, 0.05, 0.25, 1) 0.5s forwards;
}

/* argola de ferro perto da fresta */
.ring {
  position: absolute;
  top: 50%;
  width: 34px;
  height: 34px;
  margin-top: -17px;
  border-radius: 50%;
  border: 5px solid #b98c3a;
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.7),
    inset 0 0 3px rgba(0, 0, 0, 0.6);
}

.door.left .ring {
  right: 18px;
}

.door.right .ring {
  left: 18px;
}

/* luz quente que escapa pela fresta enquanto abre */
.glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 22% 70% at 50% 50%, rgba(255, 205, 120, 0.85), rgba(255, 170, 70, 0.25) 60%, transparent 100%);
  opacity: 0;
  animation: glow 1.9s ease-in-out 0.5s both;
}

@keyframes door-left {
  to {
    transform: rotateY(-104deg);
  }
}

@keyframes door-right {
  to {
    transform: rotateY(104deg);
  }
}

@keyframes glow {
  0% {
    opacity: 0;
  }
  35% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes doors-gone {
  to {
    visibility: hidden;
  }
}

@keyframes scene-light {
  from {
    filter: brightness(0.25);
  }
  to {
    filter: brightness(1);
  }
}

/* ───────────── fechando: o inverso da abertura ─────────────
   Só existe com portas (closing só liga quando elas aparecem), então o modo
   leve e o movimento reduzido não passam por aqui. */

/* travado: nada no estande responde enquanto as portas se fecham */
.shop.closing {
  touch-action: none;
}

.shop.closing .scene {
  pointer-events: none;
  animation: scene-dim 1.3s ease-in forwards;
}

.shop.closing .counter {
  overflow: hidden;
}

/* as portas voltam do ponto em que ficaram abertas e se fecham */
.shop.closing .doors {
  animation: none;
}

.shop.closing .door.left {
  animation: door-left-close 1.3s cubic-bezier(0.75, 0, 0.45, 0.95) forwards;
}

.shop.closing .door.right {
  animation: door-right-close 1.3s cubic-bezier(0.75, 0, 0.45, 0.95) forwards;
}

.shop.closing .glow {
  animation: glow-close 1.3s ease-in-out both;
}

@keyframes door-left-close {
  from {
    transform: rotateY(-104deg);
  }
  to {
    transform: rotateY(0deg);
  }
}

@keyframes door-right-close {
  from {
    transform: rotateY(104deg);
  }
  to {
    transform: rotateY(0deg);
  }
}

/* a luz que escapa pela fresta aperta e some quando as portas encostam */
@keyframes glow-close {
  0% {
    opacity: 0;
  }
  65% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes scene-dim {
  from {
    filter: brightness(1);
  }
  to {
    filter: brightness(0.25);
  }
}

.shop-enter-active,
.shop-leave-active {
  transition: opacity 0.3s ease;
}

.shop-enter-from,
.shop-leave-to {
  opacity: 0;
}

/* modo leve e movimento reduzido: sem portas, direto ao estande */
:global(html.lite) .shop .doors {
  display: none;
}

:global(html.lite) .shop .scene {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .doors {
    display: none;
  }

  .scene {
    animation: none;
  }
}
</style>
