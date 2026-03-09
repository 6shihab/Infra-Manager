import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { AutoLogout } from './components/AutoLogout';
import React, { Suspense } from 'react';

const Login = React.lazy(() => import('./pages/Login').then(module => ({ default: module.Login })));
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

function App() {
  return (
    <AuthProvider>
      <NotificationsProvider>
      <AutoLogout />
      <Router>
        <Suspense fallback={<div className="flex h-screen items-center justify-center p-4"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
          <Routes>
            <Route path="/login" element={<Login />} />

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
                <Route path="users" element={<Users />} />
                <Route path="groups" element={<Groups />} />
                <Route path="audit-logs" element={<AuditLogs />} />
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
      </Router>
      </NotificationsProvider>
    </AuthProvider>
  );
}

export default App;
