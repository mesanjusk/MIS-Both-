import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import axios from '../apiClient.js';
import { startGoogleDriveConnect } from '../utils/googleDriveConnect';
import { toast } from '../Components';
import { useAuth } from '../context/AuthContext';
import { getStoredToken, setStoredToken } from '../utils/authStorage';

const GOOGLE_COLORS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'];

function ColoredBrand({ text }) {
  let ci = 0;
  return (
    <Box component="span">
      {text.split('').map((ch, i) => {
        if (ch === ' ') return <Box key={i} component="span" sx={{ display: 'inline-block', width: '0.3em' }} />;
        const col = GOOGLE_COLORS[ci++ % GOOGLE_COLORS.length];
        return <Box key={i} component="span" sx={{ color: col }}>{ch}</Box>;
      })}
    </Box>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [User_name, setUser_Name] = useState('');
  const [Password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const { setAuthData, userName, userGroup } = useAuth();

  const ensureMandatoryGoogleDrive = useCallback(async (userGroupValue) => {
    const target = userGroupValue === 'Vendor' ? '/vendorHome' : '/home';

    try {
      const statusRes = await axios.get('/api/google-drive/status', { params: { check: 1 } });
      const status = statusRes?.data || {};

      if (!status.oauthConfigured || status.configurationRequired) {
        setErrorText('Google Drive is mandatory, but Google OAuth is not configured on the server. Please contact the administrator.');
        return false;
      }

      if (status.connected && !status.reconnectRequired) {
        navigate(target, { replace: true });
        return true;
      }

      const normalizedRole = String(userGroupValue || '').trim().toLowerCase();
      const canConnectDrive = ['admin', 'owner', 'manager'].includes(normalizedRole);

      if (!canConnectDrive) {
        setErrorText('Google Drive connection is mandatory. An Admin/Owner/Manager must reconnect Google Drive before you can continue.');
        return false;
      }

      const returnTo = `${window.location.origin}${target}`;
      const redirecting = await startGoogleDriveConnect(returnTo);
      if (!redirecting) {
        setErrorText('Google Drive connection is mandatory and could not be started. Please check the Google OAuth configuration.');
      }
      return redirecting;
    } catch (error) {
      console.error('Mandatory Google Drive check failed:', error);
      setErrorText(error?.response?.data?.message || 'Google Drive is mandatory and its connection could not be verified. Please try again.');
      return false;
    }
  }, [navigate]);

  useEffect(() => {
    if (!userName || !getStoredToken()) return;
    void ensureMandatoryGoogleDrive(userGroup);
  }, [ensureMandatoryGoogleDrive, userGroup, userName]);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setErrorText('');
    try {
      const response = await axios.post('/api/users/login', { User_name, Password });
      const data = response.data;
      if (data.status === 'notexist') { setErrorText('User has not signed up.'); setLoading(false); return; }
      if (data.status === 'invalid') { setErrorText('Invalid credentials. Please check username and password.'); setLoading(false); return; }
      if (!data.token) { setErrorText('Login succeeded but token was not received from the server.'); setLoading(false); return; }
      setStoredToken(data.token);
      setAuthData({
        userName: User_name,
        userGroup: data.userGroup,
        mobileNumber: data.userMobile || data.userMob || '',
        permissions: data.permissions || {},
      });
      toast.success('Login successful. Verifying Google Drive...');
      await ensureMandatoryGoogleDrive(data.userGroup);
    } catch (error) {
      console.error('Login error:', error);
      setErrorText('An error occurred during login. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 2,
        py: 4,
      }}
    >
      <Paper
        elevation={0}
        sx={(t) => ({
          width: '100%',
          maxWidth: 420,
          borderRadius: 4,
          overflow: 'hidden',
          border: `1.5px solid ${t.palette.divider}`,
          boxShadow: `0 8px 40px ${alpha(t.palette.primary.main, 0.12)}`,
        })}
      >
        {/* Brand header */}
        <Box
          sx={(t) => ({
            background: `linear-gradient(135deg, ${t.palette.primary.main} 0%, ${t.palette.primary.dark} 100%)`,
            px: 4,
            py: 3.5,
            textAlign: 'center',
          })}
        >
          <Typography
            sx={{
              fontFamily: '"Google Sans","Product Sans",Roboto,sans-serif',
              fontWeight: 900,
              fontSize: '1.75rem',
              color: 'white',
              letterSpacing: 0.5,
              lineHeight: 1,
              mb: 0.75,
              userSelect: 'none',
            }}
          >
            SK Digital MIS
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.78)', fontWeight: 500 }}>
            Management Information System
          </Typography>
        </Box>

        {/* Form */}
        <Box component="form" onSubmit={submit} sx={{ px: { xs: 3, md: 4 }, pt: 3.5, pb: 4 }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography
                sx={{
                  fontFamily: '"Google Sans","Product Sans",Roboto,sans-serif',
                  fontWeight: 900,
                  fontSize: '1.15rem',
                  lineHeight: 1.2,
                  mb: 0.5,
                }}
              >
                <ColoredBrand text="Welcome back" />
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Sign in to access your dashboard
              </Typography>
            </Box>

            {errorText && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {errorText}
              </Alert>
            )}

            <TextField
              label="Username"
              autoComplete="username"
              value={User_name}
              onChange={(e) => setUser_Name(e.target.value)}
              required
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonRoundedIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={Password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockRoundedIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              endIcon={loading ? <CircularProgress size={18} color="inherit" /> : <LoginRoundedIcon />}
              sx={{ py: 1.25, borderRadius: 2.5, fontWeight: 800, fontSize: '0.95rem' }}
            >
              {loading ? 'Please wait…' : 'Sign In'}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
