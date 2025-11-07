import { Routes } from '@angular/router';

export const APP_ROUTES: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then(c => c.DashboardComponent)
  },
  {
    path: 'branch/:id',
    loadComponent: () => import('./pages/branch-detail/branch-detail.component').then(c => c.BranchDetailComponent)
  },
  {
    path: 'camera/:id',
    loadComponent: () => import('./pages/camera/camera.component').then(c => c.CameraComponent)
  },
  {
    path: 'config',
    loadComponent: () => import('./pages/config/config.component').then(c => c.ConfigComponent)
  },
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
