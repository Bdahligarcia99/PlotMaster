import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import HomeScreen from "./screens/HomeScreen";
import ProjectDashboard from "./screens/ProjectDashboard";
import WorkspaceShell from "./screens/WorkspaceShell";
import FamilyTreeScreen from "./screens/FamilyTreeScreen";
import TimelineScreen from "./screens/TimelineScreen";
import IntroDialog from "./components/home/IntroDialog";
import { useAppStore } from "./store/appStore";
import { useIntroWindowSize } from "./hooks/useIntroWindowSize";

function WorkspaceRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/project/${id}` : "/"} replace />;
}

export default function App() {
  const location = useLocation();
  const introDialogOpen = useAppStore((s) => s.introDialogOpen);
  const setIntroDialogOpen = useAppStore((s) => s.setIntroDialogOpen);

  useIntroWindowSize();

  const isAtRoot = location.pathname === "/";
  const showIntroDialog = isAtRoot || introDialogOpen;
  const canClose = introDialogOpen && !isAtRoot;

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            isAtRoot ? (
              <IntroDialog
                isOpen={true}
                onClose={() => setIntroDialogOpen(false)}
                canClose={false}
                standalone={true}
              />
            ) : (
              <HomeScreen />
            )
          }
        />
        <Route path="/family-tree/:projectId" element={<FamilyTreeScreen />} />
        <Route path="/timeline/:projectId" element={<TimelineScreen />} />
        <Route path="/projects/:id" element={<ProjectDashboard />} />
        <Route path="/project/:id" element={<WorkspaceShell />} />
        <Route path="/workspaces/:id" element={<WorkspaceRedirect />} />
      </Routes>
      {showIntroDialog && !isAtRoot && (
        <IntroDialog
          isOpen={true}
          onClose={() => setIntroDialogOpen(false)}
          canClose={canClose}
        />
      )}
    </>
  );
}
