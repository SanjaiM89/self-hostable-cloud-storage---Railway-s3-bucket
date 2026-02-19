import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Loader from './components/Loader';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const EditorPage = lazy(() => import('./pages/EditorPage'));
const SharedFilePage = lazy(() => import('./pages/SharedFilePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const MusicLayout = lazy(() => import('./music/MusicLayout'));
const MusicHome = lazy(() => import('./music/MusicHome'));
const MusicLibrary = lazy(() => import('./music/MusicLibrary'));
const Favorites = lazy(() => import('./music/Favorites'));
const YouTube = lazy(() => import('./music/YouTube'));
const Discovery = lazy(() => import('./music/Discovery'));
const Playlists = lazy(() => import('./music/Playlists'));
const MusicSettings = lazy(() => import('./music/MusicSettings'));

function LoadingFallback() {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary, #1e1e2e)',
      color: 'var(--text-secondary, #999)',
      fontSize: '14px',
    }}>
      <div className="flex flex-col items-center gap-2" style={{ textAlign: 'center' }}>
        <Loader className="scale-75" />
        Loading...
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/" replace /> : children;
}

function HomeRoute() {
  const { user } = useAuth();
  if (user?.is_admin) {
    return <Navigate to="/admin" replace />;
  }
  return <Dashboard />;
}

import ChatSidebar from './components/ai/ChatSidebar';
import GlobalPlayer from './components/GlobalPlayer';

export default function App() {
  return (
    <Router>
      <ChatSidebar />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomeRoute />
              </ProtectedRoute>
            }
          />
          <Route
            path="/share/:token"
            element={<SharedFilePage />}
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/music"
            element={
              <ProtectedRoute>
                <MusicLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<MusicHome />} />
            <Route path="library" element={<MusicLibrary />} />
            <Route path="favorites" element={<Favorites />} />
            <Route path="discovery" element={<Discovery />} />
            <Route path="playlists" element={<Playlists />} />
            <Route path="youtube" element={<YouTube />} />
            <Route path="settings" element={<MusicSettings />} />
          </Route>
          <Route
            path="/editor/:fileId"
            element={
              <ProtectedRoute>
                <EditorPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
      <GlobalPlayer />
    </Router>
  );
}
