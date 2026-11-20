<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CharacterCard from '@/components/CharacterCard.vue'
import CombatEffect from '@/components/CombatEffect.vue'
import ConditionReveal from '@/components/ConditionReveal.vue'
import ImageOverlay from '@/components/ImageOverlay.vue'
import LevelUpEffect from '@/components/LevelUpEffect.vue'
import LogFeed from '@/components/LogFeed.vue'
import MySheet from '@/components/MySheet.vue'
import PlayerLobby from '@/components/PlayerLobby.vue'
import ShopOverlay from '@/components/ShopOverlay.vue'
import TransferInbox from '@/components/TransferInbox.vue'
import TurnBar from '@/components/TurnBar.vue'
import { useCampaignStore } from '@/stores/campaign'
import { useClassesStore } from '@/stores/classes'
import { useNotifyStore } from '@/stores/notify'
import { useRealtimeStore } from '@/stores/realtime'
import { HP_PER_LEVEL, MANA_PER_LEVEL } from '@/utils/classHooks'
import { buzz } from '@/utils/haptics'

const route = useRoute()
const router = useRouter()
const campaign = useCampaignStore()
const classes = useClassesStore()
const notify = useNotifyStore()
const realtime = useRealtimeStore()

const id = computed(() => String(route.params.id))
const state = computed(() => campaign.state)
const me = computed(() => campaign.myCharacter)
const myClass = computed(() => (me.value ? classes.byId(me.value.classId) : undefined))
const others = computed(() => state.value?.characters.filter((c) => c.id !== me.value?.id) ?? [])

const tab = ref<'ficha' | 'party' | 'log'>('ficha')

watch(id, (v) => campaign.open(v), { immediate: true })
onBeforeUnmount(() => campaign.close())

// removido do lobby pelo mestre
watch(
  () => campaign.kicked,
  async (k) => {
    if (!k) return
    notify.info('O mestre tirou você deste lobby')
    await router.push('/jogador')
  },
)

// a aventura começou: vai direto para a ficha
watch(
  () => state.value?.status,
  (s, prev) => {
    if (prev === 'LOBBY' && s === 'ACTIVE') {
      tab.value = 'ficha'
      notify.success('A aventura começou!')
    }
  },
)

// chegou a vez do jogador no combate
watch(
  () => campaign.isMyTurn,
  (mine, before) => {
    if (mine && !before) {
      notify.success('O foco está em você!')
      buzz([200, 100, 200])
    }
  },
)

// o mestre abre a loja: as portas se abrem na tela e ela fica até o mestre fechar
// (o ShopOverlay cuida da tela e do efeito de fechar; aqui só o aviso e a vibração)
watch(
  () => state.value?.shopOpen,
  (open, before) => {
    if (open && before === false) buzz(120)
    if (!open && before) notify.info('O mercador fechou as portas')
  },
  { immediate: true },
)

// avisa de mudanças na própria ficha feitas por outros (dano do mestre, máscara…)
const unseen = ref(0)
watch(
  () => campaign.logs.length,
  (n, prev) => {
    if (tab.value !== 'log' && n > prev && prev > 0) unseen.value += n - prev
  },
)
watch(tab, (t) => {
  if (t === 'log') unseen.value = 0
})
</script>

<template>
  <div class="page narrow">
    <v-alert v-if="campaign.error" type="error" variant="tonal" class="mb-4">
      {{ campaign.error }}
      <template #append>
        <v-btn variant="text" to="/jogador">Voltar</v-btn>
      </template>
    </v-alert>
    <v-progress-linear v-if="campaign.loading && !state" indeterminate color="secondary" />

    <template v-if="state">
      <div class="page-header slim">
        <v-btn icon="mdi-arrow-left" variant="text" size="small" to="/jogador" aria-label="Voltar para campanhas" />
        <h1>{{ state.name }}</h1>
        <v-icon
          :icon="realtime.connected ? 'mdi-access-point' : 'mdi-access-point-off'"
          :color="realtime.connected ? 'success' : 'error'"
          size="small"
          :title="realtime.connected ? 'Ao vivo' : 'Sem conexão ao vivo — tentando reconectar'"
          :aria-label="realtime.connected ? 'Ao vivo' : 'Sem conexão ao vivo'"
        />
      </div>

      <!-- lobby -->
      <template v-if="state.status === 'LOBBY'">
        <p v-if="state.description" class="desc">{{ state.description }}</p>
        <PlayerLobby />
      </template>

      <!-- encerrada -->
      <v-empty-state
        v-else-if="state.status === 'ENDED'"
        icon="mdi-book-lock"
        title="Campanha encerrada"
        text="O mestre encerrou esta campanha. Obrigado por jogar!"
      >
        <template #actions>
          <v-btn color="primary" to="/jogador">Voltar</v-btn>
        </template>
      </v-empty-state>

      <!-- aventura -->
      <template v-else-if="state.status === 'ACTIVE'">
        <TurnBar />
        <v-tabs v-model="tab" color="secondary" grow density="compact" class="mb-3">
          <v-tab value="ficha" prepend-icon="mdi-card-account-details">Ficha</v-tab>
          <v-tab value="party" prepend-icon="mdi-account-group">Party</v-tab>
          <v-tab value="log" prepend-icon="mdi-script-text">
            Log
            <v-badge v-if="unseen" :content="unseen" color="primary" inline />
          </v-tab>
        </v-tabs>

        <v-window v-model="tab">
          <v-window-item value="ficha">
            <MySheet v-if="me && myClass" :character="me" :cls="myClass" />
            <v-alert v-else type="info" variant="tonal">Você não tem personagem nesta campanha.</v-alert>
          </v-window-item>

          <v-window-item value="party">
            <div class="party">
              <CharacterCard
                v-for="c in others"
                :key="c.id"
                :character="c"
                :cls="classes.byId(c.classId)"
                :player-name="campaign.playerName(c.userId)"
                :highlight="state.combat?.currentCharacterId === c.id"
              />
              <div v-if="!others.length" class="empty">Você está sozinho nesta aventura.</div>
            </div>
          </v-window-item>

          <v-window-item value="log">
            <LogFeed :logs="campaign.logs" max-height="65dvh" />
          </v-window-item>
        </v-window>
      </template>

      <ImageOverlay :image="state.shownImage ?? campaign.privateImage" />
      <ShopOverlay v-if="state.status === 'ACTIVE'" :open="state.shopOpen" />
      <TransferInbox v-if="state.status === 'ACTIVE'" />
      <CombatEffect />
      <ConditionReveal :conditions="me?.conditions" />
      <LevelUpEffect
        :level="me?.level"
        :hp-per-level="HP_PER_LEVEL"
        :mana-per-level="MANA_PER_LEVEL"
        :skills="myClass?.abilities"
      />
    </template>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 720px;
  /* topo enxuto: o celular não tem altura de sobra */
  padding-top: 12px;
  padding-bottom: 96px;
}

/* cabeçalho da campanha numa linha só: sem o título grande e sem a divisória ornamental */
.page-header.slim {
  flex-wrap: nowrap;
  gap: 8px;
  margin-bottom: 10px;
}

.page-header.slim h1 {
  min-width: 0;
  font-size: 1.3rem;
  letter-spacing: 0.06em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-header.slim::after {
  display: none;
}

.desc {
  opacity: 0.7;
  margin: -8px 0 16px;
}

.party {
  display: grid;
  gap: 12px;
}

.empty {
  opacity: 0.6;
  font-style: italic;
}
</style>
