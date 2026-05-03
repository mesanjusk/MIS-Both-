import { useMemo, useState } from 'react';
import { toast } from '../../Components';
import { buildTemplatePayload, whatsappCloudService } from '../../services/whatsappCloudService';
import TemplateSelector from './TemplateSelector';

const splitNumbers = (rawValue) =>
  String(rawValue || '')
    .split(/[\n,;\s]+/)
    .map((item) => item.replace(/[^\d+]/g, '').trim())
    .filter(Boolean);

export default function BulkSender() {
  const [numbersText, setNumbersText] = useState('');
  const [template, setTemplate] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState({ total: 0, processed: 0, success: 0, failed: 0 });

  const numbers = useMemo(() => splitNumbers(numbersText), [numbersText]);

  const handleCsvUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    setNumbersText((prev) => `${prev.trim()}\n${content}`.trim());
    event.target.value = '';
  };

  const sendBulkMessages = async () => {
    if (numbers.length === 0) {
      toast.error('Please provide at least one recipient number.');
      return;
    }

    if (!template?.name || !template?.language) {
      toast.error('Please select a template first.');
      return;
    }

    setIsSending(true);
    setProgress({ total: numbers.length, processed: 0, success: 0, failed: 0 });

    let success = 0;
    let failed = 0;

    for (let index = 0; index < numbers.length; index += 1) {
      const to = numbers[index];

      try {
        await whatsappCloudService.sendTemplateMessage(
          buildTemplatePayload({
            to,
            template: {
              name: template.name,
              language: template.language,
              parameters: template.parameters || [],
            },
          }),
        );
        success += 1;
      } catch (error) {
        failed += 1;
      }

      setProgress({
        total: numbers.length,
        processed: index + 1,
        success,
        failed,
      });
    }

    if (failed > 0) {
      toast.error(`${failed} message(s) failed. ${success} sent successfully.`);
    } else {
      toast.success(`Bulk send completed. ${success} messages sent.`);
    }

    setIsSending(false);
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-800">Bulk Messaging</h3>

      <div className="mt-4 space-y-4">
        <label className="block text-sm text-gray-700">
          Recipient Numbers (one per line or comma separated)
          <textarea
            rows={4}
            disabled={isSending}
            value={numbersText}
            onChange={(event) => setNumbersText(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            placeholder={'+14155552671\n+14155552672'}
          />
        </label>

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-blue-700">
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvUpload} />
          <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5">Upload CSV</span>
        </label>

        <TemplateSelector selectedTemplate={template} onTemplateChange={setTemplate} disabled={isSending} />

        <button
          type="button"
          onClick={sendBulkMessages}
          disabled={isSending || numbers.length === 0}
          className="rounded-lg bg-green-600 px-4 py-2.5 font-medium text-white disabled:opacity-60"
        >
          {isSending ? 'Sending Bulk...' : 'Send Bulk Template'}
        </button>

        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <p>Total: <strong>{progress.total}</strong></p>
          <p>Processed: <strong>{progress.processed}</strong></p>
          <p>Success: <strong className="text-green-700">{progress.success}</strong></p>
          <p>Failed: <strong className="text-red-700">{progress.failed}</strong></p>
        </div>
      </div>
    </section>
  );
}
