import PropTypes from 'prop-types';
import { createContext, useContext, useMemo, useReducer } from 'react';

const initialState = {
  lastMessageResult: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'setLastMessageResult':
      return { ...state, lastMessageResult: action.payload };
    default:
      return state;
  }
}

const WhatsAppCloudContext = createContext(null);

export function WhatsAppCloudProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value = useMemo(
    () => ({
      ...state,
      setLastMessageResult: (value) => dispatch({ type: 'setLastMessageResult', payload: value }),
    }),
    [state],
  );

  return <WhatsAppCloudContext.Provider value={value}>{children}</WhatsAppCloudContext.Provider>;
}

WhatsAppCloudProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useWhatsAppCloudState() {
  const context = useContext(WhatsAppCloudContext);
  if (!context) {
    throw new Error('useWhatsAppCloudState must be used within WhatsAppCloudProvider');
  }
  return context;
}
