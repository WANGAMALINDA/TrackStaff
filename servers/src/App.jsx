import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import TrackServDashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Login from "./pages/Login";

export default function App() {
  return (
    <BrowserRouter basename="/TrackStaff/">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<TrackServDashboard name="trackserv-dashboard-root" />} />
        <Route path="/profile" element={<Profile />} />
        
        {/* Default route redirects to Login */}
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}