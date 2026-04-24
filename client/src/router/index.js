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
    path: '/choose',
    name: 'Choose',
    component: () => import('../views/ChooseView.vue'),
    meta: { requiresAuth: true },
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
        meta: { requiredModule: 'gallery' },
      },
      {
        path: 'product/:id',
        name: 'ProductDetail',
        component: () => import('../views/ProductDetailView.vue'),
        meta: { requiredModule: 'gallery' },
      },
      {
        path: 'admin/products',
        name: 'ProductManage',
        component: () => import('../views/admin/ProductManageView.vue'),
        meta: { requiredModule: 'products' },
      },
      {
        path: 'admin/series',
        name: 'SeriesManage',
        component: () => import('../views/admin/SeriesManageView.vue'),
        meta: { requiredModule: 'series' },
      },
      {
        path: 'admin/users',
        name: 'UserManage',
        component: () => import('../views/admin/UserManageView.vue'),
        meta: { requiredRole: ['super_admin', 'admin'] },
      },
      {
        path: 'admin/api-keys',
        name: 'ApiKeyManage',
        component: () => import('../views/admin/ApiKeyManageView.vue'),
        meta: { requiredRole: ['super_admin'] },
      },
      {
        path: 'ai/hd-white',
        name: 'AiHdWhite',
        component: () => import('../views/ai/HdWhiteView.vue'),
        meta: { requiredModule: 'as_ai' },
      },
      {
        path: 'ai/feature-2',
        name: 'AiFeature2',
        component: () => import('../views/ai/FeaturePlaceholderView.vue'),
        meta: { requiredModule: 'as_ai' },
        props: { featureName: '功能二' },
      },
      {
        path: 'ai/feature-3',
        name: 'AiFeature3',
        component: () => import('../views/ai/FeaturePlaceholderView.vue'),
        meta: { requiredModule: 'as_ai' },
        props: { featureName: '功能三' },
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
    return next('/choose');
  }
  if (to.meta.requiredRole) {
    if (!to.meta.requiredRole.includes(auth.user?.role)) {
      return next('/');
    }
  }
  if (to.meta.requiredModule) {
    if (!auth.hasModule(to.meta.requiredModule)) {
      return next('/login');
    }
  }
  next();
});

export default router;
