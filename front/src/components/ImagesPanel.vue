<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api, errorMessage } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useConfirmStore } from '@/stores/confirm'
import { useNotifyStore } from '@/stores/notify'
import type { CampaignImage } from '@/types/api'

/** Galeria do mestre: enviar, mostrar para a mesa, ocultar, renomear, excluir. */
const props = defineProps<{ campaignId: string }>()

const campaign = useCampaignStore()
const notify = useNotifyStore()
const confirm = useConfirmStore()

const images = ref<CampaignImage[]>([])
const loading = ref(false)
/** v-file-input devolve File, File[] ou null dependendo da versão/uso */
const files = ref<File | File[] | null>(null)
const picked = () => (Array.isArray(files.value) ? files.value[0] : files.value) ?? null
const title = ref('')
const uploading = ref(false)
const busyId = ref<string | null>(null)

async function load() {
  loading.value = true
  try {
    images.value = (await api.get<CampaignImage[]>(`/campaigns/${props.campaignId}/images`)).data
  } catch (e) {
    notify.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

async function upload() {
  const file = picked()
  if (!file) return
  if (file.size > 15 * 1024 * 1024) {
    notify.error('A imagem passa de 15 MB')
    return
  }
  const form = new FormData()
  form.append('file', file)
  if (title.value.trim()) form.append('title', title.value.trim())
  uploading.value = true
  try {
    const { data } = await api.post<CampaignImage>(`/campaigns/${props.campaignId}/images`, form)
    images.value.unshift(data)
    files.value = null
    title.value = ''
  } catch (e) {
    notify.error(errorMessage(e))
  } finally {
    uploading.value = false
  }
}

// ── mostrar: para todos ou só para alguns jogadores ──
const dialog = ref(false)
const picking = ref<CampaignImage | null>(null)
const audience = ref<'all' | 'some'>('all')
const chosen = ref<string[]>([])
const players = computed(() => campaign.state?.players ?? [])

function askShow(img: CampaignImage) {
  picking.value = img
  audience.value = 'all'
  chosen.value = []
  dialog.value = true
}

async function confirmShow() {
  const img = picking.value
  if (!img) return
  const userIds = audience.value === 'some' ? [...chosen.value] : []
  dialog.value = false
  busyId.value = img.id
  const ok = await campaign.act(() =>
    api.post(`/campaigns/${props.campaignId}/show-image`, { imageId: img.id, userIds }).then(() => ({ data: null })),
  )
  busyId.value = null
  // só para alguns: o servidor não guarda, então a tela do mestre lembra para poder ocultar
  if (ok) campaign.privateShown = userIds.length ? { imageId: img.id, names: userIds.map(campaign.playerName) } : null
}

async function hide() {
  const ok = await campaign.act(() =>
    api.post(`/campaigns/${props.campaignId}/hide-image`).then(() => ({ data: null })),
  )
  if (ok) campaign.privateShown = null
}

/** O que está na tela dos jogadores agora: para todos (vem do estado) ou só para alguns. */
const current = computed(() => {
  const all = campaign.state?.shownImage
  if (all) return { imageId: all.id, title: all.title, names: null as string[] | null }
  const some = campaign.privateShown
  if (!some) return null
  const title = images.value.find((i) => i.id === some.imageId)?.title ?? ''
  return { imageId: some.imageId, title, names: some.names }
})

async function remove(img: CampaignImage) {
  const ok = await confirm.ask({
    title: `Excluir a imagem "${img.title}"?`,
    text: 'Ela some da galeria da campanha. Isso não pode ser desfeito.',
    confirmLabel: 'Excluir',
    icon: 'mdi-delete',
  })
  if (!ok) return
  try {
    await api.delete(`/images/${img.id}`)
    images.value = images.value.filter((i) => i.id !== img.id)
  } catch (e) {
    notify.error(errorMessage(e))
  }
}

// renomear
const renaming = ref<string | null>(null)
const newTitle = ref('')
function startRename(img: CampaignImage) {
  renaming.value = img.id
  newTitle.value = img.title
}
async function saveRename(img: CampaignImage) {
  const t = newTitle.value.trim()
  renaming.value = null
  if (!t || t === img.title) return
  try {
    const { data } = await api.patch<CampaignImage>(`/images/${img.id}`, { title: t })
    img.title = data.title
  } catch (e) {
    notify.error(errorMessage(e))
  }
}

watch(() => props.campaignId, load)
onMounted(load)
</script>

<template>
  <div>
    <v-card class="card-frame pa-4 mb-4" color="surface">
      <div class="upload-row">
        <v-file-input
          v-model="files"
          label="Imagem (PNG, JPG, WEBP, GIF — até 15 MB)"
          accept="image/png,image/jpeg,image/webp,image/gif"
          prepend-icon=""
          prepend-inner-icon="mdi-image-plus"
          hide-details
          class="grow"
        />
        <v-text-field v-model="title" label="Título (opcional)" maxlength="80" hide-details class="grow" />
        <v-btn color="primary" :loading="uploading" :disabled="!picked()" prepend-icon="mdi-upload" @click="upload">
          Enviar
        </v-btn>
      </div>
    </v-card>

    <v-alert v-if="current" type="info" variant="tonal" class="mb-4">
      Mostrando agora: <strong>{{ current.title }}</strong>
      <span v-if="current.names"> — só para {{ current.names.join(', ') }}</span>
      <template #append>
        <v-btn variant="flat" color="surface-bright" prepend-icon="mdi-eye-off" @click="hide">Ocultar</v-btn>
      </template>
    </v-alert>

    <v-progress-linear v-if="loading && !images.length" indeterminate color="secondary" />
    <div v-if="!loading && !images.length" class="empty">Nenhuma imagem enviada nesta campanha.</div>

    <div class="gallery">
      <v-card
        v-for="img in images"
        :key="img.id"
        class="card-frame img-card"
        :class="{ shown: current?.imageId === img.id }"
        color="surface"
      >
        <v-img :src="img.url" :alt="img.title" aspect-ratio="1.4" cover />
        <div class="img-body">
          <v-text-field
            v-if="renaming === img.id"
            v-model="newTitle"
            density="compact"
            hide-details
            autofocus
            maxlength="80"
            @keyup.enter="saveRename(img)"
            @blur="saveRename(img)"
          />
          <div v-else class="img-title" :title="img.title">{{ img.title }}</div>
          <div class="img-actions">
            <v-btn
              v-if="current?.imageId !== img.id"
              size="small"
              color="secondary"
              variant="flat"
              prepend-icon="mdi-eye"
              :loading="busyId === img.id"
              @click="askShow(img)"
            >
              Mostrar
            </v-btn>
            <v-btn v-else size="small" variant="tonal" prepend-icon="mdi-eye-off" @click="hide">Ocultar</v-btn>
            <v-spacer />
            <v-btn icon="mdi-pencil" size="small" variant="text" :aria-label="`Renomear ${img.title}`" @click="startRename(img)" />
            <v-btn
              icon="mdi-delete"
              size="small"
              variant="text"
              :aria-label="`Excluir ${img.title}`"
              title="Excluir"
              @click="remove(img)"
            />
          </div>
        </div>
      </v-card>
    </div>

    <v-dialog v-model="dialog" max-width="420">
      <v-card class="card-frame" color="surface">
        <v-card-title class="title-font pt-5 px-6 pick-title">Mostrar para quem?</v-card-title>
        <v-card-text class="px-6">
          <v-radio-group v-model="audience" hide-details>
            <v-radio label="Todos os jogadores" value="all" />
            <v-radio label="Só alguns jogadores" value="some" />
          </v-radio-group>
          <div v-if="audience === 'some'" class="pick-list">
            <v-checkbox
              v-for="p in players"
              :key="p.userId"
              v-model="chosen"
              :value="p.userId"
              :label="p.displayName"
              density="compact"
              hide-details
            />
            <div v-if="!players.length" class="empty">Ainda não há jogadores nesta campanha.</div>
          </div>
        </v-card-text>
        <v-card-actions class="px-6 pb-5 pt-2 justify-end ga-2">
          <v-btn variant="text" @click="dialog = false">Cancelar</v-btn>
          <v-btn
            color="secondary"
            variant="flat"
            prepend-icon="mdi-eye"
            :disabled="audience === 'some' && !chosen.length"
            @click="confirmShow"
          >
            Mostrar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.upload-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.grow {
  flex: 1 1 220px;
}

.empty {
  opacity: 0.6;
  font-style: italic;
}

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.img-card.shown {
  border-color: var(--gold) !important;
  box-shadow: 0 0 0 1px var(--gold);
}

.img-body {
  padding: 10px 12px 8px;
}

.img-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.img-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 8px;
}

.pick-title {
  white-space: normal;
  font-size: 1.2rem;
}

.pick-list {
  margin-top: 4px;
  padding-left: 4px;
  max-height: 40vh;
  overflow-y: auto;
}
</style>
