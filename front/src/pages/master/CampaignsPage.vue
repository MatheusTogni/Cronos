<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import QuickFormDialog from '@/components/QuickFormDialog.vue'
import { api, errorMessage } from '@/services/api'
import { useNotifyStore } from '@/stores/notify'
import { STATUS_COLOR, STATUS_LABEL, type MasterCampaign } from '@/types/api'
import type { QuickField } from '@/types/ui'

const router = useRouter()
const notify = useNotifyStore()

const campaigns = ref<MasterCampaign[]>([])
const loading = ref(false)
const createOpen = ref(false)

const fields: QuickField[] = [
  { key: 'name', label: 'Nome da campanha', required: true, maxlength: 80 },
  { key: 'description', label: 'Descrição', type: 'textarea', maxlength: 500, hint: 'Aparece para os jogadores no lobby' },
]

async function load() {
  loading.value = true
  try {
    campaigns.value = (await api.get<MasterCampaign[]>('/campaigns')).data
  } catch (e) {
    notify.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

async function create(values: Record<string, string | number>) {
  try {
    const { data } = await api.post<MasterCampaign>('/campaigns', values)
    createOpen.value = false
    await router.push(`/mestre/campanhas/${data.id}`)
  } catch (e) {
    notify.error(errorMessage(e))
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Campanhas</h1>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="createOpen = true">Nova campanha</v-btn>
    </div>

    <v-progress-linear v-if="loading && !campaigns.length" indeterminate color="secondary" />

    <v-empty-state
      v-if="!loading && !campaigns.length"
      icon="mdi-castle"
      title="Nenhuma campanha ainda"
      text="Crie uma campanha, abra o lobby e os jogadores verão ela na tela deles."
    />

    <div class="list">
      <v-card
        v-for="c in campaigns"
        :key="c.id"
        class="card-frame camp"
        color="surface"
        :to="`/mestre/campanhas/${c.id}`"
      >
        <div class="camp-main">
          <div class="title-font camp-name">{{ c.name }}</div>
          <div v-if="c.description" class="camp-desc">{{ c.description }}</div>
        </div>
        <div class="camp-side">
          <v-chip :color="STATUS_COLOR[c.status]" size="small" variant="tonal">{{ STATUS_LABEL[c.status] }}</v-chip>
          <span class="camp-count"><v-icon icon="mdi-account-group" size="small" /> {{ c.playerCount }}</span>
        </div>
      </v-card>
    </div>

    <QuickFormDialog
      v-model="createOpen"
      title="Nova campanha"
      :fields="fields"
      submit-label="Criar"
      @submit="create"
    />
  </div>
</template>

<style scoped>
.list {
  display: grid;
  gap: 10px;
}

.camp {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}

.camp-main {
  flex: 1 1 260px;
  min-width: 0;
}

.camp-name {
  font-weight: 700;
  font-size: 1.15rem;
}

.camp-desc {
  opacity: 0.65;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.camp-side {
  display: flex;
  align-items: center;
  gap: 12px;
}

.camp-count {
  opacity: 0.75;
}
</style>
