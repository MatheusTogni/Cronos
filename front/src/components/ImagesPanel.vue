<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
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

async function show(img: CampaignImage) {
  busyId.value = img.id
  await campaign.act(() =>
    api.post(`/campaigns/${props.campaignId}/show-image`, { imageId: img.id }).then(() => ({ data: null })),
  )
  busyId.value = null
}

const hide = () =>
  campaign.act(() => api.post(`/campaigns/${props.campaignId}/hide-image`).then(() => ({ data: null })))

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

    <v-alert v-if="campaign.state?.shownImage" type="info" variant="tonal" class="mb-4">
      Mostrando agora: <strong>{{ campaign.state.shownImage.title }}</strong>
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
        :class="{ shown: campaign.state?.shownImage?.id === img.id }"
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
              v-if="campaign.state?.shownImage?.id !== img.id"
              size="small"
              color="secondary"
              variant="flat"
              prepend-icon="mdi-eye"
              :loading="busyId === img.id"
              @click="show(img)"
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
</style>
