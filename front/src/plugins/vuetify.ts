import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { pt } from 'vuetify/locale'

/** Tema escuro único, no clima das fichas: preto, carmim e dourado. */
export default createVuetify({
  locale: { locale: 'pt', messages: { pt } },
  theme: {
    defaultTheme: 'grimorio',
    themes: {
      grimorio: {
        dark: true,
        colors: {
          background: '#0e0b0d',
          surface: '#18131a',
          'surface-bright': '#241c26',
          'surface-variant': '#2c2330',
          'on-surface-variant': '#d8cfc4',
          primary: '#b8322a',
          secondary: '#c9a227',
          error: '#e5534b',
          info: '#4a90d9',
          success: '#4caf7a',
          warning: '#e0a43a',
          'on-background': '#ece4d8',
          'on-surface': '#ece4d8',
        },
      },
    },
  },
  defaults: {
    VTextField: { variant: 'outlined', density: 'comfortable' },
    VSelect: { variant: 'outlined', density: 'comfortable' },
    VTextarea: { variant: 'outlined', density: 'comfortable' },
    VBtn: { rounded: 'lg' },
    VCard: { rounded: 'lg' },
  },
})
