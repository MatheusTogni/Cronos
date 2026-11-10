<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, errorMessage } from '@/services/api'
import { useNotifyStore } from '@/stores/notify'
import { useRealtimeStore } from '@/stores/realtime'
import type { OpenCampaign } from '@/types/api'

const router = useRouter()
const notify = useNotifyStore()
const realtime = useRealtimeStore()

const campaigns = ref<OpenCampaign[]>([])
const loading = ref(false)
const joining = ref<string | null>(null)

const mine = computed(() => campaigns.value.filter((c) => c.joined))
const open = computed(() => campaigns.value.filter((c) => !c.joined))

async function load() {
  loading.value = true
  try {
    campaigns.value = (await api.get<OpenCampaign[]>('/campaigns/open')).data
  } catch (e) {
    notify.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

async function join(c: OpenCampaign) {
  joining.value = c.id
  try {
    await api.post(`/campaigns/${c.id}/join`)
    await router.push(`/jogador/campanha/${c.id}`)
  } catch (e) {
    notify.error(errorMessage(e))
    await load()
  } finally {
    joining.value = null
  }
}

// a lista muda sozinha quando o mestre abre/começa/encerra uma campanha
let off: (() => void) | null = null
let timer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  void load()
  off = realtime.on('campaigns:changed', () => {
    clearTimeout(timer)
    timer = setTimeout(load, 300)
  })
})
onBeforeUnmount(() => {
  off?.()
  clearTimeout(timer)
})
</script>

<template>
  <div class="page narrow">
    <div class="page-header">
      <h1>Campanhas</h1>
      <v-btn icon="mdi-refresh" variant="text" :loading="loading" aria-label="Atualizar lista" @click="load" />
    </div>

    <template v-if="mine.length">
      <h2 class="section">Suas campanhas</h2>
      <v-card
        v-for="c in mine"
        :key="c.id"
        class="card-frame camp"
        color="surface"
        :to="`/jogador/campanha/${c.id}`"
      >
        <div class="camp-main">
          <div class="title-font camp-name">{{ c.name }}</div>
          <div class="camp-sub">Mestre {{ c.master.displayName }} · {{ c.playerCount }} na mesa</div>
        </div>
        <v-btn v-if="c.status === 'ACTIVE'" color="primary" variant="flat" append-icon="mdi-arrow-right">
          Voltar para a aventura
        </v-btn>
        <v-btn v-else color="secondary" variant="tonal" append-icon="mdi-arrow-right">
          {{ c.ready ? 'Pronto · ver lobby' : 'Continuar no lobby' }}
        </v-btn>
      </v-card>
    </template>

    <h2 class="section">Lobbies abertos</h2>
    <v-progress-linear v-if="loading && !campaigns.length" indeterminate color="secondary" />
    <v-empty-state
      v-if="!loading && !open.length"
      icon="mdi-campfire"
      title="Nenhum lobby aberto"
      text="Quando o mestre abrir o lobby de uma campanha, ela aparece aqui sozinha."
      class="empty"
    >
      <template #actions>
        <v-btn variant="text" to="/jogador/classes" prepend-icon="mdi-book-open-variant">Conhecer as classes</v-btn>
      </template>
    </v-empty-state>

    <v-card v-for="c in open" :key="c.id" class="card-frame camp" color="surface">
      <div class="camp-main">
        <div class="title-font camp-name">{{ c.name }}</div>
        <div v-if="c.description" class="camp-desc">{{ c.description }}</div>
        <div class="camp-sub">Mestre {{ c.master.displayName }} · {{ c.playerCount }} na mesa</div>
      </div>
      <v-btn color="primary" variant="flat" size="large" :loading="joining === c.id" @click="join(c)">Entrar</v-btn>
    </v-card>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 720px;
}

.section {
  font-family: var(--font-title);
  font-size: 0.9rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold);
  margin: 18px 0 10px;
}

.camp {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 10px;
}

.camp-main {
  flex: 1 1 220px;
  min-width: 0;
}

.camp-name {
  font-weight: 700;
  font-size: 1.15rem;
}

.camp-desc {
  opacity: 0.8;
  margin: 2px 0;
}

.camp-sub {
  opacity: 0.6;
  font-size: 0.9rem;
}

.empty {
  padding-top: 8px;
}
</style>
