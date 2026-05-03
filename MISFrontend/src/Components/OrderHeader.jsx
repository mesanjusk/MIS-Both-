import React from "react";

export default function OrderHeader({ values, notes }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-base">
        <strong className="text-gray-500">{values.Order_Number}</strong>
      </div>
      <div>
        <strong className="text-lg text-gray-900">
          {values.Customer_name}
        </strong>
        {values.Remark && (
          <div className="text-xs text-gray-500 mt-0.5">{values.Remark}</div>
        )}
        <div className="text-xs text-gray-600">
          {notes
            .filter((note) => note.Order_uuid === values.Order_uuid)
            .map((note, index) => (
              <div key={index}>{note.Note_name}</div>
            ))}
        </div>
      </div>
    </div>
  );
}
