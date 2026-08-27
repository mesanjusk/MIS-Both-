import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { askOfficeAi, fetchOfficeAiBrief } from '../services/officeAiService';

const SUGGESTED_QUESTIONS = [
  'What needs my attention now?',
  'Which orders are ready but not delivered?',
  'What payments are pending?',
  'Who is absent and who is covering their work?',
  'Show the biggest operational blockers.',
];

const severityColor = (severity) => {
  if (severity === 'critical' || severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  return 'default';
};

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

function Metric({ label, value, helper }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, px: 1.4, py: 1.1, minWidth: 145, flex: '1 1 145px' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={700}>{label}</Typography>
      <Typography variant="h6" fontWeight={900} lineHeight={1.2}>{value}</Typography>
      {helper ? <Typography variant="caption" color="text.secondary">{helper}</Typography> : null}
    </Paper>
  );
}

export default function OfficeAiPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerMeta, setAnswerMeta] = useState(null);

  const loadBrief = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchOfficeAiBrief();
      setData(response.data?.result || null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load Office AI');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBrief(); }, [loadBrief]);

  const business = data?.snapshot?.business || {};
  const brief = data?.brief || {};
  const priorities = useMemo(() => brief?.priorities || [], [brief]);

  const submitQuestion = useCallback(async (value) => {
    const clean = String(value ?? question).trim();
    if (!clean || asking) return;
    setQuestion(clean);
    setAsking(true);
    setError('');
    try {
      const response = await askOfficeAi(clean);
      const result = response.data?.result || {};
      setAnswer(result.answer || 'No answer returned.');
      setAnswerMeta(result.ai || null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Office AI could not answer');
    } finally {
      setAsking(false);
    }
  }, [asking, question]);

  return (
    <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'visible' }}>
      <CardContent sx={{ p: { xs: 1.5, md: 2 }, '&:last-child': { pb: { xs: 1.5, md: 2 } } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} gap={1}>
          <Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <AutoAwesomeRoundedIcon color="primary" />
              <Typography variant="h6" fontWeight={900}>Office AI</Typography>
              <Chip size="small" color="success" variant="outlined" label="Suggest only" />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Live management brief from existing orders, accounts, attendance and Team Operations. No AI write actions are enabled.
            </Typography>
          </Box>
          <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={loadBrief} disabled={loading}>
            Refresh AI
          </Button>
        </Stack>

        {error ? <Alert severity="error" sx={{ mt: 1.5, borderRadius: 2 }}>{error}</Alert> : null}

        {loading ? (
          <Stack direction="row" alignItems="center" spacing={1.2} sx={{ py: 3 }}>
            <CircularProgress size={22} />
            <Typography variant="body2" color="text.secondary">Building live office snapshot...</Typography>
          </Stack>
        ) : (
          <>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
              <Metric label="Open Orders" value={business.openOrders || 0} />
              <Metric label="Unassigned" value={business.unassignedOrders || 0} />
              <Metric label="Overdue Tasks" value={business.overdueTasks || 0} />
              <Metric label="Ready to Deliver" value={business.readyNotDelivered || 0} />
              <Metric label="Delivered Unpaid" value={business.deliveredUnpaid || 0} />
              <Metric label="Vendor Payable" value={money(business.vendorPayableAmount)} />
            </Stack>

            <Paper variant="outlined" sx={{ mt: 1.5, p: 1.5, borderRadius: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Typography variant="subtitle2" fontWeight={900}>{brief.headline || 'Office brief'}</Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  label={brief.ai?.status === 'ready' ? `Gemini · ${brief.ai?.model || ''}` : 'MIS rule brief'}
                />
              </Stack>
              <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                {brief.aiText || brief.summary || 'No major exception detected.'}
              </Typography>
            </Paper>

            {priorities.length ? (
              <Stack spacing={0.75} sx={{ mt: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={900}>System-detected priorities</Typography>
                {priorities.map((item, index) => (
                  <Stack
                    key={`${item.title}-${index}`}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    sx={{ borderBottom: index === priorities.length - 1 ? 0 : '1px solid', borderColor: 'divider', pb: 0.75 }}
                  >
                    <Chip size="small" color={severityColor(item.severity)} label={item.severity || 'info'} />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={800}>{item.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.detail}</Typography>
                    </Box>
                    <Typography variant="caption" color="text.disabled">{item.source}</Typography>
                  </Stack>
                ))}
              </Stack>
            ) : null}

            <Divider sx={{ my: 1.7 }} />

            <Typography variant="subtitle2" fontWeight={900}>Ask Office AI</Typography>
            <Typography variant="caption" color="text.secondary">
              Answers use the current MIS snapshot only. In this release Office AI cannot change orders, payments, tasks or users.
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Example: What needs my attention right now?"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submitQuestion();
                  }
                }}
                inputProps={{ maxLength: 1200 }}
              />
              <Button
                variant="contained"
                startIcon={asking ? <CircularProgress size={16} color="inherit" /> : <SendRoundedIcon />}
                onClick={() => submitQuestion()}
                disabled={asking || !question.trim()}
              >
                Ask
              </Button>
            </Stack>

            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.7, mt: 1 }}>
              {SUGGESTED_QUESTIONS.map((item) => (
                <Button key={item} size="small" variant="outlined" onClick={() => submitQuestion(item)} disabled={asking}>
                  {item}
                </Button>
              ))}
            </Stack>

            {answer ? (
              <Paper sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                <Stack direction="row" justifyContent="space-between" gap={1}>
                  <Typography variant="subtitle2" fontWeight={900}>Answer</Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={answerMeta?.status === 'ready' ? 'Gemini' : 'MIS rules'}
                  />
                </Stack>
                <Typography variant="body2" sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>{answer}</Typography>
              </Paper>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
