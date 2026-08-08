import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, Grid, IconButton, MenuItem, Paper, Stack,
  TextField, Typography,
} from '@mui/material';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import PermMediaRoundedIcon from '@mui/icons-material/PermMediaRounded';
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded';
import toast from 'react-hot-toast';
import {
  createPost, updatePost, getPost, submitPost, approvePost, rejectPost,
  schedulePost, publishPostNow, cancelPost, uploadAsset, listAssets, listAccounts,
} from '../services/socialMediaService';
import { SOCIAL_PLATFORMS, PLATFORM_LABELS, SOCIAL_CONTENT_TYPES } from '../constants/social';
import { ROUTES } from '../constants/routes';

function AssetPickerDialog({ open, onClose, onPick }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    listAssets({ limit: 100 }).then(({ data }) => setAssets(data)).finally(() => setLoading(false));
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Add from Content Library</DialogTitle>
      <DialogContent>
        {loading ? <CircularProgress /> : (
          <Grid container spacing={1}>
            {assets.map((a) => (
              <Grid item xs={4} sm={3} md={2} key={a._id}>
                <Box
                  component="img"
                  src={a.thumbnailUrl || a.url}
                  onClick={() => { onPick(a); onClose(); }}
                  sx={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 1.5, cursor: 'pointer', border: '1px solid', borderColor: 'divider' }}
                />
              </Grid>
            ))}
            {!assets.length && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No assets in your library yet.</Typography>}
          </Grid>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

const emptyPost = () => ({
  title: '', contentType: 'image', assets: [], caption: '', hashtags: [],
  platforms: [], accountsByPlatform: {}, platformSettings: {}, scheduledAt: '', timezone: 'Asia/Kolkata',
  status: 'DRAFT', approvalStatus: 'NOT_SUBMITTED',
});

export default function SocialCreatePost() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [post, setPost] = useState(emptyPost());
  const [assetObjs, setAssetObjs] = useState([]); // full asset docs for preview
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);

  const loadAccounts = useCallback(async () => {
    const data = await listAccounts({ status: 'CONNECTED' });
    setAccounts(data);
  }, []);

  useEffect(() => {
    loadAccounts();
    if (!id) return;
    setLoading(true);
    getPost(id).then((data) => {
      setPost({
        ...data,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt).toISOString().slice(0, 16) : '',
        assets: (data.assets || []).map((a) => a._id),
        accountsByPlatform: data.accountsByPlatform || {},
      });
      setAssetObjs(data.assets || []);
    }).catch(() => toast.error('Failed to load post')).finally(() => setLoading(false));
  }, [id, loadAccounts]);

  const isEditable = ['DRAFT', 'REJECTED'].includes(post.status) || !id;

  const set = (patch) => setPost((p) => ({ ...p, ...patch }));

  const handleUpload = async (files) => {
    for (const file of Array.from(files || [])) {
      try {
        const asset = await uploadAsset(file);
        setAssetObjs((prev) => [...prev, asset]);
        set({ assets: [...post.assets, asset._id] });
      } catch (err) {
        toast.error(err?.response?.data?.message || 'Upload failed');
      }
    }
  };

  const removeAsset = (assetId) => {
    setAssetObjs((prev) => prev.filter((a) => a._id !== assetId));
    set({ assets: post.assets.filter((a) => a !== assetId) });
  };

  const togglePlatform = (platform) => {
    const active = post.platforms.includes(platform);
    set({ platforms: active ? post.platforms.filter((p) => p !== platform) : [...post.platforms, platform] });
  };

  const setPlatformAccount = (platform, accountId) => {
    set({ accountsByPlatform: { ...post.accountsByPlatform, [platform]: accountId } });
  };

  const setPlatformSetting = (key, value) => set({ platformSettings: { ...post.platformSettings, [key]: value } });

  const buildPayload = () => ({
    title: post.title,
    contentType: post.contentType,
    assets: post.assets,
    caption: post.caption,
    hashtags: post.hashtags,
    platforms: post.platforms,
    accountsByPlatform: post.accountsByPlatform,
    platformSettings: post.platformSettings,
    scheduledAt: post.scheduledAt || null,
    timezone: post.timezone,
    campaign: post.campaign || null,
  });

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      if (id) {
        const updated = await updatePost(id, buildPayload());
        setPost((p) => ({ ...p, ...updated }));
        toast.success('Draft saved');
      } else {
        const created = await createPost(buildPayload());
        toast.success('Draft created');
        navigate(`${ROUTES.SOCIAL_CREATE_POST}/${created._id}`, { replace: true });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (fn, successMsg) => {
    setSaving(true);
    try {
      const updated = await fn();
      if (updated) setPost((p) => ({ ...p, ...updated }));
      toast.success(successMsg);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <AddPhotoAlternateRoundedIcon color="primary" sx={{ fontSize: 30 }} />
        <Box>
          <Typography variant="h5" fontWeight={900}>{id ? 'Edit Post' : 'Create Post'}</Typography>
          <Chip size="small" label={post.status} sx={{ mt: 0.5 }} />
        </Box>
      </Stack>

      {post.status === 'REJECTED' && post.rejectionReason && (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 2, borderColor: 'error.main', bgcolor: 'error.lighter' }}>
          <Typography variant="subtitle2" color="error.main" fontWeight={800}>Rejected:</Typography>
          <Typography variant="body2">{post.rejectionReason}</Typography>
        </Paper>
      )}

      <Grid container spacing={2}>
        {/* LEFT — media */}
        <Grid item xs={12} md={3}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>Media</Typography>
              <Stack spacing={1} sx={{ mb: 1 }}>
                {assetObjs.map((a) => (
                  <Paper key={a._id} variant="outlined" sx={{ p: 0.5, borderRadius: 1.5, position: 'relative' }}>
                    <Box component="img" src={a.thumbnailUrl || a.url} sx={{ width: '100%', borderRadius: 1, display: 'block' }} />
                    {isEditable && (
                      <IconButton size="small" onClick={() => removeAsset(a._id)} sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(255,255,255,.85)' }}>
                        <DeleteRoundedIcon fontSize="small" color="error" />
                      </IconButton>
                    )}
                  </Paper>
                ))}
              </Stack>
              {isEditable && (
                <Stack spacing={1}>
                  <Button size="small" variant="outlined" startIcon={<CloudUploadRoundedIcon />} onClick={() => fileInputRef.current?.click()}>Upload</Button>
                  <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
                  <Button size="small" variant="text" startIcon={<PermMediaRoundedIcon />} onClick={() => setPickerOpen(true)}>Add from Library</Button>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* CENTER — caption + platforms */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent>
              <Stack spacing={2}>
                <TextField label="Internal title (not published)" value={post.title} disabled={!isEditable} onChange={(e) => set({ title: e.target.value })} fullWidth size="small" />
                <TextField select label="Content type" value={post.contentType} disabled={!isEditable} onChange={(e) => set({ contentType: e.target.value })} size="small">
                  {SOCIAL_CONTENT_TYPES.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                </TextField>
                <TextField label="Caption" value={post.caption} disabled={!isEditable} onChange={(e) => set({ caption: e.target.value })} fullWidth multiline minRows={4} />
                <TextField
                  label="Hashtags (comma-separated)"
                  value={post.hashtags.join(', ')}
                  disabled={!isEditable}
                  onChange={(e) => set({ hashtags: e.target.value.split(',').map((h) => h.trim()).filter(Boolean) })}
                  fullWidth size="small"
                />

                <Typography variant="subtitle2" fontWeight={800}>Platforms</Typography>
                <Stack spacing={1}>
                  {SOCIAL_PLATFORMS.map((platform) => {
                    const platformAccounts = accounts.filter((a) => a.platform === platform);
                    const checked = post.platforms.includes(platform);
                    return (
                      <Paper key={platform} variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                          <FormControlLabel
                            control={<Checkbox checked={checked} disabled={!isEditable || !platformAccounts.length} onChange={() => togglePlatform(platform)} />}
                            label={PLATFORM_LABELS[platform]}
                          />
                          {!platformAccounts.length ? (
                            <Chip size="small" label="Not connected" onClick={() => navigate(ROUTES.SOCIAL_ACCOUNTS)} clickable />
                          ) : checked ? (
                            <TextField
                              select size="small" sx={{ minWidth: 160 }}
                              value={post.accountsByPlatform[platform] || ''}
                              disabled={!isEditable}
                              onChange={(e) => setPlatformAccount(platform, e.target.value)}
                            >
                              {platformAccounts.map((a) => <MenuItem key={a._id} value={a._id}>{a.name}</MenuItem>)}
                            </TextField>
                          ) : null}
                        </Stack>

                        {checked && platform === 'youtube' && (
                          <Stack spacing={1} sx={{ mt: 1 }}>
                            <TextField size="small" label="YouTube title" disabled={!isEditable} value={post.platformSettings.youtubeTitle || ''} onChange={(e) => setPlatformSetting('youtubeTitle', e.target.value)} />
                            <TextField size="small" label="YouTube description" multiline disabled={!isEditable} value={post.platformSettings.youtubeDescription || ''} onChange={(e) => setPlatformSetting('youtubeDescription', e.target.value)} />
                            <TextField select size="small" label="Privacy" disabled={!isEditable} value={post.platformSettings.youtubePrivacy || 'public'} onChange={(e) => setPlatformSetting('youtubePrivacy', e.target.value)}>
                              <MenuItem value="public">Public</MenuItem>
                              <MenuItem value="unlisted">Unlisted</MenuItem>
                              <MenuItem value="private">Private</MenuItem>
                            </TextField>
                          </Stack>
                        )}
                        {checked && platform === 'linkedin' && (
                          <TextField select size="small" sx={{ mt: 1 }} label="Visibility" disabled={!isEditable} value={post.platformSettings.linkedinVisibility || 'PUBLIC'} onChange={(e) => setPlatformSetting('linkedinVisibility', e.target.value)}>
                            <MenuItem value="PUBLIC">Public</MenuItem>
                            <MenuItem value="CONNECTIONS">Connections only</MenuItem>
                          </TextField>
                        )}
                        {checked && platform === 'tiktok' && (
                          <Stack spacing={1} sx={{ mt: 1 }}>
                            <TextField select size="small" label="Privacy" disabled={!isEditable} value={post.platformSettings.tiktokPrivacyLevel || ''} onChange={(e) => setPlatformSetting('tiktokPrivacyLevel', e.target.value)}>
                              <MenuItem value="SELF_ONLY">Only Me</MenuItem>
                              <MenuItem value="MUTUAL_FOLLOW_FRIENDS">Friends</MenuItem>
                              <MenuItem value="PUBLIC_TO_EVERYONE">Everyone (requires TikTok audit approval)</MenuItem>
                            </TextField>
                          </Stack>
                        )}
                        {checked && (platform === 'instagram' || platform === 'facebook') && (
                          <TextField size="small" sx={{ mt: 1 }} fullWidth label="First comment (optional)" disabled={!isEditable} value={post.platformSettings.firstComment || ''} onChange={(e) => setPlatformSetting('firstComment', e.target.value)} />
                        )}
                      </Paper>
                    );
                  })}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* RIGHT — schedule + actions */}
        <Grid item xs={12} md={3}>
          <Stack spacing={2}>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>Schedule</Typography>
                <TextField
                  type="datetime-local" size="small" fullWidth
                  disabled={!isEditable}
                  value={post.scheduledAt}
                  onChange={(e) => set({ scheduledAt: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  label="Publish at"
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>Timezone: {post.timezone}</Typography>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>Actions</Typography>
                <Stack spacing={1}>
                  {isEditable && (
                    <>
                      <Button variant="outlined" disabled={saving} onClick={handleSaveDraft}>Save Draft</Button>
                      {id && post.status !== 'PENDING_APPROVAL' && (
                        <Button variant="contained" disabled={saving} onClick={() => runAction(() => submitPost(id), 'Submitted for approval')}>
                          Submit for Approval
                        </Button>
                      )}
                    </>
                  )}
                  {post.approvalStatus === 'PENDING' && (
                    <>
                      <Button variant="contained" color="success" disabled={saving} onClick={() => runAction(() => approvePost(id), 'Approved')}>Approve</Button>
                      <Button variant="outlined" color="error" disabled={saving} onClick={() => setRejectOpen(true)}>Reject</Button>
                    </>
                  )}
                  {post.approvalStatus === 'APPROVED' && (
                    <>
                      <Button
                        variant="contained"
                        disabled={saving || !post.scheduledAt}
                        onClick={() => runAction(() => schedulePost(id, new Date(post.scheduledAt).toISOString(), post.timezone), 'Scheduled')}
                      >
                        Schedule
                      </Button>
                      <Button variant="outlined" disabled={saving} onClick={() => runAction(() => publishPostNow(id), 'Publishing now')}>Publish Now</Button>
                    </>
                  )}
                  {['SCHEDULED', 'APPROVED', 'PENDING_APPROVAL'].includes(post.status) && id && (
                    <Button variant="text" color="error" disabled={saving} onClick={() => runAction(() => cancelPost(id), 'Cancelled')}>Cancel</Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      <AssetPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(asset) => { setAssetObjs((prev) => [...prev, asset]); set({ assets: [...post.assets, asset._id] }); }}
      />

      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Reject post</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth multiline minRows={3} label="Reason (required)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button
            variant="contained" color="error"
            onClick={async () => {
              if (!rejectReason.trim()) { toast.error('Reason is required'); return; }
              await runAction(() => rejectPost(id, rejectReason.trim()), 'Rejected');
              setRejectOpen(false);
            }}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
