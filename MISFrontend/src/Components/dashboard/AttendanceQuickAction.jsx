import React, { useEffect, useState } from 'react';
import { Button, CircularProgress } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import toast from 'react-hot-toast';
import axios from '../../apiClient.js';

// Sequential punch flow: In -> Lunch Out -> Lunch In -> Out. Only the single
// next-available action is ever shown, matching the "one button, whichever
// is available" attendance flow requested for the home-screen header.
const NEXT_ACTION = {
  none: 'In',
  In: 'Lunch Out',
  'Lunch Out': 'Lunch In',
  'Lunch In': 'Out',
  Out: null,
};

const BUTTON_STYLE = {
  In: { bgcolor: '#16a34a', label: 'Punch In' },
  'Lunch Out': { bgcolor: '#f59e0b', label: 'Lunch Out' },
  'Lunch In': { bgcolor: '#2563eb', label: 'Lunch In' },
  Out: { bgcolor: '#dc2626', label: 'Punch Out' },
};

export default function AttendanceQuickAction({ userName }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [nextAction, setNextAction] = useState(null);

  const loadState = async () => {
    if (!userName) return;
    try {
      const res = await axios.get(`/api/attendance/getTodayAttendance/${encodeURIComponent(userName)}`);
      const flow = res.data?.flow || [];
      const lastType = flow.length ? flow[flow.length - 1] : 'none';
      setNextAction(NEXT_ACTION[lastType] ?? null);
    } catch {
      setNextAction('In');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadState(); }, [userName]);

  const handlePunch = async () => {
    if (!nextAction || submitting) return;
    setSubmitting(true);
    try {
      const now = new Date();
      const res = await axios.post('/api/attendance/addAttendance', {
        User_name: userName,
        Type: nextAction,
        Status: 'Present',
        Date: now.toLocaleDateString(),
        Time: now.toLocaleTimeString('en-US', { hour12: false }),
      });
      if (res.data?.success) {
        toast.success(`${nextAction} marked`);
        await loadState();
      } else {
        toast.error(res.data?.message || 'Failed to mark attendance');
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to mark attendance');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <CircularProgress size={18} sx={{ color: '#16a34a' }} />;
  if (!nextAction) {
    return (
      <Button
        size="small"
        disabled
        startIcon={<CheckCircleRoundedIcon sx={{ fontSize: 16 }} />}
        sx={{ borderRadius: 5, textTransform: 'none', fontWeight: 700, fontSize: '0.72rem' }}
      >
        Day complete
      </Button>
    );
  }

  const style = BUTTON_STYLE[nextAction];
  return (
    <Button
      size="small"
      variant="contained"
      onClick={handlePunch}
      disabled={submitting}
      sx={{
        borderRadius: 5,
        textTransform: 'none',
        fontWeight: 700,
        fontSize: '0.72rem',
        px: 1.75,
        bgcolor: style.bgcolor,
        '&:hover': { bgcolor: style.bgcolor, opacity: 0.9 },
      }}
    >
      {submitting ? <CircularProgress size={14} sx={{ color: 'white' }} /> : style.label}
    </Button>
  );
}
