import { createRouter, createWebHashHistory } from 'vue-router'
import AppLayout from '../layouts/AppLayout.vue'
import MineView from '../views/MineView.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          redirect: { name: 'mine' },
        },
        {
          path: 'mine',
          name: 'mine',
          component: MineView,
        },
        {
          path: 'templates',
          name: 'templates',
          component: () => import('../views/TemplatesView.vue'),
        },
        {
          path: 'edit/:id?',
          name: 'edit',
          component: () => import('../views/EditView.vue'),
          props: true,
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'mine' },
    },
  ],
})

export default router
