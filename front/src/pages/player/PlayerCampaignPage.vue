<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CharacterCard from '@/components/CharacterCard.vue'
import DiceRoller from '@/components/DiceRoller.vue'
import ImageOverlay from '@/components/ImageOverlay.vue'
import LevelUpEffect from '@/components/LevelUpEffect.vue'
import LogFeed from '@/components/LogFeed.vue'
import MySheet from '@/components/MySheet.vue'
import NpcCard from '@/components/NpcCard.vue'
import PlayerLobby from '@/components/PlayerLobby.vue'
import TurnBar from '@/components/TurnBar.vue'
import { useCampaignStore } from '@/stores/campaign'
import { useClassesStore } from '@/stores/classes'
import { useNotifyStore } from '@/stores/notify'
import { useRealtimeStore } from '@/stores/realtime'
import { HP_PER_LEVEL } from '@/utils/classHooks'
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

// o mestre resolveu (ou negou) a ação que o jogador tinha declarado
watch(
  () => campaign.myPendingAction?.id ?? null,
  (now, before) => {
    if (before && !now) {
      notify.info('O mestre resolveu a sua ação')
      buzz(120)
    }
  },
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
      <div class="page-header">
        <v-btn icon="mdi-arrow-left" variant="text" to="/jogador" aria-label="Voltar para campanhas" />
        <h1>{{ state.name }}</h1>
        <v-icon
          :icon="realtime.connected ? 'mdi-access-point' : 'mdi-access-point-off'"
          :color="realtime.connected ? 'success' : 'error'"
          :title="realtime.connected ? 'Ao vivo' : 'Sem conexão ao vivo — tentando reconectar'"
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
        <v-tabs v-model="tab" color="secondary" grow class="mb-4">
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
            <template v-if="state.npcs.length">
              <div class="side-title">Inimigos</div>
              <div class="party mb-4">
                <NpcCard v-for="n in state.npcs" :key="n.id" :npc="n" />
              </div>
              <div class="side-title">Party</div>
            </template>
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
            <v-card class="card-frame pa-4 mb-4" color="surface">
              <div class="side-title">Rolar dados</div>
              <DiceRoller :campaign-id="state.id" />
            </v-card>
            <LogFeed :logs="campaign.logs" max-height="65dvh" />
          </v-window-item>
        </v-window>
      </template>

      <ImageOverlay :image="state.shownImage" />
      <LevelUpEffect :level="me?.level" :hp-per-level="HP_PER_LEVEL" />
    </template>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 720px;
  padding-bottom: 96px;
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

.side-title {
  font-family: var(--font-title);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 8px;
}
</style>
