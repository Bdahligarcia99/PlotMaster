import { Routes, Route } from "react-router-dom";
import HomeScreen from "./screens/HomeScreen";
import ProjectDashboard from "./screens/ProjectDashboard";
import WorkspaceShell from "./screens/WorkspaceShell";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/projects/:id" element={<ProjectDashboard />} />
      <Route path="/workspaces/:id" element={<WorkspaceShell />} />
    </Routes>
  );
}
