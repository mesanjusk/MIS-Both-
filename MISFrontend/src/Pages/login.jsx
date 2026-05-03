import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import axios, { getApiBase } from '../apiClient.js';
import { MobileContainer, toast } from '../Components';
import { useAuth } from '../context/AuthContext';
import { setStoredToken } from '../utils/authStorage';

const BACKEND_BASE = getApiBase() || import.meta.env.VITE_API_SERVER || 'https://misbackend-e078.onrender.com';

export default function Login() {
  const navigate = useNavigate();
  const [User_name, setUser_Name] = useState('');
  const [Password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const { setAuthData, userName, userGroup } = useAuth();

  useEffect(() => {
    if (!userName) return;

    const target = userGroup === 'Vendor' ? '/vendorHome' : '/home';
    navigate(target, { replace: true });
  }, [navigate, userGroup, userName]);

 async function checkGoogleDriveAndRedirect(userGroupValue) {
  try {
    const statusRes = await axios.get('/api/google-drive/status', { params: { check: 1 } });
    const connected = !!statusRes?.data?.connected;
    const reconnectRequired = !!statusRes?.data?.reconnectRequired;
    const automationEnabled = !!statusRes?.data?.automationEnabled;

    const target = userGroupValue === 'Vendor' ? '/vendorHome' : '/home';

    if (automationEnabled && (!connected || reconnectRequired)) {
      const returnTo =
        userGroupValue === 'Vendor'
          ? `${window.location.origin}/vendorHome`
          : `${window.location.origin}/home`;

      window.location.href = `${BACKEND_BASE}/api/google-drive/connect?returnTo=${encodeURIComponent(returnTo)}`;
      return;
    }

    navigate(target, { replace: true });
  } catch (error) {
    console.error('Google Drive status check failed:', error);
    const target = userGroupValue === 'Vendor' ? '/vendorHome' : '/home';
    navigate(target, { replace: true });
  }
}
  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setErrorText('');

    try {
      const response = await axios.post('/api/users/login', {
        User_name,
        Password,
      });

      const data = response.data;

      if (data.status === 'notexist') {
        setErrorText('User has not signed up.');
        setLoading(false);
        return;
      }

      if (data.status === 'invalid') {
        setErrorText('Invalid credentials. Please check username and password.');
        setLoading(false);
        return;
      }

      if (!data.token) {
        setErrorText('Login succeeded but token was not received from the server.');
        console.error('Token missing in response:', data);
        setLoading(false);
        return;
      }

      setStoredToken(data.token);

      setAuthData({
        userName: User_name,
        userGroup: data.userGroup,
        mobileNumber: data.userMobile || data.userMob || '',
      });

      toast.success('Login successful. Redirecting...');
      await checkGoogleDriveAndRedirect(data.userGroup);
    } catch (error) {
      console.error('Login error:', error);
      setErrorText('An error occurred during login. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 2 }}>
      <MobileContainer maxWidth="sm">
        <Card sx={{ maxWidth: 460, mx: 'auto' }}>
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Stack spacing={3} component="form" onSubmit={submit}>
              <Box>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  Welcome back
                </Typography>
                <Typography color="text.secondary">Sign in to access your MIS dashboard.</Typography>
              </Box>

              {errorText && <Alert severity="error">{errorText}</Alert>}

              <TextField
                label="User Name"
                autoComplete="username"
                value={User_name}
                onChange={(e) => setUser_Name(e.target.value)}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonRoundedIcon fontSize="small" />
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
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />

              <Button type="submit" variant="contained" fullWidth disabled={loading} endIcon={loading ? <CircularProgress size={18} color="inherit" /> : <LoginRoundedIcon />}>
                {loading ? 'Please wait...' : 'Sign In'}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </MobileContainer>
    </Box>
  );
}
