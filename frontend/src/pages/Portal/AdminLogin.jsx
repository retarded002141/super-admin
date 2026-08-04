import React, { useState } from 'react';
import iitiLogo from '../../assets/iitilogo.png';
import '../../stylesheets/Portal/adminLogin.css';
import { loginAdmin, verifyAdmin2FA } from '../../services/authService';

export function AdminLogin({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const completeLogin = (token) => {
    localStorage.setItem('adminToken', token);
    localStorage.setItem('isAdminAuthenticated', 'true');
    onLoginSuccess();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const response = await loginAdmin({ email, password });
      if (response?.data?.requires2FA) {
        setMessage(response.data.msg || 'Verification code sent to your email');
        setIsOtpStep(true);
        return;
      }

      const token = response?.data?.token;
      if (!token) {
        throw new Error('Login response did not include a token.');
      }

      completeLogin(token);
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Invalid email/username or password.';
      setError(detail);
      setIsOtpStep(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const response = await verifyAdmin2FA({ email, otp });
      const token = response?.data?.token;
      if (!token) {
        throw new Error('2FA verification response did not include a token.');
      }

      completeLogin(token);
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Invalid verification code.';
      setError(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src={iitiLogo} alt="IITI Logo" className="login-logo" />
          <h1 className="login-title">Admin Portal</h1>
          <p className="login-subtitle">Institute of Information Technology & Innovation</p>
        </div>

        {error && <div className="login-error">{error}</div>}
        {message && <div className="login-success">{message}</div>}

        {!isOtpStep ? (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email or Username</label>
              <input
                id="email"
                type="text"
                placeholder="Enter admin username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="login-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Signing In...' : 'Sign In to Dashboard'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="login-form">
            <div className="form-group">
              <label htmlFor="otp">Verification Code</label>
              <input
                id="otp"
                type="text"
                placeholder="Enter 6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="login-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Verifying...' : 'Verify Code'}
            </button>

            <button
              type="button"
              className="login-btn secondary"
              onClick={() => {
                setIsOtpStep(false);
                setOtp('');
                setMessage('');
              }}
            >
              Back to Login
            </button>
          </form>
        )}

        <div className="login-footer">
          <p>Authorized personnel only</p>
        </div>
      </div>
    </div>
  );
}