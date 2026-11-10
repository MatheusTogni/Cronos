<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ClassSheet from '@/components/ClassSheet.vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useClassesStore } from '@/stores/classes'
import type { CampaignState } from '@/types/api'

/** Lobby visto pelo jogador: escolher classe, dar nome e ficar pronto. */
const campaign = useCampaignStore()
const classes = useClassesStore()
const router = useRouter()

const state = computed(() => campaign.state!)
const me = computed(() => campaign.myCharacter)
const ready = computed(() => campaign.mySeat?.ready ?? false)

const selectedClassId = ref<string | null>(me.value?.classId ?? null)
const name = ref(me.value?.name ?? '')
const detailOpen = ref(false)
const saving = ref(false)

watch(me, (c) => {
  // personagem salvo em outra aba/aparelho: acompanha
  if (c && !saving.value) {
    selectedClassId.value ??= c.classId
    if (!name.value) name.value = c.name
  }
})

const selectedClass = computed(() => (selectedClassId.value ? classes.byId(selectedClassId.value) : undefined))
const dirty = computed(
  () => !me.value || me.value.classId !== selectedClassId.value || me.value.name !== name.value.trim(),
)
const canSave = computed(() => !!selectedClassId.value && !!name.value.trim() && dirty.value)

function pick(id: string) {
  selectedClassId.value = id
  detailOpen.value = true
}

async function save() {
  if (!canSave.value) return
  saving.value = true
  await campaign.act(() =>
    api.post<CampaignState & { logs: [] }>(`/campaigns/${state.value.id}/character`, {
      classId: selectedClassId.value,
      name: name.value.trim(),
    }),
  )
  saving.value = false
}

const toggling = ref(false)
async function toggleReady() {
  toggling.value = true
  await campaign.act(() =>
    api.post<CampaignState & { logs: [] }>(`/campaigns/${state.value.id}/ready`, { ready: !ready.value }),
  )
  toggling.value = false
}

async function leave() {
  const ok = await campaign.act(() => api.post(`/campaigns/${state.value.id}/leave`).then(() => ({ data: null })))
  if (ok) await router.push('/jogador')
}

const className = (classId: string) => classes.byId(classId)?.name ?? classId
const characterOf = (userId: string) => state.value.characters.find((c) => c.userId === userId)
</script>

<template>
  <div class="lobby">
    <section class="block">
      <h2 class="title-font">1. Escolha sua classe</h2>
      <div class="class-grid">
        <button
          v-for="cls in classes.list"
          :key="cls.id"
          type="button"
          class="class-pick"
          :class="{ selected: cls.id === selectedClassId }"
          :style="{ '--accent': cls.color }"
          :aria-pressed="cls.id === selectedClassId"
          @click="pick(cls.id)"
        >
          <v-img :src="cls.artFile" :alt="cls.name" aspect-ratio="1" cover position="top" />
          <div class="pick-name title-font">{{ cls.name }}</div>
          <v-icon v-if="cls.id === selectedClassId" icon="mdi-check-circle" class="pick-check" color="secondary" />
        </button>
      </div>
    </section>

    <section class="block">
      <h2 class="title-font">2. Dê um nome</h2>
      <div class="name-row">
        <v-text-field
          v-model="name"
          label="Nome do personagem"
          maxlength="40"
          hide-details
          :disabled="!selectedClassId"
          @keyup.enter="save"
        />
        <v-btn color="secondary" variant="flat" size="large" :disabled="!canSave" :loading="saving" @click="save">
          Salvar
        </v-btn>
      </div>
      <div v-if="me && !dirty" class="saved">
        <v-icon icon="mdi-check" size="small" /> {{ me.name }}, {{ className(me.classId) }}
      </div>
      <div v-else-if="me && dirty" class="unsaved">Alterações ainda não salvas.</div>
    </section>

    <section class="block">
      <h2 class="title-font">3. Pronto?</h2>
      <v-btn
        block
        size="x-large"
        :color="ready ? 'success' : 'primary'"
        :variant="ready ? 'tonal' : 'flat'"
        :prepend-icon="ready ? 'mdi-check-decagram' : 'mdi-flag-checkered'"
        :disabled="!me || dirty"
        :loading="toggling"
        @click="toggleReady"
      >
        {{ ready ? 'Pronto! (toque para cancelar)' : 'Estou pronto' }}
      </v-btn>
      <div class="hint">O mestre começa a aventura quando todos estiverem prontos.</div>
    </section>

    <section class="block">
      <h2 class="title-font">Na mesa</h2>
      <div class="party">
        <div v-for="p in state.players" :key="p.userId" class="party-row">
          <v-icon
            :icon="p.ready ? 'mdi-check-circle' : 'mdi-timer-sand'"
            :color="p.ready ? 'success' : 'grey'"
            :title="p.ready ? 'Pronto' : 'Escolhendo'"
          />
          <span class="party-name">{{ p.displayName }}</span>
          <span class="party-char">
            <template v-if="characterOf(p.userId)">
              {{ characterOf(p.userId)!.name }} · {{ className(characterOf(p.userId)!.classId) }}
            </template>
            <template v-else>escolhendo…</template>
          </span>
        </div>
      </div>
      <v-btn variant="text" color="error" prepend-icon="mdi-logout" class="mt-4" @click="leave">Sair do lobby</v-btn>
    </section>

    <v-dialog v-model="detailOpen" max-width="680" scrollable>
      <v-card v-if="selectedClass" class="card-frame" color="surface">
        <v-card-text class="pa-5">
          <ClassSheet :cls="selectedClass" />
        </v-card-text>
        <v-card-actions class="px-5 pb-4">
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="detailOpen = false">Escolher {{ selectedClass.name }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.block {
  margin-bottom: 28px;
}

h2 {
  font-size: 1.05rem;
  margin: 0 0 10px;
  color: var(--gold);
}

.class-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 10px;
}

.class-pick {
  --accent: var(--crimson);
  position: relative;
  border: 2px solid transparent;
  border-radius: 12px;
  overflow: hidden;
  background: #18131a;
  color: inherit;
  cursor: pointer;
  padding: 0;
}

.class-pick.selected {
  border-color: var(--accent);
}

.class-pick:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.pick-name {
  font-size: 0.85rem;
  font-weight: 700;
  padding: 6px 4px 8px;
  text-align: center;
  border-top: 2px solid var(--accent);
}

.pick-check {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #0e0b0d;
  border-radius: 50%;
}

.name-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.saved {
  margin-top: 8px;
  color: #7fd3a1;
}

.unsaved {
  margin-top: 8px;
  opacity: 0.7;
  font-style: italic;
}

.hint {
  margin-top: 8px;
  opacity: 0.6;
  font-size: 0.9rem;
}

.party {
  display: grid;
  gap: 6px;
}

.party-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.party-name {
  font-weight: 600;
}

.party-char {
  opacity: 0.65;
}
</style>
