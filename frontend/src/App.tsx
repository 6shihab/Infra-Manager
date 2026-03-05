import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { ProjectDetails } from './pages/ProjectDetails';
import { ProjectForm } from './pages/ProjectForm';
import { ServerForm } from './pages/ServerForm';
import { DatabaseForm } from './pages/DatabaseForm';
import { ComponentForm } from './pages/ComponentForm';
import { Settings } from './pages/Settings';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/new" element={<ProjectForm />} />
          <Route path="projects/:id" element={<ProjectDetails />} />
          <Route path="projects/:id/edit" element={<ProjectForm />} />
          <Route path="projects/:projectId/servers/new" element={<ServerForm />} />
          <Route path="projects/:projectId/servers/:serverId/edit" element={<ServerForm />} />
          <Route path="projects/:projectId/databases/new" element={<DatabaseForm />} />
          <Route path="projects/:projectId/databases/:databaseId/edit" element={<DatabaseForm />} />
          <Route path="projects/:projectId/components/new" element={<ComponentForm />} />
          <Route path="projects/:projectId/components/:componentId/edit" element={<ComponentForm />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={
            <div className="flex flex-col items-center justify-center h-[60vh]">
              <h2 className="text-2xl font-bold mb-2">404 - Page Not Found</h2>
              <p className="text-gray-400">The page you are looking for doesn't exist.</p>
            </div>
          } />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
