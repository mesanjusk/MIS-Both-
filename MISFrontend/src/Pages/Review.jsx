import React, { useState, useEffect } from "react";
import axios from '../apiClient.js';

export default function Review() {
  const [tasks, setTasks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [review, setReview] = useState("");

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    const token = localStorage.getItem("token");
    const res = await axios.get(`/tasks`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setTasks(res.data.tasks);
  };

  const submitReview = async (id) => {
    const token = localStorage.getItem("token");
    await axios.post(`/tasks/review/${id}`, { review }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setSelected(null);
    setReview("");
    fetchTasks();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-3xl mx-auto bg-white rounded shadow p-6">
        <h2 className="text-xl font-bold mb-4">Task Reviews</h2>
        <ul>
          {tasks.map(t => (
            <li key={t._id} className="border-b py-2 flex flex-col gap-1">
              <div className="flex justify-between">
                <span>{t.name} ({t.date?.slice(0,10)})</span>
                <button
                  className="text-blue-600"
                  onClick={() => { setSelected(t._id); setReview(t.review || ""); }}
                >
                  Review
                </button>
              </div>
              {selected === t._id && (
                <div className="my-2 flex flex-col gap-2">
                  <textarea
                    className="border p-2 rounded"
                    value={review}
                    onChange={e => setReview(e.target.value)}
                  />
                  <button
                    className="bg-blue-500 text-white px-3 py-1 rounded"
                    onClick={() => submitReview(t._id)}
                  >
                    Save
                  </button>
                </div>
              )}
              {t.review && <div className="text-xs text-gray-600">Last review: {t.review}</div>}
            </li>
          ))}
        </ul>
        <button className="mt-6 px-4 py-2 bg-gray-800 text-white rounded" onClick={() => window.location.href = "/planner"}>Back to Planner</button>
      </div>
    </div>
  );
}
