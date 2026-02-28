import { createContext, useState, useContext } from 'react';

const AuthContext = createContext();
const API = process.env.REACT_APP_API_URL;

export const AuthProvider = ({ children }) => {
  const [user,  setUser]  = useState(() => JSON.parse(localStorage.getItem('wp_user'))  || null);
  const [token, setToken] = useState(() => localStorage.getItem('wp_token') || null);

  const login = (u, t) => {
    localStorage.setItem('wp_user',  JSON.stringify(u));
    localStorage.setItem('wp_token', t);
    setUser(u); setToken(t);
  };

  const logout = () => {
    localStorage.removeItem('wp_user');
    localStorage.removeItem('wp_token');
    setUser(null); setToken(null);
  };

  const authFetch = (url, opts = {}) =>
    fetch(`${API}${url}`, {
      ...opts,
      headers: { 'Authorization': `Bearer ${token}`, ...(opts.headers || {}) },
    });

  return (
    <AuthContext.Provider value={{ user, token, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
