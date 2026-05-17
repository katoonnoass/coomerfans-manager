import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { NeonInput } from '../ui/NeonInput';
import { NeonButton } from '../ui/NeonButton';
import { GlassCard } from '../ui/GlassCard';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoggingIn, loginError } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email, password });
      navigate('/');
    } catch { /* error handled by hook */ }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <GlassCard className="w-full max-w-md p-8 animate-scale-in">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            <span className="neon-text-pink">Welcome</span>{' '}
            <span className="neon-text-cyan">Back</span>
          </h1>
          <p className="text-white/30 font-mono text-sm mt-2">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <NeonInput
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <NeonInput
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {loginError && (
            <p className="text-neon-pink text-sm font-mono">
              {(loginError as any)?.response?.data?.error || 'Login failed'}
            </p>
          )}

          <NeonButton type="submit" className="w-full" disabled={isLoggingIn}>
            {isLoggingIn ? 'Signing in...' : 'Sign In'}
          </NeonButton>
        </form>

        <p className="text-center text-white/30 text-sm mt-6">
          Don't have an account?{' '}
          <button
            onClick={() => navigate('/register')}
            className="text-neon-cyan hover:underline"
          >
            Register
          </button>
        </p>
      </GlassCard>
    </div>
  );
}

export function RegisterForm() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { register, isRegistering, registerError } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register({ email, username, password });
      navigate('/');
    } catch { /* error handled by hook */ }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <GlassCard className="w-full max-w-md p-8 animate-scale-in">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            <span className="neon-text-pink">Create</span>{' '}
            <span className="neon-text-cyan">Account</span>
          </h1>
          <p className="text-white/30 font-mono text-sm mt-2">Join the platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <NeonInput
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <NeonInput
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <NeonInput
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {registerError && (
            <p className="text-neon-pink text-sm font-mono">
              {(registerError as any)?.response?.data?.error || 'Registration failed'}
            </p>
          )}

          <NeonButton type="submit" className="w-full" disabled={isRegistering}>
            {isRegistering ? 'Creating account...' : 'Create Account'}
          </NeonButton>
        </form>

        <p className="text-center text-white/30 text-sm mt-6">
          Already have an account?{' '}
          <button
            onClick={() => navigate('/login')}
            className="text-neon-cyan hover:underline"
          >
            Sign In
          </button>
        </p>
      </GlassCard>
    </div>
  );
}
