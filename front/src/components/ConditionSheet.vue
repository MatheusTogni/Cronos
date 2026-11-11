<script setup lang="ts">
import { computed } from 'vue'
import { useClassesStore } from '@/stores/classes'
import { POLARITY_COLOR, POLARITY_LABEL, type ConditionDef, type Crit } from '@/types/api'
import { conditionArt } from '@/utils/conditionArt'

/** Ficha de uma condição do catálogo: efeitos, duração e quem aplica. */
const props = defineProps<{ def: ConditionDef }>()

const classes = useClassesStore()
const accent = computed(() => conditionArt(props.def.id, props.def.polarity).color)

const critLabel = (c: Crit) =>
  c.min === c.max ? `${c.min}` : c.max === 20 ? `${c.min}+` : `${c.min}–${c.max}`

const duration = computed(() =>
  props.def.turns
    ? `${props.def.turns} ${props.def.turns === 1 ? 'turno' : 'turnos'} de quem carrega`
    : 'Até alguém remover',
)

const hpLabel = computed(() => {
  const hp = props.def.hpPerTurn
  if (!hp) return null
  return hp < 0 ? `Perde ${-hp} de vida no fim de cada turno` : `Recupera ${hp} de vida no fim de cada turno`
})

/** Habilidades das classes que aplicam esta condição (efeito ou crítico). */
const sources = computed(() => {
  const out: { cls: string; color: string; ability: string; how: string }[] = []
  for (const cls of classes.list) {
    for (const a of cls.abilities) {
      if ((a.effectData as { condition?: string } | null)?.condition === props.def.id) {
        out.push({
          cls: cls.name,
          color: cls.color,
          ability: a.name,
          how: a.effect === 'SELF_CONDITION' ? 'em si mesmo' : 'no alvo',
        })
      }
      for (const c of a.crits ?? []) {
        if (c.condition === props.def.id) {
          out.push({
            cls: cls.name,
            color: cls.color,
            ability: a.name,
            how: `crítico ${critLabel(c)}${c.turns ? `, ${c.turns} ${c.turns === 1 ? 'turno' : 'turnos'}` : ''}`,
          })
        }
      }
    }
  }
  return out
})
</script>

<template>
  <div class="sheet" :style="{ '--accent': accent }">
    <header class="sheet-head">
      <h2 class="title-font">{{ def.name }}</h2>
      <div class="cats">
        <v-chip size="small" variant="outlined" :color="POLARITY_COLOR[def.polarity]">
          {{ POLARITY_LABEL[def.polarity] }}
        </v-chip>
        <v-chip v-if="def.skipsTurn" size="small" variant="outlined" color="error" prepend-icon="mdi-pause-circle">
          Perde a vez
        </v-chip>
      </div>
    </header>

    <section>
      <h3>Efeito</h3>
      <p class="pre-line">{{ def.description }}</p>
    </section>

    <section>
      <h3>Regras na mesa</h3>
      <ul class="rules">
        <li>
          <v-icon icon="mdi-timer-sand" size="small" />
          <span><strong>Duração:</strong> {{ duration }}</span>
        </li>
        <li v-if="hpLabel">
          <v-icon :icon="def.hpPerTurn < 0 ? 'mdi-heart-minus' : 'mdi-heart-plus'" size="small" />
          <span>{{ hpLabel }}</span>
        </li>
        <li v-if="def.skipsTurn">
          <v-icon icon="mdi-pause-circle" size="small" />
          <span>Quem carrega é pulado no combate (perde a vez), e a duração desconta assim mesmo.</span>
        </li>
        <li v-if="def.exclusiveGroup">
          <v-icon icon="mdi-swap-horizontal" size="small" />
          <span>Só uma por alvo: outra do mesmo tipo substitui a anterior.</span>
        </li>
      </ul>
      <p class="note">
        A duração conta nos turnos de quem carrega a condição e desconta no fim de cada um deles. Em invocações, conta o
        turno do dono; em inimigos, o turno do mestre. O mestre pode ajustar tudo isso ao aplicar.
      </p>
    </section>

    <section v-if="sources.length">
      <h3>Quem aplica</h3>
      <div v-for="(s, i) in sources" :key="i" class="source" :style="{ '--cls': s.color }">
        <span class="src-class">{{ s.cls }}</span>
        <span class="src-ability">{{ s.ability }}</span>
        <span class="src-how">{{ s.how }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sheet-head h2 {
  font-size: 1.8rem;
  margin: 0;
  color: #f0e6d6;
}

.cats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

section {
  margin-top: 18px;
}

h3 {
  font-family: var(--font-title);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  margin: 0 0 6px;
  font-weight: 700;
}

p {
  margin: 0;
  line-height: 1.45;
}

.rules {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 6px;
}

.rules li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  line-height: 1.4;
}

.rules .v-icon {
  color: var(--accent);
  margin-top: 2px;
}

.note {
  margin-top: 10px;
  font-size: 0.9rem;
  opacity: 0.7;
  font-style: italic;
}

.source {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  border: 1px solid var(--border-soft);
  border-left: 3px solid var(--cls);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.src-class {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--cls);
}

.src-ability {
  font-family: var(--font-title);
  font-weight: 700;
}

.src-how {
  margin-left: auto;
  font-size: 0.85rem;
  opacity: 0.7;
}
</style>
