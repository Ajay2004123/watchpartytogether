import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import AuthPage  from './pages/AuthPage';
import HomePage  from './pages/HomePage';
import RoomPage  from './pages/RoomPage';

const Private = ({ children }) => {
  const { user } = useAuth();
  return user ? children : <Navigate to="/auth" replace />;
};

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/auth"      element={<AuthPage />} />
            <Route path="/"          element={<Private><HomePage /></Private>} />
            <Route path="/room/:id"  element={<Private><RoomPage /></Private>} />
            <Route path="*"          element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
