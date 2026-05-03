import { useCallback, useMemo, useState } from "react";
import { TASK_TYPES } from "./useOrdersData";

const DRAG_DATA_TYPE = "application/json";

export function useOrderDnD({ onMove }) {
  const [mobileSelection, setMobileSelection] = useState(null); // orderId
  const [statusMessage, setStatusMessage] = useState("");

  const resetMobileSelection = useCallback(() => setMobileSelection(null), []);

  const handleDragStart = useCallback((orderId, currentTask, event) => {
    if (!event?.dataTransfer) return;
    event.dataTransfer.setData(
      DRAG_DATA_TYPE,
      JSON.stringify({ id: orderId, currentTask: currentTask || TASK_TYPES.OTHER })
    );
    event.dataTransfer.effectAllowed = "move";
  }, []);

  const allowDrop = useCallback((event, allow) => {
    if (!allow) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    async (event, targetTask, allowDropFlag) => {
      if (!allowDropFlag) return;
      event.preventDefault();
      let payload;
      try {
        payload = JSON.parse(event.dataTransfer.getData(DRAG_DATA_TYPE));
      } catch (err) {
        return;
      }
      const droppedId = payload?.id;
      if (!droppedId) return;
      await onMove(droppedId, targetTask, setStatusMessage);
    },
    [onMove]
  );

  const startMobileMove = useCallback((orderId) => {
    if (!orderId) return;
    setMobileSelection(orderId);
  }, []);

  const confirmMobileMove = useCallback(
    async (targetTask) => {
      if (!mobileSelection) return false;
      await onMove(mobileSelection, targetTask, setStatusMessage);
      resetMobileSelection();
      return true;
    },
    [mobileSelection, onMove, resetMobileSelection]
  );

  const dragHandlers = useMemo(
    () => ({
      onDragStart: handleDragStart,
      onDrop: handleDrop,
      onDragOver: allowDrop,
    }),
    [allowDrop, handleDragStart, handleDrop]
  );

  return {
    mobileSelection,
    startMobileMove,
    confirmMobileMove,
    resetMobileSelection,
    statusMessage,
    setStatusMessage,
    dragHandlers,
  };
}
