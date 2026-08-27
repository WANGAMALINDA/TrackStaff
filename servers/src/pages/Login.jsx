import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Eye, EyeOff } from "lucide-react";
import { supabase } from "../components/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email || !password) {
      setMessage("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    setMessage("Authenticating...");

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setMessage(authError.message);
      setIsLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("role, username, full_name")
      .eq("id", authData.user.id)
      .single();

    if (profileError) {
      console.error("Error fetching profile:", profileError.message);
      await supabase.auth.signOut();
      setMessage("Unable to verify your account. Please try again.");
      setIsLoading(false);
      return;
    }

    if (profileData?.role !== "staff") {
      await supabase.auth.signOut();
      setMessage("This login is restricted to staff accounts.");
      setIsLoading(false);
      return;
    }

    setMessage("Login successful. Redirecting...");
    navigate("/dashboard");
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    if (!email) {
      setMessage("Please enter your email address first to reset your password.");
      return;
    }
    
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Password reset instructions sent to your email.");
    }
    setIsLoading(false);
  };

  return (
    <div className="login-page-wrapper">
      <style>{`
        .login-page-wrapper {
          --green: #087f4f;
          --green-dark: #066b43;
          --green-light: #e7f5ee;
          --text: #18212f;
          --muted: #68717d;
          --border: #cfd6d2;

          min-height: 100vh;
          font-family: Arial, Helvetica, sans-serif;
          color: var(--text);
          background: #f8fbfa;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 30px 18px;
          position: relative;
          overflow-x: hidden;
          overflow-y: auto;
        }

        .login-page-wrapper::before,
        .login-page-wrapper::after {
          content: "";
          position: fixed;
          width: 360px;
          height: 360px;
          border-radius: 50%;
          z-index: 0;
        }

        .login-page-wrapper::before {
          background: var(--green-light);
          top: -100px;
          right: -100px;
        }

        .login-page-wrapper::after {
          background: var(--green-light);
          bottom: -100px;
          left: -100px;
        }

        .login-container {
          background: #ffffff;
          width: 100%;
          max-width: 420px;
          padding: 40px 32px;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
          position: relative;
          z-index: 1;
        }

        .header-box {
          margin-bottom: 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .brand-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }

        .form-group {
          margin-bottom: 20px;
          position: relative;
        }

        .form-group label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .form-group input {
          width: 100%;
          padding: 12px 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          outline: none;
          font-size: 15px;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }

        .form-group input:focus {
          border-color: var(--green);
          box-shadow: 0 0 0 3px var(--green-light);
        }

        .toggle-password {
          position: absolute;
          right: 14px;
          top: 36px;
          background: none;
          border: none;
          cursor: pointer;
          color: var(--muted);
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .login-btn {
          width: 100%;
          padding: 14px;
          background: var(--green);
          color: #ffffff;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: background 0.2s;
          margin-top: 10px;
        }

        .login-btn:hover:not(:disabled) {
          background: var(--green-dark);
        }
        
        .login-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .forgot-password {
          display: block;
          text-align: center;
          margin-top: 20px;
          font-size: 14px;
          color: var(--green);
          text-decoration: none;
          font-weight: 600;
        }

        .status-message {
          margin-top: 20px;
          padding: 12px;
          border-radius: 8px;
          background: var(--green-light);
          color: var(--green-dark);
          font-size: 14px;
          text-align: center;
          font-weight: 500;
        }
      `}</style>

      <div className="login-container">
        <div className="header-box">
          <div className="brand-header">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                backgroundColor: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <MapPin size={20} color="#fff" />
            </div>
            {!isMobile && (
              <div style={{ lineHeight: 1.2, textAlign: "left" }}>
                <p style={{ margin: 0, fontWeight: 700, color: "#111827", fontSize: 18 }}>
                  Track<span style={{ color: "#059669" }}>Serv</span>
                </p>
                <p style={{ margin: 0, marginTop: -2, fontSize: 11, color: "#6b7280" }}>
                  Unified Citizen Hub
                </p>
              </div>
            )}
          </div>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: 0 }}>
            Sign In to your account
          </p>
        </div>

        <form onSubmit={handleSubmit} id="loginForm">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type={showPassword ? "text" : "password"}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={isLoading}
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword(!showPassword)}
              aria-label="Toggle password visibility"
              disabled={isLoading}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button type="submit" className="login-btn" disabled={isLoading}>
            {isLoading ? "Authenticating..." : "Sign In"}
          </button>
        </form>

        <a href="#forgot" className="forgot-password" onClick={handleForgotPassword}>
          Forgot Password?
        </a>

        {message && <div className="status-message">{message}</div>}
      </div>
    </div>
  );
}