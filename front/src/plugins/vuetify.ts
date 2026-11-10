import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { pt } from 'vuetify/locale'

/** Tema escuro único, no clima do ícone: preto-violeta, bronze/ouro e carmim. */
export default createVuetify({
  locale: { locale: 'pt', messages: { pt } },
  theme: {
    defaultTheme: 'cronos',
    themes: {
      cronos: {
        dark: true,
        colors: {
          background: '#0b0810',
          surface: '#16101c',
          'surface-bright': '#231a2c',
          'surface-light': '#1d1524',
          'surface-variant': '#2a2034',
          'on-surface-variant': '#d8cdb8',
          primary: '#a8322b',
          secondary: '#d4a04c',
          arcane: '#7a52b3',
          error: '#d9463d',
          info: '#4f86d6',
          success: '#4caf7a',
          warning: '#e0a43a',
          'on-background': '#eadfca',
          'on-surface': '#eadfca',
        },
        variables: {
          // divisórias e bordas do Vuetify em bronze discreto
          'border-color': '#d4a04c',
          'border-opacity': 0.16,
        },
      },
    },
  },
  defaults: {
    VTextField: { variant: 'outlined', density: 'comfortable', color: 'secondary' },
    VSelect: { variant: 'outlined', density: 'comfortable', color: 'secondary' },
    VTextarea: { variant: 'outlined', density: 'comfortable', color: 'secondary' },
    VBtn: { rounded: 'sm' },
    VCard: { rounded: 'sm' },
  },
})
