import { useState } from 'react';
import TemplateMessageComposer from './TemplateMessageComposer';
import BulkSender from './BulkSender';

const initialForm = {
  to: '',
};

export default function SendMessagePanel() {
  const [form, setForm] = useState(initialForm);
  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-800">Send Approved Tempate</h3>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <label className="text-sm text-gray-700">
            Recipient Number
            <input
              value={form.to}
              onChange={(event) => handleChange('to', event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="+14155552671"
            />
          </label>

          

          <TemplateMessageComposer
            recipient={form.to}
            className="space-y-3"
            buttonLabel="Send Template Message"
          />
        </div>
      </section>

      <BulkSender />
    </div>
  );
}
