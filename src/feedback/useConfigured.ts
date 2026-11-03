import { useEffect, useState } from 'react';
import { feedbackConfigured } from './configured';
export function useFeedbackConfigured() {
  const [configured, setConfigured] = useState(false);
  useEffect(() => {
    let active = true;
    void feedbackConfigured().then((value) => { if (active) setConfigured(value); });
    return () => { active = false; };
  }, []);
  return configured;
}
