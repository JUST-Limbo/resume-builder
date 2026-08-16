import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '../layouts/AppLayout.vue'
import MineView from '../views/MineView.vue'

const router = createRouter({
  history: createWebHistory(),
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
