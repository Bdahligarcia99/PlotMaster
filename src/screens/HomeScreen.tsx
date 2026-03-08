/**
 * Renders the empty shell when no project is loaded.
 * The IntroDialog (Create/Recents) is rendered by App and overlays this.
 */
export default function HomeScreen() {
  return (
    <div className="min-h-screen bg-dark-bg" aria-hidden="true" />
  );
}
