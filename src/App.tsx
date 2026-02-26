import { Routes, Route, Navigate, useParams } from "react-router-dom";
import HomeScreen from "./screens/HomeScreen";
import ProjectDashboard from "./screens/ProjectDashboard";
import WorkspaceShell from "./screens/WorkspaceShell";
import FamilyTreeScreen from "./screens/FamilyTreeScreen";

function WorkspaceRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/project/${id}` : "/"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/family-tree/:projectId" element={<FamilyTreeScreen />} />
      <Route path="/projects/:id" element={<ProjectDashboard />} />
      <Route path="/project/:id" element={<WorkspaceShell />} />
      <Route path="/workspaces/:id" element={<WorkspaceRedirect />} />
    </Routes>
  );
}
