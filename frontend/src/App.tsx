import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider as OidcAuthProvider } from 'react-oidc-context';
import { WebStorageStateStore } from 'oidc-client-ts';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { OfflineProvider } from './contexts/OfflineContext';
import { AutoLogout } from './components/AutoLogout';
import { ToastProvider } from './components/Toast';
import React, { Suspense, useState, useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import api from './utils/api';
import { installOfflineAdapter } from './utils/offlineAdapter';
import { oidcConfig } from './oidc-config';

const Login = React.lazy(() => import('./pages/Login').then(module => ({ default: module.Login })));
const OidcCallback = React.lazy(() => import('./pages/OidcCallback').then(module => ({ default: module.OidcCallback })));
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const Projects = React.lazy(() => import('./pages/Projects').then(module => ({ default: module.Projects })));
const ProjectDetails = React.lazy(() => import('./pages/ProjectDetails').then(module => ({ default: module.ProjectDetails })));
const ProjectForm = React.lazy(() => import('./pages/ProjectForm').then(module => ({ default: module.ProjectForm })));
const Servers = React.lazy(() => import('./pages/Servers').then(module => ({ default: module.Servers })));
const ServerForm = React.lazy(() => import('./pages/ServerForm').then(module => ({ default: module.ServerForm })));
const ProjectServerForm = React.lazy(() => import('./pages/ProjectServerForm').then(module => ({ default: module.ProjectServerForm })));
const DatabaseEngines = React.lazy(() => import('./pages/DatabaseEngines').then(module => ({ default: module.DatabaseEngines })));
const DatabaseForm = React.lazy(() => import('./pages/DatabaseForm').then(module => ({ default: module.DatabaseForm })));
const ProjectDatabaseForm = React.lazy(() => import('./pages/ProjectDatabaseForm').then(module => ({ default: module.ProjectDatabaseForm })));
const ComponentForm = React.lazy(() => import('./pages/ComponentForm').then(module => ({ default: module.ComponentForm })));
const Settings = React.lazy(() => import('./pages/Settings').then(module => ({ default: module.Settings })));
const Users = React.lazy(() => import('./pages/Users').then(module => ({ default: module.Users })));
const Groups = React.lazy(() => import('./pages/Groups').then(module => ({ default: module.Groups })));
const AuditLogs = React.lazy(() => import('./pages/AuditLogs').then(module => ({ default: module.AuditLogs })));
const Trash = React.lazy(() => import('./pages/Trash').then(module => ({ default: module.Trash })));
const ServerConfig = React.lazy(() => import('./pages/ServerConfig').then(module => ({ default: module.ServerConfig })));

const Spinner = () => (
  <div className="flex h-screen items-center justify-center p-4">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
  </div>
);

function App() {
  // In Electron, wait until we've read the backend URL from IPC and set it on the Axios instance.
  // In the browser, this is immediately true (no IPC).
  const [ready, setReady] = useState(!window.electronAPI);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getApiUrl().then(url => {
      api.defaults.baseURL = url;
      installOfflineAdapter();
      setReady(true);
    });
  }, []);

  if (!ready) return <Spinner />;

  // Build the OIDC config with a proper userStore
  const finalOidcConfig = {
    ...oidcConfig,
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  };

  return (
    <OfflineProvider>
    <OidcAuthProvider {...finalOidcConfig}>
    <AuthProvider>
      <NotificationsProvider>
      <ToastProvider>
      <AutoLogout />
      <Router>
        <ErrorBoundary>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/callback" element={<OidcCallback />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="projects" element={<Projects />} />
                <Route path="projects/new" element={<ProjectForm />} />
                <Route path="projects/:id" element={<ProjectDetails />} />
                <Route path="projects/:id/edit" element={<ProjectForm />} />
                <Route path="projects/:projectId/servers/new" element={<ProjectServerForm />} />
                <Route path="projects/:projectId/databases/new" element={<ProjectDatabaseForm />} />
                <Route path="servers" element={<Servers />} />
                <Route path="servers/new" element={<ServerForm />} />
                <Route path="servers/:serverId/edit" element={<ServerForm />} />
                <Route path="databases" element={<DatabaseEngines />} />
                <Route path="databases/new" element={<DatabaseForm />} />
                <Route path="databases/:databaseId/edit" element={<DatabaseForm />} />
                <Route path="projects/:projectId/components/new" element={<ComponentForm />} />
                <Route path="projects/:projectId/components/:componentId/edit" element={<ComponentForm />} />
                <Route path="settings" element={<Settings />} />
                <Route path="settings/connection" element={<ServerConfig />} />
                <Route path="users" element={<Users />} />
                <Route path="groups" element={<Groups />} />
                <Route path="audit-logs" element={<AuditLogs />} />
                <Route path="trash" element={<Trash />} />
                <Route path="*" element={
                  <div className="flex flex-col items-center justify-center h-[60vh]">
                    <h2 className="text-2xl font-bold mb-2">404 - Page Not Found</h2>
                    <p className="text-gray-400">The page you are looking for doesn't exist.</p>
                  </div>
                } />
              </Route>
            </Route>
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </Router>
      </ToastProvider>
      </NotificationsProvider>
    </AuthProvider>
    </OidcAuthProvider>
    </OfflineProvider>
  );
}

export default App;
