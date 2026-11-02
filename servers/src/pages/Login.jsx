import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Mail, MapPin, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { supabase } from "../components/supabaseClient";
import "./Login.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const strictEmailPattern = /^[^\s@]+@([a-z0-9-]+\.)+[a-z]{2,63}$/i;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email || !password) {
      setMessage("Please enter both email and password.");
      return;
    }

    if (!strictEmailPattern.test(email.trim())) {
      setMessage("Enter a valid email address, including a domain such as .com or .org.");
      return;
    }

    setIsLoading(true);
    setMessage("Authenticating...");

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setMessage("We couldn't sign you in. Check that your staff email and password are correct, then try again.");
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
    navigate("/dashboard", { replace: true });
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

  const isSuccessMessage = message.startsWith("Login successful") ||
    message.startsWith("Password reset instructions");

  return (
    <main className="staff-login" aria-labelledby="staff-login-title">
      <div className="staff-login__blob staff-login__blob--one" aria-hidden="true" />
      <div className="staff-login__blob staff-login__blob--two" aria-hidden="true" />

      <section className="staff-login__card">
        <div className="staff-login__brand" aria-label="TrackServ Staff Portal">
          <span className="staff-login__brand-icon"><MapPin size={20} aria-hidden="true" /></span>
          <span className="staff-login__brand-name">Track<span>Serv</span></span>
        </div>

        <div className="staff-login__eyebrow">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>Staff Portal</span>
        </div>

        <h1 id="staff-login-title">Welcome back</h1>
        <p className="staff-login__subtitle">
          Sign in to manage and respond to community service reports.
        </p>

        <form className="staff-login__form" onSubmit={handleSubmit} id="loginForm">
          <div className="staff-login__field">
            <label htmlFor="email">Staff email</label>
            <div className="staff-login__input-wrap">
              <Mail className="staff-login__input-icon" size={18} aria-hidden="true" />
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="staff-login__field">
            <label htmlFor="password">Password</label>
            <div className="staff-login__input-wrap">
              <KeyRound className="staff-login__input-icon" size={18} aria-hidden="true" />
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="staff-login__password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={isLoading}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="staff-login__submit" disabled={isLoading}>
            {isLoading ? (
              <><span className="staff-login__spinner" aria-hidden="true" /> Signing in…</>
            ) : "Sign in"}
          </button>
        </form>

        <a href="#forgot" className="staff-login__forgot" onClick={handleForgotPassword}>
          Forgot password?
        </a>

        {message && (
          <div
            className={`staff-login__message ${isSuccessMessage ? "success" : "error"}`}
            role={isSuccessMessage ? "status" : "alert"}
          >
            {message}
          </div>
        )}

        <p className="staff-login__footer">Authorized staff accounts only</p>
      </section>
    </main>
  );
}