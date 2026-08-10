import ChatPage from "./pages/ChatPage";
import DashboardPage from "./pages/DashboardPage";

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith("/dashboard")) return <DashboardPage />;
  return <ChatPage />;
}
