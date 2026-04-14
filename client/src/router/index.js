import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { guest: true },
  },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'ProductList',
        component: () => import('../views/ProductListView.vue'),
      },
      {
        path: 'product/:id',
        name: 'ProductDetail',
        component: () => import('../views/ProductDetailView.vue'),
      },
{
        path: 'admin/products',
        name: 'ProductManage',
        component: () => import('../views/admin/ProductManageView.vue'),
        meta: { requiresAdmin: true },
      },
      {
        path: 'admin/series',
        name: 'SeriesManage',
        component: () => import('../views/admin/SeriesManageView.vue'),
        meta: { requiresAdmin: true },
      },
      {
        path: 'admin/users',
        name: 'UserManage',
        component: () => import('../views/admin/UserManageView.vue'),
        meta: { requiresAdmin: true },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  const auth = useAuthStore();

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return next('/login');
  }
  if (to.meta.guest && auth.isLoggedIn) {
    return next('/');
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return next('/');
  }
  next();
});

export default router;
