import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Grid, IconButton, LinearProgress, Paper, Stack, TextField, Typography,
} from '@mui/material';
import PermMediaRoundedIcon from '@mui/icons-material/PermMediaRounded';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import PlayCircleRoundedIcon from '@mui/icons-material/PlayCircleRounded';
import toast from 'react-hot-toast';
import { listAssets, uploadAsset, deleteAsset } from '../services/socialMediaService';

export default function SocialContentLibrary() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (kindFilter) params.kind = kindFilter;
      if (search) params.search = search;
      const { data } = await listAssets(params);
      setAssets(data);
    } catch {
      toast.error('Failed to load content library');
    } finally {
      setLoading(false);
    }
  }, [kindFilter, search]);

  useEffect(() => { load(); }, [load]);

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        setProgress(0);
        await uploadAsset(file, {}, (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
        });
      }
      toast.success('Upload complete');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFiles(Array.from(e.dataTransfer.files || []));
  };

  const handleDelete = async (asset) => {
    if (!window.confirm(`Delete "${asset.format || asset.kind}" asset?`)) return;
    try {
      await deleteAsset(asset._id);
      toast.success('Asset deleted');
      setAssets((prev) => prev.filter((a) => a._id !== asset._id));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Delete failed (asset may still be in use by a post)');
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <PermMediaRoundedIcon color="primary" sx={{ fontSize: 30 }} />
        <Box>
          <Typography variant="h5" fontWeight={900}>Content Library</Typography>
          <Typography variant="caption" color="text.secondary">Reusable media — one upload, use across multiple platforms</Typography>
        </Box>
      </Stack>

      <Paper
        variant="outlined"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        sx={{ p: 3, borderRadius: 2, borderStyle: 'dashed', textAlign: 'center', cursor: 'pointer', mb: 2 }}
      >
        <CloudUploadRoundedIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="body2" fontWeight={700}>Drag & drop images/video here, or click to browse</Typography>
        <Typography variant="caption" color="text.secondary">JPEG/PNG/WEBP/GIF up to 25MB · MP4/MOV/WEBM up to 500MB</Typography>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          hidden
          onChange={(e) => handleFiles(Array.from(e.target.files || []))}
        />
        {uploading && <LinearProgress variant="determinate" value={progress} sx={{ mt: 1.5, borderRadius: 1 }} />}
      </Paper>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" rowGap={1}>
        <TextField size="small" placeholder="Search tags…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {['image', 'video'].map((k) => (
          <Chip
            key={k}
            label={k === 'image' ? 'Images' : 'Videos'}
            color={kindFilter === k ? 'primary' : 'default'}
            onClick={() => setKindFilter(kindFilter === k ? null : k)}
            variant={kindFilter === k ? 'filled' : 'outlined'}
          />
        ))}
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={1.5}>
          {assets.map((asset) => (
            <Grid item xs={6} sm={4} md={2} key={asset._id}>
              <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                <Box sx={{ position: 'relative', pt: '100%', bgcolor: 'grey.100' }}>
                  <Box
                    component="img"
                    src={asset.thumbnailUrl || asset.url}
                    alt=""
                    sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {asset.kind === 'video' && (
                    <PlayCircleRoundedIcon sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#fff', fontSize: 32, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.6))' }} />
                  )}
                  <IconButton
                    size="small"
                    onClick={() => handleDelete(asset)}
                    sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: '#fff' } }}
                  >
                    <DeleteRoundedIcon fontSize="small" color="error" />
                  </IconButton>
                </Box>
                <Box sx={{ p: 0.75 }}>
                  <Typography variant="caption" noWrap display="block">{asset.format} · {Math.round((asset.bytes || 0) / 1024)}KB</Typography>
                  {asset.usageCount > 0 && <Chip size="small" label={`Used in ${asset.usageCount}`} sx={{ height: 16, fontSize: '0.6rem', mt: 0.25 }} />}
                </Box>
              </Paper>
            </Grid>
          ))}
          {!assets.length && (
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" align="center">No media yet — upload something above.</Typography>
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  );
}
