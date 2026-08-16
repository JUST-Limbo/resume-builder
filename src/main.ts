import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'
import { useResumeStore } from './stores/resume'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

const store = useResumeStore(pinia)
void store.hydrate()

app.mount('#app')
