// Bootstrap : Pinia + gestion d'erreurs globale + montage.
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

// Gestion d'erreurs globale (local-first : on ne remonte rien au réseau, on logge).
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Flooow] erreur applicative', info, err)
}

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Flooow] promesse rejetée', event.reason)
  })
}

app.mount('#app')
