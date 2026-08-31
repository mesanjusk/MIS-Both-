import { useEffect, useState } from 'react';
import ReactQRCode from 'react-qr-code';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import axios from '../apiClient.js';

/**
 * Business identity — the name, address, GST and UPI ID that appear on every
 * invoice, plus a live preview of the invoice header and payment QR.
 *
 * This used to be a sixth tab inside the Business Control Center, sitting
 * beside five queues of orders needing action. It is not a queue and nothing
 * about it is operational: it is configuration, edited once and then left
 * alone for months. It lives under Admin with the other setup screens now, so
 * the order console is only about orders.
 *
 * The API and payload are unchanged — same GET/PUT /api/business-profile.
 */

const EMPTY_PROFILE = {
  name: '', addressLine1: '', addressLine2: '', city: '',
  phone: '', email: '', gst: '', upiId: '', upiName: '',
};

export default function BusinessProfileSettings() {
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    setProfileLoading(true);
    axios.get('/api/business-profile')
      .then((res) => {
        if (!alive) return;
        if (res.data?.success && res.data.result && Object.keys(res.data.result).length) {
          setProfileForm({ ...EMPTY_PROFILE, ...res.data.result });
        }
      })
      .catch(() => {})
      .finally(() => { if (alive) setProfileLoading(false); });
    return () => { alive = false; };
  }, []);

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await axios.put('/api/business-profile', profileForm);
      if (res.data?.success) {
        setProfileMsg({ severity: 'success', text: 'Business profile saved successfully.' });
      } else {
        setProfileMsg({ severity: 'error', text: res.data?.message || 'Save failed.' });
      }
    } catch (err) {
      setProfileMsg({ severity: 'error', text: err?.response?.data?.message || 'Save failed.' });
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Paper elevation={0} sx={{ p: { xs: 1.25, md: 2 }, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h5" fontWeight={900} color="primary.main">Business Profile</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Appears on invoices and payment links.
        </Typography>
      <Box sx={{ mt: 2 }}>
        {profileLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : (
          <Grid container spacing={2}>
            <Grid item xs={12} md={7}>
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                <Typography variant="subtitle1" fontWeight={800} gutterBottom>Business Details</Typography>
                {profileMsg && <Alert severity={profileMsg.severity} sx={{ mb: 2, borderRadius: 2 }}>{profileMsg.text}</Alert>}
                <Stack spacing={2}>
                  <TextField label="Business Name" value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} fullWidth size="small" />
                  <TextField label="Address Line 1" value={profileForm.addressLine1} onChange={(e) => setProfileForm((p) => ({ ...p, addressLine1: e.target.value }))} fullWidth size="small" />
                  <TextField label="Address Line 2" value={profileForm.addressLine2} onChange={(e) => setProfileForm((p) => ({ ...p, addressLine2: e.target.value }))} fullWidth size="small" />
                  <TextField label="City" value={profileForm.city} onChange={(e) => setProfileForm((p) => ({ ...p, city: e.target.value }))} fullWidth size="small" />
                  <Grid container spacing={1.5}>
                    <Grid item xs={12} sm={6}>
                      <TextField label="Phone" value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} fullWidth size="small" />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField label="Email" value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} fullWidth size="small" />
                    </Grid>
                  </Grid>
                  <TextField label="GST Number" value={profileForm.gst} onChange={(e) => setProfileForm((p) => ({ ...p, gst: e.target.value }))} fullWidth size="small" placeholder="e.g. 27AABCU9603R1ZX" />
                  <Grid container spacing={1.5}>
                    <Grid item xs={12} sm={6}>
                      <TextField label="UPI ID" value={profileForm.upiId} onChange={(e) => setProfileForm((p) => ({ ...p, upiId: e.target.value }))} fullWidth size="small" placeholder="e.g. business@upi" />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField label="UPI Name (display)" value={profileForm.upiName} onChange={(e) => setProfileForm((p) => ({ ...p, upiName: e.target.value }))} fullWidth size="small" />
                    </Grid>
                  </Grid>
                  <Button
                    variant="contained"
                    disabled={profileSaving}
                    onClick={saveProfile}
                    sx={{ alignSelf: 'flex-start', borderRadius: 2, bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
                  >
                    {profileSaving ? 'Saving…' : 'Save Business Profile'}
                  </Button>
                </Stack>
              </Paper>
            </Grid>

            <Grid item xs={12} md={5}>
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, textAlign: 'center' }}>
                <Typography variant="subtitle1" fontWeight={800} gutterBottom>Invoice QR Preview</Typography>
                {profileForm.upiId ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                      <ReactQRCode
                        value={`upi://pay?pa=${encodeURIComponent(profileForm.upiId)}&pn=${encodeURIComponent(profileForm.upiName || profileForm.name || '')}&cu=INR`}
                        size={160}
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary">{profileForm.upiId}</Typography>
                    <Typography variant="caption" color="text.secondary">This QR will appear on all invoices</Typography>
                  </>
                ) : (
                  <Box sx={{ py: 4, color: 'text.disabled' }}>
                    <Typography variant="body2">Enter a UPI ID to see the QR preview</Typography>
                  </Box>
                )}
              </Paper>

              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom color="text.secondary">Invoice Header Preview</Typography>
                <Typography variant="body1" fontWeight={800}>{profileForm.name || '—'}</Typography>
                {profileForm.addressLine1 && <Typography variant="caption" display="block">{profileForm.addressLine1}</Typography>}
                {profileForm.addressLine2 && <Typography variant="caption" display="block">{profileForm.addressLine2}</Typography>}
                {profileForm.city && <Typography variant="caption" display="block">{profileForm.city}</Typography>}
                {profileForm.phone && <Typography variant="caption" display="block">📞 {profileForm.phone}</Typography>}
                {profileForm.email && <Typography variant="caption" display="block">✉ {profileForm.email}</Typography>}
                {profileForm.gst && <Typography variant="caption" display="block">GST: {profileForm.gst}</Typography>}
              </Paper>
            </Grid>
          </Grid>
        )}
      </Box>
      </Paper>
    </Box>
  );
}
