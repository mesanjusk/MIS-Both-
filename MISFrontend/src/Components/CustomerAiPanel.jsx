import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import { parseCustomerEnquiry, prepareCustomerQuote } from '../services/officeAiService';

const money = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(Number(value || 0));

export default function CustomerAiPanel() {
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [selectedRateCard, setSelectedRateCard] = useState('');
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState('');

  const requirement = result?.requirement || null;
  const matches = result?.rateCardMatches || [];
  const questions = result?.followupQuestions || [];

  const followupText = useMemo(() => {
    if (!questions.length) return '';
    return questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
  }, [questions]);

  const quoteText = useMemo(() => {
    if (!quote?.ready) return '';
    const p = quote.pricing || {};
    return [
      `Quote: ${quote.rateCard?.itemName || requirement?.product || 'Print Job'}`,
      `Quantity: ${p.quantity || requirement?.quantity || '-'}`,
      p.sqft ? `Size: ${p.widthFt}ft × ${p.heightFt}ft (${Number(p.sqft).toFixed(2)} sq.ft)` : null,
      `Subtotal: ${money(p.subtotal)}`,
      `GST: ${money(p.gst)}`,
      `Grand Total: ${money(p.total)}`,
    ].filter(Boolean).join('\n');
  }, [quote, requirement]);

  const parse = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setQuote(null);
    setSelectedRateCard('');
    try {
      const response = await parseCustomerEnquiry(message.trim());
      const data = response.data?.result || null;
      setResult(data);
      const first = data?.rateCardMatches?.[0]?.rateCard_uuid || '';
      setSelectedRateCard(first);
      if (data?.quote?.ready) setQuote(data.quote);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not parse enquiry');
    } finally {
      setLoading(false);
    }
  };

  const recalcQuote = async () => {
    if (!requirement || !selectedRateCard) return;
    setQuoteLoading(true);
    setError('');
    try {
      const response = await prepareCustomerQuote(requirement, selectedRateCard);
      setQuote(response.data?.result || null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not prepare quote');
    } finally {
      setQuoteLoading(false);
    }
  };

  const copy = async (text) => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { /* browser can block clipboard */ }
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.25, md: 1.75 }, borderRadius: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <AutoAwesomeRoundedIcon color="primary" />
        <Box>
          <Typography variant="subtitle1" fontWeight={900}>Customer AI — Enquiry → Quote Prep</Typography>
          <Typography variant="caption" color="text.secondary">
            Prepare-only. It does not send WhatsApp messages or create orders automatically.
          </Typography>
        </Box>
        <Chip size="small" label="HUMAN APPROVAL" color="warning" sx={{ ml: 'auto' }} />
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert> : null}

      <TextField
        fullWidth multiline minRows={3} maxRows={7} size="small"
        label="Paste customer WhatsApp enquiry"
        placeholder="Example: 500 visiting cards 350gsm matte double side kal chahiye"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button variant="contained" onClick={parse} disabled={loading || !message.trim()}>
          {loading ? 'Understanding…' : 'Understand Enquiry'}
        </Button>
      </Stack>

      {requirement ? (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" fontWeight={900}>Extracted Requirement</Typography>
          <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 0.75 }}>
            <Chip size="small" label={`Product: ${requirement.product || 'Missing'}`} color={requirement.product ? 'default' : 'warning'} />
            <Chip size="small" label={`Qty: ${requirement.quantity || 'Missing'}`} color={requirement.quantity ? 'default' : 'warning'} />
            {requirement.gsm ? <Chip size="small" label={`${requirement.gsm} GSM`} /> : null}
            {requirement.sides ? <Chip size="small" label={`${requirement.sides} side`} /> : null}
            {requirement.lamination ? <Chip size="small" label={`${requirement.lamination} lamination`} /> : null}
            {requirement.deadline ? <Chip size="small" color="info" label={`Due: ${requirement.deadline}`} /> : null}
            {requirement.size ? <Chip size="small" label={`Size: ${requirement.size.width}×${requirement.size.height} ${requirement.size.unit}`} /> : null}
            <Chip size="small" variant="outlined" label={result?.aiUsed ? 'Gemini assisted' : 'Rule parser'} />
          </Stack>

          {questions.length ? (
            <Box sx={{ mt: 1, p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="subtitle2">Ask customer only these missing questions:</Typography>
              <Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', m: 0.5 }}>{followupText}</Typography>
              <Button size="small" startIcon={<ContentCopyRoundedIcon />} onClick={() => copy(followupText)}>Copy questions</Button>
            </Box>
          ) : null}

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" fontWeight={900}>Existing Rate Card Match</Typography>
          {matches.length ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 0.75 }} alignItems="flex-start">
              <TextField
                select size="small" label="Rate Card" value={selectedRateCard}
                onChange={(e) => { setSelectedRateCard(e.target.value); setQuote(null); }}
                sx={{ minWidth: 260 }}
              >
                {matches.map((match) => (
                  <MenuItem key={match.rateCard_uuid} value={match.rateCard_uuid}>
                    {match.itemName}{match.category ? ` — ${match.category}` : ''}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="outlined" onClick={recalcQuote} disabled={!selectedRateCard || quoteLoading || questions.length > 0}>
                {quoteLoading ? 'Calculating…' : 'Prepare Quote'}
              </Button>
            </Stack>
          ) : (
            <Alert severity="warning" sx={{ mt: 0.75 }}>
              No matching active Rate Card found. Add/fix the item in Rate Card Master before quoting.
            </Alert>
          )}

          {quote ? (
            <Alert severity={quote.ready ? 'success' : 'warning'} sx={{ mt: 1 }}>
              {quote.ready ? (
                <>
                  <Typography variant="subtitle2">Prepared Quote — review before sending</Typography>
                  <Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', m: 0.5 }}>{quoteText}</Typography>
                  <Button size="small" startIcon={<ContentCopyRoundedIcon />} onClick={() => copy(quoteText)}>Copy quote</Button>
                </>
              ) : <Typography variant="body2">{quote.error || 'Quote needs more information.'}</Typography>}
            </Alert>
          ) : null}
        </>
      ) : null}
    </Paper>
  );
}
